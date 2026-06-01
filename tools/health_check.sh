#!/usr/bin/env bash
set -euo pipefail

# IDCS production health check for Nginx + Gunicorn + Cloudflare Tunnel deployments.
# Exit code is non-zero when one or more checks fail.

ROOT_DIR="/home/iqac/IDCS-Restart"
FRONTEND_HOST="${FRONTEND_HOST:-idcs.krgi.co.in}"
BACKEND_HOST="${BACKEND_HOST:-db.krgi.co.in}"
CF_TUNNEL_CONFIG="${CF_TUNNEL_CONFIG:-/home/iqac/.cloudflared/config.yml}"
LOCAL_FRONTEND_URL="${LOCAL_FRONTEND_URL:-http://localhost/}"
LOCAL_LOGIN_URL="${LOCAL_LOGIN_URL:-http://localhost/api/accounts/token/}"
PUBLIC_FRONTEND_URL="${PUBLIC_FRONTEND_URL:-https://${FRONTEND_HOST}/}"
PUBLIC_BACKEND_URL="${PUBLIC_BACKEND_URL:-https://${BACKEND_HOST}/api/accounts/token/}"
CERT_BASE="${CERT_BASE:-${ROOT_DIR}/.letsencrypt/config/live}"
MAX_TIME="${MAX_TIME:-10}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

ok() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "[OK]   $*"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "[FAIL] $*"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo "[WARN] $*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

service_is_active() {
  local svc="$1"
  if systemctl is-active --quiet "$svc"; then
    return 0
  fi
  return 1
}

http_status() {
  local url="$1"
  curl -sS -o /dev/null -w "%{http_code}" --max-time "$MAX_TIME" "$url" || echo "000"
}

cloudflared_tunnel_id() {
  if [[ ! -f "$CF_TUNNEL_CONFIG" ]]; then
    return 1
  fi
  awk -F': ' '/^tunnel:[[:space:]]*/ {print $2; exit}' "$CF_TUNNEL_CONFIG"
}

cloudflared_active_connectors() {
  local tunnel_id="$1"
  local info

  if [[ -z "$tunnel_id" ]]; then
    echo ""
    return 1
  fi

  info="$(cloudflared tunnel info "$tunnel_id" 2>/dev/null || true)"
  if printf '%s\n' "$info" | grep -qi "does not have any active connection"; then
    echo "0"
    return 0
  fi

  printf '%s\n' "$info" | awk '
    /^CONNECTOR ID/ {in_table=1; next}
    in_table && $1 ~ /^[0-9a-f-]{8,}$/ {count++}
    END {print count+0}
  '
}

cloudflared_process_check() {
  local cfg="$1"
  local lines total managed unmanaged

  lines="$(ps -eo args | grep '[c]loudflared' || true)"
  total="$(printf '%s\n' "$lines" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ -z "$lines" || "$total" -eq 0 ]]; then
    echo "0:0:0"
    return 0
  fi

  managed="$(printf '%s\n' "$lines" | grep -F "/usr/bin/cloudflared tunnel --config $cfg run" | wc -l | tr -d ' ')"
  unmanaged=$(( total - managed ))
  echo "${total}:${managed}:${unmanaged}"
}

check_http_code() {
  local url="$1"
  local expected_regex="$2"
  local label="$3"

  local code
  code="$(http_status "$url")"
  if [[ "$code" =~ $expected_regex ]]; then
    ok "$label (status=$code)"
  else
    fail "$label (status=$code, expected=$expected_regex)"
  fi
}

check_cert_days_left() {
  local cert_path="$1"
  local label="$2"

  if [[ ! -f "$cert_path" ]]; then
    warn "$label cert missing: $cert_path"
    return
  fi

  if ! have_cmd openssl; then
    warn "openssl not found; skipping cert check for $label"
    return
  fi

  local enddate epoch_now epoch_end days_left
  enddate="$(openssl x509 -enddate -noout -in "$cert_path" | cut -d= -f2- || true)"
  if [[ -z "$enddate" ]]; then
    warn "$label cert end date unreadable"
    return
  fi

  epoch_now="$(date +%s)"
  epoch_end="$(date -d "$enddate" +%s 2>/dev/null || echo "")"
  if [[ -z "$epoch_end" ]]; then
    warn "$label cert end date parse failed: $enddate"
    return
  fi

  days_left=$(( (epoch_end - epoch_now) / 86400 ))
  if (( days_left < 0 )); then
    fail "$label cert expired ($days_left days)"
  elif (( days_left < 15 )); then
    warn "$label cert expiring soon (${days_left} days)"
  else
    ok "$label cert valid (${days_left} days left)"
  fi
}

echo "== IDCS health check =="
echo "time=$(date -Iseconds)"
echo

echo "[1] Service status"
if service_is_active nginx; then ok "nginx active"; else fail "nginx inactive"; fi
if service_is_active gunicorn; then ok "gunicorn active"; else fail "gunicorn inactive"; fi
if service_is_active cloudflared; then
  ok "cloudflared active"
  cf_proc_stats="$(cloudflared_process_check "$CF_TUNNEL_CONFIG")"
  cf_total_procs="${cf_proc_stats%%:*}"
  cf_proc_stats_rest="${cf_proc_stats#*:}"
  cf_managed_procs="${cf_proc_stats_rest%%:*}"
  cf_unmanaged_procs="${cf_proc_stats_rest##*:}"

  if [[ "$cf_total_procs" -eq 0 ]]; then
    fail "cloudflared process not found in ps output"
  elif [[ "$cf_managed_procs" -ne 1 ]]; then
    fail "cloudflared managed process count expected=1 actual=${cf_managed_procs}"
  else
    ok "cloudflared managed process count=${cf_managed_procs}"
  fi

  if [[ "$cf_unmanaged_procs" -gt 0 ]]; then
    fail "cloudflared unmanaged/duplicate processes detected=${cf_unmanaged_procs}"
  else
    ok "cloudflared unmanaged processes=0"
  fi

  if have_cmd cloudflared; then
    cf_tunnel_id="$(cloudflared_tunnel_id || true)"
    if [[ -n "$cf_tunnel_id" ]]; then
      cf_connectors="$(cloudflared_active_connectors "$cf_tunnel_id" || true)"
      if [[ -z "$cf_connectors" ]]; then
        warn "cloudflared connector check unavailable (tunnel=$cf_tunnel_id)"
      elif [[ "$cf_connectors" -eq 0 ]]; then
        fail "cloudflared tunnel has no active connectors (tunnel=$cf_tunnel_id)"
      else
        ok "cloudflared tunnel connectors active=${cf_connectors} (tunnel=$cf_tunnel_id)"
      fi
    else
      warn "cloudflared tunnel id not found in $CF_TUNNEL_CONFIG"
    fi
  else
    warn "cloudflared CLI missing; skipped connector check"
  fi
else
  warn "cloudflared inactive"
fi

echo
echo "[2] Local HTTP checks"
check_http_code "$LOCAL_FRONTEND_URL" '^(200|301|302)$' "local frontend"
check_http_code "$LOCAL_LOGIN_URL" '^(200|400|401|405)$' "local login API"

echo
echo "[3] Public HTTPS checks"
check_http_code "$PUBLIC_FRONTEND_URL" '^(200|301|302)$' "public frontend"
check_http_code "$PUBLIC_BACKEND_URL" '^(200|400|401|405)$' "public login API"

echo
echo "[4] TLS certificate freshness"
check_cert_days_left "${CERT_BASE}/${FRONTEND_HOST}/fullchain.pem" "$FRONTEND_HOST"
check_cert_days_left "${CERT_BASE}/${BACKEND_HOST}/fullchain.pem" "$BACKEND_HOST"

echo
echo "[5] Recent error signals (last 20 min)"
if have_cmd journalctl; then
  g_err="$(journalctl -u gunicorn --since '20 min ago' --no-pager 2>/dev/null | grep -E 'Traceback|ERROR|CRITICAL|WORKER TIMEOUT' || true)"
  n_err="$(journalctl -u nginx --since '20 min ago' --no-pager 2>/dev/null | grep -E 'error|crit|emerg' || true)"
  c_err="$(journalctl -u cloudflared --since '20 min ago' --no-pager 2>/dev/null | grep -E 'ERR|error|x509|502|503|connection reset' || true)"

  g_err="$(printf '%s\n' "$g_err" | sed '/^$/d' | wc -l | tr -d ' ')"
  n_err="$(printf '%s\n' "$n_err" | sed '/^$/d' | wc -l | tr -d ' ')"
  c_err="$(printf '%s\n' "$c_err" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$g_err" -gt 0 ]]; then warn "gunicorn recent error lines=$g_err"; else ok "gunicorn recent errors=0"; fi
  if [[ "$n_err" -gt 0 ]]; then warn "nginx recent error lines=$n_err"; else ok "nginx recent errors=0"; fi
  if [[ "$c_err" -gt 0 ]]; then warn "cloudflared recent error lines=$c_err"; else ok "cloudflared recent errors=0"; fi
else
  warn "journalctl unavailable; skipped log checks"
fi

echo
echo "== Summary =="
echo "pass=$PASS_COUNT warn=$WARN_COUNT fail=$FAIL_COUNT"

if (( FAIL_COUNT > 0 )); then
  exit 2
fi
if (( WARN_COUNT > 0 )); then
  exit 1
fi
exit 0
