# Toyota Employee Library

A touchscreen PDF/EPUB library with employee ID + PIN sign-in, account progress, private notes, bookmarks, favorites, a read-later list, personal reading targets and a shared catalog. Administrators can upload books in batches, organize the catalog and manage employee access. See [EMPLOYEE_LIBRARY.md](EMPLOYEE_LIBRARY.md) for setup, account management, offline behavior and production storage.

Built with React and TypeScript for reading and listening on museum kiosks, desktop browsers and mobile screens.

## Included book

The supplied 481-page PDF is bundled at `public/books/toyota-way-continuous-improvement.pdf`. Its cover is rendered from the supplied first page. The original file is unchanged. The book is user-supplied content, not part of the open-source reader licenses.

## Run on a kiosk

Requires Node.js 22.13 or newer.

1. `npm ci`
2. `npm run build:render`
3. `npm start`
4. Open `http://127.0.0.1:5180` and use the full-screen button or browser kiosk mode.

Use `npm run dev` for development (frontend 5180, API 5181). The first local start generates a `LIBRARY-ADMIN` account and saves its initial PIN in the ignored `.library-data/local-admin.txt`. The service worker runs only in a production build. The Cloudflare build remains available with `npm run build` and `npm run start:cloudflare`.

## Reader features

- Original PDF rendering, zoom, selectable text view, embedded contents and direct page jumps.
- EPUB pagination and contents through EPUB.js. Scripts are disabled and active/remote section content is removed.
- Read aloud, pause, resume, stop, voice choice and speed. Optional continuous narration advances across pages.
- Additional PDF/EPUB files can be opened for the current visit. Those files are not uploaded or saved to a shared library.
- Keyboard left/right page navigation and touch-sized controls.
- Four minutes of inactivity produces a 30-second warning, then ends the visit and signs out an active employee account. Active narration prevents reset.
- Library navigation stays within the current visit. **Finish visit** clears imported books, stops narration, closes dialogs, and restores default reading preferences. The idle timer also covers the library and dialogs.
- Landscape layouts keep reading controls visible at 1920×1080, 1366×768, and 1280×720, with 48-pixel touch targets, keyboard focus, and reduced-motion support.
- The preloaded book and app assets are cached for offline use after the first successful online load. A footer confirms readiness. New service-worker versions activate between sessions when kiosk tabs are closed.

## Account reading progress

Sign in and open **My reading progress** from the library, reader or account panel. The dashboard shows started and employee-marked completed books, favorites, books saved for later, last-read dates, saved positions and resume actions, with filtering and sorting.

PDF progress counts unique pages successfully opened since page tracking began. Revisiting a page or changing zoom does not increase the count; jumping ahead does not count skipped pages. EPUB progress shows the furthest reading position while preserving the last position for resume. These indicators describe pages opened or locations reached, not comprehension. **Mark completed** is a separate employee choice and does not set coverage to 100%.

Existing records retain their saved PDF page or EPUB location. Older PDF records display saved position until coverage tracking begins; historical pages are not invented. Archived books keep their account history and remain visible as unavailable. Device saves and server confirmation are shown separately, and confirmed progress returns on the next sign-in.

## Personal reading plans and notes

Use **Read later** on a book card or in **My reading progress** to build a private account list separate from favorites. Adding an unopened book does not mark it started, and opening it does not automatically remove it from the list. In the dashboard, set a personal finish-by date, change it, or remove it. Upcoming and past-target counts cover unfinished books, with filters for all personal targets or only past targets. Marking a book completed retains its target date and removes it from those counts. Targets use the employee device's local calendar date and never complete books automatically. Read-later choices and targets use the same offline queue and server-confirmation status as progress.

Open **My notes** while reading to search bookmarks, filter to the current location, sort them, rename a saved location, or undo the most recent removal while the panel remains open. **Download notes & bookmarks** saves this book's current notes and saved locations as a Unicode text file. Notes continue to save automatically, with a character counter and a visible device/server save status.

## Narration

Uses the operating system/browser Speech Synthesis API. Install the required voices on the kiosk. Device voices can work offline; network voices need a connection. Voice changes do not translate the book. Image-only/scanned pages without an embedded text layer cannot be narrated; OCR is not included. Sound is off until the visitor presses Read aloud.

## Shared catalog administration

Sign in as an administrator and choose **Manage library**. Upload up to 100 PDF/EPUB files per batch, with individual results and safe retries of remaining files. Search and filter by availability, collection, format, language and metadata quality; sort by title, date, reader count or collection. Review books missing a description or using an unclassified collection. Browse catalog and employee tables in pages of 25, 50 or 100; the employee directory supports name/ID search and role/access filters. Select up to 100 books for bulk collection, author/publisher, language, archive or restore changes. Selections are preserved across pages and filters, and failed updates stay selected for retry. The table checkbox selects the current page; bulk changes apply to the whole selection.

The administration panel shows the configured book-file storage budget and exports every matching catalog result across all pages to Unicode CSV, including Japanese and Kannada. Archived files still use storage. Uploaded files persist in the database. Use the institution's approved book copies.

## Open source

- [Mozilla PDF.js](https://github.com/mozilla/pdf.js): Apache-2.0; original PDF rendering and text extraction.
- [EPUB.js](https://github.com/futurepress/epub.js): BSD-2-Clause; EPUB layout and navigation.
- [KOReader](https://github.com/koreader/koreader) was reviewed as a reference; its code is not embedded.

License copies are in `public/licenses`. No cloud AI or paid voice API is required.

## Checks

`node --test scripts/test-visit-clock.mjs`
`node node_modules/typescript/bin/tsc --noEmit`
`npm run build`
`npm run build:render`
`npm run test:library`
`npm run test:browser` (install Playwright Chromium first)
