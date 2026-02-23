# Backend (Django + DRF)

Setup (local development):

- Create a virtualenv and install requirements:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

- Copy `.env.sample` to `.env` and update DB settings (for Supabase, set `DATABASE_URL` accordingly).
- Run migrations and create superuser:

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

API endpoints:
- `POST /api/accounts/token/` -> obtain JWT (username + password)
- `POST /api/accounts/token/refresh/` -> refresh
- `POST /api/accounts/register/` -> create user
- `GET  /api/accounts/me/` -> get current user (requires Bearer token)

SMS / OTP (mobile verification):

- Default: SMS is logged (no real send).
- To send OTP, pick a backend and set in `backend/.env`:

```env
# Option A: SMS gateway (HTTP GET)
SMS_BACKEND=http_get
SMS_GATEWAY_URL=https://your-sms-provider.example/send?to={to}&message={message}

# Option B: WhatsApp (uses local whatsapp-web.js microservice)
# SMS_BACKEND=whatsapp
# OBE_WHATSAPP_API_URL=http://127.0.0.1:3000/send-whatsapp
# OBE_WHATSAPP_API_KEY=change-me
```

`SMS_GATEWAY_URL` must include `{to}` and `{message}` placeholders.

WhatsApp microservice notes:

- The backend expects an HTTP endpoint at `OBE_WHATSAPP_API_URL` that accepts:

```http
POST /send-whatsapp
Content-Type: application/json

{ "api_key": "...", "to": "91XXXXXXXXXX", "message": "..." }
```

- Quick test (replace values):

```bash
curl -sS 'http://127.0.0.1:3000/send-whatsapp' \
	-H 'Content-Type: application/json' \
	-d '{"api_key":"change-me","to":"91XXXXXXXXXX","message":"Test from IDCS"}'
```
