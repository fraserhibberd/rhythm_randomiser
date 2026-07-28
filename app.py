from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from urllib.parse import urlparse

import webview


PROJECT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
INDEX_PATH = FRONTEND_DIR / "index.html"
STYLESHEET_PATH = FRONTEND_DIR / "styles.css"
JAVASCRIPT_PATH = FRONTEND_DIR / "app.js"


class AppRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        files = {
            "/": (INDEX_PATH, "text/html; charset=utf-8"),
            "/styles.css": (STYLESHEET_PATH, "text/css; charset=utf-8"),
            "/app.js": (JAVASCRIPT_PATH, "application/javascript; charset=utf-8"),
        }
        requested_file = files.get(path)
        if requested_file is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        file_path, content_type = requested_file
        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, _format: str, *_args) -> None:
        return


def start_app_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", 0), AppRequestHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> None:
    server = start_app_server()
    host, port = server.server_address
    try:
        webview.create_window(
            "Web Audio Latency Test",
            url=f"http://{host}:{port}/",
            width=980,
            height=760,
        )
        webview.start()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
