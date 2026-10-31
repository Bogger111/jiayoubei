$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$enginePath=Join-Path $projectRoot 'services/home-engine/engine.py'
$webScript=Join-Path $projectRoot 'node_modules/vinext/dist/cli.js'
# Only this checkout's absolute entry points and their direct helper processes.
$processes=Get-CimInstance Win32_Process
$owned=$processes | Where-Object { ($_.Name -eq 'python.exe' -and $_.CommandLine -like "*$enginePath*") -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like "*$webScript*") }
$ownedIds=@($owned.ProcessId)
$processes | Where-Object { $_.ParentProcessId -in $ownedIds -and $_.Name -in @('python.exe','workerd.exe','node.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
$owned | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
Write-Host '家有备本地服务已停止。'
