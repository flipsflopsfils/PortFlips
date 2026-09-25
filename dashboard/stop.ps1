$ErrorActionPreference = 'Stop'
$taskUrl = 'http://127.0.0.1:8765'
try { $taskHealth = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 2 } catch { exit 0 }
if ($taskHealth.app -eq 'loan-risk-local') {
    Invoke-RestMethod -Uri "$taskUrl/api/shutdown" -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
}
