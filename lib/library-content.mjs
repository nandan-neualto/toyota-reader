// What administrators edit on the library home page: a welcome line, dated announcements,
// a "Staff picks" shelf, and the order and descriptions of collections.

export const CONTENT_LIMITS = { announcements: 10, picks: 24, collections: 300 };

export const defaultContent = () => ({ welcome: '', announcements: [], picks: { title: 'Staff picks', bookIds: [] }, collections: [] });

const text = (value, label, max, required = false) => {
  const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (required && !clean) throw new Error(`Add ${label}.`);
  if (clean.length > max) throw new Error(`Keep ${label} under ${max} characters.`);
  return clean;
};
// Multi-line text keeps its paragraphs.
const paragraphs = (value, label, max) => {
  const clean = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (clean.length > max) throw new Error(`Keep ${label} under ${max} characters.`);
  return clean;
};
const day = (value, label) => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error(`Choose a valid ${label}.`);
  return value;
};
const bookId = value => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^[\w-]{1,120}$/.test(value)) throw new Error('Choose a book from the catalogue.');
  return value;
};

/** Validates content from an administrator. Throws an Error whose message can be shown as is. */
export function cleanContent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid library content.');
  const announcements = input.announcements ?? [];
  if (!Array.isArray(announcements) || announcements.length > CONTENT_LIMITS.announcements) throw new Error(`Use at most ${CONTENT_LIMITS.announcements} announcements.`);
  const ids = new Set();
  const cleanAnnouncements = announcements.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid announcement.');
    const id = typeof item.id === 'string' && /^[\w-]{1,40}$/.test(item.id) ? item.id : '';
    if (!id || ids.has(id)) throw new Error('Invalid announcement.');
    ids.add(id);
    const startsOn = day(item.startsOn, 'start date'), endsOn = day(item.endsOn, 'end date');
    if (startsOn && endsOn && endsOn < startsOn) throw new Error('An announcement cannot end before it starts.');
    return { id, title: text(item.title, 'an announcement title', 120, true), message: paragraphs(item.message, 'the announcement message', 600), bookId: bookId(item.bookId), tone: item.tone === 'important' ? 'important' : 'info', startsOn, endsOn };
  });
  const picks = input.picks ?? {};
  if (typeof picks !== 'object' || Array.isArray(picks)) throw new Error('Invalid staff picks.');
  const pickIds = picks.bookIds ?? [];
  if (!Array.isArray(pickIds) || pickIds.length > CONTENT_LIMITS.picks) throw new Error(`Choose at most ${CONTENT_LIMITS.picks} staff picks.`);
  const cleanPicks = [...new Set(pickIds.map(bookId).filter(Boolean))];
  const collections = input.collections ?? [];
  if (!Array.isArray(collections) || collections.length > CONTENT_LIMITS.collections) throw new Error('Too many collections.');
  const names = new Set();
  const cleanCollections = collections.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid collection.');
    const name = text(item.name, 'a collection name', 80, true), key = name.toLocaleLowerCase();
    if (names.has(key)) throw new Error(`“${name}” is listed twice.`);
    names.add(key);
    return { name, description: paragraphs(item.description, 'a collection description', 400) };
  });
  return { welcome: text(input.welcome, 'the welcome line', 200), announcements: cleanAnnouncements, picks: { title: text(picks.title, 'the staff picks title', 60) || 'Staff picks', bookIds: cleanPicks }, collections: cleanCollections };
}

/** Announcements showing on a calendar day (YYYY-MM-DD); start and end days are included. */
export const activeAnnouncements = (content, today) => (content?.announcements ?? []).filter(item => (!item.startsOn || item.startsOn <= today) && (!item.endsOn || today <= item.endsOn));

/** Collection names in the administrator's order; any others follow alphabetically. */
export function orderCollections(names, content) {
  const order = new Map((content?.collections ?? []).map((item, index) => [item.name, index]));
  return [...names].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b));
}

export const collectionDescription = (name, content) => (content?.collections ?? []).find(item => item.name === name)?.description ?? '';

/** Renaming onto an existing collection merges them; a missing description is filled from the old one. */
export function renameCollectionContent(content, from, to) {
  const collections = content.collections.map(item => ({ ...item }));
  const source = collections.findIndex(item => item.name === from), target = collections.findIndex(item => item.name === to);
  if (source < 0) return { ...content, collections };
  if (target < 0) { collections[source].name = to; return { ...content, collections }; }
  if (!collections[target].description) collections[target].description = collections[source].description;
  collections.splice(source, 1);
  return { ...content, collections };
}
