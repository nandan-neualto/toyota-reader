// Covers are made in the administrator's browser with the same PDF/EPUB engines the reader uses,
// so the server never has to parse book files. Each cover is a small JPEG.
const MAX_WIDTH = 400, MAX_HEIGHT = 520;

function toJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.84));
}

async function pdfCover(file: Blob) {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
  const task = lib.getDocument({data: new Uint8Array(await file.arrayBuffer()), cMapUrl: "/vendor/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/standard_fonts/", wasmUrl: "/vendor/wasm/"});
  try {
    const page = await (await task.promise).getPage(1);
    const base = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: Math.min(MAX_WIDTH / base.width, MAX_HEIGHT / base.height)});
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    await page.render({canvas, viewport}).promise;
    return await toJpeg(canvas);
  } finally { await task.destroy(); }
}

async function epubCover(file: Blob) {
  const {default: ePub} = await import("epubjs");
  const book = ePub();
  try {
    await book.open(await file.arrayBuffer(), "binary"); await book.ready;
    const url = await book.coverUrl();
    if (!url) return null;
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, MAX_WIDTH / image.naturalWidth, MAX_HEIGHT / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await toJpeg(canvas);
  } finally { book.destroy(); }
}

/** A JPEG cover for a book, or null when the book has no usable first page or cover image. */
export async function createCover(file: Blob, format: "pdf" | "epub"): Promise<Blob | null> {
  try { return format === "pdf" ? await pdfCover(file) : await epubCover(file); }
  catch { return null; }
}
