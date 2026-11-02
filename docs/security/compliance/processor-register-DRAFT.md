# Third-Party Processor Register (DRAFT)

Purpose: DPDP Act 2023 / DPDP Rules 2025 require the Data Fiduciary (the college) to know every
Data Processor that handles personal data for it, what it receives, and under what contract.
Rows below were pre-filled from the code on 2026-10-23. **Fill the blank columns and confirm or
delete each row.** "NEEDS LEGAL REVIEW" marks points for counsel.

## What to fill in for each provider

| Column | What to write | Where to find it |
|---|---|---|
| Account owner | Which legal entity holds the account: the college, your company, or an individual | Provider's billing/admin page |
| Live? | Yes / No / Dev only | Production `.env` on the server (`SMS_BACKEND`, `EMAIL_HOST`, …) |
| Data sent | Personal-data fields that leave our system | Pre-filled from code; correct it if wrong |
| Purpose | Why the data is sent | Pre-filled |
| Processing location | Country/region where the provider stores or processes the data | Provider's data-residency or DPA page |
| Contract / DPA | Signed agreement or accepted online terms, with date and link | Provider's legal page; your records |
| Retention at provider | How long the provider keeps it, and whether you can delete it | Provider settings / DPA |
| Breach contact | Provider's security/incident email | Provider's trust page |

## Register

| # | Provider | Service | Live? | Account owner | Data sent (from code) | Purpose | Location | Contract / DPA | Retention | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cloudflare | Tunnel + DNS for `*.krgi.co.in` (`deploy/cloudflared-idcs.yml`) | Yes | | **All HTTP traffic**, including logins, JWTs and every API response, because TLS terminates at Cloudflare | Publish the on-prem server | Global edge (check Cloudflare data-localisation options) | | | Highest-volume processor. JWTs in URLs (D-02) appear in its logs |
| 2 | Google (Gmail SMTP) | Outgoing email (`EMAIL_HOST=smtp.gmail.com`, `erp/settings.py:534`) | | **Personal Gmail by default** (`erp/settings.py:536`) | Recipient emails, names, notification content | Notifications / password-related mail | Google global | | | Move to an institutional account (Google Workspace for Education or similar) — NEEDS LEGAL REVIEW |
| 3 | Google (Sheets/Drive API) | Marks sync (`academic_v2/google_sheets_service.py`) | | | Student register numbers, names, marks per question | Faculty mark entry in Sheets | Google global | | | Marks of minors leave the system |
| 4 | Meta / WhatsApp via `whatsapp-web.js` | OTP + notifications (`whatsapp-server/`, `OBE_WHATSAPP_*`) | Yes (per `whatsapp.service`) | Owner of the linked phone number | Mobile numbers, OTPs, mark/publish notifications, names | OTP verification, academic notifications | Meta global | | | Unofficial WhatsApp Web client — may breach WhatsApp terms; consider the official WhatsApp Business API — NEEDS LEGAL REVIEW |
| 5 | Twilio | SMS/Verify (`SMS_BACKEND=twilio`) | | | Mobile numbers, OTPs | OTP | US (default) | | | Only if `SMS_BACKEND=twilio` in production |
| 6 | Generic SMS gateway | `SMS_BACKEND=http_get`, `SMS_GATEWAY_URL` | | | Mobile numbers, message text | SMS | | | | Name the provider if used |
| 7 | Canva | Poster/branding (`template_api/canva_views.py`) | | | Event details, possibly staff names/photos on posters | Event posters | Canva global | | | |
| 8 | n8n | Branding workflows (`N8N_BRANDING_WEBHOOK_URL`, `tools/.n8n*`) | | | Event/poster data | Automation | Self-hosted? | | | If self-hosted on our server it is not a third party; confirm |
| 9 | Microsoft Power BI | Pulls the reporting API (`REPORTING_API_KEY`, `reporting/`) | | | Student/faculty names, marks, **photo URLs** | Dashboards | Microsoft tenant region | | | Whoever owns the Power BI workspace is a processor |
| 10 | GitHub | Source hosting (`github.com/Pixel-Square/IDCS-Restart`) | Yes | Pixel-Square org | **Full database dumps and a student roster are committed** (audit #1) | Code hosting | US | | | Remove the data (audit #1); GitHub should then hold none |
| 11 | Payment gateway | Planned | No | | (future) | Fee collection | | | | Choose an RBI-authorised Indian PA; never store card data (PCI-DSS) |
| 12 | Backup storage | Off-site backups (in India, per owner) | Yes | | Full database | Disaster recovery | India (confirmed by owner) | | | Name the provider or site |

## Analytics / trackers in the web apps

None found: no Google Analytics, Tag Manager, Hotjar, Clarity, Mixpanel or Segment in `frontend/` or
`coe/` (checked 2026-10-23).
