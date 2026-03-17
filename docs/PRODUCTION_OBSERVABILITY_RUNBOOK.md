# Production Observability and Recovery Runbook

This runbook is for the current deployment shape:
- Nginx serves frontend and reverse-proxies `/api` to Gunicorn socket.
- Cloudflare Tunnel routes public hostnames to local HTTP (`http://localhost:80`).
- HTTPS is terminated at Cloudflare edge for public traffic.

## 1) Fast health check

Run:

```bash
cd /home/iqac/IDCS-Restart
bash tools/health_check.sh
```

Exit codes:
- `0` means healthy.
- `1` means warnings only.
- `2` means one or more hard failures.

## 2) Core service checks

```bash
sudo systemctl status nginx --no-pager -n 30
sudo systemctl status gunicorn --no-pager -n 30
sudo systemctl status cloudflared --no-pager -n 30
```

If a service is down:

```bash
sudo systemctl restart nginx
sudo systemctl restart gunicorn
sudo systemctl restart cloudflared
```

## 3) Endpoint smoke checks

```bash
curl -I http://localhost/
curl -i -X POST http://localhost/api/accounts/token/ -H 'Content-Type: application/json' -d '{"username":"x","password":"x"}'

curl -I https://idcs.krgi.co.in/
curl -i -X POST https://db.krgi.co.in/api/accounts/token/ -H 'Content-Type: application/json' -d '{"username":"x","password":"x"}'
```

Expected:
- Frontend root: `200` or redirect `301/302`.
- Login token API: JSON response, typically `400` for invalid payload, not HTML redirect loops.

## 4) Redirect loop triage (ERR_TOO_MANY_REDIRECTS)

1. Confirm tunnel origin still points to local HTTP origin (`http://localhost:80`) for both hostnames.
2. Verify Nginx 80 blocks are serving content directly and not forcing 80->443 redirects while tunnel origin is HTTP.
3. Ensure `/api` proxy includes forwarded proto for tunneled traffic.
4. Reload Nginx after config edits:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5) 502 Bad Gateway triage

Common causes in this stack:
- Gunicorn process down.
- Socket missing at `/run/gunicorn/gunicorn.sock`.
- Cloudflare Tunnel origin mismatch (for example, pointing to HTTPS on an origin with cert SAN mismatch).

Checks:

```bash
ls -l /run/gunicorn/gunicorn.sock
sudo journalctl -u gunicorn --since '30 min ago' --no-pager
sudo journalctl -u cloudflared --since '30 min ago' --no-pager
```

If cloudflared logs show x509/SAN errors, restore origin to `http://localhost:80`.

## 6) TLS certificate checks and renewal

Check expiration:

```bash
openssl x509 -enddate -noout -in /home/iqac/IDCS-Restart/.letsencrypt/config/live/idcs.krgi.co.in/fullchain.pem
openssl x509 -enddate -noout -in /home/iqac/IDCS-Restart/.letsencrypt/config/live/db.krgi.co.in/fullchain.pem
```

Renew with webroot mode:

```bash
certbot certonly --webroot -w /home/iqac/IDCS-Restart/frontend/build -d idcs.krgi.co.in
certbot certonly --webroot -w /home/iqac/IDCS-Restart/frontend/build -d db.krgi.co.in
sudo systemctl reload nginx
```

## 7) Log review shortcuts

```bash
bash tools/trace_slow_endpoints.sh
sudo journalctl -u gunicorn --since '20 min ago' --no-pager | tail -n 200
sudo journalctl -u nginx --since '20 min ago' --no-pager | tail -n 200
sudo journalctl -u cloudflared --since '20 min ago' --no-pager | tail -n 200
```

## 8) Suggested cron for periodic checks

Preferred one-time setup:

```bash
cd /home/iqac/IDCS-Restart
chmod +x tools/health_check.sh tools/setup_health_monitoring.sh
bash tools/setup_health_monitoring.sh
```

This adds a 10-minute cron and prepares logrotate template at `deploy/logrotate_idcs_health.conf`.

Optional automatic logrotate install:

```bash
cd /home/iqac/IDCS-Restart
INSTALL_LOGROTATE=1 bash tools/setup_health_monitoring.sh
```

Manual cron example (every 10 minutes):

```bash
*/10 * * * * cd /home/iqac/IDCS-Restart && /bin/bash tools/health_check.sh >> /home/iqac/IDCS-Restart/check.txt 2>&1
```

Use log rotation for `check.txt` if it grows quickly.

## 9) Recovery order (minimal downtime)

1. Validate Nginx syntax and reload.
2. Restart Gunicorn and confirm socket exists.
3. Restart cloudflared and verify ingress health.
4. Re-run `tools/health_check.sh`.
5. Validate login API and homepage from both localhost and public domains.
