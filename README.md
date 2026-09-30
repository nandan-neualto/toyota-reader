# Toyota Reading Room

A separate React/TypeScript touchscreen kiosk for reading and listening to PDF and EPUB books.

## Included book
The supplied 481-page PDF is bundled at `public/books/toyota-way-continuous-improvement.pdf`. Its cover is rendered from the supplied first page. The original file is unchanged. The book is user-supplied content, not part of the open-source reader licenses.

## Run on a kiosk
Requires Node.js 22.13 or newer.

1. `npm ci`
2. `npm run build`
3. `npm start -- --port 5180`
4. Open `http://127.0.0.1:5180` and use the full-screen button or browser kiosk mode.

Use `npm run dev -- --hostname 127.0.0.1 --port 5180` for development. The service worker runs only in a production build.

## Reader features
- Original PDF rendering, zoom, selectable text view, embedded contents and direct page jumps.
- EPUB pagination and contents through EPUB.js. Scripts are disabled and active/remote section content is removed.
- Read aloud, pause, resume, stop, voice choice and speed. Optional continuous narration advances across pages.
- Additional PDF/EPUB files can be opened for the current visit. Those files are not uploaded or saved to a shared library.
- Keyboard left/right page navigation and touch-sized controls.
- Four minutes of inactivity produces a 30-second warning, then returns to the library. Active narration prevents reset.
- Library navigation stays within the current visit. **Finish visit** clears imported books, stops narration, closes dialogs, and restores default reading preferences. The idle timer also covers the library and dialogs.
- Landscape layouts keep reading controls visible at 1920×1080, 1366×768, and 1280×720, with 48-pixel touch targets, keyboard focus, and reduced-motion support.
- The preloaded book and app assets are cached for offline use after the first successful online load. A footer confirms readiness. New service-worker versions activate between sessions when kiosk tabs are closed.

## Narration
Uses the operating system/browser Speech Synthesis API. Install the required voices on the kiosk. Device voices can work offline; network voices need a connection. Voice changes do not translate the book. Image-only/scanned pages without an embedded text layer cannot be narrated; OCR is not included. Sound is off until the visitor presses Read aloud.

## More preloaded books
Place authorized book files in `public/books`, add entries in `lib/catalog.ts`, and add them to the initial shelf in `app/reading-room.tsx`. Rebuild to update the offline cache. For a production museum collection, use the institution’s approved book copies.

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
