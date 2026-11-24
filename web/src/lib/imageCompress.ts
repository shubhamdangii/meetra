"use client";
// Every photo is resized and re-compressed in the browser before upload, so storage stays small
// and pages load fast on phones. Presets match where each photo is shown.

export type PhotoKind = "event" | "gallery" | "host" | "avatar";
const PRESETS: Record<PhotoKind, { max: number; square?: boolean; targetKB: number }> = {
  event:   { max: 1600, targetKB: 350 },            // event cards + event page gallery
  gallery: { max: 1400, targetKB: 300 },            // host gallery
  host:    { max: 800, targetKB: 160 },             // host profile photo
  avatar:  { max: 512, square: true, targetKB: 90 }, // member profile photo (round)
};
/** Biggest original we accept (phone camera photos are often 5 to 15 MB). */
export const MAX_ORIGINAL_MB = 25;

let webpOk: boolean | null = null;
function canWebp() {
  if (webpOk === null) { try { const c = document.createElement("canvas"); c.width = c.height = 1; webpOk = c.toDataURL("image/webp").startsWith("data:image/webp"); } catch { webpOk = false; } }
  return webpOk;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };   // browsers apply the photo's EXIF rotation here
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`"${file.name}" isn't a photo we can read. Use JPG, PNG or WebP.`)); };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process that photo"))), type, q));

export type Compressed = { blob: Blob; type: string; ext: string; width: number; height: number; beforeKB: number; afterKB: number };

/** Resize + compress one photo for the given use. Throws a friendly error for non-images or huge files. */
export async function compressImage(file: File, kind: PhotoKind): Promise<Compressed> {
  if (!/^image\//.test(file.type)) throw new Error(`"${file.name}" isn't a photo. Use JPG, PNG or WebP.`);
  if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) throw new Error(`"${file.name}" is over ${MAX_ORIGINAL_MB} MB.`);
  const p = PRESETS[kind];
  const img = await loadImage(file);
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (!sw || !sh) throw new Error(`"${file.name}" looks empty.`);
  if (p.square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }

  const type = canWebp() ? "image/webp" : "image/jpeg";
  const ext = type === "image/webp" ? "webp" : "jpg";
  let scale = Math.min(1, p.max / Math.max(sw, sh));
  let best: Blob | null = null, w = 0, h = 0;
  // shrink quality first, then dimensions, until it fits the target size
  for (let round = 0; round < 4; round++) {
    w = Math.max(1, Math.round(sw * scale)); h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    if (type === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }   // transparent PNGs get a white background
    g.imageSmoothingQuality = "high";
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    for (const q of [0.82, 0.74, 0.66]) {
      best = await toBlob(c, type, q);
      if (best.size <= p.targetKB * 1024) break;
    }
    if (best!.size <= p.targetKB * 1024) break;
    scale *= 0.8;
  }
  return { blob: best!, type, ext, width: w, height: h, beforeKB: Math.round(file.size / 1024), afterKB: Math.round(best!.size / 1024) };
}
