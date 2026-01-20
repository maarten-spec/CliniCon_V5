# Deployment Guide for app.clinicon.de Internal Pages

## 1. Pages Build Configuration
- **Build command:** (leave empty). This repo is a pure static site with no build stepâ€”Cloudflare Pages should be configured with an empty build command.
- **Output directory:** `.` (the repo root). The `pages/` tree is rendered as-is, and `assets/` holds shared static files.
- **Functions directory:** `functions` (Cloudflare Pages automatically exposes `/api/*` from `functions/api/*.js`).

## 2. Environment Bindings
- **D1 Database binding:** 
  - `binding`: `DB`
  - `database_name`: `db_clinicon`
  - `database_id`: `d371882f-ca67-47c0-aa9f-c2d9fffc017f`

Ensure the above binding is added on the Pages project Settings â†’ Functions â†’ D1 Databases section.

## 3. Key Files/Paths
- `pages/internerBereich/GFO/pages/stellenplan.html` (entry point for the scheduler UI)
- `/internerBereich/assets/stellenplan.app.js` (frontend logic that talks to `/api/*`)
- `/functions/api/*.js` (backend endpoints exposed at `/api/*`)

## 4. Local Testing Checklist
1. `wrangler pages dev . --d1 DB=db_clinicon` (runs Cloudflare Pages emulator with the D1 binding)
2. `curl http://127.0.0.1:8787/api/org-units` (expect JSON array)
3. `curl http://127.0.0.1:8787/api/qualifikationen`
4. `curl "http://127.0.0.1:8787/api/stellenplan?org=STA1&year=2026&dienstart=01"` (use a valid org code/year)

## 5. Post-Deploy Smoke Tests (app.clinicon.de)
1. `https://app.clinicon.de/api/org-units`
2. `https://app.clinicon.de/api/qualifikationen`
3. `https://app.clinicon.de/api/stellenplan?org=STA1&year=2026&dienstart=01`
4. `https://app.clinicon.de/pages/internerBereich/GFO/pages/stellenplan.html` (verify Access badge shows and scheduler loads)

## 6. Notes
- Static assets under `/assets/*` and html under `/pages/*` are served without a build step.
- The frontend uses `fetch("/api/...")`, so ensure Functions are reachable through the same origin (Cloudflare Access must not block `/api` for authenticated users).
