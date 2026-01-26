# IDCS-Restart Setup Guide

## Quick Start

### Backend Setup (Django)

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create a virtual environment (if not already created):

   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:
   - Windows: `.venv\Scripts\activate`
   - Mac/Linux: `source .venv/bin/activate`

4. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Run migrations:

   ```bash
   python manage.py migrate
   ```

6. Create a superuser (optional):

   ```bash
   python manage.py createsuperuser
   ```

7. Start the Django development server:
   ```bash
   python manage.py runserver
   ```

The backend should now be running at: http://localhost:8000

### Frontend Setup (React + Vite)

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend should now be running at: http://localhost:3000

## Login Page

Visit http://localhost:3000/login to access the login page.

You can log in using:

- **Email**: your college email
- **Register Number**: student registration number
- **Staff ID**: staff identifier
- **Password**: your password

## API Endpoints

The backend exposes the following authentication endpoints:

- `POST /api/accounts/token/` - Login (obtain JWT tokens)
- `POST /api/accounts/token/refresh/` - Refresh access token
- `GET /api/accounts/me/` - Get current user info
- `POST /api/accounts/register/` - Register new user

## Environment Variables

### Backend (.env)

Already configured in `backend/.env`. Uses SQLite by default.

### Frontend (.env)

Already configured in `frontend/.env`:

```
VITE_API_BASE=http://localhost:8000
```

## CORS Configuration

The backend is already configured with CORS enabled for all origins during development (`CORS_ALLOW_ALL_ORIGINS = True` in settings.py).

## Notes

- The login system supports authentication via email, student registration number, or staff ID
- JWT tokens are used for authentication
- Access tokens expire after 60 minutes (configurable)
- Refresh tokens expire after 1 day
