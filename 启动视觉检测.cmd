@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js/npm not found. Install Node.js 22.13 or newer, then try again.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/cv' -TimeoutSec 2; if($r.StatusCode -eq 200 -and $r.Content -match 'jiayoubei-cv'){Start-Process 'http://localhost:3000/cv'; exit 0}}catch{}; exit 1" >nul 2>&1
if not errorlevel 1 exit /b 0

start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url='http://localhost:3000/cv'; for($i=0;$i -lt 90;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2; if($r.StatusCode -eq 200 -and $r.Content -match 'jiayoubei-cv'){Start-Process $url; exit 0}}catch{}; Start-Sleep -Seconds 1}; Write-Host 'CV page did not become ready. Check the server window.'"

echo Starting JiaYouBei on http://localhost:3000/cv
echo Keep this window open while using the app.
call npm.cmd run dev -- --port 3000
echo Server stopped. Review the error above.
pause
