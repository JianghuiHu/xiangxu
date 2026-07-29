#!/bin/bash

set -euo pipefail
cd -- "$(dirname -- "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "像序需要 Python 3 来启动本地服务。请先从 python.org 或 Homebrew 安装 Python 3。" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
URL="http://127.0.0.1:${PORT}/"

echo "像序 · 万象归序，创作从容"
echo "正在启动本地服务：${URL}"
echo "关闭此终端窗口即可停止像序。"

(sleep 1 && open "${URL}") &
exec python3 server.py --port "${PORT}"
