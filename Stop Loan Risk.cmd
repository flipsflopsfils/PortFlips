@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dashboard\stop.ps1"
if errorlevel 1 pause
