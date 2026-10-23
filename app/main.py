from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
LEGACY_DB = Path(os.getenv("DARTDECK_LEGACY_DB", "/data/dartdeck.db"))

app = FastAPI(title="DartDeck Local", version="0.8.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def legacy_connection() -> sqlite3.Connection:
    if not LEGACY_DB.exists():
        raise HTTPException(404, "No legacy DartDeck database found")
    # Open read-only: v0.8 never writes new game data to the server DB.
    uri = f"file:{LEGACY_DB.as_posix()}?mode=ro"
    try:
        conn = sqlite3.connect(uri, uri=True)
    except sqlite3.Error as exc:
        raise HTTPException(500, f"Could not open legacy database: {exc}") from exc
    conn.row_factory = sqlite3.Row
    return conn


def has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    return bool(row)


def legacy_status() -> dict[str, Any]:
    if not LEGACY_DB.exists():
        return {"available": False, "players": 0, "matches": 0, "practice": 0, "x01_matches": 0, "total_180s": 0, "highest_checkout": 0}
    try:
        with legacy_connection() as conn:
            required = all(has_table(conn, t) for t in ("players", "matches", "match_players", "practice_results"))
            if not required:
                return {"available": False, "reason": "Legacy database schema not recognised", "players": 0, "matches": 0, "practice": 0, "x01_matches": 0, "total_180s": 0, "highest_checkout": 0}
            players = conn.execute("SELECT COUNT(*) c FROM players").fetchone()["c"]
            matches = conn.execute("SELECT COUNT(*) c FROM matches").fetchone()["c"]
            practice = conn.execute("SELECT COUNT(*) c FROM practice_results").fetchone()["c"]
            x01 = conn.execute("SELECT COUNT(*) c FROM matches WHERE game_type='x01'").fetchone()["c"]
            row = conn.execute(
                """
                SELECT COALESCE(SUM(mp.scores_180),0) total_180s,
                       COALESCE(MAX(mp.highest_checkout),0) highest_checkout
                FROM match_players mp
                JOIN matches m ON m.id=mp.match_id
                WHERE m.game_type='x01'
                """
            ).fetchone()
            return {
                "available": True,
                "players": int(players),
                "matches": int(matches),
                "practice": int(practice),
                "x01_matches": int(x01),
                "total_180s": int(row["total_180s"] or 0),
                "highest_checkout": int(row["highest_checkout"] or 0),
                "database_path": str(LEGACY_DB),
            }
    except HTTPException:
        raise
    except Exception as exc:
        return {"available": False, "reason": str(exc), "players": 0, "matches": 0, "practice": 0, "x01_matches": 0, "total_180s": 0, "highest_checkout": 0}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "storage": "local-device", "version": "0.8.0"}


@app.get("/api/migration/status")
def migration_status() -> dict[str, Any]:
    return legacy_status()


@app.get("/api/migration/export")
def migration_export() -> dict[str, Any]:
    status = legacy_status()
    if not status.get("available"):
        raise HTTPException(404, status.get("reason") or "No legacy DartDeck data available")
    with legacy_connection() as conn:
        player_rows = conn.execute("SELECT id,name,created_at FROM players ORDER BY id").fetchall()
        players = [
            {"id": int(r["id"]), "uid": f"legacy-server-player-{int(r['id'])}", "name": r["name"], "created_at": r["created_at"]}
            for r in player_rows
        ]
        matches: list[dict[str, Any]] = []
        for m in conn.execute("SELECT id,game_type,start_score,winner_player_id,settings_json,played_at FROM matches ORDER BY id").fetchall():
            mps = conn.execute(
                """
                SELECT player_id,finishing_position,darts_thrown,points_scored,three_dart_average,
                       first_nine_average,highest_visit,highest_checkout,checkout_attempts,checkouts,
                       scores_100_plus,scores_140_plus,scores_180,legs_won
                FROM match_players WHERE match_id=? ORDER BY id
                """,
                (m["id"],),
            ).fetchall()
            matches.append({
                "id": int(m["id"]),
                "uid": f"legacy-server-match-{int(m['id'])}",
                "game_type": m["game_type"],
                "start_score": m["start_score"],
                "winner_player_id": m["winner_player_id"],
                "settings_json": m["settings_json"],
                "played_at": m["played_at"],
                "players": [dict(r) for r in mps],
            })
        practice = []
        for r in conn.execute("SELECT id,player_id,mode,score,details_json,played_at FROM practice_results ORDER BY id").fetchall():
            practice.append({
                "id": int(r["id"]),
                "uid": f"legacy-server-practice-{int(r['id'])}",
                "player_id": int(r["player_id"]),
                "mode": r["mode"],
                "score": r["score"],
                "details_json": r["details_json"],
                "played_at": r["played_at"],
            })
        mapped_settings: dict[str, Any] = {}
        if has_table(conn, "app_settings"):
            rows = conn.execute("SELECT key,value FROM app_settings").fetchall()
            legacy = {r["key"]: r["value"] for r in rows}
            if legacy.get("primary_color"):
                mapped_settings["primary_color"] = legacy["primary_color"]
            if legacy.get("font") in {"modern", "system", "rounded", "condensed"}:
                mapped_settings["font"] = legacy["font"]
            if "keep_awake" in legacy:
                mapped_settings["keep_awake"] = str(legacy["keep_awake"]).lower() == "true"
            mapped_settings["dartboard_mode"] = True
            mapped_settings["theme_id"] = "midnight"
    return {
        "dartdeck_format": "dartdeck-backup",
        "schema_version": 1,
        "source": {"edition": "docker-server-legacy", "version": "0.7.x", "database": LEGACY_DB.name},
        "legacy_summary": status,
        "data": {"players": players, "matches": matches, "practice": practice, "settings": mapped_settings},
    }


@app.get("/api/migration/database")
def download_legacy_database():
    if not LEGACY_DB.exists():
        raise HTTPException(404, "No legacy DartDeck database found")
    return FileResponse(LEGACY_DB, media_type="application/x-sqlite3", filename="dartdeck-legacy.sqlite3")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/service-worker.js")
def service_worker():
    return FileResponse(STATIC_DIR / "service-worker.js", media_type="application/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.exception_handler(404)
async def spa_fallback(request, exc):
    # Keep API 404s as JSON; browser navigation falls back to the app shell.
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": getattr(exc, "detail", "Not found")})
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
