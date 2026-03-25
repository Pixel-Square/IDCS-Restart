param(
    [string]$ProjectRoot = "C:\Users\Admin\Downloads\projects\IDCS-Restart",
    [string]$TaskName = "IDCS-eSSL-Realtime-Sync",
    [string]$RunAsUser = "$env:USERDOMAIN\$env:USERNAME",
    [string]$DeviceIP = "192.168.81.80",
    [int]$DevicePort = 4370
)

$ErrorActionPreference = "Stop"

$runnerScript = Join-Path $ProjectRoot "deploy\windows\run_essl_realtime.ps1"
if (-not (Test-Path $runnerScript)) {
    throw "Runner script not found: $runnerScript"
}

$psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`" -ProjectRoot `"$ProjectRoot`" -DeviceIP `"$DeviceIP`" -DevicePort $DevicePort"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $RunAsUser -LogonType Password -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Task $TaskName installed and started." -ForegroundColor Green
Write-Host "Use this to check status: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Yellow
Write-Host "Use this to remove: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor Yellow
