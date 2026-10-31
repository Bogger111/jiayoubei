param([switch]$Open)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$statePath=Join-Path $projectRoot '.care-local/home-upgrade'
$modelPython=Join-Path $statePath 'engine-venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $modelPython)) { throw 'Please run: python services/home-engine/bootstrap.py' }
Push-Location -LiteralPath $projectRoot
try {
    & $modelPython 'services/home-engine/bootstrap.py' --configure
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure the local model service' }
    $enginePath=Join-Path $projectRoot 'services/home-engine/engine.py'
    $existing=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like "*$enginePath*" }
    if (!$existing) {
        $engineProcess=Start-Process -FilePath $modelPython -ArgumentList @('"'+$enginePath+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $statePath 'engine.out.log') -RedirectStandardError (Join-Path $statePath 'engine.err.log') -Environment @{PYTHONUTF8='1';HF_HUB_OFFLINE='1';TRANSFORMERS_OFFLINE='1';HTTP_PROXY='';HTTPS_PROXY='';ALL_PROXY=''} -PassThru
        @{id=$engineProcess.Id;root=$projectRoot;engine=$enginePath;started=$engineProcess.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $statePath 'launcher.json') -Encoding utf8
    }
    $webAddress='http://localhost:3000'
    $webScript=Join-Path $projectRoot 'node_modules/vinext/dist/cli.js'
    $webPort=Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if (!$webPort) {
        $webProcess=Start-Process -FilePath (Get-Command node).Source -ArgumentList @('"'+$webScript+'"','dev','-H','localhost','-p','3000') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $statePath 'web.out.log') -RedirectStandardError (Join-Path $statePath 'web.err.log') -Environment @{HTTP_PROXY='';HTTPS_PROXY='';ALL_PROXY='';NO_PROXY='localhost,127.0.0.1'} -PassThru
        @{id=$webProcess.Id;root=$projectRoot;script=$webScript;started=$webProcess.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $statePath 'web-launcher.json') -Encoding utf8
    }
    $ready=$false
    for($attempt=0;$attempt -lt 30;$attempt++){
        try{$response=Invoke-WebRequest -Uri ($webAddress+'/') -TimeoutSec 3 -NoProxy;if($response.StatusCode -eq 200 -and $response.Content -match '家有备'){$ready=$true;break}}catch{}
        Start-Sleep -Milliseconds 500
    }
    if(!$ready){throw 'The application is not ready. Check port 3000 and .care-local/home-upgrade/web.err.log.'}
    Write-Host ('家有备已启动：'+$webAddress+'/')
    if($Open){Start-Process ($webAddress+'/')}
} finally { Pop-Location }
