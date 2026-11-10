@echo off
if exist "%~dp0src-tauri\target\release\my-island.exe" (
    cd /d "%~dp0src-tauri\target\release"
    start "" "my-island.exe"
) else (
    cd /d "%~dp0src-tauri\target\debug"
    start "" "my-island.exe"
)
