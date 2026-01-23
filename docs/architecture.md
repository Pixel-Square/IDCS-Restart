# Architecture Overview

This project is a small College ERP split into two main parts:

- backend/ (Django + DRF)
  - `accounts` app: authentication and authorization (custom `User`, roles, permissions)
  - `academics` app: academic domain (profiles, academic masters, courses, semesters, subjects)
  - `erp` project: Django settings and URL routing

- frontend/ (Vite + React + TypeScript)
  - simple SPA that authenticates via JWT and consumes backend APIs

Key design principles
- Separation of concerns: auth and domain data live in separate apps (`accounts` vs `academics`).
- Role/permission model is centralized in `accounts` and used for authorization only.
- Academic master data lives in `academics` and is referenced from profiles.

Core endpoints (backend)
- `POST /api/accounts/token/` — obtain `access` + `refresh` tokens using `identifier` + `password`.
  - `identifier` = email or student `reg_no` or staff `staff_id`.
- `POST /api/accounts/token/refresh/` — refresh access token using `refresh`.
- `GET /api/accounts/me/` — authenticated endpoint that returns user info, roles, permissions.

Admin
- Both `accounts` and `academics` register admin models and inlines for convenient management.

Token handling (frontend)
- Frontend uses an axios instance that attaches `access` token and automatically refreshes
  when a request returns 401. On refresh failure the user is logged out.
