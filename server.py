from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(os.environ.get("DARTDECK_WEB_ROOT", "/app/dist/web")).resolve()
PORT = int(os.environ.get("PORT", "8000"))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path.split("?", 1)[0] in {"/", "/index.html", "/service-worker.js"}:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        clean = self.path.split("?", 1)[0]
        if clean == "/health":
            payload = b'{"status":"ok","version":"0.9.0","storage":"local-device"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        target = ROOT / clean.lstrip("/")
        if clean != "/" and not target.exists() and "." not in Path(clean).name:
            self.path = "/index.html"
        super().do_GET()

if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"DartDeck 0.9.0 serving {ROOT} on :{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
