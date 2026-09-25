param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
$taskUrl = 'http://127.0.0.1:8765'
if (-not (Test-Path -LiteralPath $taskPython)) {
    throw 'The Python environment is missing. Follow the setup steps in README.md.'
}
$taskHealth = $null
try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 2 } catch { }
if ($taskHealth.app -ne 'loan-risk-local') {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'artifacts\model.joblib'))) {
        & $taskPython (Join-Path $PSScriptRoot 'build_data.py')
        if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the analysis. See the message above.' }
    }
    $taskLog = Join-Path $PSScriptRoot '.runtime'
    New-Item -ItemType Directory -Force -Path $taskLog | Out-Null
    Start-Process -FilePath $taskPython -ArgumentList @("`"$(Join-Path $PSScriptRoot 'server.py')`"") -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLog 'server.log') -RedirectStandardError (Join-Path $taskLog 'server-errors.log')
    for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
        Start-Sleep -Milliseconds 250
        try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 1 } catch { continue }
        if ($taskHealth.app -eq 'loan-risk-local') { break }
    }
}
if ($taskHealth.app -ne 'loan-risk-local') { throw 'The dashboard could not start. Check dashboard/.runtime/server-errors.log.' }
if (-not $NoBrowser) { Start-Process $taskUrl }
