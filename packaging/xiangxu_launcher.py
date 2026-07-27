from __future__ import annotations

import functools
import base64
import http.server
import multiprocessing
import os
import socket
import sys
import threading
import time
import uuid
from pathlib import Path

import webview


PRODUCT_NAME = "像序"
SLOGAN = "万象归序，创作从容"


class DesktopApi:
    def __init__(self) -> None:
        self.window = None
        self._streams: dict[str, tuple[Path, object]] = {}
        self._lock = threading.Lock()

    def attach(self, window) -> None:
        self.window = window

    def begin_save(self, filename: str):
        if self.window is None:
            raise RuntimeError("Desktop window is not ready")
        safe_name = Path(filename or "xiangxu-export.zip").name
        dialog_enum = getattr(webview, "FileDialog", None)
        dialog_type = dialog_enum.SAVE if dialog_enum is not None else webview.SAVE_DIALOG
        selected = self.window.create_file_dialog(dialog_type, save_filename=safe_name)
        if not selected:
            return {"cancelled": True}
        selected_path = selected if isinstance(selected, str) else selected[0]
        path = Path(selected_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        token = uuid.uuid4().hex
        stream = path.open("wb")
        with self._lock:
            self._streams[token] = (path, stream)
        return {"token": token, "path": str(path)}

    def append_save_chunk(self, token: str, encoded: str):
        with self._lock:
            entry = self._streams.get(token)
            if entry is None:
                raise ValueError("Unknown save token")
            entry[1].write(base64.b64decode(encoded, validate=True))
        return {"ok": True}

    def finish_save(self, token: str):
        with self._lock:
            entry = self._streams.pop(token, None)
        if entry is None:
            raise ValueError("Unknown save token")
        path, stream = entry
        stream.flush()
        os.fsync(stream.fileno())
        stream.close()
        return {"path": str(path)}

    def cancel_save(self, token: str):
        with self._lock:
            entry = self._streams.pop(token, None)
        if entry is None:
            return {"ok": True}
        path, stream = entry
        stream.close()
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": True}

    def close_all(self) -> None:
        with self._lock:
            entries = list(self._streams.values())
            self._streams.clear()
        for path, stream in entries:
            stream.close()
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass


def resource_root() -> Path:
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "app"
    return Path(__file__).resolve().parent.parent


class LocalAppHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, _format: str, *_args) -> None:
        return


def create_server(root: Path):
    handler = functools.partial(LocalAppHandler, directory=str(root))
    try:
        return http.server.ThreadingHTTPServer(("127.0.0.1", 5173), handler)
    except OSError:
        return http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)


def main() -> None:
    root = resource_root()
    if not (root / "index.html").exists():
        raise FileNotFoundError(f"Missing bundled application: {root}")
    server = create_server(root)
    thread = threading.Thread(target=server.serve_forever, name="xiangxu-local-server", daemon=True)
    thread.start()
    port = server.server_address[1]
    storage = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "像序" / "WebView2"
    storage.mkdir(parents=True, exist_ok=True)
    api = DesktopApi()
    try:
        test_mode = os.environ.get("XIANGXU_TEST_MODE") == "1"
        window = webview.create_window(
            f"{PRODUCT_NAME} · {SLOGAN}",
            f"http://127.0.0.1:{port}/",
            width=1380,
            height=900,
            min_size=(1080, 720),
            text_select=True,
            hidden=test_mode,
            js_api=api,
        )
        api.attach(window)
        def close_test_window() -> None:
            time.sleep(3)
            window.destroy()

        webview.start(close_test_window if test_mode else None, gui="edgechromium", debug=False, private_mode=False, storage_path=str(storage))
    finally:
        api.close_all()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
