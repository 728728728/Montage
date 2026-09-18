// 文字の描画（Canvas 2D）。タイトル・キャプション・日付スタンプ・誌面の飾り
import { fontString } from './themes.js';
import { clamp, smooth, easeOutCubic, easeOutBack, easeInOutCubic } from './model.js';
import { polaroidGeom, polaroidAnimated, editorialGeom, minimalGeom, letterboxBar } from './layout.js';

const widthCache = new Map();
export function clearTextCache() { widthCache.clear(); }

function charW(ctx, font, ch) {
  const k = font + '|' + ch;
  let w = widthCache.get(k);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(ch).width;
    if (widthCache.size > 30000) widthCache.clear();
    widthCache.set(k, w);
  }
  return w;
}

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

function tokenize(s) {
  const tokens = [];
  let cur = '';
  for (const ch of s) {
    if (CJK.test(ch)) {
      if (cur) { tokens.push(cur); cur = ''; }
      tokens.push(ch);
    } else if (ch === ' ') {
      tokens.push(cur + ' '); cur = '';
    } else cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** 文字列を行に分ける。各行は [{ch, w}] */
function layoutLines(ctx, text, font, track, maxW) {
  const lines = [];
  const widthOf = (arr) => arr.reduce((s, c) => s + c.w, 0) + track * Math.max(0, arr.length - 1);
  for (const para of String(text).split('\n')) {
    let line = [];
    for (const tok of tokenize(para)) {
      const chars = [...tok].map((ch) => ({ ch, w: charW(ctx, font, ch) }));
      const cand = line.concat(chars);
      if (line.length && widthOf(trimEnd(cand)) > maxW) {
        lines.push(trimEnd(line));
        line = [];
        // 1語だけで幅を超える場合は文字単位で折る
        for (const c of chars) {
          if (line.length && widthOf(line.concat([c])) > maxW) { lines.push(line); line = []; }
          if (!(line.length === 0 && c.ch === ' ')) line.push(c);
        }
      } else {
        line = cand;
      }
    }
    lines.push(trimEnd(line));
  }
  return lines.map((l) => ({ chars: l, width: widthOf(l) }));
}
function trimEnd(arr) {
  let n = arr.length;
  while (n > 0 && arr[n - 1].ch === ' ') n--;
  return n === arr.length ? arr : arr.slice(0, n);
}

/**
 * 文字ブロックを描く
 * o: {text, x, y, align, vAlign:'middle'|'top'|'bottom', maxW, font, size, track(em), lineH, color, alpha, anim, lt,
 *     shadow, glow, box, boxColor, boxText}
 * 戻り値: {top, bottom, width}
 */
function drawText(ctx, o) {
  if (!o.text || o.alpha <= 0.002) return null;
  const size = o.size;
  const track = (o.track || 0) * size;
  const lines = layoutLines(ctx, o.text, o.font, track, o.maxW || 1e9);
  const lh = size * (o.lineH || 1.25);
  const blockH = lh * lines.length;
  let top = o.y - blockH / 2;
  if (o.vAlign === 'top') top = o.y;
  if (o.vAlign === 'bottom') top = o.y - blockH;
  const lt = o.lt || 0;
  const anim = o.anim || 'fade';

  let blockA = 1, blockDy = 0;
  if (anim === 'fade') { const e = easeOutCubic(lt / 0.9); blockA = e; blockDy = (1 - e) * size * 0.35; }
  if (anim === 'tracking') blockA = easeOutCubic(lt / 1.2);
  if (anim === 'write') blockA = clamp(lt / 0.2, 0, 1);
  const alpha = o.alpha * blockA;
  if (alpha <= 0.002) return null;

  ctx.save();
  ctx.font = o.font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color;
  if (o.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.45;
    ctx.shadowOffsetY = size * 0.04;
  }
  if (o.glow) {
    ctx.shadowColor = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = size * 0.6;
    ctx.shadowOffsetY = 0;
  }
  let maxWidth = 0;
  let gi = 0; // 全体での文字番号
  const total = lines.reduce((s, l) => s + l.chars.length, 0);
  lines.forEach((line, li) => {
    maxWidth = Math.max(maxWidth, line.width);
    const cy = top + lh * li + lh / 2 + blockDy;
    let x0 = o.x;
    if (o.align === 'center') x0 = o.x - line.width / 2;
    if (o.align === 'right') x0 = o.x - line.width;

    // キネティックの帯
    if (o.box) {
      const e = easeOutCubic((lt - li * 0.06) / 0.3);
      if (e > 0) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = o.alpha;
        ctx.fillStyle = o.boxColor;
        const padX = size * 0.28, bh = lh * 0.98;
        ctx.fillRect(x0 - padX, cy - bh / 2, (line.width + padX * 2) * e, bh);
        ctx.restore();
      }
    }

    ctx.save();
    if (anim === 'mask') {
      const q = easeOutCubic((lt - li * 0.12) / 0.8);
      ctx.beginPath();
      ctx.rect(x0 - size, cy - lh / 2 - size * 0.1, line.width + size * 2, lh + size * 0.25);
      ctx.clip();
      ctx.translate(0, (1 - q) * lh);
    }
    if (anim === 'write') {
      const q = easeInOutCubic((lt - li * 0.35) / 1.3);
      ctx.beginPath();
      ctx.rect(x0 - size, cy - lh, (line.width + size * 2) * q, lh * 2);
      ctx.clip();
    }
    const perChar = track !== 0 || anim === 'type' || anim === 'pop' || anim === 'blur';
    if (!perChar) {
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'left';
      ctx.fillText(line.chars.map((c) => c.ch).join(''), x0, cy);
      gi += line.chars.length;
    } else {
      let x = x0;
      for (const c of line.chars) {
        let a = 1, dy = 0, sc = 1;
        if (anim === 'type') {
          a = clamp(lt * 15 - gi, 0, 1);
        } else if (anim === 'pop') {
          const q = clamp((lt - gi * (total > 24 ? 0.018 : 0.035)) / 0.36, 0, 1);
          a = clamp(q * 3, 0, 1); sc = 0.35 + 0.65 * easeOutBack(q);
        } else if (anim === 'blur') {
          const q = clamp((lt - gi * 0.04) / 0.95, 0, 1);
          const e = easeOutCubic(q); a = e; dy = (1 - e) * size * 0.3;
        }
        if (a > 0.003 && c.ch !== ' ') {
          ctx.globalAlpha = alpha * a;
          if (sc !== 1) {
            ctx.save();
            ctx.translate(x + c.w / 2, cy + dy);
            ctx.scale(sc, sc);
            ctx.textAlign = 'center';
            ctx.fillText(c.ch, 0, 0);
            ctx.restore();
          } else {
            ctx.textAlign = 'left';
            ctx.fillText(c.ch, x, cy + dy);
          }
        }
        x += c.w + track;
        gi++;
      }
    }
    ctx.restore();
  });
  ctx.restore();
  return { top, bottom: top + blockH, width: maxWidth };
}

// ---------- 日付スタンプ（7セグ表示） ----------
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
function drawSeg(ctx, x, y, h, digit) {
  const w = h * 0.52, t = h * 0.13, sk = h * 0.1;
  const X = (px, py) => x + px + (h / 2 - py) * (sk / h); // 斜体
  const seg = {
    a: [[t * 0.6, 0], [w - t * 0.6, 0], [w - t * 1.2, t], [t * 1.2, t]],
    d: [[t * 1.2, h - t], [w - t * 1.2, h - t], [w - t * 0.6, h], [t * 0.6, h]],
    g: [[t * 0.8, h / 2 - t / 2], [w - t * 0.8, h / 2 - t / 2], [w - t * 0.5, h / 2], [w - t * 0.8, h / 2 + t / 2], [t * 0.8, h / 2 + t / 2], [t * 0.5, h / 2]],
    f: [[0, t * 0.6], [t, t * 1.2], [t, h / 2 - t * 0.8], [0, h / 2 - t * 0.4]],
    b: [[w - t, t * 1.2], [w, t * 0.6], [w, h / 2 - t * 0.4], [w - t, h / 2 - t * 0.8]],
    e: [[0, h / 2 + t * 0.4], [t, h / 2 + t * 0.8], [t, h - t * 1.2], [0, h - t * 0.6]],
    c: [[w - t, h / 2 + t * 0.8], [w, h / 2 + t * 0.4], [w, h - t * 0.6], [w - t, h - t * 1.2]],
  };
  for (const s of SEG[digit] || '') {
    const pts = seg[s];
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(X(px, py), y + py) : ctx.moveTo(X(px, py), y + py)));
    ctx.closePath();
    ctx.fill();
  }
  return w;
}

function drawDateStamp(ctx, W, H, date, alpha, bottom) {
  if (!date || alpha <= 0) return;
  const d = new Date(date);
  const parts = [String(d.getFullYear()).slice(2), String(d.getMonth() + 1), String(d.getDate())];
  const h = H * 0.042, gap = h * 0.16, space = h * 0.55;
  // 右寄せ：幅を先に計算
  const digitW = h * 0.52;
  let width = h * 0.25 + gap; // アポストロフィ
  parts.forEach((p, i) => { width += p.length * (digitW + gap) + (i < 2 ? space : 0); });
  let x = W - W * 0.055 - width;
  const y = H - bottom - h;
  ctx.save();
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = '#ff9d42';
  ctx.shadowColor = 'rgba(255,120,30,0.9)';
  ctx.shadowBlur = h * 0.35;
  ctx.fillRect(x, y, h * 0.1, h * 0.28); // '
  x += h * 0.25 + gap;
  parts.forEach((p, i) => {
    for (const ch of p) { drawSeg(ctx, x, y, h, +ch); x += digitW + gap; }
    x += i < 2 ? space : 0;
  });
  ctx.restore();
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// ---------- メイン ----------
/**
 * S: {project, theme, look, tl, fr, t, W, H, master, getMeta}
 */
export function drawOverlay(ctx, S) {
  const { W, H, fr } = S;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!fr) return;
  const list = [[fr.a, fr.b ? 1 - smooth(0, 0.5, fr.p) : 1]];
  if (fr.b) list.push([fr.b, smooth(0.5, 1, fr.p)]);
  for (const [it, a] of list) {
    if (a <= 0.001) continue;
    if (it.clip.type === 'title') drawTitle(ctx, S, it, a * S.master);
    else drawPhotoText(ctx, S, it, a * S.master);
  }
  if (S.theme.layout === 'editorial') drawEditorialChrome(ctx, S);
}

function fonts(S) {
  const T = S.theme.text;
  const main = S.look.font || T.font;
  return {
    main,
    sub: T.subFont,
    caption: S.look.font || T.caption.font || T.font,
  };
}

function drawTitle(ctx, S, it, alpha) {
  const { W, H, theme, t } = S;
  const T = theme.text, F = fonts(S);
  const c = it.clip;
  const lt = t - (it.start - it.tIn / 2);
  const st = T.title, sub = T.sub;
  const size = st.size * H;
  const onPhoto = c.bg === 'photo' || c.bg === 'black';
  let color = st.color;
  if (c.bg === 'white') color = '#1b1a18';
  else if (onPhoto && (theme.layout === 'editorial' || theme.layout === 'minimal')) color = '#ffffff';
  const subColor = c.bg === 'white' ? '#4a4640' : onPhoto && (theme.layout === 'editorial' || theme.layout === 'minimal') ? '#ffffffcc' : sub.color;
  const title = st.upper ? (c.title || '').toUpperCase() : c.title || '';
  const subtitle = sub.upper ? (c.subtitle || '').toUpperCase() : c.subtitle || '';
  const hasSub = !!subtitle.trim();
  const fadeOut = it.tOut === 0 ? 1 - smooth(it.end - 0.35, it.end, t) : 1;
  const A = alpha * fadeOut;
  const fullBleed = theme.layout === 'full' || onPhoto;
  const shadow = fullBleed && !st.glow && c.bg !== 'white' && theme.id !== 'kinetic';

  // 字間が広がる演出
  let track = st.tracking;
  if (st.anim === 'tracking') track = st.tracking * (0.62 + 0.38 * easeOutCubic(lt / Math.max(1.5, it.dur)));

  const titleFont = fontString(F.main, st.weight, st.italic, size);
  const cy = hasSub ? H * 0.465 : H * 0.5;
  const r = drawText(ctx, {
    text: title, x: W / 2, y: cy, align: 'center', maxW: W * 0.84, font: titleFont, size,
    track, lineH: 1.12, color, alpha: A, anim: st.anim, lt, shadow, glow: st.glow,
    box: theme.id === 'kinetic' && c.bg !== 'theme', boxColor: theme.accent,
  });
  const bottom = r ? r.bottom : cy;
  if (hasSub) {
    const ssize = sub.size * H;
    const slt = lt - 0.55;
    const sy = bottom + H * 0.05 + ssize / 2;
    if (T.title.deco === 'rule' && slt > 0) {
      ctx.save();
      ctx.globalAlpha = A * easeOutCubic(slt / 0.8) * 0.7;
      ctx.fillStyle = subColor;
      const lw = W * 0.05 * easeOutCubic(slt / 1.0);
      ctx.fillRect(W / 2 - lw / 2, bottom + H * 0.022, lw, Math.max(1, H * 0.0015));
      ctx.restore();
    }
    drawText(ctx, {
      text: subtitle, x: W / 2, y: sy, align: 'center', maxW: W * 0.8,
      font: fontString(F.sub, sub.weight, false, ssize), size: ssize, track: sub.tracking,
      color: subColor, alpha: A, anim: st.anim === 'type' ? 'type' : 'fade', lt: slt, shadow,
    });
  }
}

function captionStyle(S, it) {
  const T = S.theme.text.caption;
  const c = it.clip;
  const size = T.size * S.H * (c.captionSize || 1);
  return { T, size, font: fontString(fonts(S).caption, T.weight, T.italic, size) };
}

function drawPhotoText(ctx, S, it, alpha) {
  const { W, H, theme, look, t } = S;
  const c = it.clip;
  const rec = S.getMeta(c.mediaId);
  const ar = rec ? rec.w / rec.h : 1.5;
  const layout = theme.layout;
  const lt = t - it.start - 0.15;
  const fadeOut = it.tOut === 0 ? 1 - smooth(it.end - 0.3, it.end, t) : 1;
  const A = alpha * fadeOut;
  const bar = look.letterbox ? letterboxBar(W, H) : 0;

  if (layout === 'editorial') {
    drawEditorialColumn(ctx, S, it, ar, A, lt);
  } else if (c.caption && c.caption.trim()) {
    const { T, size, font } = captionStyle(S, it);
    let pos = c.captionPos && c.captionPos !== 'auto' ? c.captionPos : T.pos;
    const text = T.upper ? c.caption.toUpperCase() : c.caption;
    const base = {
      text, font, size, track: T.tracking, color: T.color, alpha: A, anim: T.anim, lt,
      lineH: 1.3, glow: T.glow, box: T.box, boxColor: theme.accent,
    };
    const fullBleed = layout === 'full';
    if (pos === 'frame' && layout === 'polaroid') {
      const g0 = polaroidGeom(c, W, H, ar);
      const vlt = t - (it.start - it.tIn / 2);
      const g = polaroidAnimated(g0, c, vlt, W, H);
      const fs = Math.min(size, g.bottom * 0.46);
      ctx.save();
      ctx.translate(g.cx, g.cy);
      ctx.rotate(g.rot);
      ctx.scale(g.scale, g.scale);
      drawText(ctx, {
        ...base, size: fs, font: captionStyle(S, it).font.replace(/\d+px/, `${Math.round(fs)}px`),
        x: 0, y: g.fh / 2 - g.bottom / 2, align: 'center', maxW: g.fw * 0.88, lineH: 1.05, lt: vlt - 0.9,
      });
      ctx.restore();
    } else if (pos === 'frame' || pos === 'below') {
      // ミニマル：写真の下に小さく
      const g = minimalGeom(W, H, ar);
      const y = layout === 'minimal' ? Math.min(H * 0.93, g.cy + g.h / 2 + H * 0.065) : H * 0.9;
      drawText(ctx, { ...base, x: W / 2, y, align: 'center', maxW: W * 0.7, color: layout === 'minimal' ? T.color : '#fff', shadow: layout !== 'minimal' });
    } else {
      let x = W / 2, y = H * 0.86, align = 'center', vAlign = 'middle', maxW = W * 0.8;
      if (pos === 'bar') {
        if (bar > size * 1.2) y = H - bar / 2; else y = H * 0.87;
      } else if (pos === 'bottomLeft') {
        x = W * 0.06; align = 'left'; y = H * 0.86 - bar; maxW = W * 0.6;
      } else if (pos === 'bottom') {
        y = H * 0.86 - bar;
      } else if (pos === 'center') {
        y = layout === 'full' && theme.id === 'kinetic' ? H * 0.6 : H * 0.5;
      } else if (pos === 'top') {
        y = H * 0.14 + bar;
      }
      if (pos === 'bottom' || pos === 'bottomLeft') vAlign = 'bottom', y = H - H * 0.1 - bar;
      const light = layout === 'minimal' && pos !== 'bar';
      drawText(ctx, {
        ...base, x, y, align, vAlign, maxW,
        color: light ? T.color : layout === 'minimal' ? '#fff' : T.color,
        shadow: (fullBleed || layout === 'polaroid') && !T.glow && !T.box,
      });
    }
  }
  if (look.dateStamp && rec && rec.date) {
    drawDateStamp(ctx, W, H, rec.date, A * clamp((t - it.start + it.tIn / 2) / 0.3, 0, 1), H * 0.06 + bar);
  }
}

function drawEditorialColumn(ctx, S, it, ar, A, lt) {
  const { W, H, theme } = S;
  const g = editorialGeom(it.photoIndex, W, H, ar);
  const c = it.clip;
  const F = fonts(S);
  const ink = theme.ink || '#1d1b18';
  const x = g.textX;
  const numSize = H * 0.15;
  drawText(ctx, {
    text: String(it.photoIndex + 1).padStart(2, '0'), x, y: H * 0.18, vAlign: 'top', align: 'left',
    font: fontString(F.main, 400, true, numSize), size: numSize, color: theme.accent, alpha: A, anim: 'mask', lt, lineH: 1.0,
  });
  let y = H * 0.18 + numSize * 1.12;
  // 細い線
  ctx.save();
  ctx.globalAlpha = A * easeOutCubic((lt - 0.2) / 0.8);
  ctx.fillStyle = ink;
  ctx.fillRect(x, y, g.textW * 0.28 * easeOutCubic((lt - 0.2) / 0.9), Math.max(1, H * 0.0018));
  ctx.restore();
  y += H * 0.045;
  if (c.caption && c.caption.trim()) {
    const { T, size } = captionStyle(S, it);
    const font = fontString(F.caption, T.weight, T.italic, size);
    const r = drawText(ctx, {
      text: c.caption, x, y, vAlign: 'top', align: 'left', maxW: g.textW, font, size, track: T.tracking,
      color: ink, alpha: A, anim: 'mask', lt: lt - 0.25, lineH: 1.3,
    });
    if (r) y = r.bottom;
  }
  const rec = S.getMeta(c.mediaId);
  if (rec && rec.date) {
    const d = new Date(rec.date);
    const ds = H * 0.02;
    drawText(ctx, {
      text: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, x, y: Math.max(y + H * 0.05, H * 0.8), vAlign: 'top', align: 'left',
      font: fontString('modern', 500, false, ds), size: ds, track: 0.32, color: '#6b645a', alpha: A, anim: 'fade', lt: lt - 0.45,
    });
  }
}

function drawEditorialChrome(ctx, S) {
  const { W, H, project, fr, master } = S;
  const ink = S.theme.ink || '#1d1b18';
  const ds = H * 0.019;
  const m = W * 0.065;
  const y = H * 0.07;
  ctx.save();
  ctx.globalAlpha = master * 0.9;
  ctx.fillStyle = ink;
  ctx.fillRect(m, H * 0.1, W - m * 2, Math.max(1, H * 0.0014));
  ctx.restore();
  const font = fontString('modern', 500, false, ds);
  drawText(ctx, { text: (project.name || 'MONTAGE').toUpperCase(), x: m, y, align: 'left', font, size: ds, track: 0.38, color: ink, alpha: master, anim: 'none' });
  const year = new Date(project.createdAt || Date.now()).getFullYear();
  drawText(ctx, { text: `VOL. ${year}`, x: W - m, y, align: 'right', font, size: ds, track: 0.38, color: ink, alpha: master, anim: 'none' });
  const it = fr.b && fr.p > 0.5 ? fr.b : fr.a;
  if (it.photoIndex >= 0) {
    drawText(ctx, {
      text: `P. ${String(it.photoIndex + 1).padStart(2, '0')} / ${String(S.tl.photoCount).padStart(2, '0')}`,
      x: W - m, y: H * 0.94, align: 'right', font, size: ds, track: 0.3, color: '#6b645a', alpha: master, anim: 'none',
    });
  }
}
