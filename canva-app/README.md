# IDCS Poster Maker — Canva App

A **Canva Apps SDK** panel that runs inside Canva's editor. It lets Branding staff and HODs inject IDCS event details directly into a Canva poster design.

## App credentials

| Variable | Value |
|---|---|
| `CANVA_APP_ID` | `AAHAAJpXAcc` |
| `CANVA_APP_ORIGIN` | `https://app-aahaajpxacc.canva-apps.com` |
| Production URL | `https://app-aahaajpxacc.canva-apps.com/index.html` |

## Quick start — development

```bash
cd canva-app
npm install
npm run dev          # starts on http://localhost:8080
```

Then in the [Canva developer portal](https://www.canva.com/developers/apps):
1. Open your app (`AAHAAJpXAcc`)
2. Set **Development URL** → `http://localhost:8080`
3. Open any Canva design → Apps panel → **IDCS Poster Maker**

> The app requires the Vite dev server's `Cross-Origin-Resource-Policy: cross-origin` headers to load inside Canva's iframe — the `vite.config.ts` sets these automatically.

## Features

| Tab | What it does |
|---|---|
| **Event Data** | Fill in event fields (title, venue, date, chief guest, etc.) and click **+ Add** to insert each field as a styled text box in the active Canva design. Optionally fetch pending events from the IDCS backend. |
| **Presets** | One-click preset layouts for Seminars, Workshops, Guest Lectures, Fests, and Competitions. All text fields are inserted at once. |
| **Help** | Setup instructions and app credentials. |

## Build for deployment

```bash
npm run build        # outputs to canva-app/dist/
```

Upload the `dist/` folder to your hosting, or let Canva host the app by publishing through the developer portal.

## Project structure

```
canva-app/
├── .env                        # Dev env vars (CANVA_APP_ID etc.)
├── .env.production             # Production env vars
├── package.json
├── tsconfig.json
├── vite.config.ts              # Port 8080, CORS headers, IDCS API proxy
└── src/
    ├── index.html              # App entry (inside src/ per Canva convention)
    ├── index.tsx               # ReactDOM.createRoot mount
    ├── App.tsx                 # Tab shell (Event Data | Presets | Help)
    ├── styles.css              # Panel CSS (no framework, tiny footprint)
    ├── components/
    │   ├── EventDataPanel.tsx  # Per-field insert + "Add All" + IDCS fetch
    │   └── TemplatePresetsPanel.tsx  # Ready-made text groups per event type
    └── utils/
        ├── canvaHelpers.ts     # addNativeElement wrappers
        └── idcsApi.ts          # Fetch pending events from Django backend
```

## Backend API note

`idcsApi.ts` calls `/api/events/?status=Pending+Approval` — proxied by Vite to `CANVA_BACKEND_HOST`. In production, configure your Django backend's CORS settings to allow requests from `https://app-aahaajpxacc.canva-apps.com`.
