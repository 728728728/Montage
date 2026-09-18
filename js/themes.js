// テーマ・フォント・カラーグレードの定義

export const FONT_SETS = [
  { id: 'elegant', ja: 'エレガント明朝', latin: 'Cormorant Garamond', jp: 'Shippori Mincho', fb: 'serif', weights: [400, 500, 600], italic: true },
  { id: 'editorial', ja: 'エディトリアル', latin: 'Playfair Display', jp: 'Zen Old Mincho', fb: 'serif', weights: [400, 700], italic: true },
  { id: 'modern', ja: 'モダンゴシック', latin: 'Jost', jp: 'Zen Kaku Gothic New', fb: 'sans-serif', weights: [300, 400, 500], italic: false },
  { id: 'round', ja: 'まるゴシック', latin: 'Jost', jp: 'Zen Maru Gothic', fb: 'sans-serif', weights: [400, 500], italic: false },
  { id: 'hand', ja: '手書き', latin: 'Caveat', jp: 'Yomogi', fb: 'cursive', weights: [500, 700], italic: false },
  { id: 'pop', ja: 'ポップ極太', latin: 'Anton', jp: 'Dela Gothic One', fb: 'sans-serif', weights: [400], italic: false },
  { id: 'type', ja: 'タイプライター', latin: 'Special Elite', jp: 'Klee One', fb: 'monospace', weights: [400], italic: false },
];
export const FONT_SET = Object.fromEntries(FONT_SETS.map((f) => [f.id, f]));

/** Canvas 用のフォント指定文字列。欧文フォント→和文フォントの順にフォールバックさせる */
export function fontString(setId, weight, italic, px) {
  const f = FONT_SET[setId] || FONT_SET.modern;
  const w = f.weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const it = italic && f.italic ? 'italic ' : '';
  return `${it}${w} ${Math.max(1, Math.round(px))}px "${f.latin}", "${f.jp}", ${f.fb}`;
}

export const GRADES = [
  { id: 'natural', ja: 'ナチュラル', sw: ['#c8b69c', '#6e8797'], p: {} },
  { id: 'teal', ja: 'ティール＆オレンジ', sw: ['#e39a5a', '#1f6f78'], p: { contrast: 1.12, sat: 1.06, shadows: [-0.035, 0.02, 0.05], highlights: [0.06, 0.02, -0.05], fade: 0.015 } },
  { id: 'film', ja: 'フィルム', sw: ['#d9b27c', '#5d6b5a'], p: { contrast: 0.93, sat: 0.8, temp: 0.2, fade: 0.07, shadows: [0.0, 0.02, 0.025], highlights: [0.05, 0.02, -0.03] } },
  { id: 'golden', ja: 'ゴールデン', sw: ['#f1b35e', '#a4512f'], p: { exposure: 0.05, contrast: 1.05, sat: 1.1, temp: 0.34, highlights: [0.06, 0.025, -0.04] } },
  { id: 'vivid', ja: 'ビビッド', sw: ['#ff5b4d', '#2d8cff'], p: { contrast: 1.16, sat: 1.32 } },
  { id: 'dreamy', ja: 'ドリーミー', sw: ['#f7cdd4', '#c8c6f0'], p: { exposure: 0.1, contrast: 0.86, sat: 0.88, temp: 0.06, tint: 0.07, fade: 0.09, highlights: [0.05, 0.0, 0.035] } },
  { id: 'clean', ja: 'クリーン', sw: ['#f2efe9', '#9fb3c0'], p: { exposure: 0.03, contrast: 1.06, sat: 0.95, temp: -0.02 } },
  { id: 'cool', ja: 'クール', sw: ['#b8c9d6', '#3a5670'], p: { contrast: 1.08, sat: 0.88, temp: -0.3, shadows: [-0.02, 0.0, 0.04] } },
  { id: 'mono', ja: 'モノクロ', sw: ['#d8d8d8', '#3a3a3a'], p: { bw: 1, contrast: 1.08, fade: 0.03 } },
  { id: 'noir', ja: 'ノワール', sw: ['#ffffff', '#000000'], p: { bw: 1, contrast: 1.42, exposure: -0.05 } },
];
export const GRADE = Object.fromEntries(GRADES.map((g) => [g.id, g]));

export const THEMES = [
  {
    id: 'cinematic', name: 'Cinematic', ja: 'シネマティック',
    desc: '黒帯とティール＆オレンジ。映画の予告編のように',
    layout: 'full', bg: '#050505', titleBg: { type: 'solid', color: '#030303' }, fadeColor: '#000000',
    motion: { amount: 0.11, pattern: ['in', 'panR', 'out', 'panL', 'in', 'panU'] },
    transitions: ['fade', 'fade', 'black', 'fade'], transitionDur: 1.2, defaultDuration: 3.5,
    grade: 'teal', grain: 0.14, vignette: 0.38, leak: 0, letterbox: true,
    weave: 0, dust: 0, flicker: 0, dateStamp: false, accent: '#e6c28a',
    text: {
      font: 'elegant', subFont: 'modern',
      title: { weight: 500, size: 0.078, tracking: 0.32, upper: true, anim: 'tracking', color: '#f5efe6', deco: 'rule' },
      sub: { weight: 300, size: 0.024, tracking: 0.55, upper: true, color: '#d9d1c4' },
      caption: { font: 'modern', weight: 300, size: 0.031, tracking: 0.14, anim: 'fade', pos: 'bar', color: '#efe8dc' },
    },
  },
  {
    id: 'film', name: '8mm Film', ja: '8ミリフィルム',
    desc: '粒子と光漏れ、日付スタンプ。懐かしいホームムービー',
    layout: 'full', bg: '#0d0a08', titleBg: { type: 'solid', color: '#0e0b08' }, fadeColor: '#000000',
    motion: { amount: 0.07, pattern: ['in', 'panL', 'out', 'panR'] },
    transitions: ['burn', 'fade', 'fade', 'burn', 'fade'], transitionDur: 0.9, defaultDuration: 3,
    grade: 'film', grain: 0.5, vignette: 0.55, leak: 0.45, letterbox: false,
    weave: 1, dust: 0.7, flicker: 1, dateStamp: true, accent: '#ff9a3c',
    text: {
      font: 'type', subFont: 'type',
      title: { weight: 400, size: 0.066, tracking: 0.08, upper: false, anim: 'type', color: '#fff3dc' },
      sub: { weight: 400, size: 0.03, tracking: 0.12, upper: false, color: '#e9d9bd' },
      caption: { weight: 400, size: 0.036, tracking: 0.03, anim: 'type', pos: 'bottomLeft', color: '#fff3dc' },
    },
  },
  {
    id: 'editorial', name: 'Editorial', ja: 'エディトリアル',
    desc: '雑誌の誌面のようなレイアウトと大きなタイポグラフィ',
    layout: 'editorial', bg: '#eee7db', titleBg: { type: 'solid', color: '#eee7db' }, fadeColor: '#eee7db',
    motion: { amount: 0.06, pattern: ['in', 'out', 'panR', 'in', 'panL'] },
    transitions: ['push', 'wipe', 'push', 'fade'], transitionDur: 0.8, defaultDuration: 3.5,
    grade: 'clean', grain: 0.1, vignette: 0.12, leak: 0, letterbox: false,
    weave: 0, dust: 0, flicker: 0, dateStamp: false, accent: '#b4452e', ink: '#1d1b18',
    text: {
      font: 'editorial', subFont: 'modern',
      title: { weight: 700, italic: true, size: 0.13, tracking: -0.01, upper: false, anim: 'mask', color: '#1d1b18' },
      sub: { weight: 500, size: 0.023, tracking: 0.42, upper: true, color: '#4a453e' },
      caption: { weight: 400, italic: true, size: 0.046, tracking: 0, anim: 'mask', pos: 'column', color: '#1d1b18' },
    },
  },
  {
    id: 'polaroid', name: 'Polaroid', ja: 'ポラロイド',
    desc: '写真がテーブルに一枚ずつ重なっていく。手書きの文字で',
    layout: 'polaroid', bg: '#2a241e', titleBg: { type: 'table' }, fadeColor: '#000000',
    motion: { amount: 0.03, pattern: ['in'] },
    transitions: ['fade'], transitionDur: 0.9, defaultDuration: 2.6,
    grade: 'golden', grain: 0.2, vignette: 0.3, leak: 0.12, letterbox: false,
    weave: 0, dust: 0, flicker: 0, dateStamp: false, accent: '#f2c46d',
    table: ['#4a3f33', '#18130f'],
    text: {
      font: 'hand', subFont: 'hand',
      title: { weight: 700, size: 0.13, tracking: 0, upper: false, anim: 'write', color: '#f7efe2' },
      sub: { weight: 500, size: 0.05, tracking: 0, upper: false, color: '#e7d8c1' },
      caption: { weight: 500, size: 0.052, tracking: 0, anim: 'write', pos: 'frame', color: '#2b2622' },
    },
  },
  {
    id: 'kinetic', name: 'Kinetic', ja: 'キネティック',
    desc: '音楽に合わせてテンポよく切り替わる。SNS向けのノリ',
    layout: 'full', bg: '#000000', titleBg: { type: 'solid', color: '#ff4530' }, fadeColor: '#000000',
    motion: { amount: 0.1, pattern: ['punch'] },
    transitions: ['zoom', 'whip', 'glitch', 'white', 'whip', 'zoom', 'iris'], transitionDur: 0.36, defaultDuration: 1.4,
    grade: 'vivid', grain: 0.12, vignette: 0.25, leak: 0, letterbox: false,
    weave: 0, dust: 0, flicker: 0, dateStamp: false, accent: '#ff4530', pulse: true,
    text: {
      font: 'pop', subFont: 'modern',
      title: { weight: 400, size: 0.17, tracking: 0.01, upper: true, anim: 'pop', color: '#ffffff' },
      sub: { weight: 500, size: 0.03, tracking: 0.3, upper: true, color: '#ffffff' },
      caption: { weight: 400, size: 0.075, tracking: 0.01, upper: true, anim: 'pop', pos: 'center', color: '#ffffff', box: true },
    },
  },
  {
    id: 'minimal', name: 'Minimal Mono', ja: 'ミニマル',
    desc: 'モノクロと余白。静かで上品に',
    layout: 'minimal', bg: '#f3f2ef', titleBg: { type: 'solid', color: '#f3f2ef' }, fadeColor: '#f3f2ef',
    motion: { amount: 0.035, pattern: ['in', 'out'] },
    transitions: ['fade'], transitionDur: 1.1, defaultDuration: 3.5,
    grade: 'mono', grain: 0.08, vignette: 0.05, leak: 0, letterbox: false,
    weave: 0, dust: 0, flicker: 0, dateStamp: false, accent: '#1c1c1c', ink: '#1c1c1c',
    text: {
      font: 'modern', subFont: 'modern',
      title: { weight: 300, size: 0.05, tracking: 0.5, upper: true, anim: 'fade', color: '#1c1c1c' },
      sub: { weight: 400, size: 0.022, tracking: 0.35, upper: true, color: '#6a6a6a' },
      caption: { weight: 400, size: 0.026, tracking: 0.22, anim: 'fade', pos: 'below', color: '#2a2a2a' },
    },
  },
  {
    id: 'dreamy', name: 'Dreamy', ja: 'ドリーミー',
    desc: 'やわらかな光とパステル。ふんわり溶け合う',
    layout: 'full', bg: '#f4e3e0', titleBg: { type: 'radial', colors: ['#fbe7e1', '#cfc8ee'] }, fadeColor: '#ffffff',
    motion: { amount: 0.12, pattern: ['in', 'panR', 'out', 'panU'] },
    transitions: ['blur', 'fade', 'blur', 'white'], transitionDur: 1.4, defaultDuration: 3.8,
    grade: 'dreamy', grain: 0.1, vignette: 0.12, leak: 0.35, letterbox: false,
    weave: 0, dust: 0, flicker: 0, dateStamp: false, accent: '#f0b8c4',
    text: {
      font: 'elegant', subFont: 'round',
      title: { weight: 400, italic: true, size: 0.1, tracking: 0.02, upper: false, anim: 'blur', color: '#ffffff', glow: true },
      sub: { weight: 400, size: 0.026, tracking: 0.3, upper: false, color: '#ffffff' },
      caption: { weight: 400, italic: true, size: 0.046, tracking: 0.02, anim: 'blur', pos: 'bottom', color: '#ffffff', glow: true },
    },
  },
];
export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const getTheme = (id) => THEME[id] || THEMES[0];

/** テーマと「仕上げ」の上書き設定を合わせた最終的な見た目 */
export function resolveLook(project, theme) {
  const L = project.look || {};
  const gradeId = L.grade && L.grade !== 'theme' ? L.grade : theme.grade;
  const g = (GRADE[gradeId] || GRADE.natural).p;
  const pick = (v, d) => (v === null || v === undefined ? d : v);
  let letterbox = theme.letterbox;
  if (L.letterbox === 'on') letterbox = true;
  if (L.letterbox === 'off') letterbox = false;
  let dateStamp = theme.dateStamp;
  if (L.dateStamp === 'on') dateStamp = true;
  if (L.dateStamp === 'off') dateStamp = false;
  return {
    gradeId,
    exposure: g.exposure || 0, contrast: g.contrast ?? 1, sat: g.sat ?? 1,
    temp: g.temp || 0, tint: g.tint || 0, fade: g.fade || 0, bw: g.bw || 0,
    shadows: g.shadows || [0, 0, 0], highlights: g.highlights || [0, 0, 0],
    grain: pick(L.grain, theme.grain),
    vignette: pick(L.vignette, theme.vignette),
    leak: pick(L.leak, theme.leak),
    letterbox, dateStamp,
    motion: pick(L.motion, 1),
    font: L.font && L.font !== 'theme' ? L.font : null,
    fadeInOut: L.fadeInOut !== false,
  };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** テーマで使うフォントを先に読み込んでおく（Canvasは読み込み前だと代替フォントで描いてしまう） */
export async function ensureFonts(project, theme) {
  if (!document.fonts || !document.fonts.load) return;
  const L = resolveLook(project, theme);
  const sets = new Set([L.font || theme.text.font, theme.text.subFont, theme.text.caption.font || L.font || theme.text.font]);
  let sample = 'AaBb0123';
  for (const c of project.clips) sample += (c.caption || '') + (c.title || '') + (c.subtitle || '');
  sample += project.name || '';
  const loads = [];
  for (const id of sets) {
    const f = FONT_SET[id];
    if (!f) continue;
    for (const w of f.weights) {
      loads.push(document.fonts.load(`${w} 40px "${f.latin}"`, sample));
      loads.push(document.fonts.load(`${w} 40px "${f.jp}"`, sample));
      if (f.italic) loads.push(document.fonts.load(`italic ${w} 40px "${f.latin}"`, sample));
    }
  }
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 4000))]);
}
