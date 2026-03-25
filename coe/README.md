# COE (Standalone UI)

This folder contains a separate COE UI app at the repo root.

## Dev

From the repo root:

- Install: `npm --prefix coe install`
- Run: `npm --prefix coe run dev`

The app proxies `/api` to Django (default `http://127.0.0.1:8000`).
You can override it with `VITE_DEV_API_PROXY_TARGET`.

## Styling

Edit `coe/src/index.css` and `coe/tailwind.config.js` to customize COE-only UI styles.

## Migration status

The COE app is now self-contained:

- All COE pages are served from `coe/src/pages/COE/*`
- COE services and retrieval logs are served from `coe/src/services/*` and `coe/src/utils/*`
- App routing no longer imports anything from `frontend/src`
