# Performance Based Appraisal System (PBAS) — Standalone Project

This is a standalone, full-stack implementation of the **Performance Based Appraisal System (PBAS)** extracted from IDCS. It features dedicated backend, frontend, and a standalone SQLite database.

---

## 📁 Project Structure

```
pbas/
├── db.sqlite3                # Dedicated standalone SQLite database (copied at root)
├── README.md                 # Project documentation & run guide
├── backend/                  # Standalone Django Backend
│   ├── manage.py
│   ├── db.sqlite3            # Active Django SQLite database
│   ├── requirements.txt      # Python dependencies
│   ├── seed_pbas.py          # Complete database seeder with demo accounts & criteria
│   ├── pbas_backend/         # Django project configuration & settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── accounts/             # Role-based User & Profile Management
│   │   ├── models.py         # User, Role, Department, College, StaffProfile, StudentProfile
│   │   ├── views.py          # Login, Me, DemoUsers, Roles, Departments
│   │   ├── serializers.py
│   │   └── urls.py
│   └── pbas_core/            # Core Appraisal Engine
│       ├── models.py         # CustomDepartment, Node, Submission, ApprovalFlow, Duration
│       ├── views.py          # Submissions, Approvals, Sequential Actions, Logs, Activity
│       ├── serializers.py
│       ├── permissions.py    # IsIQACManager, IsApprover, IsAuthenticatedSubmitter
│       ├── utils.py
│       └── urls.py
└── frontend/                 # Standalone React + TypeScript + Tailwind CSS Frontend
    ├── package.json
    ├── vite.config.ts        # Configured proxy to backend (/api -> http://127.0.0.1:8000)
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx           # Full route flow (Welcome -> Login -> Dashboard)
        ├── types/pbas.ts     # TypeScript interfaces
        ├── services/
        │   ├── auth.ts       # Token & JWT session handling
        │   └── pbas.ts       # All API calls for trees, submissions & approvals
        ├── components/
        │   └── layout/
        │       ├── DashboardLayout.tsx
        │       ├── DashboardSidebar.tsx  # Dynamic sidebar with role switcher
        │       └── DashboardTopbar.tsx
        └── pages/
            ├── WelcomePage.tsx          # 1. Welcome Landing Page with 1-Click Role Login
            ├── LoginPage.tsx            # 2. Login Page with quick credentials
            ├── DashboardHome.tsx        # 3. Dashboard Overview with KPI metrics & breakdown
            ├── PBASSubmissionPage.tsx   # 4. Criteria Tree & Evidence Submission Form
            ├── MySubmissionsPage.tsx    # 5. User Submission History & Review Timeline
            ├── PBASApprovalsPage.tsx    # 6. Approver Review Hub (Approve / Reject)
            ├── PBASAdminPage.tsx        # 7. Framework Tree Builder, Cycles & Audit Logs
            └── ProfilePage.tsx          # 8. User Profile & Credit Breakdown
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup & Run

In a terminal, navigate to `pbas/backend`:

```bash
cd /home/iqac/IDCS-MAIN/pbas/backend

# Activate your python virtual environment
source /home/iqac/IDCS-MAIN/backend/.venv/bin/activate

# (Optional: database is already migrated and seeded)
python manage.py migrate
python seed_pbas.py

# Start Django development server
python manage.py runserver 0.0.0.0:8000
```

The backend API will run on `http://127.0.0.1:8000/api/`.

---

### 2. Frontend Setup & Run

In another terminal, navigate to `pbas/frontend`:

```bash
cd /home/iqac/IDCS-MAIN/pbas/frontend

# Start Vite development server
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 👥 Pre-Seeded Demo Role Credentials

All demo accounts share the password: **`password123`**. You can also use the **1-Click Login buttons** on the Welcome Page or the Quick Role Switcher in the dashboard sidebar.

| Persona / Role | Email | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Faculty Submitter** | `faculty@pbas.edu` | `password123` | Submit criteria proofs, PDF evidence, view approval status |
| **HOD Approver** | `hod@pbas.edu` | `password123` | 1st tier review for departmental faculty, approve / reject |
| **Principal (Dean)** | `principal@pbas.edu` | `password123` | Final executive review, grant career advancement credits |
| **IQAC / PBAS Admin** | `iqac@pbas.edu` | `password123` | Manage criteria hierarchy, durations, audit logs, analytics |
| **Student Submitter** | `student@pbas.edu` | `password123` | Submit student development activities & competition awards |

---

## 🔄 Application User Journey

1. **Welcome Page (`/`)**:
   - Modern hero section with UGC & NAAC appraisal framework overview.
   - Interactive role cards with 1-click test login for immediate access.
2. **Login Page (`/login`)**:
   - Authentication with email/username and password.
   - Quick-fill buttons for Faculty, Approver, Principal, Admin, and Student.
3. **Dashboard (`/dashboard`)**:
   - Dynamic sidebar navigation tailored to the active user's roles.
   - Category progress meters for Parts A (Teaching), B (Student Development), C (Research), D (Governance).
4. **PBAS Submission Page (`/dashboard/submit`)**:
   - Interactive criteria tree navigation across Parts A, B, C, D.
   - Leaf node submission modal with dynamic form schema, PDF/Image evidence upload, and web links.
5. **My Submissions (`/dashboard/my-submissions`)**:
   - Track pending stages, approved points, and rejection remarks with a chronological review timeline.
6. **Approver Hub (`/dashboard/approvals`)**:
   - Review pending queue, view submitted evidence/documents, and approve or reject with remarks.
7. **PBAS Admin & Manager (`/dashboard/admin`)**:
   - Edit criteria tree, points, audience, assessment cycles, and inspect audit logs.
