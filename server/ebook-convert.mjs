// MOBI and Kindle (AZW/AZW3) books are converted to EPUB with Calibre's ebook-convert, when the server has it.
// The converter runs without a shell, in a private temporary folder, one book at a time, with a time limit.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CONVERTIBLE = ['mobi', 'azw', 'azw3'];

/** MOBI and AZW3 files are Palm database files whose type/creator at byte 60 reads "BOOKMOBI". */
export function isMobi(bytes) {
  return bytes.length > 78 && bytes.toString('latin1', 60, 68) === 'BOOKMOBI';
}

function run(command, args, timeout) {
  return new Promise((done, failed) => {
    execFile(command, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, error => error ? failed(error) : done());
  });
}

/** Finds the converter: LIBRARY_EBOOK_CONVERT, or ebook-convert on the PATH. Resolves to null when neither works. */
export async function findConverter(configured = process.env.LIBRARY_EBOOK_CONVERT) {
  for (const candidate of configured ? [configured] : ['ebook-convert']) {
    try { await run(candidate, ['--version'], 20000); return candidate; } catch { /* Try the next candidate. */ }
  }
  return null;
}

/** `args` go before the input and output paths; tests use them to run a stand-in converter with Node. */
export function createConverter(command, { args = [], timeout = 180000 } = {}) {
  let queue = Promise.resolve();
  async function convert(bytes, extension) {
    if (!CONVERTIBLE.includes(extension)) throw Object.assign(new Error('Only MOBI, AZW and AZW3 books can be converted.'), { status: 400 });
    const folder = await mkdtemp(join(tmpdir(), 'library-convert-'));
    try {
      const input = join(folder, `book.${extension}`), output = join(folder, 'book.epub');
      await writeFile(input, bytes);
      try { await run(command, [...args, input, output], timeout); }
      catch { throw Object.assign(new Error('This book could not be converted to EPUB. Kindle books with copy protection (DRM) cannot be added.'), { status: 422 }); }
      return await readFile(output);
    } finally { await rm(folder, { recursive: true, force: true }); }
  }
  // One conversion at a time keeps a batch upload from overloading the server.
  return (bytes, extension) => { const next = queue.then(() => convert(bytes, extension)); queue = next.catch(() => {}); return next; };
}
