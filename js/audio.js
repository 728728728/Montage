// 音楽の再生・解析（波形とビート検出）・書き出し用のミックス
let ctx = null;

export function getAudioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    // iPhone のマナーモードでも音が出るように
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 非対応 */ }
  }
  return ctx;
}

export async function resumeAudio() {
  const c = getAudioCtx();
  if (c.state !== 'running') {
    try { await c.resume(); } catch { /* ユーザー操作待ち */ }
  }
  return c;
}

// ---------- 解析 ----------
export function analyzeAudio(buffer) {
  const peaks = computePeaks(buffer, 1600);
  const beat = detectBeats(buffer);
  return { peaks, ...beat };
}

function computePeaks(buffer, n) {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const step = Math.max(1, Math.floor(ch0.length / n));
  const out = new Array(n).fill(0);
  let max = 1e-6;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const o = i * step;
    const end = Math.min(ch0.length, o + step);
    for (let j = o; j < end; j += 4) {
      const v = Math.abs(ch0[j]) + Math.abs(ch1[j]);
      if (v > m) m = v;
    }
    out[i] = m;
    if (m > max) max = m;
  }
  return out.map((v) => Math.round((v / max) * 255));
}

/** テンポ（BPM）と、最初の拍の位置を推定する */
export function detectBeats(buffer) {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const fps = 100;
  const hop = Math.round(sr / fps);
  const n = Math.floor(ch0.length / hop);
  if (n < fps * 4) return { bpm: 0, period: 0, beatOffset: 0 };
  const env = new Float32Array(n), envLow = new Float32Array(n);
  const alpha = 1 - Math.exp((-2 * Math.PI * 160) / sr);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let e = 0, el = 0;
    const o = i * hop;
    for (let j = 0; j < hop; j++) {
      const s = (ch0[o + j] + ch1[o + j]) * 0.5;
      lp += alpha * (s - lp);
      e += s * s; el += lp * lp;
    }
    env[i] = Math.log(1e-7 + e / hop);
    envLow[i] = Math.log(1e-7 + el / hop);
  }
  const on = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    on[i] = Math.max(0, env[i] - env[i - 1]) + 1.4 * Math.max(0, envLow[i] - envLow[i - 1]);
  }
  // 局所平均を引いて、はっきりした立ち上がりだけ残す
  const W = 15;
  const on2 = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += on[i];
    if (i >= 2 * W + 1) acc -= on[i - 2 * W - 1];
    const c = i - W;
    if (c >= 0) on2[c] = Math.max(0, on[c] - acc / (2 * W + 1));
  }
  // 自己相関でテンポを求める（60〜190 BPM、120 付近を少し優先）
  const minLag = Math.floor((60 * fps) / 190), maxLag = Math.ceil((60 * fps) / 60);
  const scores = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += on2[i] * on2[i + lag];
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.8, 2));
    scores[lag] = (s / (n - lag)) * (0.55 + 0.45 * w);
  }
  let best = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) if (scores[lag] > scores[best]) best = lag;
  let lagF = best;
  if (best > minLag && best < maxLag) {
    const a = scores[best - 1], b = scores[best], c = scores[best + 1];
    const d = a - 2 * b + c;
    if (d < 0) lagF = best + (0.5 * (a - c)) / d;
  }
  // 位相：拍の位置の立ち上がりの合計が最大になるずれ
  let bestPh = 0, bestS = -1;
  for (let ph = 0; ph < lagF; ph += 0.5) {
    let s = 0;
    for (let x = ph; x < n; x += lagF) {
      const i = Math.round(x);
      s += on2[i] + 0.5 * ((on2[i - 1] || 0) + (on2[i + 1] || 0));
    }
    if (s > bestS) { bestS = s; bestPh = ph; }
  }
  const period = lagF / fps;
  return { bpm: Math.round((60 / period) * 10) / 10, period, beatOffset: bestPh / fps };
}

// ---------- 再生 ----------
/** タイムライン上の時刻 τ に鳴らす曲中の位置 */
export function musicPosAt(music, buffer, tau) {
  const loopLen = buffer.duration - music.offset;
  let pos = music.offset + tau;
  if (pos >= buffer.duration) {
    if (!music.loop || loopLen <= 0.5) return null;
    pos = music.offset + (tau % loopLen);
  }
  return pos;
}

function volumeAt(music, total, tau) {
  let v = music.volume;
  if (music.fadeIn > 0) v *= Math.min(1, tau / music.fadeIn);
  if (music.fadeOut > 0) v *= Math.min(1, Math.max(0, (total - tau) / music.fadeOut));
  return Math.max(0, v);
}

function scheduleGain(param, when, t0, total, music) {
  param.cancelScheduledValues(0);
  param.setValueAtTime(volumeAt(music, total, t0), when);
  const pts = [music.fadeIn, total - music.fadeOut, total].filter((x) => x > t0 + 0.001).sort((a, b) => a - b);
  for (const p of pts) param.linearRampToValueAtTime(volumeAt(music, total, p), when + (p - t0));
}

function connectSource(c, buffer, music, dest) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  if (music.loop && buffer.duration - music.offset > 0.5) {
    src.loop = true;
    src.loopStart = music.offset;
    src.loopEnd = buffer.duration;
  }
  const g = c.createGain();
  src.connect(g);
  g.connect(dest);
  return { src, g };
}

export class MusicPlayer {
  constructor() { this.node = null; }

  /** 時刻 t0 から再生。戻り値は「タイムライン時刻 = t0 + (ctx.currentTime - startAt)」の startAt */
  start(buffer, music, t0, total) {
    this.stop();
    const c = getAudioCtx();
    const startAt = c.currentTime + 0.06;
    if (!buffer || !music) return { ctx: c, startAt };
    const pos = musicPosAt(music, buffer, t0);
    if (pos === null) return { ctx: c, startAt };
    const { src, g } = connectSource(c, buffer, music, c.destination);
    scheduleGain(g.gain, startAt, t0, total, music);
    src.start(startAt, pos);
    if (!music.loop) src.stop(startAt + Math.max(0, total - t0));
    this.node = { src, g };
    return { ctx: c, startAt };
  }

  stop() {
    if (!this.node) return;
    try { this.node.src.stop(); } catch { /* すでに停止 */ }
    try { this.node.src.disconnect(); this.node.g.disconnect(); } catch { /* 無視 */ }
    this.node = null;
  }
}

/** 書き出し用：動画の長さぶんの音を 48kHz ステレオで作る */
export async function renderMix(buffer, music, total, sampleRate = 48000) {
  const len = Math.ceil(total * sampleRate);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(2, Math.max(1, len), sampleRate);
  if (buffer && music) {
    const pos = musicPosAt(music, buffer, 0);
    if (pos !== null) {
      const { src, g } = connectSource(oc, buffer, music, oc.destination);
      scheduleGain(g.gain, 0, 0, total, music);
      src.start(0, pos);
    }
  }
  return oc.startRendering();
}

/** 書き出し（リアルタイム録画）用：MediaStream に音を流す */
export function startStreamPlayback(buffer, music, total) {
  const c = getAudioCtx();
  const dest = c.createMediaStreamDestination();
  const startAt = c.currentTime + 0.1;
  let node = null;
  if (buffer && music) {
    const pos = musicPosAt(music, buffer, 0);
    if (pos !== null) {
      node = connectSource(c, buffer, music, dest);
      scheduleGain(node.g.gain, startAt, 0, total, music);
      node.src.start(startAt, pos);
    }
  }
  return {
    stream: dest.stream, ctx: c, startAt,
    stop() {
      if (node) { try { node.src.stop(); } catch { /* 無視 */ } }
    },
  };
}
