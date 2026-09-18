// 写真・音楽の取り込みと、端末内キャッシュ
import { db } from './db.js';
import { uid } from './model.js';
import { getAudioCtx, analyzeAudio } from './audio.js';

const records = new Map(); // id -> media レコード（Blob を含む）
const thumbUrls = new Map();

export async function getMedia(id) {
  if (records.has(id)) return records.get(id);
  const rec = await db.get('media', id);
  if (rec) records.set(id, rec);
  return rec || null;
}
export function peekMedia(id) {
  return records.get(id) || null;
}
export function thumbUrl(id) {
  if (thumbUrls.has(id)) return thumbUrls.get(id);
  const rec = records.get(id);
  if (!rec || !rec.thumb) return '';
  const url = URL.createObjectURL(rec.thumb);
  thumbUrls.set(id, url);
  return url;
}
export async function loadMediaList(ids) {
  await Promise.all([...new Set(ids)].map((id) => getMedia(id)));
}
export function forgetMedia(id) {
  records.delete(id);
  const u = thumbUrls.get(id);
  if (u) { URL.revokeObjectURL(u); thumbUrls.delete(id); }
}

// ---------- 写真 ----------
/** JPEG の EXIF から撮影日時を読む（なければ null） */
export async function readExifDate(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        return parseTiffDate(v, off + 10);
      }
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + size;
    }
  } catch { /* 読めない形式は無視 */ }
  return null;
}

function parseTiffDate(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(tiff + o, le);
  const u32 = (o) => v.getUint32(tiff + o, le);
  const readAscii = (o, n) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = v.getUint8(tiff + o + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const scan = (ifd, want) => {
    const n = u16(ifd);
    const found = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e);
      if (want.includes(tag)) found[tag] = { count: u32(e + 4), value: u32(e + 8) };
    }
    return found;
  };
  const ifd0 = u32(4);
  const f0 = scan(ifd0, [0x8769, 0x0132]);
  let str = null;
  if (f0[0x8769]) {
    const fe = scan(f0[0x8769].value, [0x9003, 0x9004]);
    const d = fe[0x9003] || fe[0x9004];
    if (d) str = readAscii(d.value, d.count);
  }
  if (!str && f0[0x0132]) str = readAscii(f0[0x0132].value, f0[0x0132].count);
  if (!str) return null;
  const m = str.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('この画像は読み込めませんでした')); };
    img.src = url;
  });
}

function drawScaled(src, sw, sh, maxSide) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(2, Math.round(sw * s)), h = Math.max(2, Math.round(sh * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** 大きい画像は段階的に縮小（一気に縮めるとギザギザになるため） */
function stepDown(src, sw, sh, maxSide) {
  let cur = src, w = sw, h = sh;
  while (Math.max(w, h) / 2 > maxSide) {
    const next = drawScaled(cur, w, h, Math.max(w, h) / 2);
    if (cur !== src) cur.width = cur.height = 0;
    cur = next; w = next.width; h = next.height;
  }
  const out = drawScaled(cur, w, h, maxSide);
  if (cur !== src) cur.width = cur.height = 0;
  return out;
}

const toBlob = (canvas, q) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))), 'image/jpeg', q));

export async function importPhoto(file) {
  const date = (await readExifDate(file)) || file.lastModified || Date.now();
  const { img, url } = await loadImage(file);
  try {
    if (img.decode) await img.decode().catch(() => {});
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) throw new Error('この画像は読み込めませんでした');
    const full = stepDown(img, iw, ih, 2048);
    const fullBlob = await toBlob(full, 0.9);
    const prev = stepDown(full, full.width, full.height, 1280);
    const prevBlob = await toBlob(prev, 0.86);
    const thumb = stepDown(prev, prev.width, prev.height, 256);
    const thumbBlob = await toBlob(thumb, 0.8);
    const rec = {
      id: uid(), kind: 'photo', name: file.name || 'photo', date,
      w: full.width, h: full.height,
      full: fullBlob, preview: prevBlob, thumb: thumbBlob,
      createdAt: Date.now(),
    };
    full.width = full.height = 0; prev.width = prev.height = 0; thumb.width = thumb.height = 0;
    await db.put('media', rec);
    records.set(rec.id, rec);
    return rec;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** テクスチャ用にデコード（quality: 'full' | 'preview' | 'thumb'） */
export async function decodeImage(id, quality) {
  const rec = await getMedia(id);
  if (!rec) return null;
  const blob = rec[quality] || rec.preview || rec.full;
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* 下の方法で読む */ }
  }
  const { img, url } = await loadImage(blob);
  try {
    if (img.decode) await img.decode().catch(() => {});
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- 音楽 ----------
const audioBuffers = new Map();

export async function importAudio(file) {
  const ab = await file.arrayBuffer();
  const buffer = await decodeAudio(ab);
  const info = analyzeAudio(buffer);
  const rec = {
    id: uid(), kind: 'audio', name: (file.name || '音楽').replace(/\.[^.]+$/, ''),
    blob: file, type: file.type, duration: buffer.duration,
    peaks: info.peaks, bpm: info.bpm, period: info.period, beatOffset: info.beatOffset,
    createdAt: Date.now(),
  };
  await db.put('media', rec);
  records.set(rec.id, rec);
  audioBuffers.set(rec.id, buffer);
  return rec;
}

function decodeAudio(arrayBuffer) {
  const ctx = getAudioCtx();
  return new Promise((resolve, reject) => {
    let done = false;
    const ok = (b) => { if (!done) { done = true; resolve(b); } };
    const ng = () => { if (!done) { done = true; reject(new Error('この音声ファイルは読み込めませんでした')); } };
    try {
      const p = ctx.decodeAudioData(arrayBuffer, ok, ng);
      if (p && p.then) p.then(ok, ng);
    } catch { ng(); }
  });
}

export async function getAudioBuffer(id) {
  if (audioBuffers.has(id)) return audioBuffers.get(id);
  const rec = await getMedia(id);
  if (!rec || !rec.blob) return null;
  const buffer = await decodeAudio(await rec.blob.arrayBuffer());
  audioBuffers.set(id, buffer);
  return buffer;
}

/** どのプロジェクトからも使われていない写真・音楽を削除する */
export async function collectGarbage(projects) {
  const used = new Set();
  for (const p of projects) {
    for (const c of p.clips) if (c.mediaId) used.add(c.mediaId);
    if (p.music) used.add(p.music.mediaId);
  }
  const keys = await db.keys('media');
  let removed = 0;
  for (const k of keys) {
    if (!used.has(k)) {
      await db.del('media', k);
      forgetMedia(k);
      audioBuffers.delete(k);
      removed++;
    }
  }
  return removed;
}
