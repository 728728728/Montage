// WebGL による映像描画（写真の配置・切り替え・カラーグレード・粒子など）

const VS_RECT = `
attribute vec2 a_pos;
uniform vec2 u_res;
uniform vec2 u_center;
uniform vec2 u_size;
uniform float u_rot;
varying vec2 v_local;
void main(){
  vec2 p = (a_pos - 0.5) * u_size;
  v_local = p;
  float c = cos(u_rot), s = sin(u_rot);
  vec2 r = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + u_center;
  gl_Position = vec4(r.x / u_res.x * 2.0 - 1.0, 1.0 - r.y / u_res.y * 2.0, 0.0, 1.0);
}`;

const FS_RECT = `
precision highp float;
uniform sampler2D u_tex;
uniform int u_mode;
uniform vec4 u_uv;
uniform vec4 u_color;
uniform vec4 u_color2;
uniform vec2 u_half;
uniform float u_radius;
uniform float u_soft;
uniform float u_opacity;
uniform float u_blur;
uniform float u_bright;
varying vec2 v_local;
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
void main(){
  float d = sdBox(v_local, u_half, u_radius);
  float a = 1.0 - smoothstep(-u_soft, u_soft, d);
  vec2 st = clamp(v_local / (2.0 * u_half) + 0.5, 0.0, 1.0);
  vec2 uv = mix(u_uv.xy, u_uv.zw, st);
  vec4 col;
  if (u_mode == 0) {
    col = vec4(texture2D(u_tex, uv).rgb, 1.0);
  } else if (u_mode == 1) {
    col = u_color;
  } else if (u_mode == 2) {
    col = vec4(u_color.rgb, u_color.a);
  } else if (u_mode == 3) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float ang = fi * 2.39996;
      float rr = sqrt((fi + 0.5) / 24.0);
      acc += texture2D(u_tex, uv + vec2(cos(ang), sin(ang)) * rr * u_blur).rgb;
    }
    col = vec4(acc / 24.0, 1.0);
  } else {
    float g = smoothstep(0.0, 1.0, length(st - 0.5) * 1.45);
    col = mix(u_color, u_color2, g);
  }
  gl_FragColor = vec4(col.rgb * u_bright, col.a * a * u_opacity);
}`;

const VS_FULL = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){ v_uv = a_pos; gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }`;

const HASH = `
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float ease(float x){ return x < 0.5 ? 4.0*x*x*x : 1.0 - pow(-2.0*x + 2.0, 3.0) / 2.0; }
`;

const FS_TRANS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_p;
uniform int u_type;
uniform vec2 u_res;
uniform float u_time;
${HASH}
vec3 A(vec2 uv){ return texture2D(u_a, uv).rgb; }
vec3 B(vec2 uv){ return texture2D(u_b, uv).rgb; }
void main(){
  vec2 uv = v_uv;
  float p = clamp(u_p, 0.0, 1.0);
  float s = sin(p * 3.14159265);
  vec3 c;
  if (u_type == 0) {
    c = mix(A(uv), B(uv), smoothstep(0.0, 1.0, p));
  } else if (u_type == 1) {
    float q = p * 2.0;
    c = p < 0.5 ? mix(A(uv), vec3(0.0), smoothstep(0.0, 1.0, q)) : mix(vec3(0.0), B(uv), smoothstep(0.0, 1.0, q - 1.0));
  } else if (u_type == 2) {
    c = mix(A(uv), B(uv), smoothstep(0.38, 0.62, p));
    float f = 1.0 - abs(p - 0.5) * 2.0;
    c = mix(c, vec3(1.0), pow(f, 1.5) * 0.96);
  } else if (u_type == 3) {
    vec2 ctr = vec2(0.5);
    float e = ease(p);
    float za = 1.0 + e * 1.1;
    float zb = 1.0 + (1.0 - e) * 0.6;
    vec3 ca = vec3(0.0), cb = vec3(0.0);
    for (int i = 0; i < 14; i++) {
      float bl = 1.0 - float(i) / 13.0 * 0.16 * s;
      ca += A(ctr + (uv - ctr) / za * bl);
      cb += B(ctr + (uv - ctr) / zb * bl);
    }
    c = mix(ca / 14.0, cb / 14.0, smoothstep(0.42, 0.58, p));
  } else if (u_type == 4) {
    float e = ease(p);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float o = (float(i) / 15.0 - 0.5) * 0.22 * s;
      float x = uv.x + e + o;
      acc += x < 1.0 ? A(vec2(clamp(x, 0.0, 1.0), uv.y)) : B(vec2(x - 1.0, uv.y));
    }
    c = acc / 16.0;
  } else if (u_type == 5) {
    float soft = 0.1;
    float d = uv.x * 0.82 + (1.0 - uv.y) * 0.18;
    float edge = mix(-soft, 1.0 + soft, ease(p));
    c = mix(B(uv), A(uv), smoothstep(edge - soft, edge + soft, d));
  } else if (u_type == 6) {
    c = mix(A(uv), B(uv), smoothstep(0.3, 0.7, p));
    vec2 q = uv - vec2(0.1 + p * 0.8, 0.55 + 0.18 * sin(p * 5.0));
    q *= vec2(1.5, 1.0);
    float blob = exp(-dot(q, q) * 2.6);
    float n = 0.5 + 0.5 * sin(uv.x * 9.0 + uv.y * 7.0 + u_time * 5.0);
    vec3 burn = vec3(1.0, 0.5, 0.16) * blob * (1.3 + n * 0.2) + vec3(1.0, 0.9, 0.7) * pow(blob, 4.0);
    c = 1.0 - (1.0 - c) * (1.0 - clamp(burn * s * 1.5, 0.0, 1.0));
  } else if (u_type == 7) {
    float fr = floor(u_time * 24.0);
    float by = floor(uv.y * 16.0);
    float r = hash(vec2(by, fr));
    float off = (r - 0.5) * 0.28 * s * step(0.45, hash(vec2(by * 3.1, fr + 1.0)));
    float sw = step(0.5, p + (hash(vec2(by, fr + 7.0)) - 0.5) * 0.5 * s);
    vec2 u1 = vec2(uv.x + off, uv.y);
    float sp = 0.022 * s;
    vec3 ca = vec3(A(u1 + vec2(sp, 0.0)).r, A(u1).g, A(u1 - vec2(sp, 0.0)).b);
    vec3 cb = vec3(B(u1 + vec2(sp, 0.0)).r, B(u1).g, B(u1 - vec2(sp, 0.0)).b);
    c = mix(ca, cb, sw);
    c += (hash(uv * u_res + fr) - 0.5) * 0.18 * s;
  } else if (u_type == 8) {
    float r = 0.03 * s;
    vec3 ca = vec3(0.0), cb = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float fi = float(i);
      float ang = fi * 2.39996;
      float rr = sqrt((fi + 0.5) / 20.0) * r;
      vec2 o = vec2(cos(ang), sin(ang) * u_res.x / u_res.y) * rr;
      ca += A(uv + o); cb += B(uv + o);
    }
    c = mix(ca / 20.0, cb / 20.0, smoothstep(0.2, 0.8, p));
    c = 1.0 - (1.0 - c) * (1.0 - vec3(1.0, 0.95, 0.92) * 0.12 * s);
  } else if (u_type == 9) {
    float e = ease(p);
    float x = uv.x + e;
    c = x < 1.0 ? A(vec2(x, uv.y)) : B(vec2(x - 1.0, uv.y));
    float seam = abs(x - 1.0);
    c *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.04, seam)) * s;
  } else if (u_type == 10) {
    vec2 q = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
    float R = ease(p) * 1.05;
    c = mix(B(uv), A(uv), smoothstep(R - 0.015, R + 0.015, length(q)));
  } else {
    c = p < 0.5 ? A(uv) : B(uv);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const FS_POST = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_res;
uniform float u_time;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_sat;
uniform float u_temp;
uniform float u_tint;
uniform float u_fade;
uniform float u_bw;
uniform vec3 u_shadows;
uniform vec3 u_highlights;
uniform float u_grain;
uniform float u_vignette;
uniform float u_leak;
uniform float u_bar;
uniform float u_flicker;
uniform float u_dust;
uniform vec2 u_weave;
uniform float u_master;
uniform vec3 u_fadeColor;
${HASH}
void main(){
  vec2 uv = v_uv + u_weave;
  vec3 c = texture2D(u_scene, clamp(uv, 0.0, 1.0)).rgb;
  float fr = floor(u_time * 24.0);
  float fr12 = floor(u_time * 12.0);
  float ex = u_exposure + u_flicker * (hash(vec2(fr12, 1.7)) - 0.5) * 0.14;
  c *= exp2(ex);
  c.r += u_temp * 0.075 + u_tint * 0.02;
  c.b += -u_temp * 0.075 + u_tint * 0.03;
  c.g -= u_tint * 0.05;
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  float l = dot(c, LW);
  c = mix(vec3(l), c, u_sat);
  c = (c - 0.5) * u_contrast + 0.5;
  l = clamp(dot(c, LW), 0.0, 1.0);
  c += u_shadows * (1.0 - l) * (1.0 - l) + u_highlights * l * l;
  c = mix(c, vec3(dot(c, LW)), u_bw);
  c = clamp(c, 0.0, 1.0);
  c = c * (1.0 - u_fade * 1.25) + u_fade;
  if (u_leak > 0.0) {
    float t = u_time;
    vec2 p1 = vec2(-0.08 + 0.25 * sin(t * 0.37), 0.85 + 0.2 * sin(t * 0.23));
    vec2 p2 = vec2(1.08 + 0.15 * sin(t * 0.29 + 1.0), 0.15 + 0.3 * cos(t * 0.31));
    vec2 asp = vec2(u_res.x / u_res.y, 1.0);
    float a = exp(-dot((v_uv - p1) * asp, (v_uv - p1) * asp) * 2.2);
    float b = exp(-dot((v_uv - p2) * asp, (v_uv - p2) * asp) * 2.8);
    float pulse = 0.55 + 0.45 * sin(t * 0.8);
    vec3 lk = vec3(1.0, 0.46, 0.16) * a * pulse + vec3(1.0, 0.25, 0.42) * b * (1.0 - pulse * 0.5);
    c = 1.0 - (1.0 - c) * (1.0 - clamp(lk * u_leak, 0.0, 1.0));
  }
  if (u_dust > 0.0) {
    float asp = u_res.x / u_res.y;
    float d = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec2 pos = vec2(hash(vec2(fr12, fi)), hash(vec2(fi + 11.0, fr12 + 3.1)));
      float r = 0.0012 + 0.0035 * hash(vec2(fr12 + fi, 7.0));
      float show = step(0.55, hash(vec2(fr12 * 1.3, fi * 2.0)));
      d += show * (1.0 - smoothstep(r * 0.4, r, length((v_uv - pos) * vec2(asp, 1.0))));
    }
    float seg = floor(u_time * 2.0);
    float sx = hash(vec2(seg, 9.0));
    float sc = step(0.62, hash(vec2(seg, 3.0))) * (1.0 - smoothstep(0.0, 0.0011, abs(v_uv.x - sx - 0.004 * sin(v_uv.y * 9.0 + u_time))));
    c = mix(c, vec3(0.06, 0.05, 0.04), clamp(d, 0.0, 1.0) * 0.75 * u_dust);
    c += sc * 0.22 * u_dust;
  }
  vec2 q = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float vig = smoothstep(0.38, 1.05, length(q) * 1.05);
  c *= 1.0 - u_vignette * vig;
  float g = (hash(floor(v_uv * u_res / 1.25) + fr * vec2(17.0, 31.0)) + hash(floor(v_uv * u_res / 1.25) + fr * vec2(7.0, 13.0) + 3.0)) - 1.0;
  float lum = dot(c, LW);
  c += g * u_grain * 0.2 * (1.0 - lum * 0.55);
  if (v_uv.y < u_bar || v_uv.y > 1.0 - u_bar) c = vec3(0.0);
  c = mix(u_fadeColor, c, u_master);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('shader: ' + log);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const locs = {};
  return {
    p,
    loc(name) {
      if (!(name in locs)) locs[name] = gl.getUniformLocation(p, name);
      return locs[name];
    },
  };
}

export class GLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = canvas.getContext('webgl2', opts);
    this.isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL が使えません');
    this.gl = gl;
    this.textures = new Map();
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.textures.clear();
      this.init();
      this.resize(this.w, this.h, true);
      if (this.onRestore) this.onRestore();
    });
    this.init();
  }

  init() {
    const gl = this.gl;
    this.pRect = program(gl, VS_RECT, FS_RECT);
    this.pTrans = program(gl, VS_FULL, FS_TRANS);
    this.pPost = program(gl, VS_FULL, FS_POST);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // 1x1 の黒テクスチャ（読み込み待ちの代わり）
    this.blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 20, 255]));
    this.fbos = [];
  }

  resize(w, h, force = false) {
    if (!force && this.w === w && this.h === h && this.fbos.length) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl;
    for (const f of this.fbos) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
    this.fbos = [];
    for (let i = 0; i < 3; i++) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.fbos.push({ fb, tex });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---------- テクスチャ ----------
  hasTex(key) { return this.textures.has(key); }
  getTex(key) {
    const t = this.textures.get(key);
    if (t) t.used = performance.now();
    return t;
  }
  uploadTex(key, source, mip = true) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    let minF = gl.LINEAR;
    if (mip && this.isGL2) {
      gl.generateMipmap(gl.TEXTURE_2D);
      minF = gl.LINEAR_MIPMAP_LINEAR;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minF);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const entry = { tex, w: source.width, h: source.height, used: performance.now(), key };
    const old = this.textures.get(key);
    if (old) gl.deleteTexture(old.tex);
    this.textures.set(key, entry);
    return entry;
  }
  deleteTex(key) {
    const t = this.textures.get(key);
    if (t) { this.gl.deleteTexture(t.tex); this.textures.delete(key); }
  }
  /** 使っていないテクスチャから捨てる */
  trim(prefix, keep, protect) {
    const list = [...this.textures.values()].filter((t) => t.key.startsWith(prefix) && !(protect && protect.has(t.key)));
    if (list.length <= keep) return;
    list.sort((a, b) => a.used - b.used);
    for (let i = 0; i < list.length - keep; i++) this.deleteTex(list[i].key);
  }
  clearAll() {
    for (const k of [...this.textures.keys()]) this.deleteTex(k);
  }

  // ---------- 描画 ----------
  target(i, color) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, i === null ? null : this.fbos[i].fb);
    gl.viewport(0, 0, this.w, this.h);
    if (color) {
      gl.clearColor(color[0], color[1], color[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  /**
   * 回転できる角丸の四角形を描く
   * o: {cx, cy, w, h, rot, mode:'tex'|'color'|'shadow'|'blur'|'radial', tex, uv:[u0,v0,u1,v1], color:[r,g,b,a], color2, radius, soft, opacity, blur, bright}
   */
  rect(o) {
    const gl = this.gl, P = this.pRect;
    gl.useProgram(P.p);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const soft = o.soft ?? 0.8;
    const pad = soft * 2 + 2;
    const mode = { tex: 0, color: 1, shadow: 2, blur: 3, radial: 4 }[o.mode || 'tex'];
    gl.uniform2f(P.loc('u_res'), this.w, this.h);
    gl.uniform2f(P.loc('u_center'), o.cx, o.cy);
    gl.uniform2f(P.loc('u_size'), o.w + pad * 2, o.h + pad * 2);
    gl.uniform1f(P.loc('u_rot'), o.rot || 0);
    gl.uniform1i(P.loc('u_mode'), mode);
    const uv = o.uv || [0, 0, 1, 1];
    gl.uniform4f(P.loc('u_uv'), uv[0], uv[1], uv[2], uv[3]);
    const c = o.color || [0, 0, 0, 1];
    gl.uniform4f(P.loc('u_color'), c[0], c[1], c[2], c[3] ?? 1);
    const c2 = o.color2 || c;
    gl.uniform4f(P.loc('u_color2'), c2[0], c2[1], c2[2], c2[3] ?? 1);
    gl.uniform2f(P.loc('u_half'), o.w / 2, o.h / 2);
    gl.uniform1f(P.loc('u_radius'), Math.min(o.radius || 0, o.w / 2, o.h / 2));
    gl.uniform1f(P.loc('u_soft'), soft);
    gl.uniform1f(P.loc('u_opacity'), o.opacity ?? 1);
    gl.uniform1f(P.loc('u_blur'), o.blur || 0);
    gl.uniform1f(P.loc('u_bright'), o.bright ?? 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, o.tex ? o.tex.tex : this.blank);
    gl.uniform1i(P.loc('u_tex'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  transition(code, p, time) {
    const gl = this.gl, P = this.pTrans;
    this.target(2);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[0].tex);
    gl.uniform1i(P.loc('u_a'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[1].tex);
    gl.uniform1i(P.loc('u_b'), 1);
    gl.uniform1f(P.loc('u_p'), p);
    gl.uniform1i(P.loc('u_type'), code);
    gl.uniform2f(P.loc('u_res'), this.w, this.h);
    gl.uniform1f(P.loc('u_time'), time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    return 2;
  }

  post(scene, L) {
    const gl = this.gl, P = this.pPost;
    this.target(null);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos[scene].tex);
    gl.uniform1i(P.loc('u_scene'), 0);
    gl.uniform2f(P.loc('u_res'), this.w, this.h);
    gl.uniform1f(P.loc('u_time'), L.time);
    gl.uniform1f(P.loc('u_exposure'), L.exposure);
    gl.uniform1f(P.loc('u_contrast'), L.contrast);
    gl.uniform1f(P.loc('u_sat'), L.sat);
    gl.uniform1f(P.loc('u_temp'), L.temp);
    gl.uniform1f(P.loc('u_tint'), L.tint);
    gl.uniform1f(P.loc('u_fade'), L.fade);
    gl.uniform1f(P.loc('u_bw'), L.bw);
    gl.uniform3fv(P.loc('u_shadows'), L.shadows);
    gl.uniform3fv(P.loc('u_highlights'), L.highlights);
    gl.uniform1f(P.loc('u_grain'), L.grain);
    gl.uniform1f(P.loc('u_vignette'), L.vignette);
    gl.uniform1f(P.loc('u_leak'), L.leak);
    gl.uniform1f(P.loc('u_bar'), L.bar);
    gl.uniform1f(P.loc('u_flicker'), L.flicker);
    gl.uniform1f(P.loc('u_dust'), L.dust);
    gl.uniform2f(P.loc('u_weave'), L.weave[0], L.weave[1]);
    gl.uniform1f(P.loc('u_master'), L.master);
    gl.uniform3fv(P.loc('u_fadeColor'), L.fadeColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
