// 1コマ分の映像と文字を組み立てる
import { GLRenderer } from './renderer.js';
import { drawOverlay } from './overlay.js';
import { getTheme, resolveLook, hexToRgb } from './themes.js';
import { frameAt, localU, TRANSITION_CODE, smooth } from './model.js';
import {
  motionFor, motionState, coverWindow, useBlurFit, polaroidGeom, polaroidAnimated,
  editorialGeom, minimalGeom, letterboxBar, hash01,
} from './layout.js';
import { decodeImage, peekMedia } from './media.js';

function lastBeatBefore(beats, t) {
  let lo = 0, hi = beats.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : beats[ans];
}

export class Engine {
  constructor({ glCanvas, ovCanvas, quality } = {}) {
    this.glc = glCanvas || document.createElement('canvas');
    this.ovc = ovCanvas || document.createElement('canvas');
    this.gl = new GLRenderer(this.glc);
    this.ctx = this.ovc.getContext('2d');
    this.quality = quality || 'preview';
    this.loading = new Map();
    this.onTexture = null;
    this.gl.onRestore = () => this.onTexture && this.onTexture();
    this.cap = this.quality === 'full' ? 8 : 12;
    this.W = 2; this.H = 2;
  }

  setSize(w, h) {
    this.W = w; this.H = h;
    this.gl.resize(w, h);
    if (this.ovc.width !== w || this.ovc.height !== h) { this.ovc.width = w; this.ovc.height = h; }
  }

  // ---------- テクスチャ ----------
  key(id, kind) { return (kind === 'blur' ? 'b:' : 'i:') + id; }

  tex(id, kind, used) {
    const k = this.key(id, kind);
    used.add(k);
    const t = this.gl.getTex(k);
    if (!t) { this.request(id, kind); this.complete = false; }
    return t || null;
  }

  request(id, kind) {
    const k = this.key(id, kind);
    if (this.loading.has(k)) return this.loading.get(k);
    if (this.gl.hasTex(k)) return Promise.resolve();
    const p = decodeImage(id, kind === 'blur' ? 'thumb' : this.quality)
      .then((bmp) => {
        if (bmp && !this.gl.lost) {
          this.gl.uploadTex(k, bmp, kind !== 'blur');
          if (bmp.close) bmp.close();
        }
      })
      .catch((e) => console.warn('texture', e))
      .finally(() => {
        this.loading.delete(k);
        if (this.onTexture) this.onTexture();
      });
    this.loading.set(k, p);
    return p;
  }

  /** そのコマに必要な画像 */
  needs(project, tl, fr) {
    const out = [];
    if (!fr) return out;
    const theme = getTheme(project.theme);
    const add = (it) => {
      const c = it.clip;
      if (c.type === 'photo') {
        out.push([c.mediaId, 'img'], [c.mediaId, 'blur']);
        if (theme.layout === 'polaroid') {
          for (let j = it.index - 1, n = 0; j >= 0 && n < 5; j--, n++) {
            const p = tl.items[j].clip;
            if (p.type !== 'photo') break;
            out.push([p.mediaId, 'img']);
          }
        }
      } else if (c.bg === 'photo') {
        const n = this.neighborPhoto(tl, it);
        if (n) out.push([n.mediaId, 'blur']);
      }
    };
    add(fr.a);
    if (fr.b) add(fr.b);
    return out;
  }

  async prepare(project, tl, t) {
    const fr = frameAt(tl, t);
    await Promise.all(this.needs(project, tl, fr).map(([id, k]) => this.request(id, k)));
  }

  prefetch(project, tl, t, ahead = 4) {
    for (const it of tl.items) {
      if (it.end < t || it.start > t + ahead) continue;
      for (const [id, k] of this.needs(project, tl, { a: it, b: null })) this.request(id, k);
    }
  }

  neighborPhoto(tl, it) {
    for (let j = it.index + 1; j < tl.items.length; j++) if (tl.items[j].clip.type === 'photo') return tl.items[j].clip;
    for (let j = it.index - 1; j >= 0; j--) if (tl.items[j].clip.type === 'photo') return tl.items[j].clip;
    return null;
  }

  // ---------- 描画 ----------
  /** env: {beats, editing} */
  render(project, tl, t, env = {}) {
    const gl = this.gl;
    if (gl.lost) return false;
    const theme = getTheme(project.theme);
    const look = resolveLook(project, theme);
    const W = this.W, H = this.H;
    this.complete = true;
    const used = new Set();
    const fr = frameAt(tl, t);
    const C = { project, theme, look, tl, t, used, env, W, H };
    let scene = 0;
    if (!fr) {
      gl.target(0, hexToRgb(theme.bg));
    } else {
      this.drawItem(0, fr.a, C);
      if (fr.b) {
        this.drawItem(1, fr.b, C);
        scene = gl.transition(TRANSITION_CODE[fr.type] ?? 0, fr.p, t);
      }
    }
    let master = 1;
    if (look.fadeInOut && !env.editing && tl.total > 2.5) {
      master = Math.min(smooth(0, 0.6, t), 1 - smooth(tl.total - 1.3, tl.total, t));
    }
    const f12 = Math.floor(t * 12);
    const weave = theme.weave
      ? [(hash01('w' + f12, 1) - 0.5) * 0.0024 * theme.weave, (hash01('w' + f12, 2) - 0.5) * 0.004 * theme.weave]
      : [0, 0];
    gl.post(scene, {
      ...look, time: t,
      bar: look.letterbox ? letterboxBar(W, H) / H : 0,
      flicker: theme.flicker, dust: theme.dust, weave, master,
      fadeColor: hexToRgb(theme.fadeColor),
    });
    drawOverlay(this.ctx, { project, theme, look, tl, fr, t, W, H, master, getMeta: peekMedia });
    gl.trim('i:', this.cap, used);
    gl.trim('b:', 40, used);
    return this.complete;
  }

  /** WebGL の映像と文字を1枚の 2D キャンバスに重ねる */
  compose(ctx2d, w = this.W, h = this.H) {
    ctx2d.drawImage(this.glc, 0, 0, w, h);
    ctx2d.drawImage(this.ovc, 0, 0, w, h);
  }

  drawItem(target, it, C) {
    if (it.clip.type === 'title') return this.drawTitleBg(target, it, C);
    switch (C.theme.layout) {
      case 'polaroid': return this.drawPolaroid(target, it, C);
      case 'editorial': return this.drawEditorial(target, it, C);
      case 'minimal': return this.drawMinimal(target, it, C);
      default: return this.drawFull(target, it, C);
    }
  }

  motion(it, C) {
    const clip = it.clip;
    const u = localU(it, C.t);
    const lt = C.t - (it.start - it.tIn / 2);
    const m = motionFor(clip, C.theme, it);
    const amt = C.theme.motion.amount * C.look.motion;
    let pulse = 0;
    if (C.theme.pulse && C.env.beats && C.env.beats.length) {
      const b = lastBeatBefore(C.env.beats, C.t);
      if (b !== null) pulse = Math.exp(-(C.t - b) * 9) * 0.035 * C.look.motion;
    }
    return motionState(m, u, lt, amt, clip.focus, pulse);
  }

  ar(id) {
    const r = peekMedia(id);
    return r && r.w && r.h ? r.w / r.h : 1.5;
  }

  photoTex(id, C) {
    return this.tex(id, 'img', C.used) || this.tex(id, 'blur', C.used);
  }

  drawFull(target, it, C) {
    const gl = this.gl, W = this.W, H = this.H;
    const clip = it.clip, id = clip.mediaId;
    const ar = this.ar(id), FA = W / H;
    gl.target(target, hexToRgb(C.theme.bg));
    const ms = this.motion(it, C);
    if (useBlurFit(clip, ar, FA)) {
      const bt = this.tex(id, 'blur', C.used);
      if (bt) {
        gl.rect({ cx: W / 2, cy: H / 2, w: W, h: H, mode: 'blur', tex: bt, uv: coverWindow(ar, FA, 1.2 + (ms.k - 1) * 0.5, 0.5, 0.5), blur: 0.05, bright: 0.5, soft: 0.5 });
      }
      let h = H, w = H * ar;
      if (w > W) { w = W; h = W / ar; }
      const s = 1 + (ms.k - 1) * 0.6;
      const dx = (ms.cx - 0.5) * W * 0.06, dy = (ms.cy - 0.5) * H * 0.06;
      gl.rect({ cx: W / 2 + dx, cy: H / 2 + dy, w: w * s, h: h * s, mode: 'shadow', color: [0, 0, 0, 0.45], soft: H * 0.03 });
      gl.rect({ cx: W / 2 + dx, cy: H / 2 + dy, w: w * s, h: h * s, mode: 'tex', tex: this.photoTex(id, C), soft: 0.6 });
    } else {
      gl.rect({ cx: W / 2, cy: H / 2, w: W + 2, h: H + 2, mode: 'tex', tex: this.photoTex(id, C), uv: coverWindow(ar, FA, ms.k, ms.cx, ms.cy), soft: 0.5 });
    }
  }

  drawPolaroid(target, it, C) {
    const gl = this.gl, W = this.W, H = this.H;
    const tb = C.theme.table;
    gl.target(target, hexToRgb(tb[1]));
    gl.rect({ cx: W / 2, cy: H / 2, w: W, h: H, mode: 'radial', color: [...hexToRgb(tb[0]), 1], color2: [...hexToRgb(tb[1]), 1], soft: 0.5 });
    const pile = [];
    for (let j = it.index - 1; j >= 0 && pile.length < 5; j--) {
      const p = C.tl.items[j];
      if (p.clip.type !== 'photo') break;
      pile.unshift(p);
    }
    pile.forEach((p, i) => this.drawPolaroidCard(p, C, 1e6, 0.8 + 0.04 * i, false));
    const lt = C.t - (it.start - it.tIn / 2);
    this.drawPolaroidCard(it, C, lt, 1, true);
  }

  drawPolaroidCard(it, C, lt, bright, current) {
    const gl = this.gl, W = this.W, H = this.H;
    const clip = it.clip, id = clip.mediaId;
    const ar = this.ar(id);
    const g = polaroidAnimated(polaroidGeom(clip, W, H, ar), clip, lt, W, H);
    const s = g.scale;
    gl.rect({
      cx: g.cx + W * 0.004 + g.lift * W * 0.03, cy: g.cy + H * 0.014 + g.lift * H * 0.05,
      w: g.fw * s, h: g.fh * s, rot: g.rot, mode: 'shadow', color: [0, 0, 0, 0.55 - g.lift * 0.25], soft: H * (0.016 + g.lift * 0.05), radius: 3,
    });
    gl.rect({ cx: g.cx, cy: g.cy, w: g.fw * s, h: g.fh * s, rot: g.rot, mode: 'color', color: [0.968, 0.958, 0.935, 1], radius: H * 0.003, soft: 0.8, bright });
    const oy = g.imgOffY * s;
    const cx = g.cx - Math.sin(g.rot) * oy, cy = g.cy + Math.cos(g.rot) * oy;
    let k = 1.02, fx = 0.5, fy = 0.5;
    if (clip.focus) { fx = clip.focus.x; fy = clip.focus.y; }
    if (current) {
      const ms = this.motion(it, C);
      k = ms.k; fx = ms.cx; fy = ms.cy;
    }
    const tex = current ? this.photoTex(id, C) : this.tex(id, 'img', C.used);
    gl.rect({ cx, cy, w: g.imgW * s, h: g.imgH * s, rot: g.rot, mode: 'tex', tex, uv: coverWindow(ar, g.imgAR, k, fx, fy), soft: 0.6, bright });
  }

  drawEditorial(target, it, C) {
    const gl = this.gl, W = this.W, H = this.H;
    const clip = it.clip, id = clip.mediaId;
    const ar = this.ar(id);
    gl.target(target, hexToRgb(C.theme.bg));
    const g = editorialGeom(it.photoIndex, W, H, ar);
    const ms = this.motion(it, C);
    gl.rect({ cx: g.cx + (g.left ? 1 : -1) * W * 0.02, cy: g.cy + H * 0.035, w: g.bw, h: g.bh, mode: 'color', color: [...hexToRgb(C.theme.accent), 0.16] });
    gl.rect({ cx: g.cx, cy: g.cy, w: g.bw, h: g.bh, mode: 'tex', tex: this.photoTex(id, C), uv: coverWindow(ar, g.bw / g.bh, ms.k, ms.cx, ms.cy), soft: 0.6 });
  }

  drawMinimal(target, it, C) {
    const gl = this.gl, W = this.W, H = this.H;
    const clip = it.clip, id = clip.mediaId;
    const ar = this.ar(id);
    gl.target(target, hexToRgb(C.theme.bg));
    const g = minimalGeom(W, H, ar);
    const ms = this.motion(it, C);
    gl.rect({ cx: g.cx, cy: g.cy, w: g.w, h: g.h, mode: 'tex', tex: this.photoTex(id, C), uv: coverWindow(ar, ar, ms.k, ms.cx, ms.cy), soft: 0.6 });
  }

  drawTitleBg(target, it, C) {
    const gl = this.gl, W = this.W, H = this.H;
    const bg = it.clip.bg || 'theme';
    if (bg === 'black') return gl.target(target, [0.01, 0.01, 0.01]);
    if (bg === 'white') return gl.target(target, [0.955, 0.95, 0.94]);
    if (bg === 'photo') {
      gl.target(target, [0, 0, 0]);
      const n = this.neighborPhoto(C.tl, it);
      if (n) {
        const bt = this.tex(n.mediaId, 'blur', C.used);
        const u = localU(it, C.t);
        if (bt) gl.rect({ cx: W / 2, cy: H / 2, w: W, h: H, mode: 'blur', tex: bt, uv: coverWindow(this.ar(n.mediaId), W / H, 1.1 + 0.1 * u, 0.5, 0.5), blur: 0.03, bright: 0.42, soft: 0.5 });
      }
      return;
    }
    const tb = C.theme.titleBg;
    if (tb.type === 'solid') return gl.target(target, hexToRgb(tb.color));
    const cols = tb.type === 'table' ? C.theme.table : tb.colors;
    gl.target(target, hexToRgb(cols[1]));
    gl.rect({ cx: W / 2, cy: H / 2, w: W, h: H, mode: 'radial', color: [...hexToRgb(cols[0]), 1], color2: [...hexToRgb(cols[1]), 1], soft: 0.5 });
  }
}
