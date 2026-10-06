# Render hosting: employee library

The employee library needs a Node web service and persistent PostgreSQL. Use the new `render-library.yaml` Blueprint. The existing `render.yaml` remains the legacy guest-only static configuration; it cannot run the account API.

Use Node.js 24.15.0, build command `npm ci --include=dev && npm run build:render`, start command `npm start`, and health path `/api/health`. The server binds Render’s `PORT` on `0.0.0.0` and serves `.next-render` with the library API. The web-service plan is free.

Set `NODE_ENV=production`, `DATABASE_URL`, `LIBRARY_ADMIN_ID` and `LIBRARY_ADMIN_PIN` in Render environment settings. Optional settings: `LIBRARY_ADMIN_NAME` and `LIBRARY_MAX_BYTES` (default 1 GB upload budget). The Blueprint asks for an existing database URL and provisions no database or paid disk. Choose persistent PostgreSQL and a storage budget appropriate to its capacity. Production fails clearly if no database URL is provided.

An existing static site cannot change its runtime to Node in place. Create the new web service from the Blueprint or matching dashboard settings, supply environment variables, and verify employee flows before presenting its URL. Move an existing custom domain only after verification. Repository changes do not alter existing Render resources.

Verify `/api/health` reports `storage: postgres`, sign in with the initial administrator, change its PIN, add an employee, and upload a PDF and EPUB. Confirm progress returns after sign-out/sign-in and after restarting the service. Uploaded files, accounts and reading records live in PostgreSQL and survive web-service redeploys.

Free web services may sleep when idle, making the first sign-in slower. Cold sign-in needs an online connection. Book downloads are private and bypass service-worker caching. Explicit offline downloads use IndexedDB per account; the app and public bundled book retain the existing offline cache. Device voices can narrate offline.

The local Cloudflare build remains available with `npm run build` and `npm run start:cloudflare`; the Node gateway presents its frontend and library API on 5180.

The initial free deployment uses Oregon and separate `library_*` tables in the existing `toyota-survey-db` instance. It does not change survey tables. Its library upload budget is 256 MB to leave database space for survey responses and reading records. Render reports that the free database expires on 29 October 2026; arrange a backup or replacement before that date. The administrator credentials are saved locally in the ignored `.library-data/render-admin.txt`, not in Git.
