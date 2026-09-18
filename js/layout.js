// 写真の配置・動きの計算。映像（WebGL）と文字（Canvas 2D）の両方から使う
import { clamp, lerp, easeOutCubic } from './model.js';

export function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function motionFor(clip, theme, it) {
  if (clip.motion && clip.motion !== 'auto') return clip.motion;
  const pat = theme.motion.pattern;
  return pat[Math.max(0, it.photoIndex) % pat.length];
}

/**
 * Ken Burns の状態。k=拡大率, cx/cy=切り抜き中心（画像内 0..1）
 * u=表示区間内の進み 0..1, lt=表示開始からの秒数
 */
export function motionState(motion, u, lt, amount, focus, pulse = 0) {
  const f = focus || { x: 0.5, y: 0.5 };
  let k = 1, cx = f.x, cy = f.y;
  const range = amount * 2.6;
  switch (motion) {
    case 'in':
      k = 1 + amount * u; cx = lerp(0.5, f.x, u); cy = lerp(0.5, f.y, u); break;
    case 'out':
      k = 1 + amount * (1 - u); cx = lerp(f.x, 0.5, u); cy = lerp(f.y, 0.5, u); break;
    case 'panR':
      k = 1 + amount * 1.3; cx = 0.5 + (u - 0.5) * range; break;
    case 'panL':
      k = 1 + amount * 1.3; cx = 0.5 - (u - 0.5) * range; break;
    case 'panU':
      k = 1 + amount * 1.3; cy = 0.5 - (u - 0.5) * range; break;
    case 'panD':
      k = 1 + amount * 1.3; cy = 0.5 + (u - 0.5) * range; break;
    case 'punch': {
      const e = easeOutCubic(lt / 0.5);
      k = 1 + amount * 1.8 * (1 - e) + amount * 0.35 * u; break;
    }
    case 'none':
    default:
      k = 1 + amount * 0.25; break;
  }
  return { k: k + pulse, cx, cy };
}

/** 画像アスペクト ar を、枠アスペクト boxAR で切り抜く uv 範囲 */
export function coverWindow(ar, boxAR, k, cx, cy) {
  let ww, wh;
  if (ar > boxAR) { wh = 1; ww = boxAR / ar; } else { ww = 1; wh = ar / boxAR; }
  ww /= k; wh /= k;
  cx = clamp(cx, ww / 2, 1 - ww / 2);
  cy = clamp(cy, wh / 2, 1 - wh / 2);
  return [cx - ww / 2, cy - wh / 2, cx + ww / 2, cy + wh / 2];
}

/** 全面レイアウトで「ぼかし背景＋全体表示」にするか */
export function useBlurFit(clip, ar, frameAR) {
  if (clip.fit === 'cover') return false;
  if (clip.fit === 'contain') return true;
  return ar < frameAR * 0.72; // 縦長・正方形に近い写真は全体を見せる
}

export function polaroidGeom(clip, W, H, ar) {
  const r1 = hash01(clip.id, 1), r2 = hash01(clip.id, 2), r3 = hash01(clip.id, 3);
  const portrait = ar < 0.9;
  const imgH = H * (portrait ? 0.6 : 0.54);
  const imgW = portrait ? imgH * 0.78 : imgH;
  const side = imgH * 0.065, top = side, bottom = imgH * 0.27;
  const fw = imgW + side * 2, fh = imgH + top + bottom;
  return {
    fw, fh, imgW, imgH, side, top, bottom,
    cx: W / 2 + (r1 - 0.5) * W * 0.34,
    cy: H / 2 + (r2 - 0.5) * H * 0.08,
    rot: (r3 - 0.5) * 0.3,
    imgAR: imgW / imgH,
    imgOffY: (top - bottom) / 2,
  };
}

/** 登場アニメーション中のポラロイド（下から滑り込んで置かれる） */
export function polaroidAnimated(g, clip, lt, W, H) {
  const e = easeOutCubic(lt / 0.95);
  const r4 = hash01(clip.id, 4);
  const lift = 1 - e;
  return {
    ...g,
    cx: g.cx + (r4 - 0.5) * W * 0.3 * lift,
    cy: g.cy + H * 0.95 * lift,
    rot: g.rot + (r4 - 0.5) * 0.9 * lift,
    scale: 1 + 0.12 * lift,
    lift,
  };
}

export function editorialGeom(photoIndex, W, H, ar) {
  const left = photoIndex % 2 === 0;
  const boxAR = clamp(ar, 0.78, 1.5);
  let bh = H * 0.68, bw = bh * boxAR;
  const maxW = W * 0.54;
  if (bw > maxW) { bw = maxW; bh = bw / boxAR; }
  const margin = W * 0.065, gap = W * 0.05;
  const cx = left ? margin + bw / 2 : W - margin - bw / 2;
  const cy = H * 0.535;
  const textX = left ? cx + bw / 2 + gap : margin;
  const textW = W - bw - margin * 2 - gap;
  return { cx, cy, bw, bh, left, textX, textW, boxAR };
}

export function minimalGeom(W, H, ar) {
  const maxW = W * 0.76, maxH = H * 0.7;
  let w = maxW, h = w / ar;
  if (h > maxH) { h = maxH; w = h * ar; }
  return { cx: W / 2, cy: H * 0.445, w, h };
}

export function letterboxBar(W, H) {
  // 2.39:1 の黒帯の高さ（片側・ピクセル）
  return Math.max(0, (H - W / 2.39) / 2);
}
