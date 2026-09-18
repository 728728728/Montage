// Montage — 画面と操作
import { db } from './db.js';
import {
  uid, clamp, round3, newProject, newPhotoClip, newTitleClip, newMusic, computeTimeline, frameAt,
  timelineBeats, snapToBeat, syncToBeats, fitToLength, beatPeriod, formatTime, projectDuration,
  TRANSITIONS, MOTIONS, defaultLook,
} from './model.js';
import { THEMES, getTheme, GRADES, GRADE, FONT_SETS, FONT_SET, resolveLook, ensureFonts } from './themes.js';
import { Engine } from './engine.js';
import { clearTextCache } from './overlay.js';
import {
  importPhoto, importAudio, getMedia, peekMedia, thumbUrl, loadMediaList, getAudioBuffer, collectGarbage,
} from './media.js';
import { MusicPlayer, resumeAudio, musicPosAt } from './audio.js';
import { detectCapabilities, exportMethod, exportVideo } from './exporter.js';
import { APP_VERSION, APP_VERSION_DATE, APP_CHANGES } from './version.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="check"><path d="M5 12l5 5 9-10"/></svg>',
  trans: '<svg viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>',
  beat: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-6 4 12 3-9 2 3h4"/></svg>',
};

const END_TEXT = {
  cinematic: 'Fin', film: 'The End', editorial: 'Fin.', polaroid: 'thank you!', kinetic: 'See you', minimal: 'End', dreamy: 'with love',
};

// ---------- 状態 ----------
const S = {
  projects: [],
  project: null,
  theme: null,
  tl: { items: [], total: 0, photoCount: 0 },
  beats: [],
  t: 0,
  playing: null,
  selected: null,
  tab: 'theme',
  pps: 48,
  snap: true,
  beatsPer: 4,
  history: [],
  future: [],
  snapshot: null,
  audioBuffer: null,
  audioMeta: null,
  engine: null,
  player: new MusicPlayer(),
  themeThumbs: new Map(),
};

const els = {};

// ---------- 起動 ----------
async function boot() {
  Object.assign(els, {
    home: $('#home'), editor: $('#editor'), grid: $('#projectGrid'), panel: $('#panel'), tabs: $('#tabs'),
    stage: $('#stage'), glc: $('#glCanvas'), ovc: $('#ovCanvas'), stageEmpty: $('#stageEmpty'), stagePlay: $('#stagePlay'),
    tl: $('#timeline'), tlScroll: $('#tlScroll'), tlContent: $('#tlContent'), tlCanvas: $('#tlCanvas'),
    timeCur: $('#timeCur'), timeTotal: $('#timeTotal'), projName: $('#projName'),
    photoInput: $('#photoInput'), replaceInput: $('#replaceInput'), audioInput: $('#audioInput'),
  });
  bindGlobal();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  try { await navigator.storage?.persist?.(); } catch { /* 無視 */ }
  if (document.fonts) {
    document.fonts.addEventListener?.('loadingdone', () => { clearTextCache(); requestRender(); });
  }
  await loadProjects();
  const last = sessionStorage.getItem('montage:open');
  if (last && S.projects.some((p) => p.id === last)) openProject(last);
  else showHome();
}

async function loadProjects() {
  S.projects = (await db.getAll('projects')) || [];
  S.projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---------- ホーム ----------
async function showHome() {
  sessionStorage.removeItem('montage:open');
  els.editor.classList.add('hidden');
  els.home.classList.remove('hidden');
  await loadProjects();
  const covers = S.projects.map((p) => p.clips.find((c) => c.type === 'photo')?.mediaId).filter(Boolean);
  await loadMediaList(covers);
  renderHome();
  // 使われなくなった写真を片付ける
  collectGarbage(S.projects).catch(() => {});
}

function renderHome() {
  $('#projectCount').textContent = S.projects.length ? `${S.projects.length} 作品` : '';
  if (!S.projects.length) {
    els.grid.innerHTML = '<div class="empty-note">まだ作品はありません。<br>上のボタンから最初のムービーをつくりましょう。</div>';
    return;
  }
  els.grid.innerHTML = S.projects.map((p) => {
    const cover = p.clips.find((c) => c.type === 'photo');
    const url = cover ? thumbUrl(cover.mediaId) : '';
    const n = p.clips.filter((c) => c.type === 'photo').length;
    const th = getTheme(p.theme);
    const d = new Date(p.updatedAt);
    return `<div class="pcard" data-open="${p.id}" role="button" tabindex="0">
      <div class="pcard-cover" style="${url ? `background-image:url(${url})` : ''}">
        ${url ? '' : `<div class="ph">${esc(th.name)}</div>`}
        <span class="pcard-dur">${formatTime(projectDuration(p), false)}</span>
      </div>
      <div class="pcard-body">
        <div class="pcard-text">
          <div class="pcard-name">${esc(p.name)}</div>
          <div class="pcard-meta">${esc(th.ja)} ・ 写真${n}枚 ・ ${d.getMonth() + 1}/${d.getDate()} 更新</div>
        </div>
        <button class="icon-btn" data-pmenu="${p.id}" aria-label="メニュー">${ICON.more}</button>
      </div>
    </div>`;
  }).join('');
}

async function createProject() {
  // iPhone では「ユーザーの操作の直後」でないと写真の選択画面が開かないので、先に開く
  els.photoInput.click();
  const d = new Date();
  const p = newProject(`${d.getMonth() + 1}月${d.getDate()}日のムービー`);
  await db.put('projects', p);
  S.projects.unshift(p);
  await openProject(p.id);
}

function projectMenu(id) {
  const p = S.projects.find((x) => x.id === id);
  if (!p) return;
  openSheet(`<h3>${esc(p.name)}</h3>
    <div class="menu-list">
      <button data-m="open">${ICON.play}開く</button>
      <button data-m="rename">${ICON.pen}名前を変える</button>
      <button data-m="dup">${ICON.copy}複製する</button>
      <button data-m="del" class="danger">${ICON.trash}削除する</button>
    </div>`, async (m) => {
    closeSheet();
    if (m === 'open') openProject(id);
    if (m === 'rename') {
      const name = await promptDialog('作品の名前', p.name);
      if (name) { p.name = name; p.updatedAt = Date.now(); await db.put('projects', p); showHome(); }
    }
    if (m === 'dup') {
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = uid(); copy.name = p.name + ' のコピー'; copy.createdAt = copy.updatedAt = Date.now();
      copy.clips.forEach((c) => { c.id = uid(); });
      await db.put('projects', copy);
      toast('複製しました');
      showHome();
    }
    if (m === 'del') {
      if (await confirmDialog(`「${p.name}」を削除しますか？`, '取り込んだ写真や音楽もこの端末から消えます（元の写真は消えません）。', '削除する', true)) {
        await db.del('projects', id);
        toast('削除しました');
        showHome();
      }
    }
  });
}

// ---------- 編集画面を開く ----------
async function openProject(id) {
  const p = await db.get('projects', id);
  if (!p) { toast('作品が見つかりませんでした', true); return showHome(); }
  p.look = { ...defaultLook(), ...(p.look || {}) };
  S.project = p;
  S.history = []; S.future = [];
  S.snapshot = JSON.stringify(p);
  S.selected = null;
  S.t = p.clips.length ? Math.min(1.2, p.clips[0].duration / 2) : 0;
  S.tab = p.clips.length ? 'theme' : 'photos';
  S.audioBuffer = null; S.audioMeta = null;
  sessionStorage.setItem('montage:open', id);
  els.home.classList.add('hidden');
  els.editor.classList.remove('hidden');
  els.projName.textContent = p.name;
  showBusy('読み込み中…');
  try {
    await loadMediaList(p.clips.filter((c) => c.mediaId).map((c) => c.mediaId));
    if (p.music) await loadMusic();
    if (!S.engine) setupEngine();
    fitStage();
    refresh();
    ensureFonts(p, S.theme).then(() => { clearTextCache(); requestRender(); });
  } finally {
    hideBusy();
  }
}

async function loadMusic() {
  const m = S.project.music;
  if (!m) { S.audioBuffer = null; S.audioMeta = null; return; }
  S.audioMeta = await getMedia(m.mediaId);
  try {
    S.audioBuffer = await getAudioBuffer(m.mediaId);
  } catch (e) {
    toast('音楽を読み込めませんでした', true);
    S.audioBuffer = null;
  }
}

function setupEngine() {
  try {
    S.engine = new Engine({ glCanvas: els.glc, ovCanvas: els.ovc, quality: 'preview' });
  } catch (e) {
    els.stageEmpty.innerHTML = '<p>この端末では映像を表示できません（WebGL 非対応）</p>';
    throw e;
  }
  S.engine.onTexture = () => requestRender();
  new ResizeObserver(() => { fitStage(); drawTimelineCanvas(); layoutTimeline(); }).observe(els.editor);
  window.addEventListener('resize', fitStage);
}

function fitStage() {
  if (!S.engine || els.editor.classList.contains('hidden')) return;
  const area = els.stage.parentElement;
  const theater = document.body.classList.contains('theater');
  const desktop = matchMedia('(min-width: 900px) and (min-height: 560px)').matches;
  let w;
  if (theater) {
    w = Math.min(innerWidth, innerHeight * 16 / 9);
  } else if (desktop) {
    const r = area.getBoundingClientRect();
    w = Math.min(r.width - 36, (r.height - 36) * 16 / 9);
  } else {
    const landscape = innerHeight < 520 && innerWidth > innerHeight;
    w = Math.min(area.clientWidth || innerWidth, innerHeight * (landscape ? 0.44 : 0.36) * 16 / 9);
  }
  w = Math.max(160, Math.floor(w));
  const h = Math.round(w * 9 / 16);
  els.stage.style.width = w + 'px';
  els.stage.style.height = h + 'px';
  els.stage.style.maxWidth = 'none';
  els.stage.style.maxHeight = 'none';
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const maxW = desktop ? 1600 : 1280;
  let pw = Math.min(maxW, Math.round(w * dpr));
  pw -= pw % 2;
  const ph = Math.round(pw * 9 / 16 / 2) * 2;
  if (S.engine.W !== pw || S.engine.H !== ph) {
    S.engine.setSize(pw, ph);
    requestRender();
  }
}

// ---------- 状態の更新 ----------
/** 見た目を作り直す。opts.panel=false でパネルはそのまま */
function refresh(opts = {}) {
  const p = S.project;
  S.theme = getTheme(p.theme);
  S.tl = computeTimeline(p, S.theme);
  S.beats = p.music && S.audioMeta ? timelineBeats(p.music, S.audioMeta, S.tl.total) : [];
  S.t = clamp(S.t, 0, Math.max(0, S.tl.total - 0.001));
  if (S.selected && !p.clips.some((c) => c.id === S.selected)) S.selected = null;
  els.projName.textContent = p.name;
  els.stageEmpty.classList.toggle('hidden', p.clips.length > 0);
  $('#snapBtn').classList.toggle('on', S.snap && S.beats.length > 0);
  $('#snapBtn').classList.toggle('hidden', !S.beats.length);
  $('#undoBtn').disabled = !S.history.length;
  $('#redoBtn').disabled = !S.future.length;
  buildTimeline();
  if (opts.panel !== false) renderPanel();
  updateTime();
  requestRender();
}

/** 変更を確定（元に戻せるように履歴に積んで保存） */
function commit(opts = {}) {
  const now = JSON.stringify(S.project);
  if (now !== S.snapshot) {
    S.history.push(S.snapshot);
    if (S.history.length > 80) S.history.shift();
    S.future = [];
    S.snapshot = now;
    save();
  }
  refresh(opts);
}

function undo() {
  if (!S.history.length) return;
  pause();
  S.future.push(S.snapshot);
  S.snapshot = S.history.pop();
  restoreSnapshot();
}
function redo() {
  if (!S.future.length) return;
  pause();
  S.history.push(S.snapshot);
  S.snapshot = S.future.pop();
  restoreSnapshot();
}
async function restoreSnapshot() {
  const prevMusic = S.project.music?.mediaId;
  S.project = JSON.parse(S.snapshot);
  if (S.project.music?.mediaId !== prevMusic) await loadMusic();
  save();
  refresh();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    S.project.updatedAt = Date.now();
    try { await db.put('projects', JSON.parse(JSON.stringify(S.project))); } catch (e) { toast('保存できませんでした：' + e.message, true); }
  }, 350);
}

// ---------- プレビュー描画 ----------
let rafPending = false;
function requestRender() {
  if (rafPending || S.playing || !S.engine) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderFrame(true);
  });
}
function renderFrame(editing) {
  if (!S.engine || !S.project || els.editor.classList.contains('hidden')) return;
  S.engine.render(S.project, S.tl, S.t, { beats: S.beats, editing });
}

// ---------- 再生 ----------
let starting = false;
async function play() {
  if (!S.tl.total || S.playing || starting) return;
  starting = true;
  if (S.t >= S.tl.total - 0.05) S.t = 0;
  let ctx;
  try {
    ctx = await resumeAudio();
    await ensureFonts(S.project, S.theme);
  } finally {
    starting = false;
  }
  if (S.playing) return;
  const { startAt } = S.player.start(S.audioBuffer, S.project.music, S.t, S.tl.total);
  S.playing = { t0: S.t, startAt, ctx };
  document.body.classList.add('playing');
  flashPlayIcon(false);
  loop();
}
function pause() {
  if (!S.playing) return;
  S.player.stop();
  S.playing = null;
  document.body.classList.remove('playing');
  requestRender();
}
function togglePlay() { if (S.playing) pause(); else play(); }
function loop() {
  if (!S.playing) return;
  const { ctx, startAt, t0 } = S.playing;
  const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  let t = t0 + Math.max(0, ctx.currentTime - startAt - lat);
  if (t >= S.tl.total) {
    S.t = S.tl.total;
    pause();
    S.t = Math.max(0, S.tl.total - 0.001);
    syncScroll(); updateTime();
    return;
  }
  S.t = t;
  S.engine.prefetch(S.project, S.tl, t, 4);
  renderFrame(false);
  syncScroll();
  updateTime();
  requestAnimationFrame(loop);
}
function flashPlayIcon(show) {
  els.stagePlay.classList.toggle('show', show);
}
function seek(t) {
  S.t = clamp(t, 0, Math.max(0, S.tl.total - 0.001));
  if (S.playing) { pause(); }
  syncScroll(); updateTime(); requestRender();
}

function updateTime() {
  els.timeCur.textContent = formatTime(S.t);
  els.timeTotal.textContent = formatTime(S.tl.total);
}

// ---------- タイムライン ----------
let lastProgScroll = -1;
function pad() { return els.tlScroll.clientWidth / 2; }

function buildTimeline() {
  const p = S.project, P = pad(), pps = S.pps;
  const html = [];
  for (const it of S.tl.items) {
    const c = it.clip;
    const left = P + it.start * pps, w = Math.max(6, it.dur * pps - 2);
    const sel = c.id === S.selected ? ' sel' : '';
    if (c.type === 'photo') {
      const url = thumbUrl(c.mediaId);
      html.push(`<div class="clip photo${sel}" data-id="${c.id}" style="left:${left + 1}px;width:${w}px;background-image:url(${url})"><span class="clip-dur">${it.dur.toFixed(1)}s</span><div class="trim-h"></div></div>`);
    } else {
      html.push(`<div class="clip title${sel}" data-id="${c.id}" style="left:${left + 1}px;width:${w}px"><span>${esc(c.title || 'タイトル')}</span><span class="clip-dur">${it.dur.toFixed(1)}s</span><div class="trim-h"></div></div>`);
    }
  }
  S.tl.items.forEach((it, i) => {
    if (i === S.tl.items.length - 1) return;
    const custom = it.clip.transition && it.clip.transition !== 'theme';
    html.push(`<button class="tmark${custom ? ' custom' : ''}" data-tm="${it.clip.id}" style="left:${P + it.end * pps}px" aria-label="切り替え">${ICON.trans}</button>`);
  });
  if (!S.tl.items.length) html.push(`<div class="tl-empty" style="left:${P + 8}px">写真を追加すると、ここに並びます</div>`);
  els.tlContent.innerHTML = html.join('');
  els.tlContent.style.width = P * 2 + S.tl.total * pps + 'px';
  syncScroll();
  drawTimelineCanvas();
}
function layoutTimeline() {
  if (!S.project) return;
  buildTimeline();
}

function syncScroll() {
  const x = Math.round(S.t * S.pps);
  if (Math.abs(els.tlScroll.scrollLeft - x) >= 1) {
    lastProgScroll = x;
    els.tlScroll.scrollLeft = x;
  }
  drawTimelineCanvas();
}

function onTimelineScroll() {
  const x = els.tlScroll.scrollLeft;
  drawTimelineCanvas();
  if (Math.abs(x - lastProgScroll) < 1.5) return;
  lastProgScroll = -1;
  if (S.playing) pause();
  S.t = clamp(x / S.pps, 0, Math.max(0, S.tl.total - 0.001));
  updateTime();
  requestRender();
}

function setZoom(pps, keepT = true) {
  S.pps = clamp(pps, 10, 260);
  buildTimeline();
  if (keepT) syncScroll();
}

function drawTimelineCanvas() {
  const cv = els.tlCanvas;
  if (!cv || !S.project) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const sx = els.tlScroll.scrollLeft, P = w / 2, pps = S.pps, total = S.tl.total;
  const tAt = (x) => (sx + x - P) / pps;
  const xAt = (t) => t * pps - sx + P;
  // 目盛り
  const step = pps >= 90 ? 0.5 : pps >= 40 ? 1 : pps >= 18 ? 2 : 5;
  const label = pps >= 40 ? 2 : pps >= 18 ? 5 : 10;
  g.font = '500 9px Inter, sans-serif';
  g.textBaseline = 'top';
  const t0 = Math.max(0, Math.floor(tAt(0) / step) * step), t1 = Math.min(total, tAt(w));
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    const x = xAt(t);
    const isL = Math.abs(t / label - Math.round(t / label)) < 1e-6;
    g.fillStyle = isL ? 'rgba(243,238,229,0.45)' : 'rgba(243,238,229,0.18)';
    g.fillRect(Math.round(x), isL ? 4 : 7, 1, isL ? 8 : 4);
    if (isL) { g.fillStyle = 'rgba(243,238,229,0.5)'; g.fillText(formatTime(t, false), Math.round(x) + 3, 3); }
  }
  // 音楽の波形とビート
  const clipTop = els.tl.querySelector('.clip')?.offsetTop ?? 24;
  const clipH = els.tl.querySelector('.clip')?.offsetHeight ?? 58;
  const laneTop = clipTop + clipH + 8, laneH = Math.max(14, h - laneTop - 6);
  const m = S.project.music, meta = S.audioMeta, buf = S.audioBuffer;
  if (m && meta && meta.peaks && total > 0) {
    const peaks = meta.peaks, dur = meta.duration;
    const xa = Math.max(0, xAt(0)), xb = Math.min(w, xAt(total));
    g.fillStyle = 'rgba(229,195,140,0.07)';
    roundRect(g, xa, laneTop, xb - xa, laneH, 6); g.fill();
    g.fillStyle = 'rgba(229,195,140,0.55)';
    const mid = laneTop + laneH / 2;
    for (let x = xa; x < xb; x += 3) {
      const tau = tAt(x);
      const pos = buf ? musicPosAt(m, buf, tau) : m.offset + tau;
      if (pos === null || pos > dur) continue;
      const v = peaks[Math.min(peaks.length - 1, Math.floor((pos / dur) * peaks.length))] / 255;
      const bh = Math.max(1, v * (laneH - 6));
      g.fillRect(x, mid - bh / 2, 2, bh);
    }
    if (S.beats.length) {
      const P2 = beatPeriod(m, meta);
      g.fillStyle = 'rgba(243,238,229,0.55)';
      for (const b of S.beats) {
        const x = xAt(b);
        if (x < -2 || x > w + 2) continue;
        const k = Math.round((b + m.offset - meta.beatOffset) / P2);
        const strong = ((k % 4) + 4) % 4 === 0;
        g.fillRect(Math.round(x), laneTop + (strong ? 0 : 3), 1, strong ? 5 : 3);
      }
    }
    g.fillStyle = 'rgba(243,238,229,0.55)';
    g.font = '500 9px Inter, "Zen Kaku Gothic New", sans-serif';
    g.textBaseline = 'middle';
    if (xa > -50) g.fillText('♪ ' + (m.name || ''), xa + 6, laneTop + laneH / 2);
  } else if (total > 0) {
    g.fillStyle = 'rgba(243,238,229,0.25)';
    g.font = '500 10px Inter, "Zen Kaku Gothic New", sans-serif';
    g.textBaseline = 'middle';
    g.fillText('♪ 音楽なし', Math.max(6, xAt(0) + 6), laneTop + laneH / 2);
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function selectClip(id, { jump = true, tab } = {}) {
  S.selected = id;
  if (id && jump) {
    const it = S.tl.items.find((x) => x.clip.id === id);
    if (it && (S.t < it.start || S.t >= it.end)) {
      pause();
      S.t = Math.min(it.end - 0.01, it.start + Math.min(0.5, it.dur / 2) + it.tIn / 2);
    }
  }
  if (tab) S.tab = tab;
  panelFocus = null;
  refresh();
}

// トリム（長さの変更）
function bindTrim() {
  let drag = null;
  els.tlContent.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.trim-h');
    if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const el = h.closest('.clip');
    const clip = S.project.clips.find((c) => c.id === el.dataset.id);
    const it = S.tl.items.find((x) => x.clip === clip);
    drag = { clip, start: it.start, x0: e.clientX, d0: clip.duration, el };
    h.setPointerCapture(e.pointerId);
    pause();
  });
  els.tlContent.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let d = drag.d0 + (e.clientX - drag.x0) / S.pps;
    let end = drag.start + d;
    if (S.snap && S.beats.length) end = snapToBeat(end, S.beats, 10 / S.pps + 0.04);
    d = clamp(end - drag.start, 0.3, 60);
    drag.clip.duration = round3(d);
    S.tl = computeTimeline(S.project, S.theme);
    const it = S.tl.items.find((x) => x.clip === drag.clip);
    drag.el.style.width = Math.max(6, it.dur * S.pps - 2) + 'px';
    drag.el.querySelector('.clip-dur').textContent = it.dur.toFixed(1) + 's';
    S.t = Math.max(it.start, it.end - 0.04);
    updateTime();
    renderFrame(true);
    const dv = $('#durVal');
    if (dv) dv.innerHTML = `${it.dur.toFixed(1)}<small>秒</small>`;
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    commit();
  };
  els.tlContent.addEventListener('pointerup', end);
  els.tlContent.addEventListener('pointercancel', end);
}

// ピンチで拡大縮小
function bindPinch() {
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  els.tlScroll.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) pinch = { d: dist(e.touches), pps: S.pps, t: S.t };
  }, { passive: true });
  els.tlScroll.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    S.t = pinch.t;
    setZoom(pinch.pps * dist(e.touches) / pinch.d);
  }, { passive: false });
  els.tlScroll.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
  els.tlScroll.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(S.pps * Math.exp(-e.deltaY * 0.01));
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      els.tlScroll.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

// ---------- パネル ----------
let panelFocus = null;

function renderPanel() {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', !S.selected && b.dataset.tab === S.tab));
  const scroll = els.panel.scrollTop;
  const sameView = els.panel.dataset.view === (S.selected ? 'clip:' + S.selected : 'tab:' + S.tab);
  let html;
  if (S.selected) {
    const clip = S.project.clips.find((c) => c.id === S.selected);
    html = clip.type === 'photo' ? photoPanel(clip) : titlePanel(clip);
    els.panel.dataset.view = 'clip:' + S.selected;
  } else {
    html = { theme: themePanel, photos: photosPanel, text: textPanel, music: musicPanel, look: lookPanel }[S.tab]();
    els.panel.dataset.view = 'tab:' + S.tab;
  }
  els.panel.innerHTML = html;
  els.panel.scrollTop = sameView ? scroll : 0;
  for (const r of $$('input[type=range]', els.panel)) setFill(r);
  afterPanel();
  if (panelFocus) {
    const el = els.panel.querySelector(`[data-sec="${panelFocus}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
    panelFocus = null;
  }
}

function setFill(r) {
  const p = ((+r.value - +r.min) / (+r.max - +r.min)) * 100;
  r.style.setProperty('--fill', p + '%');
}

const chips = (key, options, value) =>
  `<div class="chips" data-chips="${key}">${options.map(([v, label, extra = '']) =>
    `<button class="chip${String(v) === String(value) ? ' on' : ''}" data-v="${esc(v)}">${extra}${esc(label)}</button>`).join('')}</div>`;
const slider = (key, label, min, max, step, value, fmt = (v) => v) =>
  `<div class="slider"><label>${label}</label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><output data-o="${key}">${fmt(value)}</output></div>`;
const sec = (title, body, extra = '', id = '') => `<div class="sec"${id ? ` data-sec="${id}"` : ''}><div class="sec-t">${title}${extra}</div>${body}</div>`;

// --- テーマ
function themePanel() {
  const cur = S.project.theme;
  const cards = THEMES.map((t) => {
    const img = S.themeThumbs.get(themeThumbKey(t.id));
    return `<button class="tcard${t.id === cur ? ' on' : ''}" data-act="theme" data-id="${t.id}">
      <div class="tcard-img" data-thumb="${t.id}" style="${img ? `background-image:url(${img})` : themeFallbackBg(t)}"><span class="tname" style="font-family:'${FONT_SET[t.text.font].latin}';${t.text.title.italic ? 'font-style:italic;' : ''}">${esc(t.name)}</span></div>
      <div class="tcard-body"><div class="tcard-ja">${esc(t.ja)}${t.id === cur ? ICON.check : ''}</div><div class="tcard-desc">${esc(t.desc)}</div></div>
    </button>`;
  }).join('');
  return `<div class="p-head"><h3>テーマ</h3></div>
    <div class="theme-grid">${cards}</div>
    <p class="note">テーマを変えると、配置・動き・切り替え・色・文字がまとめて変わります。写真ごとの設定はそのまま残ります。</p>`;
}
function themeFallbackBg(t) {
  const c = t.titleBg.colors || t.table || [t.titleBg.color || t.bg, t.bg];
  return `background:radial-gradient(90% 90% at 30% 30%, ${c[0]}, ${c[1] || c[0]})`;
}
function themeThumbKey(themeId) {
  const first = S.project.clips.find((c) => c.type === 'photo');
  return `${themeId}|${first ? first.mediaId : '-'}`;
}
let thumbEngine = null;
let thumbBusy = false;
async function generateThemeThumbs() {
  const first = S.project.clips.find((c) => c.type === 'photo');
  if (!first || thumbBusy) return;
  thumbBusy = true;
  try {
    if (!thumbEngine) {
      thumbEngine = new Engine({ quality: 'preview' });
      thumbEngine.setSize(384, 216);
    }
    const out = document.createElement('canvas');
    out.width = 384; out.height = 216;
    const octx = out.getContext('2d');
    for (const t of THEMES) {
      const key = themeThumbKey(t.id);
      if (S.themeThumbs.has(key)) continue;
      const proj = { ...S.project, theme: t.id, look: defaultLook(), clips: [{ ...first, caption: '', transition: 'cut' }] };
      const tl = computeTimeline(proj, t);
      await ensureFonts(proj, t);
      await thumbEngine.prepare(proj, tl, 0.6);
      thumbEngine.render(proj, tl, Math.min(0.6 + 0.9, tl.total * 0.5), { editing: true });
      thumbEngine.compose(octx, 384, 216);
      S.themeThumbs.set(key, out.toDataURL('image/jpeg', 0.82));
      const el = els.panel.querySelector(`[data-thumb="${t.id}"]`);
      if (el) el.style.background = `url(${S.themeThumbs.get(key)}) center / cover`;
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    console.warn('theme thumbs', e);
  } finally {
    thumbBusy = false;
  }
}

// --- 写真（全体）
function photosPanel() {
  const p = S.project;
  const photos = p.clips.filter((c) => c.type === 'photo');
  const avg = photos.length ? photos.reduce((s, c) => s + c.duration, 0) / photos.length : S.theme.defaultDuration;
  const tiles = p.clips.map((c, i) => {
    const sel = c.id === S.selected ? ' sel' : '';
    if (c.type === 'photo') return `<div class="gtile${sel}" data-gid="${c.id}" style="background-image:url(${thumbUrl(c.mediaId)})"><span class="n">${i + 1}</span><span class="d">${c.duration.toFixed(1)}s</span></div>`;
    return `<div class="gtile title${sel}" data-gid="${c.id}"><span class="n">${i + 1}</span>${esc(c.title || 'タイトル')}<span class="d">${c.duration.toFixed(1)}s</span></div>`;
  }).join('');
  return `<div class="p-head"><h3>写真<span class="sub">${photos.length}枚 ・ ${formatTime(S.tl.total)}</span></h3></div>
    <div class="row" style="margin-bottom:18px">
      <button class="btn primary" data-act="addPhotos">${ICON.plus}写真を追加</button>
      <button class="btn" data-act="addTitle">${ICON.text}タイトルカード</button>
    </div>
    ${photos.length ? sec('並び順', chips('sort', [['date', '撮影日の順'], ['dateDesc', '新しい順'], ['shuffle', 'シャッフル']], ''), '') : ''}
    ${photos.length ? sec('写真の表示時間（すべて）', slider('allDur', '1枚あたり', 0.5, 8, 0.1, avg.toFixed(1), (v) => (+v).toFixed(1) + '秒')) : ''}
    ${p.clips.length ? sec('並べ替え', `<div class="pgrid" id="pgrid">${tiles}</div><p class="note">長押しして動かすと並べ替えられます。タップで1枚ずつ編集できます。</p>`) : ''}`;
}

// --- 写真（1枚）
function photoPanel(clip) {
  const p = S.project;
  const i = p.clips.indexOf(clip);
  const it = S.tl.items[i];
  const rec = peekMedia(clip.mediaId);
  const isLast = i === p.clips.length - 1;
  const P = beatPeriod(p.music, S.audioMeta);
  const beatBtns = P ? `<div class="chips" style="margin-top:10px">${[1, 2, 4, 8].map((n) => `<button class="chip${Math.abs(clip.duration - n * P) < 0.02 ? ' on' : ''}" data-act="durBeats" data-n="${n}">${n}拍</button>`).join('')}</div>` : '';
  const date = rec?.date ? new Date(rec.date) : null;
  const fo = clip.focus || { x: 0.5, y: 0.5 };
  return `<div class="p-head">
      <div class="p-thumb" style="background-image:url(${thumbUrl(clip.mediaId)})"></div>
      <h3>写真 ${it.photoIndex + 1}<span class="sub">${date ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` : ''}</span></h3>
      <button class="icon-btn" data-act="deselect" aria-label="閉じる">${ICON.close}</button>
    </div>
    ${sec('表示時間', `<div class="dur-box"><button class="round-btn" data-act="dur-">−</button><div class="dur-val" id="durVal">${clip.duration.toFixed(1)}<small>秒</small></div><button class="round-btn" data-act="dur+">＋</button></div>
      ${slider('dur', '長さ', 0.3, 12, 0.1, clip.duration, (v) => (+v).toFixed(1) + '秒')}${beatBtns}
      <button class="btn small ghost" data-act="durAll" style="margin-top:8px">この長さをすべての写真に</button>`, '', 'dur')}
    ${sec('文字', `<textarea class="field" data-k="caption" placeholder="写真に文字を入れる（改行もできます）" rows="2">${esc(clip.caption)}</textarea>
      <div style="height:10px"></div>${chips('capPos', [['auto', 'おまかせ'], ['bottom', '下'], ['center', '中央'], ['top', '上']], clip.captionPos || 'auto')}
      <div style="height:8px"></div>${chips('capSize', [[0.8, '小'], [1, '中'], [1.3, '大']], clip.captionSize || 1)}`, '', 'caption')}
    ${sec('動き', chips('motion', MOTIONS.map((m) => [m.id, m.ja]), clip.motion || 'auto'), '', 'motion')}
    ${sec('寄せる場所', `<div class="focus-pick" id="focusPick"><img src="${thumbUrl(clip.mediaId)}" alt=""><span class="focus-dot" style="left:${fo.x * 100}%;top:${fo.y * 100}%"></span></div><p class="note">写真をタップした場所に向かってズームします。</p>`, '')}
    ${S.theme.layout === 'full' ? sec('写真の見せ方', chips('fit', [['auto', 'おまかせ'], ['cover', '画面いっぱい'], ['contain', '全体＋ぼかし背景']], clip.fit || 'auto')) : ''}
    ${isLast ? '' : sec('次の写真への切り替え', chips('trans', [['theme', 'テーマ'], ...TRANSITIONS.map((t) => [t.id, t.ja])], clip.transition || 'theme'), '', 'trans')}
    ${clipActions(i)}`;
}

function titlePanel(clip) {
  const i = S.project.clips.indexOf(clip);
  const isLast = i === S.project.clips.length - 1;
  return `<div class="p-head"><h3>タイトルカード</h3><button class="icon-btn" data-act="deselect" aria-label="閉じる">${ICON.close}</button></div>
    ${sec('文字', `<input class="field" data-k="title" value="${esc(clip.title)}" placeholder="タイトル"><input class="field" data-k="subtitle" value="${esc(clip.subtitle)}" placeholder="サブタイトル（日付や場所など）">`)}
    ${sec('背景', chips('titleBg', [['theme', 'テーマ'], ['photo', '写真をぼかす'], ['black', '黒'], ['white', '白']], clip.bg || 'theme'))}
    ${sec('表示時間', `${slider('dur', '長さ', 0.8, 12, 0.1, clip.duration, (v) => (+v).toFixed(1) + '秒')}`, '', 'dur')}
    ${isLast ? '' : sec('次への切り替え', chips('trans', [['theme', 'テーマ'], ...TRANSITIONS.map((t) => [t.id, t.ja])], clip.transition || 'theme'), '', 'trans')}
    ${clipActions(i)}`;
}

function clipActions(i) {
  const n = S.project.clips.length;
  const c = S.project.clips[i];
  return `<div class="sec"><div class="row">
      <button class="btn" data-act="moveL" ${i === 0 ? 'disabled' : ''}>${ICON.left}前へ</button>
      <button class="btn" data-act="moveR" ${i === n - 1 ? 'disabled' : ''}>後ろへ${ICON.right}</button>
    </div><div class="row" style="margin-top:8px">
      <button class="btn" data-act="dup">${ICON.copy}複製</button>
      ${c.type === 'photo' ? `<button class="btn" data-act="replace">${ICON.swap}差し替え</button>` : ''}
      <button class="btn danger" data-act="del">${ICON.trash}削除</button>
    </div></div>`;
}

// --- 文字
function textPanel() {
  const p = S.project;
  const first = p.clips[0], last = p.clips[p.clips.length - 1];
  const opening = first && first.type === 'title' ? first : null;
  const ending = last && last.type === 'title' && last !== opening ? last : null;
  const L = p.look;
  const photos = p.clips.filter((c) => c.type === 'photo');
  const fontChips = [['theme', 'テーマ'], ...FONT_SETS.map((f) => [f.id, f.ja])];
  const fontHtml = `<div class="chips" data-chips="font">${fontChips.map(([v, label]) => {
    const f = FONT_SET[v];
    const style = f ? `style="font-family:'${f.latin}','${f.jp}'"` : '';
    return `<button class="chip${(L.font || 'theme') === v ? ' on' : ''}" data-v="${v}" ${style}>${esc(label)}</button>`;
  }).join('')}</div>`;
  return `<div class="p-head"><h3>文字</h3></div>
    ${sec('オープニング', opening
      ? `<input class="field" data-tk="${opening.id}:title" value="${esc(opening.title)}" placeholder="タイトル"><input class="field" data-tk="${opening.id}:subtitle" value="${esc(opening.subtitle)}" placeholder="サブタイトル">`
      : `<button class="btn block" data-act="addOpening">${ICON.plus}オープニングタイトルを追加</button>`)}
    ${sec('エンディング', ending
      ? `<input class="field" data-tk="${ending.id}:title" value="${esc(ending.title)}" placeholder="エンディングの文字"><input class="field" data-tk="${ending.id}:subtitle" value="${esc(ending.subtitle)}" placeholder="小さな文字（任意）">`
      : `<button class="btn block" data-act="addEnding">${ICON.plus}エンディングを追加</button>`)}
    ${sec('フォント', fontHtml)}
    ${sec('日付スタンプ', chips('dateStamp', [['theme', 'テーマ'], ['on', '表示'], ['off', '非表示']], L.dateStamp || 'theme') + '<p class="note">撮影日をフィルムカメラ風に右下へ入れます。</p>')}
    ${photos.length ? sec('写真ごとの文字', `<div class="cap-list">${photos.map((c) => `<div class="cap-row"><div class="p-thumb" data-goto="${c.id}" style="background-image:url(${thumbUrl(c.mediaId)})"></div><input class="field" data-cap="${c.id}" value="${esc(c.caption)}" placeholder="文字なし"></div>`).join('')}</div>`) : ''}`;
}

// --- 音楽
function musicPanel() {
  const p = S.project, m = p.music, meta = S.audioMeta;
  if (!m) {
    return `<div class="p-head"><h3>音楽</h3></div>
      <div class="empty-panel">
        <div class="big-ico">${ICON.music}</div>
        <p>端末に保存した音楽ファイル（MP3・M4A・WAV など）や、<br>動画ファイルの音声をBGMにできます。</p>
        <button class="btn primary" data-act="addMusic">${ICON.music}音楽を選ぶ</button>
        <p class="note">Apple Music など配信サービスの曲は、著作権保護のため読み込めません。</p>
      </div>`;
  }
  const P = beatPeriod(m, meta);
  const bpm = P ? Math.round(60 / P) : 0;
  return `<div class="p-head"><h3>音楽</h3></div>
    <div class="music-card"><div class="music-icon">${ICON.music}</div><div style="min-width:0;flex:1"><div class="music-name">${esc(m.name)}</div><div class="music-meta">${formatTime(meta?.duration || 0, false)}${bpm ? ` ・ ${bpm} BPM` : ''}</div></div>
      <button class="icon-btn" data-act="addMusic" aria-label="変更">${ICON.swap}</button></div>
    ${sec('使う部分', `<div class="wave" id="wave"><canvas></canvas></div><p class="note">枠を左右に動かして、曲のどこから流すかを決めます。開始位置 <b id="offLbl">${formatTime(m.offset)}</b></p>`, '', 'range')}
    ${P ? sec('ビートに合わせる', `<div class="sec-t" style="margin:0 0 8px"><span></span><b>何拍ごとに切り替えるか</b></div>${chips('beatsPer', [[1, '1拍'], [2, '2拍'], [4, '4拍'], [8, '8拍']], S.beatsPer)}
      <button class="btn primary block" data-act="syncBeats" style="margin-top:12px">${ICON.beat}ビートに合わせて並べる</button>
      <p class="note">すべての写真の長さを拍に合わせ、切り替えがリズムに乗るようにします（今は ${(S.beatsPer * P).toFixed(2)} 秒ごと）。タイトルカードは2倍の長さになります。</p>
      <div class="sec-t" style="margin:14px 0 8px"><span>テンポ</span><b>${bpm} BPM</b></div>${chips('tempoMul', [[0.5, '半分'], [1, '検出どおり'], [2, '倍']], m.tempoMul || 1)}
      <div style="margin-top:12px">${chips('snap', [['on', 'ビートにスナップ オン'], ['off', 'オフ']], S.snap ? 'on' : 'off')}</div>`, '') : ''}
    ${sec('長さ', `<button class="btn block" data-act="fitMusic">曲の終わりに合わせて写真の長さを調整</button>`)}
    ${sec('音量とフェード', slider('mvol', '音量', 0, 1, 0.01, m.volume, (v) => Math.round(v * 100) + '%')
      + slider('mfin', 'フェードイン', 0, 5, 0.1, m.fadeIn, (v) => (+v).toFixed(1) + '秒')
      + slider('mfout', 'フェードアウト', 0, 8, 0.1, m.fadeOut, (v) => (+v).toFixed(1) + '秒')
      + `<div style="margin-top:6px">${chips('loop', [['on', '曲が短いときはくり返す'], ['off', 'くり返さない']], m.loop ? 'on' : 'off')}</div>`)}
    <button class="btn danger block" data-act="removeMusic">${ICON.trash}音楽を外す</button>`;
}

// --- 仕上げ
function lookPanel() {
  const p = S.project, L = p.look, th = S.theme, R = resolveLook(p, th);
  const grades = [['theme', `テーマ（${GRADE[th.grade].ja}）`, GRADE[th.grade].sw], ...GRADES.map((g) => [g.id, g.ja, g.sw])];
  return `<div class="p-head"><h3>仕上げ</h3></div>
    ${sec('色', `<div class="grade-grid">${grades.map(([id, ja, sw]) => `<button class="gcard${(L.grade || 'theme') === id ? ' on' : ''}" data-act="grade" data-id="${id}"><div class="gsw" style="background:linear-gradient(120deg, ${sw[0]}, ${sw[1]})"></div>${esc(ja)}</button>`).join('')}</div>`)}
    ${sec('質感', slider('grain', '粒子', 0, 1, 0.01, R.grain, pct) + slider('vignette', '周辺の暗さ', 0, 1, 0.01, R.vignette, pct) + slider('leak', '光漏れ', 0, 1, 0.01, R.leak, pct))}
    ${sec('動き', slider('motion', '動きの強さ', 0, 2.5, 0.05, R.motion, (v) => Math.round(v * 100) + '%'))}
    ${sec('切り替え（すべて）', chips('gTrans', [['theme', 'テーマ'], ...TRANSITIONS.map((t) => [t.id, t.ja])], L.transition || 'theme')
      + slider('transDur', '長さ', 0.2, 2.5, 0.05, L.transitionDur ?? th.transitionDur, (v) => (+v).toFixed(2) + '秒')
      + '<p class="note">写真ごとに切り替えを決めた場合は、そちらが優先されます。</p>')}
    ${sec('シネマの黒帯', chips('letterbox', [['theme', 'テーマ'], ['on', 'あり'], ['off', 'なし']], L.letterbox || 'theme'))}
    ${sec('はじめと終わり', chips('fadeInOut', [['on', 'フェードする'], ['off', 'しない']], L.fadeInOut === false ? 'off' : 'on'))}
    <button class="btn block" data-act="resetLook">テーマの標準に戻す</button>`;
}
const pct = (v) => Math.round(v * 100) + '%';

// パネル描画後のしかけ
function afterPanel() {
  if (!S.selected && S.tab === 'theme') generateThemeThumbs();
  const grid = $('#pgrid');
  if (grid) bindGridSort(grid);
  const fp = $('#focusPick');
  if (fp) bindFocusPick(fp);
  const wave = $('#wave');
  if (wave) bindWave(wave);
}

// --- パネルの操作
function bindPanel() {
  els.panel.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chips[data-chips] .chip');
    if (chip) return onChip(chip.parentElement.dataset.chips, chip.dataset.v);
    const g = e.target.closest('[data-goto]');
    if (g) return selectClip(g.dataset.goto);
    const tile = e.target.closest('[data-gid]');
    if (tile && !gridJustDragged) return selectClip(tile.dataset.gid);
    const a = e.target.closest('[data-act]');
    if (a) return onAction(a.dataset.act, a);
  });
  els.panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[type=range]')) { setFill(t); onSlider(t.dataset.k, +t.value, false); }
    else if (t.dataset.k) onText(t.dataset.k, t.value, false);
    else if (t.dataset.cap) onCaption(t.dataset.cap, t.value, false);
    else if (t.dataset.tk) onTitleText(t.dataset.tk, t.value, false);
  });
  els.panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=range]')) onSlider(t.dataset.k, +t.value, true);
    else if (t.dataset.k) onText(t.dataset.k, t.value, true);
    else if (t.dataset.cap) onCaption(t.dataset.cap, t.value, true);
    else if (t.dataset.tk) onTitleText(t.dataset.tk, t.value, true);
  });
}

function selClip() { return S.project.clips.find((c) => c.id === S.selected); }

function live() {
  S.tl = computeTimeline(S.project, S.theme);
  S.beats = S.project.music && S.audioMeta ? timelineBeats(S.project.music, S.audioMeta, S.tl.total) : [];
  updateTime();
  requestRender();
}
function liveTimeline() {
  live();
  buildTimeline();
}

function onChip(key, v) {
  const p = S.project, c = selClip();
  const num = +v;
  switch (key) {
    case 'motion': c.motion = v; break;
    case 'fit': c.fit = v; break;
    case 'trans': c.transition = v; break;
    case 'capPos': c.captionPos = v; break;
    case 'capSize': c.captionSize = num; break;
    case 'titleBg': c.bg = v; break;
    case 'sort': return sortPhotos(v);
    case 'font': p.look.font = v; ensureFonts(p, S.theme).then(() => { clearTextCache(); requestRender(); }); break;
    case 'dateStamp': p.look.dateStamp = v; break;
    case 'gTrans': p.look.transition = v; break;
    case 'letterbox': p.look.letterbox = v; break;
    case 'fadeInOut': p.look.fadeInOut = v === 'on'; break;
    case 'beatsPer': S.beatsPer = num; return renderPanel();
    case 'tempoMul': p.music.tempoMul = num; break;
    case 'snap': S.snap = v === 'on'; return refresh();
    case 'loop': p.music.loop = v === 'on'; break;
  }
  commit();
  // 切り替えを選んだら、その場面を見せる
  if (key === 'trans' || key === 'gTrans') previewTransition(c);
}

function previewTransition(c) {
  const it = c ? S.tl.items.find((x) => x.clip === c) : S.tl.items.find((x) => S.t < x.end);
  if (!it || !it.tOut) return;
  S.t = Math.max(0, it.end - it.tOut / 2 - 0.4);
  syncScroll();
  updateTime();
  play();
}

function onSlider(k, v, final) {
  const p = S.project, c = selClip();
  const out = els.panel.querySelector(`[data-o="${k}"]`);
  switch (k) {
    case 'dur': {
      c.duration = round3(v);
      const dv = $('#durVal');
      if (dv) dv.innerHTML = `${v.toFixed(1)}<small>秒</small>`;
      if (out) out.textContent = v.toFixed(1) + '秒';
      liveTimeline();
      break;
    }
    case 'allDur':
      p.clips.forEach((x) => { if (x.type === 'photo') x.duration = round3(v); });
      if (out) out.textContent = v.toFixed(1) + '秒';
      liveTimeline();
      break;
    case 'mvol': p.music.volume = v; if (out) out.textContent = Math.round(v * 100) + '%'; break;
    case 'mfin': p.music.fadeIn = v; if (out) out.textContent = v.toFixed(1) + '秒'; break;
    case 'mfout': p.music.fadeOut = v; if (out) out.textContent = v.toFixed(1) + '秒'; break;
    case 'grain': case 'vignette': case 'leak':
      p.look[k] = v; if (out) out.textContent = pct(v); live(); break;
    case 'motion': p.look.motion = v; if (out) out.textContent = Math.round(v * 100) + '%'; live(); break;
    case 'transDur': p.look.transitionDur = v; if (out) out.textContent = v.toFixed(2) + '秒'; liveTimeline(); break;
  }
  if (final) commit({ panel: false });
}

function onText(k, v, final) {
  const c = selClip();
  if (!c) return;
  if (k === 'caption') c.caption = v;
  if (k === 'title') c.title = v;
  if (k === 'subtitle') c.subtitle = v;
  if (!final) showTextOf(c);
  textChanged(final);
}
/** 文字が出そろった場面を表示する（入力中の見た目確認用） */
function showTextOf(c) {
  const it = S.tl.items.find((x) => x.clip === c);
  if (!it || S.playing) return;
  const want = Math.min(it.end - it.tOut / 2 - 0.05, it.start + 2.2);
  if (Math.abs(S.t - want) > 0.01) { S.t = Math.max(it.start, want); syncScroll(); updateTime(); }
}
function onCaption(id, v, final) {
  const c = S.project.clips.find((x) => x.id === id);
  if (!c) return;
  c.caption = v;
  // 編集中の写真を表示する
  if (!final) showTextOf(c);
  textChanged(final);
}
function onTitleText(key, v, final) {
  const [id, field] = key.split(':');
  const c = S.project.clips.find((x) => x.id === id);
  if (!c) return;
  c[field] = v;
  if (!final) showTextOf(c);
  textChanged(final);
}
let fontTimer = null;
function textChanged(final) {
  requestRender();
  clearTimeout(fontTimer);
  fontTimer = setTimeout(() => ensureFonts(S.project, S.theme).then(() => { clearTextCache(); requestRender(); }), 300);
  if (final) commit({ panel: false });
}

async function onAction(act, el) {
  const p = S.project;
  const c = selClip();
  const idx = c ? p.clips.indexOf(c) : -1;
  switch (act) {
    case 'addPhotos': pause(); els.photoInput.click(); return;
    case 'addMusic': pause(); els.audioInput.click(); return;
    case 'deselect': S.selected = null; return refresh();
    case 'theme':
      if (p.theme === el.dataset.id) return;
      p.theme = el.dataset.id;
      S.theme = getTheme(p.theme);
      await ensureFonts(p, S.theme);
      clearTextCache();
      commit();
      if (!S.playing) { const it = S.tl.items.find((x) => S.t < x.end); if (it) S.t = Math.max(S.t, it.start + 0.8); requestRender(); }
      toast(`テーマ「${S.theme.ja}」`);
      return;
    case 'addTitle': {
      const at = c ? idx + 1 : p.clips.length;
      const t = newTitleClip('タイトル', '', 3);
      p.clips.splice(at, 0, t);
      commit({ panel: false });
      selectClip(t.id);
      return;
    }
    case 'addOpening': {
      p.clips.unshift(newTitleClip(p.name, dateRangeText(), 3.5));
      S.t = 0.1;
      commit();
      return;
    }
    case 'addEnding': {
      p.clips.push(newTitleClip(END_TEXT[p.theme] || 'Fin', '', 3));
      S.t = S.tl.total + 1.5;
      commit();
      return;
    }
    case 'dur-': case 'dur+': {
      let d = c.duration + (act === 'dur+' ? 0.5 : -0.5);
      d = Math.round(d * 2) / 2;
      c.duration = clamp(d, 0.5, 60);
      commit();
      return;
    }
    case 'durBeats': c.duration = round3(+el.dataset.n * beatPeriod(p.music, S.audioMeta)); commit(); return;
    case 'durAll': p.clips.forEach((x) => { if (x.type === 'photo') x.duration = c.duration; }); commit(); toast('すべての写真を同じ長さにしました'); return;
    case 'moveL': case 'moveR': {
      const j = act === 'moveL' ? idx - 1 : idx + 1;
      if (j < 0 || j >= p.clips.length) return;
      [p.clips[idx], p.clips[j]] = [p.clips[j], p.clips[idx]];
      commit();
      const it = S.tl.items[j];
      S.t = it.start + Math.min(0.5, it.dur / 2);
      syncScroll(); requestRender();
      return;
    }
    case 'dup': {
      const copy = { ...JSON.parse(JSON.stringify(c)), id: uid() };
      p.clips.splice(idx + 1, 0, copy);
      commit({ panel: false });
      selectClip(copy.id);
      return;
    }
    case 'replace': pause(); els.replaceInput.click(); return;
    case 'del': {
      p.clips.splice(idx, 1);
      S.selected = null;
      commit();
      toast('削除しました（元に戻すボタンで戻せます）');
      return;
    }
    case 'syncBeats': {
      if (!p.clips.length) return toast('先に写真を追加してください');
      syncToBeats(p, S.audioMeta, S.beatsPer);
      S.t = 0;
      commit();
      toast('ビートに合わせて並べました');
      return;
    }
    case 'fitMusic': {
      if (!S.audioMeta) return;
      const target = S.audioMeta.duration - p.music.offset;
      if (target < 2) return toast('曲の残りが短すぎます');
      fitToLength(p, target);
      commit();
      toast(`${formatTime(target, false)} に合わせました`);
      return;
    }
    case 'removeMusic':
      p.music = null; S.audioBuffer = null; S.audioMeta = null;
      commit();
      return;
    case 'grade': p.look.grade = el.dataset.id; commit(); return;
    case 'resetLook': p.look = { ...defaultLook(), font: p.look.font, dateStamp: p.look.dateStamp }; commit(); toast('テーマの標準に戻しました'); return;
  }
}

function dateRangeText() {
  const ds = S.project.clips.filter((c) => c.type === 'photo').map((c) => peekMedia(c.mediaId)?.date).filter(Boolean).sort((a, b) => a - b);
  if (!ds.length) return '';
  const f = (t) => { const d = new Date(t); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
  const a = f(ds[0]), b = f(ds[ds.length - 1]);
  return a === b ? a : `${a} — ${b}`;
}

function sortPhotos(mode) {
  const p = S.project;
  const photos = p.clips.filter((c) => c.type === 'photo');
  const slots = p.clips.map((c, i) => (c.type === 'photo' ? i : -1)).filter((i) => i >= 0);
  if (mode === 'shuffle') {
    for (let i = photos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [photos[i], photos[j]] = [photos[j], photos[i]]; }
  } else {
    const dir = mode === 'date' ? 1 : -1;
    photos.sort((a, b) => ((peekMedia(a.mediaId)?.date || 0) - (peekMedia(b.mediaId)?.date || 0)) * dir);
  }
  slots.forEach((slot, k) => { p.clips[slot] = photos[k]; });
  commit();
  toast(mode === 'shuffle' ? 'シャッフルしました' : '並べ替えました');
}

// --- 並べ替え（長押しでドラッグ）
let gridJustDragged = false;
function bindGridSort(grid) {
  let st = null;
  const tiles = () => $$('.gtile', grid);
  const baseRect = (el) => { const tr = el.style.transform; el.style.transform = ''; const r = el.getBoundingClientRect(); el.style.transform = tr; return r; };
  const place = (e) => {
    const r = baseRect(st.el);
    st.el.style.transform = `translate(${e.clientX - st.ox - r.left}px, ${e.clientY - st.oy - r.top}px) scale(1.06)`;
  };
  grid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.gtile');
    if (!el || e.button > 0) return;
    const r = el.getBoundingClientRect();
    st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, active: false };
    st.timer = setTimeout(() => {
      if (!st) return;
      st.active = true;
      el.classList.add('dragging');
      grid.classList.add('sorting');
      try { el.setPointerCapture(st.id); } catch { /* 無視 */ }
      try { navigator.vibrate?.(12); } catch { /* 無視 */ }
    }, e.pointerType === 'mouse' ? 180 : 320);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!st) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { clearTimeout(st.timer); st = null; }
      return;
    }
    e.preventDefault();
    const target = tiles().find((t) => {
      if (t === st.el) return false;
      const r = t.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (target) {
      const list = tiles();
      const a = list.indexOf(st.el), b = list.indexOf(target);
      grid.insertBefore(st.el, a < b ? target.nextSibling : target);
    }
    place(e);
    // パネルの端に来たらスクロール
    const pr = els.panel.getBoundingClientRect();
    if (e.clientY < pr.top + 40) els.panel.scrollTop -= 10;
    if (e.clientY > pr.bottom - 40) els.panel.scrollTop += 10;
  });
  const end = () => {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.active) {
      st.el.classList.remove('dragging');
      st.el.style.transform = '';
      grid.classList.remove('sorting');
      const order = tiles().map((t) => t.dataset.gid);
      const map = new Map(S.project.clips.map((c) => [c.id, c]));
      S.project.clips = order.map((id) => map.get(id));
      gridJustDragged = true;
      setTimeout(() => { gridJustDragged = false; }, 50);
      commit();
    }
    st = null;
  };
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
  grid.addEventListener('touchmove', (e) => { if (st && st.active) e.preventDefault(); }, { passive: false });
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindFocusPick(el) {
  const set = (e, final) => {
    const r = el.getBoundingClientRect();
    const c = selClip();
    c.focus = { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
    const dot = el.querySelector('.focus-dot');
    dot.style.left = c.focus.x * 100 + '%';
    dot.style.top = c.focus.y * 100 + '%';
    if (c.motion === 'auto' || c.motion === 'none' || !c.motion) { /* おまかせでも寄せ先として使う */ }
    requestRender();
    if (final) commit({ panel: false });
  };
  let down = false;
  el.addEventListener('pointerdown', (e) => { down = true; el.setPointerCapture(e.pointerId); set(e, false); });
  el.addEventListener('pointermove', (e) => { if (down) set(e, false); });
  el.addEventListener('pointerup', (e) => { if (down) { down = false; set(e, true); } });
}

function bindWave(el) {
  const cv = el.querySelector('canvas');
  const draw = () => {
    const m = S.project.music, meta = S.audioMeta;
    if (!m || !meta) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = el.clientWidth, h = el.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dur = meta.duration, pk = meta.peaks;
    const a = (m.offset / dur) * w, b = Math.min(w, ((m.offset + S.tl.total) / dur) * w);
    g.fillStyle = 'rgba(229,195,140,0.12)';
    g.fillRect(a, 0, Math.max(2, b - a), h);
    for (let x = 0; x < w; x += 2) {
      const v = pk[Math.floor((x / w) * pk.length)] / 255;
      const bh = Math.max(1, v * (h - 12));
      g.fillStyle = x >= a && x <= b ? 'rgba(229,195,140,0.9)' : 'rgba(243,238,229,0.25)';
      g.fillRect(x, h / 2 - bh / 2, 1.4, bh);
    }
    g.strokeStyle = '#e5c38c'; g.lineWidth = 2;
    g.strokeRect(a + 1, 1, Math.max(2, b - a - 2), h - 2);
    const lbl = $('#offLbl');
    if (lbl) lbl.textContent = formatTime(m.offset);
  };
  draw();
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    pause();
    drag = { x: e.clientX, off: S.project.music.offset };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dur = S.audioMeta.duration;
    let off = drag.off + ((e.clientX - drag.x) / el.clientWidth) * dur;
    off = clamp(off, 0, Math.max(0, dur - 1));
    S.project.music.offset = round3(off);
    live();
    draw();
    drawTimelineCanvas();
  });
  const up = () => { if (drag) { drag = null; commit({ panel: false }); drawTimelineCanvas(); } };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

// ---------- 取り込み ----------
async function onPhotosChosen(files, replaceId = null) {
  files = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(f.name));
  if (!files.length) return;
  const p = S.project;
  const wasEmpty = p.clips.length === 0;
  const recs = [];
  let failed = 0;
  showBusy(`写真を取り込んでいます 0 / ${files.length}`);
  for (let i = 0; i < files.length; i++) {
    setBusy(`写真を取り込んでいます ${i + 1} / ${files.length}`);
    try { recs.push(await importPhoto(files[i])); } catch (e) { failed++; console.warn(e); }
  }
  hideBusy();
  if (failed) toast(`${failed}枚は読み込めませんでした（HEIC は iPhone から選ぶと自動で変換されます）`, true);
  if (!recs.length) return;
  if (replaceId) {
    const c = p.clips.find((x) => x.id === replaceId);
    if (c) { c.mediaId = recs[0].id; c.focus = null; }
    commit();
    return;
  }
  recs.sort((a, b) => a.date - b.date);
  const dur = S.beats.length && S.beatsPer ? round3(beatPeriod(p.music, S.audioMeta) * S.beatsPer) : S.theme.defaultDuration;
  const newClips = recs.map((r) => newPhotoClip(r.id, dur));
  const sel = selClip();
  const at = sel ? p.clips.indexOf(sel) + 1 : p.clips.length;
  p.clips.splice(at, 0, ...newClips);
  if (wasEmpty) {
    p.clips.unshift(newTitleClip(p.name, dateRangeText(), 3.5));
    S.tab = 'theme';
  }
  S.selected = null;
  commit();
  if (wasEmpty) { S.t = 0.9; syncScroll(); requestRender(); }
  toast(`${recs.length}枚を追加しました`);
}

async function onAudioChosen(file) {
  if (!file) return;
  showBusy('音楽を解析しています…');
  try {
    const rec = await importAudio(file);
    const p = S.project;
    const prev = p.music;
    p.music = newMusic(rec.id, rec.name);
    if (prev) { p.music.volume = prev.volume; p.music.fadeIn = prev.fadeIn; p.music.fadeOut = prev.fadeOut; }
    S.audioMeta = rec;
    S.audioBuffer = await getAudioBuffer(rec.id);
    S.tab = 'music';
    S.selected = null;
    if (S.theme.id === 'kinetic') S.beatsPer = 2;
    commit();
    toast(rec.bpm ? `♪ 読み込みました（${Math.round(rec.bpm)} BPM）` : '♪ 読み込みました');
  } catch (e) {
    toast(e.message || '音楽を読み込めませんでした', true);
  } finally {
    hideBusy();
  }
}

// ---------- 書き出し ----------
async function openExport() {
  pause();
  const p = S.project;
  if (!S.tl.total) return toast('先に写真を追加してください');
  let res = +(localStorage.getItem('montage:res') || 1080);
  let fps = +(localStorage.getItem('montage:fps') || 30);
  const hasAudio = !!(S.audioBuffer && p.music);
  const render = async () => {
    const [w, h] = res === 1080 ? [1920, 1080] : [1280, 720];
    const caps = await detectCapabilities(w, h, fps);
    const method = exportMethod(caps, hasAudio);
    const est = method === 'webcodecs' ? '数十秒〜数分' : `約 ${formatTime(S.tl.total, false)}（動画と同じ長さ）`;
    $('#sheet').innerHTML = `<h3>書き出し</h3>
      <p class="lead">MP4 の動画ファイルにします。書き出し中はこの画面を開いたままにしてください。</p>
      <div class="sec"><div class="sec-t">画質</div>${chips('res', [[1080, 'フルHD 1080p'], [720, 'HD 720p']], res)}</div>
      <div class="sec"><div class="sec-t">なめらかさ</div>${chips('fps', [[24, '24コマ（映画風）'], [30, '30コマ']], fps)}</div>
      <div class="kv"><span>長さ</span><b>${formatTime(S.tl.total)}</b></div>
      <div class="kv"><span>音楽</span><b>${hasAudio ? esc(p.music.name) : 'なし'}</b></div>
      <div class="kv"><span>かかる時間の目安</span><b>${method ? est : '—'}</b></div>
      ${method ? '' : '<p class="note" style="color:var(--danger)">このブラウザは動画の書き出しに対応していません。Chrome か Safari の最新版でお試しください。</p>'}
      ${method === 'recorder' ? '<p class="note">この端末では、再生しながら録画する方式になります。途中で画面を切り替えると止まることがあります。</p>' : ''}
      <div class="sheet-actions"><button class="btn primary big" data-x="start" ${method ? '' : 'disabled'}>${ICON.download}書き出す</button><button class="btn ghost" data-x="cancel">やめる</button></div>`;
    $$('#sheet .chips .chip').forEach((b) => b.addEventListener('click', () => {
      const key = b.parentElement.dataset.chips;
      if (key === 'res') { res = +b.dataset.v; localStorage.setItem('montage:res', res); }
      if (key === 'fps') { fps = +b.dataset.v; localStorage.setItem('montage:fps', fps); }
      render();
    }));
    $('#sheet [data-x=cancel]').onclick = closeSheet;
    $('#sheet [data-x=start]').onclick = () => runExport(w, h, fps, caps);
  };
  openSheet('<div style="height:200px"></div>', null, { locked: false });
  await render();
}

async function runExport(w, h, fps, caps) {
  const p = S.project;
  const ctrl = new AbortController();
  $('#sheet').innerHTML = `<h3>書き出し中…</h3>
    <div class="export-preview"><canvas id="expPrev" width="480" height="270"></canvas></div>
    <div class="progress"><i id="expBar"></i></div>
    <div class="progress-row"><span id="expMsg">準備しています</span><span id="expPct">0%</span></div>
    <div class="sheet-actions"><button class="btn ghost" id="expCancel">中止する</button></div>`;
  sheetLocked = true;
  $('#expCancel').onclick = () => ctrl.abort();
  const pv = $('#expPrev').getContext('2d');
  let lastPv = 0;
  await ensureFonts(p, S.theme);
  // プレビュー用の GPU メモリを空けておく
  S.engine.gl.clearAll();
  try {
    const t0 = performance.now();
    const result = await exportVideo({
      project: JSON.parse(JSON.stringify(p)), tl: computeTimeline(p, S.theme), beats: S.beats,
      audioBuffer: S.audioBuffer, width: w, height: h, fps, caps, signal: ctrl.signal,
      onProgress: (f, canvas, msg) => {
        const now = performance.now();
        const bar = $('#expBar');
        if (!bar) return;
        bar.style.width = (f * 100).toFixed(1) + '%';
        $('#expPct').textContent = Math.floor(f * 100) + '%';
        if (msg) $('#expMsg').textContent = msg;
        else if (f > 0.02) {
          const rest = ((now - t0) / f) * (1 - f) / 1000;
          $('#expMsg').textContent = `のこり 約${rest < 60 ? Math.ceil(rest) + '秒' : Math.ceil(rest / 60) + '分'}`;
        }
        if (now - lastPv > 120 && canvas) { pv.drawImage(canvas, 0, 0, 480, 270); lastPv = now; }
      },
    });
    sheetLocked = false;
    showExportResult(result);
  } catch (e) {
    sheetLocked = false;
    if (e.name === 'AbortError') { closeSheet(); toast('書き出しを中止しました'); }
    else {
      console.error(e);
      $('#sheet').innerHTML = `<h3>書き出せませんでした</h3><p class="lead">${esc(e.message || e)}</p>
        <p class="note">画質を 720p に下げると成功することがあります。</p>
        <div class="sheet-actions"><button class="btn" data-x="close">閉じる</button></div>`;
      $('#sheet [data-x=close]').onclick = closeSheet;
    }
  } finally {
    requestRender();
  }
}

function showExportResult({ blob, ext }) {
  const name = (S.project.name || 'montage').replace(/[\\/:*?"<>|]/g, '_') + '.' + ext;
  const url = URL.createObjectURL(blob);
  const file = new File([blob], name, { type: blob.type });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const mb = (blob.size / 1024 / 1024).toFixed(1);
  $('#sheet').innerHTML = `<h3>できました</h3>
    <p class="lead">${esc(name)} ・ ${mb} MB</p>
    <div class="export-preview"><video src="${url}" controls playsinline></video></div>
    <div class="sheet-actions">
      ${canShare ? `<button class="btn primary big" data-x="share">${ICON.share}保存・共有する</button>` : ''}
      <a class="btn ${canShare ? '' : 'primary big'}" href="${url}" download="${esc(name)}">${ICON.download}ファイルとしてダウンロード</a>
      <button class="btn ghost" data-x="close">閉じる</button>
    </div>
    ${canShare ? '<p class="note">iPhone では「保存・共有する」→「ビデオを保存」で写真アプリに入ります。</p>' : ''}`;
  const sh = $('#sheet [data-x=share]');
  if (sh) sh.onclick = async () => {
    try { await navigator.share({ files: [file], title: S.project.name }); } catch (e) { if (e.name !== 'AbortError') toast('共有できませんでした', true); }
  };
  $('#sheet [data-x=close]').onclick = () => { closeSheet(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
}

// ---------- シート・ダイアログ ----------
let sheetHandler = null;
let sheetLocked = false;
function openSheet(html, onPick) {
  $('#sheet').innerHTML = html;
  $('#sheetWrap').classList.remove('hidden');
  sheetHandler = onPick;
}
function closeSheet() {
  if (sheetLocked) return;
  $('#sheetWrap').classList.add('hidden');
  $('#sheet').innerHTML = '';
  sheetHandler = null;
}
function confirmDialog(title, body, ok = 'OK', danger = false) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><p class="lead">${esc(body)}</p>
      <div class="sheet-actions"><button class="btn ${danger ? 'danger' : 'primary'} big" data-m="ok">${esc(ok)}</button><button class="btn ghost" data-m="no">キャンセル</button></div>`,
    (m) => { closeSheet(); resolve(m === 'ok'); });
    sheetCancel = () => resolve(false);
  });
}
function promptDialog(title, value) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><div style="height:10px"></div><input class="field" id="promptInput" value="${esc(value)}" maxlength="60">
      <div class="sheet-actions"><button class="btn primary big" data-m="ok">決定</button><button class="btn ghost" data-m="no">キャンセル</button></div>`,
    (m) => { const v = $('#promptInput').value.trim(); closeSheet(); resolve(m === 'ok' ? v : null); });
    sheetCancel = () => resolve(null);
    setTimeout(() => { const i = $('#promptInput'); i.focus(); i.select(); }, 50);
  });
}
let sheetCancel = null;

function openAbout() {
  const changes = Object.entries(APP_CHANGES).map(([v, list]) => `<div style="margin-top:10px"><b style="font-size:13px">v${v}</b><ul class="changes">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
  openSheet(`<h3>Montage <span style="font-weight:400;color:var(--text3);font-size:13px">v${APP_VERSION}（${APP_VERSION_DATE}）</span></h3>
    <p class="lead">写真と音楽からムービーをつくる、自分専用のアプリです。写真・音楽・作品はすべてこの端末の中だけに保存され、どこにも送信されません。</p>
    <div class="kv"><span>保存している容量</span><b id="usage">計算中…</b></div>
    <div class="sec" style="margin-top:16px"><div class="sec-t">使い方のコツ</div>
      <ul class="changes">
        <li>ホーム画面に追加すると、アプリのように全画面で使えて、データも消えにくくなります（Safari：共有 →「ホーム画面に追加」）。</li>
        <li>タイムラインを左右になぞると再生位置を動かせます。2本指で広げると拡大します。</li>
        <li>選んだ写真の右端のつまみをドラッグすると、表示時間を変えられます。</li>
        <li>音楽を入れると、ビートに合わせて自動で並べられます。</li>
      </ul></div>
    <div class="sec"><div class="sec-t">更新履歴</div>${changes}</div>
    <div class="sheet-actions"><button class="btn" data-m="close">閉じる</button></div>`, () => closeSheet());
  navigator.storage?.estimate?.().then((e) => {
    const u = $('#usage');
    if (u) u.textContent = `${(e.usage / 1024 / 1024).toFixed(0)} MB`;
  }).catch(() => { const u = $('#usage'); if (u) u.textContent = '—'; });
}

function showBusy(text) { $('#busyText').textContent = text; $('#busy').classList.remove('hidden'); }
function setBusy(text) { $('#busyText').textContent = text; }
function hideBusy() { $('#busy').classList.add('hidden'); }
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, err ? 4200 : 2400);
  setTimeout(() => el.remove(), err ? 4600 : 2800);
}

// ---------- 全体のイベント ----------
function bindGlobal() {
  $('#newProjectBtn').addEventListener('click', createProject);
  $('#aboutBtn').addEventListener('click', openAbout);
  els.grid.addEventListener('click', (e) => {
    const m = e.target.closest('[data-pmenu]');
    if (m) { e.stopPropagation(); return projectMenu(m.dataset.pmenu); }
    const o = e.target.closest('[data-open]');
    if (o) openProject(o.dataset.open);
  });
  $('#backBtn').addEventListener('click', () => { pause(); clearTimeout(saveTimer); db.put('projects', S.project).then(showHome); });
  $('#nameBtn').addEventListener('click', async () => {
    const name = await promptDialog('作品の名前', S.project.name);
    if (name) { S.project.name = name; commit({ panel: false }); }
  });
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#exportBtn').addEventListener('click', openExport);
  $('#playBtn').addEventListener('click', togglePlay);
  $('#zoomInBtn').addEventListener('click', () => setZoom(S.pps * 1.5));
  $('#zoomOutBtn').addEventListener('click', () => setZoom(S.pps / 1.5));
  $('#snapBtn').addEventListener('click', () => { S.snap = !S.snap; toast(S.snap ? 'ビートにスナップ：オン' : 'ビートにスナップ：オフ'); refresh({ panel: S.tab === 'music' }); });
  $('#theaterBtn').addEventListener('click', () => {
    document.body.classList.add('theater');
    try { els.stage.parentElement.requestFullscreen?.().catch(() => {}); } catch { /* 無視 */ }
    fitStage();
    play();
  });
  $('#theaterClose').addEventListener('click', (e) => { e.stopPropagation(); exitTheater(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('theater')) exitTheater(); });
  els.stage.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (!S.project.clips.length) return;
    if (S.playing) {
      pause();
      flashPlayIcon(true);
      setTimeout(() => flashPlayIcon(false), 600);
    } else play();
  });
  els.stageEmpty.addEventListener('click', (e) => { if (e.target.closest('[data-act=addPhotos]')) els.photoInput.click(); });
  els.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    S.selected = null;
    refresh();
  });
  els.tlScroll.addEventListener('scroll', onTimelineScroll, { passive: true });
  els.tlContent.addEventListener('click', (e) => {
    const tm = e.target.closest('[data-tm]');
    if (tm) { panelFocus = 'trans'; S.selected = tm.dataset.tm; refresh(); return; }
    const c = e.target.closest('.clip');
    if (c) {
      if (c.dataset.id === S.selected) return;
      return selectClip(c.dataset.id);
    }
    if (S.selected) { S.selected = null; refresh(); }
  });
  bindTrim();
  bindPinch();
  bindPanel();
  els.photoInput.addEventListener('change', () => { const f = els.photoInput.files; onPhotosChosen(f).finally(() => { els.photoInput.value = ''; }); });
  els.replaceInput.addEventListener('change', () => { const f = els.replaceInput.files; onPhotosChosen(f, S.selected).finally(() => { els.replaceInput.value = ''; }); });
  els.audioInput.addEventListener('change', () => { const f = els.audioInput.files[0]; onAudioChosen(f).finally(() => { els.audioInput.value = ''; }); });
  $('#sheetWrap').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) {
      if (sheetLocked) return;
      const c = sheetCancel; sheetCancel = null;
      closeSheet();
      if (c) c();
      return;
    }
    const m = e.target.closest('[data-m]');
    if (m && sheetHandler) { sheetCancel = null; sheetHandler(m.dataset.m); }
  });
  document.addEventListener('keydown', (e) => {
    if (els.editor.classList.contains('hidden')) return;
    if (!$('#sheetWrap').classList.contains('hidden')) { if (e.key === 'Escape') { const c = sheetCancel; sheetCancel = null; closeSheet(); if (c) c(); } return; }
    if (e.target.matches('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'ArrowLeft') seek(S.t - (e.shiftKey ? 1 : 1 / 30));
    else if (e.key === 'ArrowRight') seek(S.t + (e.shiftKey ? 1 : 1 / 30));
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected) onAction('del');
    else if (e.key === 'Escape') { if (document.body.classList.contains('theater')) exitTheater(); else if (S.selected) { S.selected = null; refresh(); } }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); if (S.project) db.put('projects', S.project).catch(() => {}); } });
}

function exitTheater() {
  document.body.classList.remove('theater');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  pause();
  fitStage();
}

// 動作確認用（コンソールから状態を見られるように）
window.__montage = { S, refresh, seek, commit, renderFrame };

boot().catch((e) => {
  console.error(e);
  hideBusy();
  toast('起動に失敗しました：' + e.message, true);
});
