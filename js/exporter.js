// MP4 への書き出し
// 1) WebCodecs が使える端末：1コマずつ描いてエンコード（速く、コマ落ちしない）
// 2) 使えない端末：画面を再生しながら MediaRecorder で録画（動画の長さぶん時間がかかる）
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { Engine } from './engine.js';
import { renderMix, startStreamPlayback } from './audio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function detectCapabilities(width, height, fps) {
  const caps = { videoCodec: null, audioCodec: null, recorderMime: null };
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f']) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 8e6, framerate: fps });
        if (s && s.supported) { caps.videoCodec = codec; break; }
      } catch { /* 次を試す */ }
    }
  }
  if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
      try {
        const s = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
        if (s && s.supported) { caps.audioCodec = { codec, mux }; break; }
      } catch { /* 次を試す */ }
    }
  }
  if (typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream) {
    for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs="avc1,mp4a"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
      try { if (MediaRecorder.isTypeSupported(m)) { caps.recorderMime = m; break; } } catch { /* 無視 */ }
    }
  }
  return caps;
}

/** どの方法で書き出すか */
export function exportMethod(caps, hasAudio) {
  if (caps.videoCodec && (!hasAudio || caps.audioCodec)) return 'webcodecs';
  if (caps.recorderMime) return 'recorder';
  return null;
}

export async function exportVideo(opts) {
  const method = exportMethod(opts.caps, !!(opts.audioBuffer && opts.project.music));
  if (!method) throw new Error('この端末のブラウザは動画の書き出しに対応していません。Chrome か Safari の最新版でお試しください。');
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* 非対応 */ }
  try {
    return method === 'webcodecs' ? await viaWebCodecs(opts) : await viaRecorder(opts);
  } finally {
    try { await lock?.release(); } catch { /* 無視 */ }
  }
}

function makeComp(width, height) {
  const comp = document.createElement('canvas');
  comp.width = width; comp.height = height;
  return { comp, ctx: comp.getContext('2d', { alpha: false }) };
}

async function viaWebCodecs({ project, tl, beats, audioBuffer, width, height, fps, caps, onProgress, signal }) {
  const hasAudio = !!(audioBuffer && project.music);
  const engine = new Engine({ quality: 'full' });
  engine.setSize(width, height);
  const { comp, ctx } = makeComp(width, height);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: hasAudio ? { codec: caps.audioCodec.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encErr = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e; },
  });
  venc.configure({
    codec: caps.videoCodec, width, height, framerate: fps,
    bitrate: height >= 1080 ? 9_000_000 : 5_000_000,
    latencyMode: 'quality',
    avc: { format: 'avc' },
  });
  const frames = Math.max(1, Math.ceil(tl.total * fps));
  const vShare = hasAudio ? 0.93 : 0.99;
  try {
    for (let i = 0; i < frames; i++) {
      if (signal && signal.aborted) throw new DOMException('中止しました', 'AbortError');
      if (encErr) throw encErr;
      const t = i / fps;
      await engine.prepare(project, tl, t);
      engine.prefetch(project, tl, t, 1.5);
      engine.render(project, tl, t, { beats });
      engine.compose(ctx, width, height);
      const frame = new VideoFrame(comp, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 4) await wait(2);
      if (i % 4 === 0) {
        onProgress && onProgress(((i + 1) / frames) * vShare, comp);
        await wait(0);
      }
    }
    await venc.flush();
    if (encErr) throw encErr;
    if (hasAudio) {
      onProgress && onProgress(vShare, comp, '音声を合成しています');
      const mix = await renderMix(audioBuffer, project.music, tl.total, 48000);
      const aenc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { encErr = e; },
      });
      aenc.configure({ codec: caps.audioCodec.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
      const L = mix.getChannelData(0), R = mix.numberOfChannels > 1 ? mix.getChannelData(1) : L;
      const N = L.length, CH = 4800;
      for (let o = 0; o < N; o += CH) {
        if (encErr) throw encErr;
        const n = Math.min(CH, N - o);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(o, o + n), 0);
        data.set(R.subarray(o, o + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o / 48000) * 1e6), data });
        aenc.encode(ad);
        ad.close();
        if (aenc.encodeQueueSize > 20) await wait(1);
      }
      await aenc.flush();
      if (encErr) throw encErr;
      aenc.close();
    }
    muxer.finalize();
    onProgress && onProgress(1, comp);
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', method: 'webcodecs' };
  } finally {
    try { if (venc.state !== 'closed') venc.close(); } catch { /* 無視 */ }
    engine.gl.clearAll();
    engine.gl.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

async function viaRecorder({ project, tl, beats, audioBuffer, width, height, fps, caps, onProgress, signal }) {
  const engine = new Engine({ quality: 'full' });
  engine.setSize(width, height);
  const { comp, ctx } = makeComp(width, height);
  // 最初の数秒ぶんを先に読み込んでおく
  await engine.prepare(project, tl, 0);
  engine.prefetch(project, tl, 0, 5);
  await Promise.all([...engine.loading.values()]);
  engine.render(project, tl, 0, { beats });
  engine.compose(ctx, width, height);

  const vstream = comp.captureStream(fps);
  const audio = startStreamPlayback(audioBuffer, project.music, tl.total);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...audio.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: caps.recorderMime, videoBitsPerSecond: height >= 1080 ? 9_000_000 : 5_000_000, audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const actx = audio.ctx;
  while (actx.currentTime < audio.startAt) await wait(5);
  rec.start(1000);
  try {
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal && signal.aborted) return reject(new DOMException('中止しました', 'AbortError'));
        const t = actx.currentTime - audio.startAt;
        engine.prefetch(project, tl, t, 4);
        engine.render(project, tl, Math.min(t, tl.total - 0.001), { beats });
        engine.compose(ctx, width, height);
        onProgress && onProgress(Math.min(0.99, t / tl.total), comp, 'この画面を開いたままお待ちください（再生しながら録画しています）');
        if (t >= tl.total + 0.15) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    audio.stop();
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    engine.gl.clearAll();
    engine.gl.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  const type = caps.recorderMime.split(';')[0];
  onProgress && onProgress(1, comp);
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', method: 'recorder' };
}
