# Employee library setup and operation

## Local preview

Requires Node.js 22.13+ (24.15 recommended).

```powershell
npm ci
npm run build:render
npm start
```

Open `http://127.0.0.1:5180`. The server creates `.library-data/library.sqlite` on first start and generates a local administrator with ID `LIBRARY-ADMIN`. Its initial random PIN is printed once and saved in the ignored `.library-data/local-admin.txt`. Use that account to add employees, then change the PIN from the account button.

For development, `npm run dev` starts the frontend on 5180 and the API on 5181. `npm run build` preserves the Cloudflare build; `npm run start:cloudflare` presents it with the library API through 5180, with the local worker on 5182. Run one preview mode at a time.

## Employee features

- Employee ID + PIN/passphrase sign-in, with administrator-provisioned accounts and self-service PIN changes.
- Resume at the last PDF page or EPUB CFI position, including on another device using the same server.
- Favorites, completed books, up to 100 bookmarks per book, and private notes.
- Search titles, authors, descriptions and topics; filter by collection or personal shelf; sort by title, date or reading progress; grid/list views.
- Original PDF rendering, zoom, text view, contents, direct page jumps and EPUB pagination.
- Read aloud, pause/resume/stop, installed voices, speed and continuous narration.
- Device-local saves queue while offline and sync automatically on reconnection. Status distinguishes device saves from confirmed server receipt. Conflicting changes from another device require choosing which copy to keep.
- Save shared books on a device for offline reading while signed in. Sign-in needs a connection. The bundled book supports guest offline reading after the app has been cached.
- Personal files stay in memory for the current visit. They are cleared on sign-out, and do not enter the shared catalog or the employee’s saved record.
- Four minutes of inactivity shows a 30-second sign-out warning. Active narration prevents timeout. Sign-out clears the visible account, stops audio, removes personal imports and resets controls; account progress remains saved.

## Administration

Sign in as an administrator and choose **Manage library**.

- Select/drop up to 100 PDFs/EPUBs per batch, at most 50 MB each. Each file has an individual result. A failed file does not discard successful uploads. Retrying identical contents skips duplicates.
- Assign collection, author and language defaults to each batch. Edit title, author, collection, description, language and availability afterward.
- Archive and restore books. Archiving hides a book and its download endpoint without deleting its file or employee reading records.
- Select up to 100 books to archive, restore, or move to another collection together. Catalog search and availability filters help manage large collections.
- Add employees individually or import up to 200 from CSV with `employeeId,name,pin` and optional `role` (`employee` or `admin`). Quoted CSV and Unicode names are supported. Existing IDs retain their credentials.
- Pause/reactivate access or reset a PIN. PIN resets and paused access revoke existing sessions. The signed-in administrator’s own access cannot be paused through the directory.
- View reader counts per book. Private notes remain available only to their employee account.

CSV example (replace the example PINs before using):

```csv
employeeId,name,pin,role
EMP-001,Aiko Tanaka,replace-with-private-pin,employee
EMP-002,Sudha,replace-with-another-pin,employee
```

## Persistent storage and security

The backend uses SQLite locally and PostgreSQL in production with the same schema. Uploaded book bytes live in the database and survive service restarts and redeploys. Default upload storage budget: 1 GB. Set `LIBRARY_MAX_BYTES` to fit the capacity of the chosen database. Notes are limited to 20,000 characters. Local data, credentials and environment files are ignored by Git.

Production requires `DATABASE_URL`; first startup also requires `LIBRARY_ADMIN_ID` and `LIBRARY_ADMIN_PIN` (at least 6 characters). Optional `LIBRARY_ADMIN_NAME` names the initial administrator. The production server refuses ephemeral SQLite. PostgreSQL TLS options belong in the connection URL; the app does not disable certificate verification.

Use `render-library.yaml` for the employee backend. The original `render.yaml` describes the legacy static kiosk and supports guest reading only. See `RENDER.md` for the transition. Local commands do not provision cloud resources.

Sessions use hashed random tokens, HttpOnly/SameSite cookies, server-side role checks and PINs hashed with scrypt. Incorrect sign-ins are rate-limited. This is an administrator-managed directory; it does not verify identity against Toyota HR or corporate SSO. Administrators must provision authorized IDs and distribute initial PINs privately. Corporate SSO can be connected when its provider is known.

Signing into a different account in another browser tab clears the previous account from its tab. Saves are bound to that tab’s account ID so stale tabs cannot overwrite another employee’s progress.

Back up the database regularly. To back up local SQLite, stop the preview and copy `.library-data` (including any WAL files). Browser storage contains offline copies and unsynced changes; clearing it does not remove records already received by the server. Queued changes belong to the account’s immutable database ID and only resume syncing when that account signs back in.

## Verification

```powershell
npm run test:library
node node_modules/typescript/bin/tsc --noEmit
npm run build:render
npm run build
npx playwright install chromium --only-shell
npm run test:browser
```

Server checks use isolated temporary data. Browser checks use an in-memory database and synthetic PDF/EPUB books; they verify upload/login/progress/offline workflows and save screenshots in the ignored `outputs/employee-library` folder. Layout checks cover 1920×1080, 1366×768, 1280×720, portrait and mobile. Build the Render frontend before browser checks.
