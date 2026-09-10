from __future__ import annotations

import os
import sqlite3
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = Path(os.getenv("DARTDECK_DB", "/data/dartdeck.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
BRANDING_DIR = DB_PATH.parent / "branding"
BRANDING_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS = {
    "primary_color": "#8ca75b",
    "accent_color": "#b8cf8f",
    "background_color": "#0d0f10",
    "panel_color": "#171a1c",
    "text_color": "#f4f6f1",
    "muted_color": "#aeb5ad",
    "font": "modern",
    "keep_awake": True,
}
ALLOWED_FONTS = {"modern", "system", "rounded", "condensed", "classic", "mono"}
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

app = FastAPI(title="DartDeck", version="0.2.1")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_type TEXT NOT NULL,
                start_score INTEGER,
                winner_player_id INTEGER,
                settings_json TEXT,
                played_at TEXT NOT NULL,
                FOREIGN KEY (winner_player_id) REFERENCES players(id)
            );

            CREATE TABLE IF NOT EXISTS match_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL,
                player_id INTEGER NOT NULL,
                finishing_position INTEGER,
                darts_thrown INTEGER DEFAULT 0,
                points_scored INTEGER DEFAULT 0,
                three_dart_average REAL DEFAULT 0,
                first_nine_average REAL DEFAULT 0,
                highest_visit INTEGER DEFAULT 0,
                highest_checkout INTEGER DEFAULT 0,
                checkout_attempts INTEGER DEFAULT 0,
                checkouts INTEGER DEFAULT 0,
                scores_100_plus INTEGER DEFAULT 0,
                scores_140_plus INTEGER DEFAULT 0,
                scores_180 INTEGER DEFAULT 0,
                legs_won INTEGER DEFAULT 0,
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
                FOREIGN KEY (player_id) REFERENCES players(id)
            );

            CREATE TABLE IF NOT EXISTS practice_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                mode TEXT NOT NULL,
                score REAL NOT NULL DEFAULT 0,
                details_json TEXT,
                played_at TEXT NOT NULL,
                FOREIGN KEY (player_id) REFERENCES players(id)
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )


@app.on_event("startup")
def startup() -> None:
    init_db()


class PlayerIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class MatchPlayerIn(BaseModel):
    player_id: int
    finishing_position: int | None = None
    darts_thrown: int = 0
    points_scored: int = 0
    three_dart_average: float = 0
    first_nine_average: float = 0
    highest_visit: int = 0
    highest_checkout: int = 0
    checkout_attempts: int = 0
    checkouts: int = 0
    scores_100_plus: int = 0
    scores_140_plus: int = 0
    scores_180: int = 0
    legs_won: int = 0


class MatchIn(BaseModel):
    game_type: str
    start_score: int | None = None
    winner_player_id: int | None = None
    settings_json: str | None = None
    players: list[MatchPlayerIn]


class PracticeIn(BaseModel):
    player_id: int
    mode: str
    score: float = 0
    details_json: str | None = None


class SettingsIn(BaseModel):
    primary_color: str
    accent_color: str
    background_color: str
    panel_color: str
    text_color: str
    muted_color: str
    font: str
    keep_awake: bool = True


def load_settings() -> dict[str, Any]:
    result = dict(DEFAULT_SETTINGS)
    with db() as conn:
        rows = conn.execute("SELECT key, value FROM app_settings").fetchall()
    for row in rows:
        key = row["key"]
        if key not in result:
            continue
        if key == "keep_awake":
            result[key] = row["value"].lower() == "true"
        else:
            result[key] = row["value"]
    result["has_custom_favicon"] = (BRANDING_DIR / "icon-512.png").exists()
    return result


def icon_path(size: int) -> Path:
    custom = BRANDING_DIR / f"icon-{size}.png"
    if custom.exists():
        return custom
    return STATIC_DIR / "icons" / f"icon-{size}.png"


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return load_settings()


@app.put("/api/settings")
def update_settings(payload: SettingsIn) -> dict[str, Any]:
    data = payload.model_dump()
    for key in ("primary_color", "accent_color", "background_color", "panel_color", "text_color", "muted_color"):
        if not HEX_RE.match(str(data[key])):
            raise HTTPException(400, f"Invalid colour for {key}")
    if data["font"] not in ALLOWED_FONTS:
        raise HTTPException(400, "Invalid font")
    with db() as conn:
        for key, value in data.items():
            stored = "true" if value is True else "false" if value is False else str(value)
            conn.execute(
                "INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, stored),
            )
    return load_settings()


@app.post("/api/settings/favicon")
async def upload_favicon(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(400, "Upload a PNG, JPG or WebP image")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be 5 MB or smaller")
    try:
        from io import BytesIO
        source = Image.open(BytesIO(raw)).convert("RGBA")
    except Exception as exc:
        raise HTTPException(400, "Could not read that image") from exc
    if min(source.size) < 64:
        raise HTTPException(400, "Image must be at least 64 × 64 pixels")
    # Centre-crop square, then generate all PWA/favicon sizes.
    source = ImageOps.fit(source, (1024, 1024), method=Image.Resampling.LANCZOS)
    for size in (64, 180, 192, 512):
        out = source.resize((size, size), Image.Resampling.LANCZOS)
        out.save(BRANDING_DIR / f"icon-{size}.png", "PNG", optimize=True)
    return load_settings()


@app.delete("/api/settings/favicon")
def reset_favicon() -> dict[str, Any]:
    for size in (64, 180, 192, 512):
        path = BRANDING_DIR / f"icon-{size}.png"
        if path.exists():
            path.unlink()
    return load_settings()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/players")
def list_players() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT id, name, created_at FROM players ORDER BY name COLLATE NOCASE").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/players")
def create_player(payload: PlayerIn) -> dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    now = datetime.now(timezone.utc).isoformat()
    try:
        with db() as conn:
            cur = conn.execute("INSERT INTO players(name, created_at) VALUES (?, ?)", (name, now))
            player_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Player already exists")
    return {"id": player_id, "name": name, "created_at": now}


@app.delete("/api/players/{player_id}")
def delete_player(player_id: int) -> dict[str, bool]:
    with db() as conn:
        used = conn.execute(
            "SELECT 1 FROM match_players WHERE player_id=? UNION SELECT 1 FROM practice_results WHERE player_id=? LIMIT 1",
            (player_id, player_id),
        ).fetchone()
        if used:
            raise HTTPException(409, "Player has recorded history and cannot be deleted")
        cur = conn.execute("DELETE FROM players WHERE id=?", (player_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Player not found")
    return {"ok": True}


@app.post("/api/matches")
def save_match(payload: MatchIn) -> dict[str, int]:
    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO matches(game_type,start_score,winner_player_id,settings_json,played_at) VALUES (?,?,?,?,?)",
            (payload.game_type, payload.start_score, payload.winner_player_id, payload.settings_json, now),
        )
        match_id = int(cur.lastrowid)
        for p in payload.players:
            conn.execute(
                """
                INSERT INTO match_players(
                    match_id, player_id, finishing_position, darts_thrown, points_scored,
                    three_dart_average, first_nine_average, highest_visit, highest_checkout,
                    checkout_attempts, checkouts, scores_100_plus, scores_140_plus, scores_180, legs_won
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    match_id, p.player_id, p.finishing_position, p.darts_thrown, p.points_scored,
                    p.three_dart_average, p.first_nine_average, p.highest_visit, p.highest_checkout,
                    p.checkout_attempts, p.checkouts, p.scores_100_plus, p.scores_140_plus, p.scores_180, p.legs_won,
                ),
            )
    return {"id": match_id}


@app.post("/api/practice")
def save_practice(payload: PracticeIn) -> dict[str, int]:
    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO practice_results(player_id,mode,score,details_json,played_at) VALUES (?,?,?,?,?)",
            (payload.player_id, payload.mode, payload.score, payload.details_json, now),
        )
    return {"id": int(cur.lastrowid)}


@app.get("/api/stats")
def stats() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT
                p.id,
                p.name,
                COUNT(DISTINCT mp.match_id) AS matches,
                COALESCE(SUM(mp.legs_won),0) AS legs_won,
                ROUND(CASE WHEN SUM(mp.darts_thrown) > 0
                    THEN SUM(mp.points_scored) * 3.0 / SUM(mp.darts_thrown)
                    ELSE 0 END, 2) AS lifetime_average,
                ROUND(MAX(mp.three_dart_average), 2) AS best_average,
                COALESCE(MAX(mp.highest_checkout),0) AS highest_checkout,
                COALESCE(MAX(mp.highest_visit),0) AS highest_visit,
                COALESCE(SUM(mp.scores_180),0) AS total_180s,
                COALESCE(SUM(mp.checkouts),0) AS checkouts,
                COALESCE(SUM(mp.checkout_attempts),0) AS checkout_attempts
            FROM players p
            LEFT JOIN match_players mp ON mp.player_id=p.id
            GROUP BY p.id,p.name
            ORDER BY p.name COLLATE NOCASE
            """
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/")
def index() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/manifest.webmanifest")
def manifest() -> JSONResponse:
    settings = load_settings()
    payload = {
        "id": "/",
        "name": "DartDeck",
        "short_name": "DartDeck",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
        "background_color": settings["background_color"],
        "theme_color": settings["primary_color"],
        "description": "Self-hosted darts scoring and practice app",
        "orientation": "any",
        "icons": [
            {"src": "/branding/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/branding/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
        "shortcuts": [
            {"name": "New X01 game", "short_name": "X01", "url": "/?go=x01-setup", "icons": [{"src": "/branding/icon-192.png", "sizes": "192x192"}]},
            {"name": "Solo practice", "short_name": "Practice", "url": "/?go=practice-menu", "icons": [{"src": "/branding/icon-192.png", "sizes": "192x192"}]},
        ],
    }
    return JSONResponse(payload, headers={"Cache-Control": "no-cache"})


@app.get("/branding/icon-{size}.png")
def branding_icon(size: int) -> FileResponse:
    if size not in {64, 180, 192, 512}:
        raise HTTPException(404, "Icon not found")
    return FileResponse(icon_path(size), media_type="image/png", headers={"Cache-Control": "no-cache"})


@app.get("/favicon.ico")
def favicon() -> FileResponse:
    return FileResponse(icon_path(64), media_type="image/png", headers={"Cache-Control": "no-cache"})


@app.get("/service-worker.js")
def service_worker() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "service-worker.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Service-Worker-Allowed": "/"},
    )
