// プロジェクトのデータ構造と、時間軸の計算
export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
export const easeInOutCubic = (x) => {
  x = clamp(x, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (x) => {
  x = clamp(x, 0, 1);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export const TRANSITIONS = [
  { id: 'fade', ja: 'クロスフェード', code: 0 },
  { id: 'black', ja: '暗転', code: 1 },
  { id: 'white', ja: '白フラッシュ', code: 2 },
  { id: 'zoom', ja: 'ズーム', code: 3 },
  { id: 'whip', ja: 'ウィップ', code: 4 },
  { id: 'wipe', ja: 'ワイプ', code: 5 },
  { id: 'burn', ja: 'フィルムバーン', code: 6 },
  { id: 'glitch', ja: 'グリッチ', code: 7 },
  { id: 'blur', ja: 'ぼかし', code: 8 },
  { id: 'push', ja: 'スライド', code: 9 },
  { id: 'iris', ja: 'アイリス', code: 10 },
  { id: 'cut', ja: 'カット', code: -1 },
];
export const TRANSITION_CODE = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t.code]));

export const MOTIONS = [
  { id: 'auto', ja: 'おまかせ' },
  { id: 'in', ja: 'ズームイン' },
  { id: 'out', ja: 'ズームアウト' },
  { id: 'panR', ja: '右へ' },
  { id: 'panL', ja: '左へ' },
  { id: 'panU', ja: '上へ' },
  { id: 'panD', ja: '下へ' },
  { id: 'none', ja: '固定' },
];

export function newProject(name) {
  const now = Date.now();
  return {
    id: uid(),
    name: name || '新しい作品',
    createdAt: now,
    updatedAt: now,
    theme: 'cinematic',
    clips: [],
    music: null,
    look: defaultLook(),
  };
}

export function defaultLook() {
  return {
    grade: 'theme',
    grain: null,
    vignette: null,
    leak: null,
    letterbox: 'theme',
    motion: 1,
    transition: 'theme',
    transitionDur: null,
    font: 'theme',
    dateStamp: 'theme',
    fadeInOut: true,
  };
}

export function newPhotoClip(mediaId, duration) {
  return {
    id: uid(), type: 'photo', mediaId, duration,
    motion: 'auto', focus: null, fit: 'auto', transition: 'theme',
    caption: '', captionPos: 'auto', captionSize: 1,
  };
}

export function newTitleClip(title, subtitle, duration) {
  return {
    id: uid(), type: 'title', duration,
    title: title || '', subtitle: subtitle || '', bg: 'theme', transition: 'theme',
  };
}

export function newMusic(mediaId, name) {
  return { mediaId, name, offset: 0, volume: 0.9, fadeIn: 0.5, fadeOut: 2.5, loop: true, tempoMul: 1 };
}

/** クリップ i から i+1 への切り替え */
export function transitionFor(project, theme, i) {
  const a = project.clips[i], b = project.clips[i + 1];
  if (!b) return null;
  const own = a.transition && a.transition !== 'theme' ? a.transition : null;
  const global = project.look.transition && project.look.transition !== 'theme' ? project.look.transition : null;
  let type = own || global || theme.transitions[i % theme.transitions.length];
  // ポラロイドは写真どうしが「重なっていく」ので、切り替えは写真の登場アニメーションで表現する
  if (!own && !global && theme.layout === 'polaroid' && a.type === 'photo' && b.type === 'photo') type = 'stack';
  let dur = project.look.transitionDur ?? theme.transitionDur;
  if (type === 'cut' || type === 'stack') dur = 0;
  dur = Math.max(0, Math.min(dur, a.duration * 0.7, b.duration * 0.7));
  return { type, dur };
}

export function computeTimeline(project, theme) {
  const clips = project.clips;
  const trans = clips.map((_, i) => transitionFor(project, theme, i));
  const items = [];
  let t = 0, photoIndex = 0, chapter = 0;
  clips.forEach((clip, i) => {
    if (clip.type === 'title') chapter = i;
    items.push({
      clip, index: i, start: t, end: t + clip.duration, dur: clip.duration,
      tIn: i > 0 ? trans[i - 1].dur : 0,
      tOut: trans[i] ? trans[i].dur : 0,
      trans: trans[i],
      photoIndex: clip.type === 'photo' ? photoIndex++ : -1,
      chapter,
    });
    t += clip.duration;
  });
  return { items, total: t, photoCount: photoIndex };
}

/** 時刻 t に見えているクリップ（切り替え中なら a→b と進捗 p） */
export function frameAt(tl, t) {
  const items = tl.items;
  if (!items.length) return null;
  t = clamp(t, 0, Math.max(0, tl.total - 1e-4));
  let lo = 0, hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (items[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  const it = items[lo];
  if (lo > 0 && it.tIn > 0 && t < it.start + it.tIn / 2) {
    const prev = items[lo - 1];
    return { a: prev, b: it, p: (t - (it.start - it.tIn / 2)) / it.tIn, type: prev.trans.type, t };
  }
  if (lo < items.length - 1 && it.tOut > 0 && t >= it.end - it.tOut / 2) {
    return { a: it, b: items[lo + 1], p: (t - (it.end - it.tOut / 2)) / it.tOut, type: it.trans.type, t };
  }
  return { a: it, b: null, p: 0, type: null, t };
}

/** クリップが画面に映っている区間（切り替えの重なりを含む） */
export function visibleRange(it) {
  return [it.start - it.tIn / 2, it.end + it.tOut / 2];
}
export function localU(it, t) {
  const [s, e] = visibleRange(it);
  return clamp((t - s) / (e - s), 0, 1);
}

// ---------- 音楽とビート ----------
export function beatPeriod(music, meta) {
  if (!music || !meta || !meta.period) return 0;
  return meta.period / (music.tempoMul || 1);
}

/** タイムライン上のビート時刻（秒） */
export function timelineBeats(music, meta, total) {
  const P = beatPeriod(music, meta);
  if (!P) return [];
  const out = [];
  let k = Math.ceil((music.offset - meta.beatOffset) / P - 1e-6);
  for (let n = 0; n < 5000; n++, k++) {
    const t = meta.beatOffset + k * P - music.offset;
    if (t > total + P) break;
    if (t >= -1e-6) out.push(Math.max(0, t));
  }
  return out;
}

export function snapToBeat(t, beats, tol = 0.14) {
  if (!beats || !beats.length) return t;
  let best = t, bd = tol;
  for (const b of beats) {
    const d = Math.abs(b - t);
    if (d < bd) { bd = d; best = b; }
    if (b > t + tol) break;
  }
  return best;
}

/** ビートに合わせて各クリップの長さをそろえる */
export function syncToBeats(project, meta, beatsPerPhoto) {
  const m = project.music;
  const P = beatPeriod(m, meta);
  if (!P) return false;
  let k = Math.round((m.offset - meta.beatOffset) / P);
  let off = meta.beatOffset + k * P;
  while (off < 0) off += P;
  m.offset = round3(off);
  for (const c of project.clips) {
    let beats = c.type === 'title' ? Math.max(4, beatsPerPhoto * 2) : beatsPerPhoto;
    while (beats * P < 0.45) beats *= 2;
    c.duration = round3(beats * P);
  }
  return true;
}

/** 動画の長さを曲の残り時間に合わせる */
export function fitToLength(project, target) {
  const total = project.clips.reduce((s, c) => s + c.duration, 0);
  if (!total || target <= 0) return;
  const f = target / total;
  for (const c of project.clips) c.duration = round3(Math.max(0.4, c.duration * f));
}

export const round3 = (x) => Math.round(x * 1000) / 1000;

export function formatTime(t, withTenths = true) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  if (!withTenths) return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
  const si = Math.floor(s);
  const d = Math.floor((s - si) * 10);
  return `${m}:${String(si).padStart(2, '0')}.${d}`;
}

export function projectDuration(project) {
  return project.clips.reduce((s, c) => s + c.duration, 0);
}
