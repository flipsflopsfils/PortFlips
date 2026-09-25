$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        throw 'Install Python 3.12, then run Setup Loan Risk.cmd again.'
    }
    Write-Host 'Creating the Python environment...'
    & py -3.12 -m venv (Join-Path $projectRoot '.venv')
    if ($LASTEXITCODE -ne 0) {
        throw 'Install Python 3.12, then run Setup Loan Risk.cmd again.'
    }
}

Write-Host 'Installing the project packages...'
& $python -m pip install -r (Join-Path $projectRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed. Check the message above.' }

Write-Host 'Setup complete. Double-click Start Loan Risk.cmd to open the dashboard.'
