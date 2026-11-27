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
- Resume at the last PDF page or EPUB CFI position, including on another device using the same server. Open **My reading progress** from the library, reader or account panel for account totals, per-book progress, last-read dates and resume actions.
- Favorites, a separate private read-later list, personal finish-by targets, completed books, up to 100 bookmarks per book, and private notes. Download notes and bookmarks as a Unicode text file.
- Search titles, authors, descriptions and topics; filter by collection or personal shelf; sort by title, recently added, last read or reading progress; grid/list views. The progress dashboard also filters all account books, in-progress or completed books, read-later books, unfinished personal targets and past targets. Sort by last read, progress, title or target date.
- Original PDF rendering, zoom, text view, contents, direct page jumps and EPUB pagination. A page scrubber above the page buttons jumps to any PDF page or EPUB position; its bubble previews the destination before you let go.
- **Find in book** (Ctrl+F) searches the whole PDF or EPUB; **Whole page** fits a full PDF page on screen; swipe left or right to turn pages.
- **Page colour** in Settings: Light, Sepia or Night. Night darkens pages and every reader control for low light (PDF pages are shown with inverted colours); the choice lasts for the visit.
- Read aloud, pause/resume/stop, installed voices, speed and continuous narration. In PDF text view the sentence being read is highlighted and kept in view.
- Device-local saves queue while offline and sync automatically on reconnection. Status distinguishes device saves from confirmed server receipt. Conflicting changes from another device require choosing which copy to keep.
- Save shared books on a device for offline reading while signed in. Sign-in needs a connection. The bundled book supports guest offline reading after the app has been cached.
- Personal files stay in memory for the current visit. They are cleared on sign-out, and do not enter the shared catalog or the employee's saved record.
- Four minutes of inactivity shows a 30-second sign-out warning. Active narration prevents timeout. Sign-out clears the visible account, stops audio, removes personal imports and resets controls; account progress remains saved.

## How reading progress works

**My reading progress** belongs to the signed-in employee account. It summarizes books started, books the employee marked completed, read-later books and favorites, and shows each book's saved position, progress, last-read date and bookmark count. Resume, favorite and completion actions are available for currently available books. Guest visits and personal imported files do not create persistent account progress.

- **PDF pages opened:** coverage is the number of distinct pages successfully displayed divided by the book's total pages. Revisits, zoom changes and rerenders do not add another page. A direct jump counts the destination page, not the pages skipped. Tracking records pages opened, not how much text was understood or time spent reading.
- **EPUB reading position:** progress uses the furthest location reached. Moving backward keeps that progress while updating the saved resume location. EPUB percentages depend on the book's generated locations rather than screen page numbers.
- **Employee-marked completion:** use **Mark completed** when you consider the book finished, or **Mark in progress** to reopen it. Completion is independent of coverage and position; reaching the last page does not automatically complete a book, and marking completed does not invent pages or force progress to 100%.
- **Existing records:** saved PDF pages, EPUB locations, notes, bookmarks, favorites and completion flags are retained. Older PDF records show their saved position until new coverage tracking begins. Tracking then counts only pages opened from that point onward; earlier pages are not inferred from the old page number.
- **Archived books:** each account keeps its reading record and book details in the progress dashboard. Archived or missing books appear unavailable for resume, while their saved history remains. Restoring an archived book makes it available again without resetting progress.

The reader and dashboard distinguish **Saved on this device** from **Saved to your account**. Pending changes sync to the server when the connection returns. Server-confirmed records are loaded on the next sign-in with that employee ID; keep the tab open if device storage is unavailable and a save is still pending. Conflicting changes retain separate copies until the employee chooses one.

## Reading rhythm

While a shared book is open and in use, the reader counts reading time for the signed-in employee: the screen must be visible and touched, scrolled or typed on within the last two and a half minutes, or narration must be playing. Time is saved per book and per local calendar day, at least once a minute and whenever the book closes, the tab is hidden or the employee signs out. It follows the same offline queue and server confirmation as other progress; when two devices report the same day, the larger total is kept, so retried saves never double-count.

**My reading progress** shows the current streak (consecutive days with at least a minute of reading; it stays alive until the end of today), the longest streak, this week's reading time against last week, and reading days over the last 12 weeks. A calendar heatmap shades each day from light to dark blue by minutes read; hover or use the arrow keys for a day's exact time, or open **Show daily reading time** for a table. The library heading shows the streak once it starts. Reading time is private to the employee: administrators see no per-employee times. Guest visits and personal files are not counted.

## Personal reading plans

**Read later** is a private list for the signed-in employee, separate from favorites. Toggle it on a library card or in **My reading progress**. A book saved for later appears in the dashboard even if it has never been opened, without incrementing Books started or creating page coverage. Opening or completing a book does not automatically remove it from the list; use the toggle whenever you want to remove it.

For a book in the progress dashboard, choose **Set target**, enter a finish-by date, and choose **Save target**. **Cancel** leaves the saved date unchanged. **Change target** lets you edit it or use **Remove target** to clear it. These are personal goals, not dates assigned by an employer. They do not trigger automatic completion.

- **Upcoming or today** counts unfinished books with a target on or after the device's current local calendar date.
- **Past target** counts unfinished books with an earlier target. **With targets** includes both groups; sorting by Target date places the earliest date first.
- **Mark completed** preserves the date as part of the reading record and excludes the book from unfinished target counts. Marking it in progress restores its applicable target status. These labels do not claim that a book was finished before its target.
- Archived books retain their target and read-later choice. Those personal settings can still be changed or removed while the book remains unavailable to open.

Read-later choices and target dates follow the existing account save process: device-local changes queue offline, server receipt is confirmed separately, and confirmed choices return after the next sign-in. They are stored alongside progress, notes and bookmarks without changing the shared catalog.

## Notes and bookmarks

While a shared book is open, choose **My notes** to open your reading space. Notes save automatically as you type, with a 20,000-character counter and clear device/server save status. **Sync now** retries pending changes; account conflicts must be resolved from the library first.

Search bookmark names (and PDF page numbers), show only the current location, or sort by saved order, name or PDF page number. **Rename bookmark** provides Save name and Cancel without changing the saved location. Removing a bookmark exposes **Undo** for the most recent removal while this panel remains open; restoring it still respects the 100-bookmark limit. Saving the current location again is disabled when it is already bookmarked, and a location must finish opening before it can be saved.

**Download notes & bookmarks** creates a UTF-8 text download containing this book's title, author, current notes and all saved bookmark labels and locations. Japanese, Kannada and other Unicode text are preserved. The export includes current device changes even if they are waiting to sync, and downloading does not modify or clear the account record.

## Administration

Sign in as an administrator and choose **Manage library**.

- Select/drop up to 100 PDFs/EPUBs per batch, at most 50 MB each by default (`LIBRARY_MAX_FILE_MB`, up to 512). When the server has Calibre, MOBI, AZW and AZW3 books are accepted too and converted to EPUB on upload; without it, the upload explains how to convert them first. A progress meter and individual results show processed, successful, waiting and failed files. A failed file does not discard successful uploads. Cancel remaining uploads, remove unsuccessful files or retry the batch; completed files are skipped and identical contents are deduplicated.
- Assign collection, author and language defaults to each batch. Edit title, author, collection, description, language and availability afterward.
- Covers are created automatically for new uploads: the first page of a PDF, or the cover image inside an EPUB. They are made in the administrator's browser with the reader's own PDF/EPUB engines and stored as small JPEGs; an EPUB without a cover image keeps the designed placeholder. **Create missing covers** does the same for books already in the catalog. Covers are served only to signed-in employees, with long-lived cache headers; a cover that cannot load (for example offline) falls back to the placeholder.
- Archive and restore books. Archiving hides a book and its download endpoint without deleting its file or employee reading records.
- Search the catalog and combine availability, collection, format, language and metadata-quality filters. **Needs review** finds books missing a description or using an empty/General collection; the individual metadata filters isolate either case. Sort by title, recently added, reader count or collection. The overview shows total, available and archived books and the number of collections. Browse 25, 50 or 100 books per page; changing filters or page size returns to the first result page.
- Select up to 100 books across pages and filters to change collection, author/publisher or language, or archive/restore them together. Blank metadata fields preserve existing values. The table checkbox selects or deselects only the current page. Other page and filter selections are preserved; the panel reports counts for this page, other matching pages and outside the current filters. Bulk changes apply to the entire selection. Successful updates are deselected and failed books remain selected for retry.
- Export all current filtered results with **Export all results CSV**. The download includes matching books on every page, with book IDs, metadata, availability, reader counts, file sizes and added dates. UTF-8 with a byte-order mark preserves Japanese, Kannada and other Unicode text in spreadsheet applications; quoted cells and formula-like text are handled safely. Export is disabled until a current catalog has loaded and while changes are running.
- View the configured library file storage budget, used bytes and remaining capacity. Archived book files still count against the budget; archiving does not reclaim their storage. This is the app's book-file quota, not a measurement of the database's total disk usage.
- Add employees individually or import up to 200 from CSV with `employeeId,name,pin` and optional `role` (`employee` or `admin`). Quoted CSV and Unicode names are supported. Existing IDs retain their credentials.
- Search the employee directory by name or ID, filter by role and active/paused access, and browse 25, 50 or 100 employees per page. Changing filters or page size returns to the first matching page.
- Pause/reactivate access or reset a PIN. PIN resets and paused access revoke existing sessions. The signed-in administrator's own access cannot be paused through the directory.
- View reader counts per book. Private notes remain available only to their employee account.

CSV example (replace the example PINs before using):

```csv
employeeId,name,pin,role
EMP-001,Aiko Tanaka,replace-with-private-pin,employee
EMP-002,Sudha,replace-with-another-pin,employee
```

## Large libraries

The library is sized for up to 10,000 books and about 100 employees reading at the same time on a modest server (4 cores, 32 GB memory, mirrored SSDs).

- **Book delivery.** Readers ask for books in byte ranges (the PDF reader uses 256 KB pieces), and the server sends only those bytes. Books stored in the database are read one megabyte at a time, so a large PDF never loads whole into memory.
- **Books on disk.** Set `LIBRARY_BOOKS_DIR` to a folder on persistent storage (for example `/srv/library/books`) and new uploads are saved there as files named by their SHA-256 digest, with only the details kept in the database. This keeps the database small and backups fast. Do not use it on hosts whose disk is wiped on redeploy, such as Render's free web service.
- **Moving existing books.** After setting `LIBRARY_BOOKS_DIR`, run `npm run library:move-books` with the same `DATABASE_URL` (or `LIBRARY_SQLITE_PATH`). It moves one book at a time and is safe to stop and run again. With PostgreSQL, run `VACUUM FULL library_books;` afterwards to return the freed space to the disk. Back up both the database and the books folder.
- **MOBI and Kindle books.** Install Calibre on the server. The library finds `ebook-convert` on the PATH, or set `LIBRARY_EBOOK_CONVERT` to its full path (on Windows, for example `C:\Program Files\Calibre2\ebook-convert.exe`). Uploads are converted one at a time, with a three-minute limit each. Books with copy protection (DRM) cannot be converted. A repeated upload of the same MOBI file is recognised before any conversion.
- **Catalogue.** Catalogue replies larger than 16 KB are compressed with Brotli or gzip, and carry an ETag, so a returning employee whose catalogue has not changed gets a short 304 reply. The offline copy of a very large catalogue keeps shortened descriptions if browser storage runs short.
- **Health check.** `/api/health` reports the database (`storage`), where book files live (`files`: `database` or `disk`) and whether MOBI conversion is available (`convertsMobi`).

## Persistent storage and security

The backend uses SQLite locally and PostgreSQL in production with the same schema. By default, uploaded book bytes live in the database and survive service restarts and redeploys; on a server with its own disk, `LIBRARY_BOOKS_DIR` stores them as files instead (see Large libraries below). Default upload storage budget: 1 GB. Set `LIBRARY_MAX_BYTES` to fit the capacity of the chosen database. The administration storage meter reports this book-file budget; leave space for database records, indexes and backups when choosing it. Notes are limited to 20,000 characters. Local data, credentials and environment files are ignored by Git.

Production requires `DATABASE_URL`; first startup also requires `LIBRARY_ADMIN_ID` and `LIBRARY_ADMIN_PIN` (at least 6 characters). Optional `LIBRARY_ADMIN_NAME` names the initial administrator. The production server refuses ephemeral SQLite. PostgreSQL TLS options belong in the connection URL; the app does not disable certificate verification.

Use `render-library.yaml` for the employee backend. The original `render.yaml` retains the legacy static service and sets `LIBRARY_REDIRECT_URL` to forward visitors to the employee library. See `RENDER.md` for the transition. Local commands do not provision cloud resources.

The server sends the app shell with a Content Security Policy (no plug-ins, no framing by other sites, same-origin connections only), plus `Permissions-Policy`, `Cross-Origin-Opener-Policy` and, in production, HSTS. Hashed `/_next/static` bundles are cached for a year as immutable; the app shell, service worker and offline manifest revalidate on every load using ETags. Text assets are compressed with Brotli or gzip once per file version and kept in memory, and book files support byte ranges so PDFs can start rendering before the whole file arrives.

Sessions use hashed random tokens, HttpOnly/SameSite cookies, server-side role checks and PINs hashed with scrypt. Incorrect sign-ins are rate-limited. This is an administrator-managed directory; it does not verify identity against Toyota HR or corporate SSO. Administrators must provision authorized IDs and distribute initial PINs privately. Corporate SSO can be connected when its provider is known.

Signing into a different account in another browser tab clears the previous account from its tab. Saves are bound to that tab's account ID so stale tabs cannot overwrite another employee's progress.

Back up the database regularly. To back up local SQLite, stop the preview and copy `.library-data` (including any WAL files). Browser storage contains offline copies and unsynced changes; clearing it does not remove records already received by the server. Queued changes belong to the account's immutable database ID and only resume syncing when that account signs back in.

## Verification

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm run build:render
npm run build
npx playwright install chromium --only-shell
npm run test:browser
```

To run the browser checks with an installed Edge or Chrome instead of downloading Chromium, set `PLAYWRIGHT_CHANNEL` first, for example `$env:PLAYWRIGHT_CHANNEL="msedge"; npm run test:browser`. GitHub Actions runs the server tests, type check and lint on every push and pull request.

Server checks use isolated temporary data. Static-file checks cover cache headers, ETag revalidation, Brotli/gzip compression, byte ranges, the not-found page and path traversal. Reader checks cover whole-page scaling, swipe detection and case/whitespace-insensitive search in English, Japanese and Kannada. Progress and catalog checks cover unique-page accounting, retained account records, personal target validation and backward compatibility, filtering, pagination, selection limits, and Unicode CSV/text output. Browser checks use an in-memory database and synthetic PDF/EPUB books; they verify upload/login/progress/offline workflows, whole-page fitting, swipe page turns, PDF and EPUB search, and the one-row phone toolbar, and save screenshots in the ignored `outputs/employee-library` folder. Layout checks cover 1920×1080, 1366×768, 1280×720, portrait and mobile. Build the Render frontend before browser checks.
