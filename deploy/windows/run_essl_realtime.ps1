param(
    [string]$ProjectRoot = "C:\Users\Admin\Downloads\projects\IDCS-Restart",
    [string]$DeviceIP = "192.168.81.80",
    [int]$DevicePort = 4370,
    [int]$ReconnectDelay = 5
)

$ErrorActionPreference = "Stop"
$backendPath = Join-Path $ProjectRoot "backend"
$pythonExe = Join-Path $backendPath ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found at $pythonExe"
}

while ($true) {
    try {
        Push-Location $backendPath
        & $pythonExe "manage.py" "sync_essl_realtime" "--ip" $DeviceIP "--port" $DevicePort
        Pop-Location
    } catch {
        Write-Host "sync_essl_realtime crashed: $($_.Exception.Message)" -ForegroundColor Red
        if ((Get-Location).Path -eq $backendPath) {
            Pop-Location
        }
    }

    Start-Sleep -Seconds ([Math]::Max($ReconnectDelay, 2))
}
