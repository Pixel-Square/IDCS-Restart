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
