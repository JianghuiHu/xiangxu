from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path, PurePosixPath


BASE = Path(__file__).resolve().parents[2]
PACKAGE_NAME = "像序-macOS-1.2.5"
ARCHIVE_PATH = BASE / "dist" / f"{PACKAGE_NAME}.zip"
PREFIX = f"{PACKAGE_NAME}/"
REQUIRED = {
    "index.html",
    "start.command",
    "README-MACOS.md",
    "assets/models/ppmattingv2-stdc1-human-512.onnx",
    "js/ai/model-manager.js",
}
FORBIDDEN_PARTS = {"backup_legacy", "tests", "packaging", "__pycache__"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


with zipfile.ZipFile(ARCHIVE_PATH) as archive:
    assert archive.testzip() is None, "ZIP CRC validation failed"
    names = archive.namelist()
    assert names and all(name.startswith(PREFIX) for name in names), "Unexpected archive root"

    relative_names = {name.removeprefix(PREFIX) for name in names}
    missing = REQUIRED - relative_names
    assert not missing, f"Missing required entries: {sorted(missing)}"

    for relative_name in relative_names:
        parts = set(PurePosixPath(relative_name).parts)
        assert not (parts & FORBIDDEN_PARTS), f"Forbidden path: {relative_name}"
        assert not relative_name.lower().endswith((".exe", ".bat", ".ps1")), (
            f"Windows-only file included: {relative_name}"
        )
        assert not relative_name.lower().endswith("u2netp.onnx"), "u2netp weights must remain optional"

    start_info = archive.getinfo(f"{PREFIX}start.command")
    start_mode = (start_info.external_attr >> 16) & 0o777
    start_data = archive.read(start_info)
    assert start_info.create_system == 3, "start.command is not marked as a Unix entry"
    assert start_mode == 0o755, f"Unexpected start.command mode: {oct(start_mode)}"
    assert start_data.startswith(b"#!/bin/bash\n"), "Invalid start.command shebang or line ending"
    assert b"\r" not in start_data, "start.command contains non-Unix line endings"

    model_name = f"{PREFIX}assets/models/ppmattingv2-stdc1-human-512.onnx"
    archive_model = archive.read(model_name)
    source_model = (BASE / "assets" / "models" / "ppmattingv2-stdc1-human-512.onnx").read_bytes()
    assert archive_model == source_model, "Bundled PP-MattingV2 model differs from source"

print(f"archive={ARCHIVE_PATH}")
print(f"files={len(names)}")
print(f"start_mode={oct(start_mode)}")
print(f"model_bytes={len(archive_model)}")
print(f"model_sha256={sha256(archive_model)}")
print(f"archive_sha256={sha256(ARCHIVE_PATH.read_bytes())}")
print("validation=PASS")
