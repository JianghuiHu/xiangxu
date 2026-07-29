from __future__ import annotations

import time
import zipfile
from pathlib import Path


BASE = Path(__file__).resolve().parents[2]
PACKAGE_NAME = "像序-macOS-1.2.5"
OUTPUT = BASE / "dist" / f"{PACKAGE_NAME}.zip"


def collect_sources() -> list[tuple[Path, str]]:
    sources = [
        (BASE / "index.html", "index.html"),
        (BASE / "README.md", "README.md"),
        (BASE / "THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"),
        (BASE / "server.py", "server.py"),
        (BASE / "packaging" / "macos" / "start.command", "start.command"),
        (BASE / "packaging" / "macos" / "README-MACOS.md", "README-MACOS.md"),
    ]

    for directory_name in ("assets", "css", "js", "vendor", "workers"):
        directory = BASE / directory_name
        for path in sorted(directory.rglob("*")):
            if path.is_file() and path.name != ".DS_Store" and "__pycache__" not in path.parts:
                sources.append((path, path.relative_to(BASE).as_posix()))

    for path, _ in sources:
        if not path.is_file():
            raise FileNotFoundError(path)
    return sources


def build() -> None:
    sources = collect_sources()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, relative_path in sources:
            data = path.read_bytes()
            if relative_path == "start.command":
                data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")

            info = zipfile.ZipInfo(
                f"{PACKAGE_NAME}/{relative_path}",
                date_time=time.localtime(path.stat().st_mtime)[:6],
            )
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (
                (0o100755 if relative_path == "start.command" else 0o100644) << 16
            )
            info.flag_bits |= 0x800
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    print(OUTPUT)
    print(f"files={len(sources)} size={OUTPUT.stat().st_size}")


if __name__ == "__main__":
    build()
