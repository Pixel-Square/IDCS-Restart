# Staff Attendance eSSL Real-Time Integration

This setup adds realtime biometric sync **without removing PS CSV upload**.

## What was added

- Realtime ingestion endpoint:
  - `POST /api/staff-attendance/biometric/realtime/`
- Device listener management command (pull mode):
  - `python manage.py sync_essl_realtime --ip 192.168.81.80 --port 4370`
- Raw punch log table:
  - `staff_biometric_punch_log`
- Attendance auto-update behavior:
  - Maps staff using `StaffProfile.staff_id` or `StaffProfile.rfid_uid`
  - Updates `AttendanceRecord` date-wise
  - Keeps earliest punch as `morning_in`
  - Uses latest OUT/UNKNOWN punch as `evening_out`

## Device/network values

- IP: `192.168.81.80`
- Subnet mask: `255.255.0.0`
- Gateway: `192.168.1.1`
- DNS: `8.8.8.8`
- TCP Port: `4370`

## Step 1: Install dependencies

From backend folder:

```bash
pip install -r requirements.txt
```

## Step 2: Run migration

```bash
python manage.py migrate
```

## Step 3: Ensure staff mapping

For each staff member, at least one of these must match biometric data:

- `StaffProfile.staff_id` == device user ID
- `StaffProfile.rfid_uid` == card UID from device

If neither matches, punch is stored as unresolved in response/log but attendance is not updated.

## Step 4A: Direct realtime from device (recommended)

Run long-lived listener:

```bash
python manage.py sync_essl_realtime --ip 192.168.81.80 --port 4370
```

This continuously pulls live punches and updates attendance rows in real time.

The command now also reads environment defaults when flags are omitted:

- `ESSL_DEVICE_IP`
- `ESSL_DEVICE_PORT`
- `ESSL_DEVICE_PASSWORD`
- `ESSL_CONNECT_TIMEOUT`
- `ESSL_RECONNECT_DELAY`

So this is enough after env setup:

```bash
python manage.py sync_essl_realtime
```

## Step 4A.1: Auto-start after reboot (Linux systemd)

Service file included:

- `deploy/essl_realtime.service`

Install it on server:

```bash
sudo cp deploy/essl_realtime.service /etc/systemd/system/essl_realtime.service
sudo systemctl daemon-reload
sudo systemctl enable essl_realtime
sudo systemctl start essl_realtime
sudo systemctl status essl_realtime
```

## Step 4A.2: Auto-start after reboot (Windows)

Scripts included:

- `deploy/windows/run_essl_realtime.ps1`
- `deploy/windows/install_essl_realtime_task.ps1`

Install scheduled task (service-style startup):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\install_essl_realtime_task.ps1 -ProjectRoot "C:\Users\Admin\Downloads\projects\IDCS-Restart" -DeviceIP "192.168.81.80" -DevicePort 4370
```

This creates startup task `IDCS-eSSL-Realtime-Sync` and starts it immediately.

## Step 4B: Push from middleware/device bridge (optional)

If your environment pushes punches to API, send:

```json
{
  "device_ip": "192.168.81.80",
  "device_port": 4370,
  "records": [
    {
      "uid": "539EA5BB",
      "staff_id": "3171022",
      "direction": "IN",
      "timestamp": "2026-03-25T08:58:00+05:30"
    }
  ]
}
```

### Secure this endpoint

Set env var / setting:

- `STAFF_BIOMETRIC_INGEST_KEY=<strong-secret>`

Then send header:

- `X-Biometric-Key: <strong-secret>`

Example cURL request:

```bash
curl -X POST "http://127.0.0.1:8000/api/staff-attendance/biometric/realtime/" \
  -H "Content-Type: application/json" \
  -H "X-Biometric-Key: IDCS_BIOMETRIC_CHANGE_ME_2026" \
  -d '{
    "device_ip": "192.168.81.80",
    "device_port": 4370,
    "records": [
      {
        "uid": "539EA5BB",
        "staff_id": "3171022",
        "direction": "IN",
        "timestamp": "2026-03-25T08:58:00+05:30"
      }
    ]
  }'
```

Example PowerShell request:

```powershell
$headers = @{ "X-Biometric-Key" = "IDCS_BIOMETRIC_CHANGE_ME_2026" }
$body = @{
  device_ip = "192.168.81.80"
  device_port = 4370
  records = @(
    @{
      uid = "539EA5BB"
      staff_id = "3171022"
      direction = "IN"
      timestamp = "2026-03-25T08:58:00+05:30"
    }
  )
} | ConvertTo-Json -Depth 4

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/staff-attendance/biometric/realtime/" -Headers $headers -ContentType "application/json" -Body $body
```

If this setting is not configured, endpoint falls back to authenticated Django users only.

## Existing PS upload flow

No PS CSV upload behavior was removed.
Both workflows now coexist:

- PS monthly/day-wise upload continues as before
- Realtime biometric punch sync runs in parallel
