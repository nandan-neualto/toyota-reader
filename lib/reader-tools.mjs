// Pure helpers for the reader: page fitting, touch page turns and in-book search.

const MAX_FIT_SCALE = 1.65;

/**
 * Scale for a PDF page. "width" fills the available width; "page" keeps the
 * whole page visible. Zoom multiplies the fitted size.
 */
export function pageScale({pageWidth, pageHeight, availableWidth, availableHeight, fit = 'width', zoom = 1, maxScale = MAX_FIT_SCALE}) {
  if (!(pageWidth > 0) || !(pageHeight > 0) || !(availableWidth > 0)) return Math.max(0.1, zoom);
  const widthScale = availableWidth / pageWidth;
  const fitted = fit === 'page' && availableHeight > 0 ? Math.min(widthScale, availableHeight / pageHeight) : widthScale;
  return Math.max(0.1, Math.min(fitted, maxScale) * zoom);
}

/**
 * Direction of a horizontal swipe: 1 for the next page (finger moves left),
 * -1 for the previous page, 0 when the gesture is a tap, scroll or slow drag.
 */
export function swipeDirection(start, end, {minDistance = 60, maxDuration = 800, ratio = 1.5} = {}) {
  if (!start || !end) return 0;
  const dx = end.x - start.x, dy = end.y - start.y, elapsed = end.time - start.time;
  if (!(elapsed >= 0) || elapsed > maxDuration) return 0;
  if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * ratio) return 0;
  return dx < 0 ? 1 : -1;
}

// Case- and whitespace-insensitive folding that remembers each folded unit's source index.
function fold(text) {
  let folded = '', space = true;
  const map = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (/\s/.test(character)) {
      if (!space) { folded += ' '; map.push(index); space = true; }
      continue;
    }
    space = false;
    const lower = character.toLocaleLowerCase();
    for (let unit = 0; unit < lower.length; unit++) { folded += lower[unit]; map.push(index); }
  }
  return {folded, map};
}

export function normalizeSearchQuery(query) {
  return fold(String(query ?? '')).folded.trim();
}

const oneLine = value => value.replace(/\s+/g, ' ');

/**
 * Find a query in text, ignoring case and runs of whitespace. Returns the
 * total number of matches and up to `limit` matches with source offsets and
 * a short excerpt around each.
 */
export function searchText(text, query, {limit = 50, context = 60} = {}) {
  const needle = normalizeSearchQuery(query), source = String(text ?? '');
  if (!needle || !source) return {total: 0, matches: []};
  const {folded, map} = fold(source);
  const matches = [];
  let total = 0, from = 0;
  while (true) {
    const position = folded.indexOf(needle, from);
    if (position === -1) break;
    total++;
    if (matches.length < limit) {
      const start = map[position], end = map[position + needle.length - 1] + 1;
      const beforeStart = Math.max(0, start - context), afterEnd = Math.min(source.length, end + context);
      matches.push({
        start, end,
        before: (beforeStart > 0 ? '…' : '') + oneLine(source.slice(beforeStart, start)).trimStart(),
        match: oneLine(source.slice(start, end)),
        after: oneLine(source.slice(end, afterEnd)).trimEnd() + (afterEnd < source.length ? '…' : ''),
      });
    }
    from = position + Math.max(1, needle.length);
  }
  return {total, matches};
}

/** Split text into plain and highlighted parts for display. */
export function highlightParts(text, query) {
  const source = String(text ?? ''), found = searchText(source, query, {limit: 1000, context: 0});
  if (!found.matches.length) return [{text: source, hit: false}];
  const parts = [];
  let cursor = 0;
  for (const {start, end} of found.matches) {
    if (start > cursor) parts.push({text: source.slice(cursor, start), hit: false});
    parts.push({text: source.slice(start, end), hit: true});
    cursor = end;
  }
  if (cursor < source.length) parts.push({text: source.slice(cursor), hit: false});
  return parts;
}

/** Page colours for reflowable text (EPUB sections and the PDF text view). */
export const readerThemes = {
  light: {label: 'Light', page: '#ffffff', text: '#283341'},
  sepia: {label: 'Sepia', page: '#f6eedc', text: '#4a3b28'},
  night: {label: 'Night', page: '#1c2027', text: '#d8dde5'},
};
