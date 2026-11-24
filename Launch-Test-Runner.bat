@echo off
cd /d "%~dp0"
echo Starting HitechDairy Test Runner UI...
call tsx src/ui/server.ts
if errorlevel 1 (
  echo Falling back to npm run ui...
  call npm run ui
)
pause
