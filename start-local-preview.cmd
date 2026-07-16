@echo off
setlocal
cd /d "%~dp0"

set "NODE=C:\Users\Mikear\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  echo Node.js was not found at the configured location.
  pause
  exit /b 1
)

start "Acceptance Sheet Preview" /b "%NODE%" "%~dp0preview-server.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/"

echo Preview is running at http://127.0.0.1:4173/
echo Keep this window open while using the preview.
pause
