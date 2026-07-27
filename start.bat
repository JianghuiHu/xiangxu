@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 像序
echo 像序正在启动... 万象归序，创作从容。
echo 所有图片仅在浏览器本地处理。
echo 关闭此窗口将停止工具。
set "PYTHON_CMD="
py -3 --version >nul 2>nul && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD python --version >nul 2>nul && set "PYTHON_CMD=python"
if defined PYTHON_CMD goto :start_server
echo 未检测到 Python，将使用 Windows PowerShell 本地服务器。
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:5173'"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 5173
goto :end
:start_server
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:5173'"
%PYTHON_CMD% -m http.server 5173
:end
endlocal
