'use strict';
  const $ = (id) => document.getElementById(id);
  // the game's version: one up in every pull request that changes the game (see CLAUDE.md). It stands in the bottom right
  // corner, and friends in a room see each other's
  const VERSION = { nr: 49, date: '24 oktober 2026' };
  $('version').textContent = 'Version ' + VERSION.nr + ' · ' + VERSION.date;
  if (!window.THREE) {
    $('lede').textContent = 'Kunde inte ladda 3D-motorn. Kontrollera att mappen lib ligger bredvid index.html och ladda om sidan.';
    $('play').disabled = true;
    // a script can't return at the top level: throwing stops the rest of it
    throw new Error('Three.js is missing');
  }

  // Light is computed in linear space and shown in sRGB, like newer three.js: hex colours go in as sRGB and come back out as sRGB
  {
    const C = THREE.Color.prototype, setHex = C.setHex, getHex = C.getHex;
    C.setHex = function (h) { setHex.call(this, h); return this.convertSRGBToLinear(); };
    C.getHex = function () { return getHex.call(this.clone().convertLinearToSRGB()); };
  }

  const loadStart = performance.now();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const fmtKm = (m) => (m / 1000).toFixed(1).replace('.', ',') + ' km';
  let seed = 1252; // Stockholm is first mentioned in 1252
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rr = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const rpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shade = (col, f) => { const c = new THREE.Color(col); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f); return c.getHex(); };

  /* ================= renderer & scene ================= */
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const MAX_DPR = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(MAX_DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  // filmic (ACES) tone mapping, with some of the colour it washes out of bright paint and facades put back
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    'vec3 CustomToneMapping( vec3 color ) { vec3 c = ACESFilmicToneMapping( color ); float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); return saturate( mix( vec3( l ), c, 1.2 ) ); }'
  );
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1.0;

  // fog is mixed in after tone mapping in three.js r128, so its colour is given in screen (sRGB) values
  const HAZE = [0.78, 0.84, 0.89];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(HAZE[0], HAZE[1], HAZE[2]);
  scene.fog = new THREE.Fog(0xffffff, 180, 1350);
  scene.fog.color.setRGB(HAZE[0], HAZE[1], HAZE[2]);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 2400);
  camera.layers.enable(1);

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x8a8172, 0.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffeccc, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 420 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN_OFF = new THREE.Vector3(85, 120, 55);
  const SUN_DIR = SUN_OFF.clone().normalize();

  // sky: blue gradient, sun and drifting clouds, drawn by one shader on a dome that follows the camera. Its colours are
  // uniforms that the day and night (DAYNIGHT) change; the values here are the day's: zenith, horizon, the sun's glow,
  // the sun's disc, the clouds and their sunlit edge, the ground below the horizon, at night the stars and the moon, and
  // how much of the sky the clouds cover (more in rain and snow: WEATHER)
  const SKY_VERT = 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const SKY_FRAG = [
    'uniform vec3 sunDir; uniform float time; uniform vec3 haze; uniform float hazeAmt; uniform float envMode;',
    'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow; uniform float uSunVis; uniform vec3 uCloud; uniform float uCloudGlow; uniform float uGround;',
    'uniform float uNight; uniform vec3 uMoonDir; uniform float uCover;',
    'varying vec3 vDir;',
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }',
    'void main() {',
    '  vec3 d = normalize(vDir); float h = d.y;',
    '  vec3 col = mix(uHor, uZen, pow(max(h, 0.0), 0.5));',
    '  if (h < 0.0) col = mix(uHor, mix(vec3(0.30, 0.32, 0.31), vec3(0.42, 0.39, 0.35), envMode) * uGround, min(1.0, -h * 5.0));',
    '  float sd = max(dot(d, sunDir), 0.0);',
    '  col += uGlow * (pow(sd, 6.0) * 0.22 + pow(sd, 90.0) * 0.8);',
    '  col += vec3(1.0, 0.96, 0.88) * smoothstep(0.9993, 0.9997, sd) * 14.0 * uSunVis;',
    '  if (uNight > 0.0 && h > 0.0) {',
    '    vec2 sp = floor(d.xz / (h + 0.35) * 260.0); float s = hash(sp);',
    '    col += vec3(0.85, 0.9, 1.0) * step(0.9965, s) * (0.6 + 0.4 * sin(time * 2.0 + s * 60.0)) * uNight * smoothstep(0.04, 0.3, h) * 1.6;',
    '    float md = dot(d, uMoonDir);',
    '    col += vec3(0.93, 0.95, 1.0) * (smoothstep(0.99955, 0.99975, md) * 2.4 + pow(max(md, 0.0), 40.0) * 0.06) * uNight;',
    '  }',
    '  if (h > 0.0) {',
    '    vec2 uv = d.xz / (h + 0.1) * 1.1 + vec2(time * 0.006, time * 0.0025);',
    '    float n = fbm(uv);',
    '    float c = smoothstep(0.48 - uCover * 0.5, 0.74 - uCover * 0.42, n) * smoothstep(0.0, 0.14, h);',
    '    vec3 cc = mix(vec3(0.58, 0.63, 0.70), vec3(1.05, 1.03, 1.0), smoothstep(0.5, 0.86, fbm(uv * 1.7 + 3.1))) * uCloud;',
    '    cc += vec3(1.0, 0.86, 0.66) * pow(sd, 5.0) * 0.45 * uCloudGlow;',
    '    col = mix(col, cc, c * 0.92);',
    '  }',
    '  col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))), envMode * 0.45);',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '  gl_FragColor.rgb = mix(gl_FragColor.rgb, haze, hazeAmt * (1.0 - smoothstep(-0.02, 0.16, h)));',
    '}'
  ].join('\n');
  // envMode 1 is the copy used for lighting: less saturated, with warm light bouncing up from the streets
  function skyMaterial(hazeAmt, envMode = 0) {
    return new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        sunDir: { value: SUN_DIR }, time: { value: 0 }, haze: { value: new THREE.Vector3(HAZE[0], HAZE[1], HAZE[2]) }, hazeAmt: { value: hazeAmt }, envMode: { value: envMode },
        uZen: { value: new THREE.Vector3(0.075, 0.24, 0.62) }, uHor: { value: new THREE.Vector3(0.55, 0.68, 0.82) }, uGlow: { value: new THREE.Vector3(1.0, 0.82, 0.58) }, uSunVis: { value: 1 },
        uCloud: { value: new THREE.Vector3(1, 1, 1) }, uCloudGlow: { value: 1 }, uGround: { value: 1 }, uNight: { value: 0 }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uCover: { value: 0 }
      }
    });
  }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), skyMaterial(1));
  sky.renderOrder = -1;
  scene.add(sky);

  // reflections and soft sky light for every PBR material come from the same sky (baked again as the day goes on, by
  // DAYNIGHT with bakeEnv)
  const envScene = new THREE.Scene(), envSky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial(0, 1));
  envScene.add(envSky);
  let envTarget = null;
  function bakeEnv() {
    const pmrem = new THREE.PMREMGenerator(renderer), old = envTarget;
    envTarget = pmrem.fromScene(envScene, 0.02, 0.1, 2000);
    scene.environment = envTarget.texture;
    pmrem.dispose();
    if (old) old.dispose();
  }
  bakeEnv();
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));

  /* ================= geometry helpers ================= */
  const _c = new THREE.Color(), _m4 = new THREE.Matrix4(), _eu = new THREE.Euler();
  function newell(q) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
  // 8 corners: 0..3 bottom (-x-z, +x-z, +x+z, -x+z), 4..7 top in the same order
  const HEXA_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
  function hexaFaces(c, cb) {
    let mx = 0, my = 0, mz = 0;
    for (const v of c) { mx += v[0]; my += v[1]; mz += v[2]; }
    mx /= 8; my /= 8; mz /= 8;
    for (const f of HEXA_FACES) {
      let q = f.map((i) => c[i]);
      let n = newell(q);
      const fx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4 - mx;
      const fy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4 - my;
      const fz = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 - mz;
      if (n[0] * fx + n[1] * fy + n[2] * fz < 0) { q = [q[0], q[3], q[2], q[1]]; n = [-n[0], -n[1], -n[2]]; }
      cb(q[0], q[1], q[2], q[3], n);
    }
  }

  // merged static geometry: vertex colours + (optionally) a repeating texture.
  // A "split" builder sends untextured faces to a second builder so they can use a material without the texture,
  // and textured faces to a third one while "modern" is set (glass and ribbon-window facades).
  // "ao" darkens vertices by height, a cheap stand-in for the shade that collects where walls meet the ground.
  // setFrame(ox, oz, cos, sin) places everything that follows in a rotated local frame: local x runs along
  // (cos, sin), local z along (-sin, cos), so a building can be modelled axis-aligned and turned to face its street.
  class Builder {
    constructor(opts = {}) {
      this.p = []; this.n = []; this.u = []; this.c = []; this.ix = []; this.nv = 0;
      this.ao = opts.ao || null;
      this.solidB = opts.split ? new Builder({ ao: opts.ao }) : null;
      this.altB = opts.split ? new Builder({ ao: opts.ao }) : null;
      this.fr = null; this.modern = false;
    }
    setFrame(ox, oz, c = 1, s = 0) {
      this.fr = ox === undefined ? null : [ox, oz, c, s];
      if (this.solidB) { this.solidB.fr = this.fr; this.altB.fr = this.fr; }
    }
    _tf(v) { const f = this.fr; return [f[0] + v[0] * f[2] - v[2] * f[3], v[1], f[1] + v[0] * f[3] + v[2] * f[2]]; }
    _th(h) { const f = this.fr; return [h[0] * f[2] - h[2] * f[3], h[1], h[0] * f[3] + h[2] * f[2]]; }
    _push(v, n, uv, r, g, b) {
      const k = this.ao ? this.ao(v[1]) : 1;
      this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv[0], uv[1]); this.c.push(r * k, g * k, b * k);
      return this.nv++;
    }
    quad(a, b, c, d, col, uvs, hint) {
      if (!uvs && this.solidB) { this.solidB.quad(a, b, c, d, col, null, hint); return; }
      if (uvs && this.modern && this.altB) { this.altB.quad(a, b, c, d, col, uvs, hint); return; }
      if (this.fr) { a = this._tf(a); b = this._tf(b); c = this._tf(c); d = this._tf(d); if (hint) hint = this._th(hint); }
      let n = newell([a, b, c, d]);
      if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
        const t = b; b = d; d = t; n = [-n[0], -n[1], -n[2]];
        if (uvs) uvs = [uvs[0], uvs[3], uvs[2], uvs[1]];
      }
      _c.set(col);
      const r = _c.r, g = _c.g, bl = _c.b, z = [0, 0];
      const U = uvs || [z, z, z, z];
      const i0 = this._push(a, n, U[0], r, g, bl), i1 = this._push(b, n, U[1], r, g, bl), i2 = this._push(c, n, U[2], r, g, bl), i3 = this._push(d, n, U[3], r, g, bl);
      this.ix.push(i0, i1, i2, i0, i2, i3);
    }
    tri(a, b, c, col, hint, uvs) {
      if (!uvs && this.solidB) { this.solidB.tri(a, b, c, col, hint); return; }
      if (uvs && this.modern && this.altB) { this.altB.tri(a, b, c, col, hint, uvs); return; }
      if (this.fr) { a = this._tf(a); b = this._tf(b); c = this._tf(c); if (hint) hint = this._th(hint); }
      let n = newell([a, b, c]);
      if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
        const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]];
        if (uvs) uvs = [uvs[0], uvs[2], uvs[1]];
      }
      _c.set(col);
      const z = [0, 0], U = uvs || [z, z, z];
      this.ix.push(this._push(a, n, U[0], _c.r, _c.g, _c.b), this._push(b, n, U[1], _c.r, _c.g, _c.b), this._push(c, n, U[2], _c.r, _c.g, _c.b));
    }
    flat(x0, z0, x1, z1, y, col, uvs) { this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col, uvs); }
    box(x0, y0, z0, x1, y1, z1, col, win = false, top = true) {
      // tall textured walls get an extra row of vertices a few metres up so the ground shading stays near the ground
      const ys = win && this.ao && y0 < 1 && y1 > 7 ? [y0, 4.5, y1] : [y0, y1];
      for (let i = 0; i < ys.length - 1; i++) this._walls(x0, ys[i], z0, x1, ys[i + 1], z1, col, win);
      if (top) this.flat(x0, z0, x1, z1, y1, col);
    }
    _walls(x0, y0, z0, x1, y1, z1, col, win) {
      const uvF = (len) => {
        if (!win) return null;
        const nu = Math.max(1, Math.round(len / CELL_W)), v0 = y0 / FLOOR_H, v1 = y1 / FLOOR_H;
        return [[0, v0], [nu, v0], [nu, v1], [0, v1]];
      };
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, uvF(x1 - x0));
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, uvF(x1 - x0));
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, uvF(z1 - z0));
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, uvF(z1 - z0));
    }
    hip(x0, z0, x1, z1, y, rh, ix, iz, col) {
      const yt = y + rh;
      const A = [x0, y, z0], B = [x1, y, z0], C = [x1, y, z1], D = [x0, y, z1];
      const A2 = [x0 + ix, yt, z0 + iz], B2 = [x1 - ix, yt, z0 + iz], C2 = [x1 - ix, yt, z1 - iz], D2 = [x0 + ix, yt, z1 - iz];
      this.quad(B, A, A2, B2, col);
      this.quad(D, C, C2, D2, col);
      this.quad(A, D, D2, A2, col);
      this.quad(C, B, B2, C2, col);
      if (x1 - x0 - 2 * ix > 0.05 && z1 - z0 - 2 * iz > 0.05) this.quad(D2, C2, B2, A2, col);
    }
    prism(cx, cz, r, y0, y1, n, col, rTop = r, cap = true) {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
        const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
        const q0 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop], q1 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
        this.quad(p0, p1, q1, q0, col, null, [Math.cos(am), 0.2, Math.sin(am)]);
        if (cap && rTop > 0) this.tri([cx, y1, cz], q0, q1, col, [0, 1, 0]);
      }
    }
    hexa(c, col) { hexaFaces(c, (a, b, cc, d) => this.quad(a, b, cc, d, col)); }
    get empty() { return this.nv === 0; }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(new THREE.BufferAttribute(this.nv > 65535 ? new Uint32Array(this.ix) : new Uint16Array(this.ix), 1));
      if (this.nv) g.computeBoundingSphere();
      this.p = this.n = this.u = this.c = this.ix = null;
      return g;
    }
  }

  // merged vertex-coloured meshes for cars and people.
  // surfOf(colour) can give each part [roughness, metalness, clearcoat, light channel] for the car shader.
  class Merger {
    constructor(surfOf) { this.p = []; this.n = []; this.c = []; this.s = []; this.surfOf = surfOf || null; }
    _surf(col, count) {
      if (!this.surfOf) return;
      const s = this.surfOf(col);
      for (let i = 0; i < count; i++) this.s.push(s[0], s[1], s[2], s[3]);
    }
    add(geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (rx || ry || rz) g.applyMatrix4(_m4.makeRotationFromEuler(_eu.set(rx, ry, rz)));
      g.translate(x, y, z);
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      _c.set(col);
      for (let i = 0; i < P.length; i += 3) {
        this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(N[i], N[i + 1], N[i + 2]); this.c.push(_c.r, _c.g, _c.b);
      }
      this._surf(col, P.length / 3);
      g.dispose(); geo.dispose();
    }
    box(w, h, d, col, x, y, z) { this.add(new THREE.BoxGeometry(w, h, d), col, x, y, z); }
    // one triangle with its own vertex normals (smooth surfaces)
    triN(a, b, c, na, nb, nc, col) {
      _c.set(col);
      for (const v of [a, b, c]) this.p.push(v[0], v[1], v[2]);
      for (const n of [na, nb, nc]) this.n.push(n[0], n[1], n[2]);
      this.c.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
      this._surf(col, 3);
    }
    hexa(c, col) {
      _c.set(col);
      const r = _c.r, g = _c.g, b = _c.b;
      hexaFaces(c, (a, bb, cc, d, n) => {
        for (const v of [a, bb, cc, a, cc, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(r, g, b); }
      });
      this._surf(col, 36);
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      if (this.s.length) g.setAttribute('surf', new THREE.Float32BufferAttribute(this.s, 4));
      g.computeBoundingSphere();
      return g;
    }
  }

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  // readback: the pixels will be read back (grain, normal maps), so keep the canvas in main memory
  function canvasTex(w, h, draw, repeat, linear, readback) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d', { willReadFrequently: !!readback }), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    if (!linear) t.encoding = THREE.sRGBEncoding;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.redraw = () => { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
    return t;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function instanced(geo, mat, list, place, shadow = true) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const o = new THREE.Object3D(), col = new THREE.Color();
    list.forEach((it, i) => {
      o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
      const cc = place(o, it);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (cc !== undefined) m.setColorAt(i, col.set(cc));
    });
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
    return m;
  }
  // monotone cubic through [[x, y], ...] (it never overshoots between the points), flat beyond the ends
  function curve(pts) {
    const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
      if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  // a tube from point a to point b, radius r at a and r2 at b
  function tubeTo(m, a, b, r, col, r2 = r, n = 10) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    if (len < 1e-5) return;
    const g = new THREE.CylinderGeometry(r2, r, len, n);
    g.applyMatrix4(_m4.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
    m.add(g, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  }

  /* ================= textures ================= */
  // speckle noise at a few scales, for asphalt, stone and plaster
  function grain(g, x, y, w, h, n, dark, light, size = 1.4) {
    for (let i = 0; i < n; i++) { g.fillStyle = rand() < 0.5 ? dark : light; const s = size * (0.6 + rand()); g.fillRect(x + rand() * w, y + rand() * h, s, s); }
  }
  function blotches(g, w, h, n, rgb, alpha, rmin, rmax) {
    for (let i = 0; i < n; i++) {
      const x = rand() * w, y = rand() * h, r = rr(rmin, rmax), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${alpha * (0.4 + rand() * 0.6)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // facade atlas: 4 × 4 window cells (one cell is 3 m wide and one storey tall), each window a little different.
  // The roughness atlas has the same layout so only the glass is shiny.
  const FACADE_CELLS = [];
  for (let i = 0; i < 16; i++) {
    const roll = rand();
    FACADE_CELLS.push({
      kind: roll < 0.3 ? 'curtain' : roll < 0.5 ? 'blind' : roll < 0.58 ? 'plant' : 'dark',
      curtain: pick(['#e8dfcf', '#c9b48f', '#b65a4a', '#6b7f6a', '#f2efe8', '#8d6e9c', '#d9c27a']),
      tilt: rr(-0.08, 0.12), blind: rr(0.2, 0.75), sky: rr(0.25, 0.7)
    });
  }
  function facadeCell(g, x0, y0, s, cell, rough) {
    const fx = x0 + s * 0.28, fy = y0 + s * 0.14, fw = s * 0.44, fh = s * 0.63;
    if (rough) {
      g.fillStyle = 'rgb(235,235,235)'; g.fillRect(x0, y0, s, s);
      g.fillStyle = 'rgb(150,150,150)'; g.fillRect(fx - 3, fy - 3, fw + 6, fh + 6);
      g.fillStyle = 'rgb(16,16,16)'; g.fillRect(fx + 4, fy + 4, fw - 8, fh - 8);
      g.fillStyle = 'rgb(150,150,150)'; g.fillRect(fx + fw / 2 - 2, fy + 4, 4, fh - 8); g.fillRect(fx + 4, fy + fh * 0.34, fw - 8, 4);
      g.fillStyle = 'rgb(200,200,200)'; g.fillRect(fx - 7, fy + fh + 2, fw + 14, 6);
      return;
    }
    g.fillStyle = '#dedad3'; g.fillRect(x0, y0, s, s);
    grain(g, x0, y0, s, s, 900, 'rgba(120,110,100,.08)', 'rgba(255,255,255,.18)', 1.6);
    g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x0, y0 + s - 7, s, 4);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x0, y0 + s - 9, s, 2);
    // reveal shadow around the opening, then frame
    g.fillStyle = 'rgba(40,30,20,.18)'; g.fillRect(fx - 6, fy - 6, fw + 12, fh + 14);
    g.fillStyle = '#f5f3ee'; g.fillRect(fx - 3, fy - 3, fw + 6, fh + 6);
    const gx = fx + 4, gy = fy + 4, gw = fw - 8, gh = fh - 8;
    const gr = g.createLinearGradient(gx, gy, gx + gw * cell.tilt * 4, gy + gh);
    gr.addColorStop(0, `rgb(${Math.round(110 + cell.sky * 80)},${Math.round(130 + cell.sky * 70)},${Math.round(150 + cell.sky * 60)})`);
    gr.addColorStop(0.45, '#3a4752'); gr.addColorStop(1, '#1d252c');
    g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    if (cell.kind === 'curtain') {
      g.fillStyle = cell.curtain; g.globalAlpha = 0.85;
      g.fillRect(gx, gy, gw * 0.24, gh); g.fillRect(gx + gw * 0.76, gy, gw * 0.24, gh);
      g.globalAlpha = 0.25; g.fillRect(gx, gy, gw, gh * 0.12); g.globalAlpha = 1;
    } else if (cell.kind === 'blind') {
      g.fillStyle = '#e9e4da'; g.fillRect(gx, gy, gw, gh * cell.blind);
      g.fillStyle = 'rgba(0,0,0,.12)';
      for (let y = gy + 3; y < gy + gh * cell.blind; y += 4) g.fillRect(gx, y, gw, 1);
    } else if (cell.kind === 'plant') {
      g.fillStyle = '#3f6e36'; g.beginPath(); g.arc(gx + gw * 0.3, gy + gh * 0.82, gw * 0.18, 0, TAU); g.fill();
      g.fillStyle = '#9c5a3c'; g.fillRect(gx + gw * 0.2, gy + gh * 0.86, gw * 0.2, gh * 0.12);
    }
    g.fillStyle = 'rgba(255,255,255,.10)'; g.beginPath(); g.moveTo(gx, gy + gh * 0.55); g.lineTo(gx + gw * 0.55, gy); g.lineTo(gx + gw * 0.75, gy); g.lineTo(gx, gy + gh * 0.8); g.fill();
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(gx, gy, gw, 5); g.fillRect(gx, gy, 4, gh);
    g.fillStyle = '#f5f3ee'; g.fillRect(fx + fw / 2 - 2, gy, 4, gh); g.fillRect(gx, fy + fh * 0.34, gw, 4);
    g.fillStyle = '#d8d3ca'; g.fillRect(fx - 7, fy + fh + 2, fw + 14, 6);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(fx - 7, fy + fh + 8, fw + 14, 3);
  }
  const facadeAtlas = (rough) => (g, w) => { const s = w / 4; FACADE_CELLS.forEach((cell, i) => facadeCell(g, (i % 4) * s, Math.floor(i / 4) * s, s, cell, rough)); };
  const facadeTex = canvasTex(512, 512, facadeAtlas(false), true, false, true);
  const facadeRough = canvasTex(512, 512, facadeAtlas(true), true, true);
  facadeTex.repeat.set(0.25, 0.25);
  facadeRough.repeat.set(0.25, 0.25);

  function asphalt(g, w, h) {
    g.fillStyle = '#44474b'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, '20,22,25', 0.18, 10, 40);
    blotches(g, w, h, 25, '120,122,126', 0.08, 8, 30);
    grain(g, 0, 0, w, h, w * h * 0.09, 'rgba(18,20,24,.45)', 'rgba(150,152,156,.32)', 1.3);
  }
  const roadTex = canvasTex(256, 512, (g, w, h) => {
    asphalt(g, w, h);
    // worn wheel tracks in both lanes, and a few sealed cracks
    for (const u of [0.225, 0.358, 0.642, 0.775]) {
      const gr = g.createLinearGradient(u * w - 14, 0, u * w + 14, 0);
      gr.addColorStop(0, 'rgba(15,16,18,0)'); gr.addColorStop(0.5, 'rgba(15,16,18,.22)'); gr.addColorStop(1, 'rgba(15,16,18,0)');
      g.fillStyle = gr; g.fillRect(u * w - 14, 0, 28, h);
    }
    g.strokeStyle = 'rgba(12,13,15,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      let x = rand() * w, y = rand() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += rr(-10, 10); y += rr(4, 16); g.lineTo(x, y); }
      g.stroke();
    }
    // Swedish centre line: 3 m dash, 9 m gap
    g.fillStyle = '#e9ebe6'; g.fillRect(w / 2 - 5, h * 0.05, 10, h * 0.25);
    grain(g, w / 2 - 5, h * 0.05, 10, h * 0.25, 120, 'rgba(60,60,60,.35)', 'rgba(255,255,255,.2)', 1.4);
  }, true);
  const junctionTex = canvasTex(256, 256, asphalt, true);
  // four-lane avenue: dashed lane lines and a solid double centre line
  const avenueTex = canvasTex(256, 512, (g, w, h) => {
    asphalt(g, w, h);
    g.fillStyle = '#e9ebe6';
    g.fillRect(w / 2 - 7, 0, 4, h); g.fillRect(w / 2 + 3, 0, 4, h);
    for (const u of [0.25, 0.75]) g.fillRect(u * w - 3, h * 0.05, 6, h * 0.25);
  }, true);
  // avenue with a planted median down the middle (Karlavägen)
  const medianTex = canvasTex(256, 512, (g, w, h) => {
    asphalt(g, w, h);
    g.fillStyle = '#a7a39b'; g.fillRect(w * 0.41, 0, w * 0.18, h);
    g.fillStyle = '#4f7a37'; g.fillRect(w * 0.425, 0, w * 0.15, h);
    grain(g, w * 0.425, 0, w * 0.15, h, 2500, 'rgba(30,50,20,.45)', 'rgba(140,180,90,.35)', 2);
    g.fillStyle = '#e9ebe6';
    for (const u of [0.2, 0.8]) g.fillRect(u * w - 3, h * 0.05, 6, h * 0.25);
  }, true);
  // Gamla stan cobbles (gatsten): rows of small, irregular stones
  const cobbleTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5d5953'; g.fillRect(0, 0, w, h);
    const s = 8;
    for (let y = 0; y < h; y += s) {
      const off = (y / s) % 2 ? s / 2 : 0;
      for (let x = -s; x < w + s; x += s) {
        const v = Math.round(rr(110, 160)), t = rr(-8, 8);
        g.fillStyle = `rgb(${v + t},${v - 2},${v - 8 - t})`;
        roundRect(g, x + off + 0.8, y + 0.8, s - 1.6 + rr(-0.6, 0.6), s - 1.6, 2.5); g.fill();
      }
    }
    blotches(g, w, h, 20, '40,36,32', 0.18, 8, 30);
  }, true);
  // granite slabs for pedestrian streets and squares
  const slabTex = canvasTex(256, 256, (g, w, h) => {
    const rows = 5, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rr(0, 40);
      while (x < w) {
        const sw = rr(34, 64), v = Math.round(rr(168, 196));
        g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(x, r * rh, sw, rh);
        g.fillStyle = 'rgba(70,66,60,.55)'; g.fillRect(x, r * rh, 1.5, rh);
        x += sw;
      }
      g.fillStyle = 'rgba(70,66,60,.55)'; g.fillRect(0, r * rh, w, 1.5);
    }
    grain(g, 0, 0, w, h, 9000, 'rgba(60,58,54,.25)', 'rgba(255,255,255,.25)', 1.2);
    blotches(g, w, h, 16, '80,76,70', 0.12, 6, 24);
  }, true);
  // rail yard: ballast with two tracks per tile
  const railTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6a6259'; g.fillRect(0, 0, w, h);
    grain(g, 0, 0, w, h, 14000, 'rgba(40,36,32,.55)', 'rgba(170,160,145,.45)', 2);
    for (const cx of [w * 0.25, w * 0.75]) {
      g.fillStyle = '#4a3a2c';
      for (let y = 4; y < h; y += 16) g.fillRect(cx - 40, y, 80, 7);
      g.fillStyle = '#b8bcc0'; g.fillRect(cx - 21, 0, 4, h); g.fillRect(cx + 17, 0, 4, h);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(cx - 17, 0, 1.5, h); g.fillRect(cx + 21, 0, 1.5, h);
    }
  }, true);
  // modern facades (1960s city centre, offices): ribbon windows and glass curtain walls, same cell size as the classic atlas
  const MODERN_CELLS = [];
  for (let i = 0; i < 16; i++) MODERN_CELLS.push({ glass: pick(['#2c3a48', '#3a3a34', '#24323a', '#30404a', '#3b3226']), sky: rr(0.2, 0.75), blind: rand() < 0.3 ? rr(0.2, 0.7) : 0, curtain: i % 4 === 3 });
  function modernCell(g, x0, y0, s, cell, rough) {
    const band = cell.curtain ? 0.12 : 0.36;
    if (rough) {
      g.fillStyle = 'rgb(16,16,16)'; g.fillRect(x0, y0, s, s);
      g.fillStyle = 'rgb(200,200,200)'; g.fillRect(x0, y0 + s * (1 - band), s, s * band);
      g.fillStyle = 'rgb(120,120,120)'; g.fillRect(x0, y0, 4, s);
      return;
    }
    const gr = g.createLinearGradient(x0, y0, x0 + s * 0.4, y0 + s);
    gr.addColorStop(0, `rgb(${Math.round(120 + cell.sky * 70)},${Math.round(140 + cell.sky * 60)},${Math.round(155 + cell.sky * 55)})`);
    gr.addColorStop(0.5, cell.glass); gr.addColorStop(1, '#151a1f');
    g.fillStyle = gr; g.fillRect(x0, y0, s, s);
    if (cell.blind) { g.fillStyle = 'rgba(225,220,210,.85)'; g.fillRect(x0, y0, s, s * (1 - band) * cell.blind); }
    g.fillStyle = cell.curtain ? '#59606a' : '#c9c6bf'; g.fillRect(x0, y0 + s * (1 - band), s, s * band);
    grain(g, x0, y0 + s * (1 - band), s, s * band, 300, 'rgba(80,80,80,.15)', 'rgba(255,255,255,.2)', 1.4);
    g.fillStyle = '#7d848c'; g.fillRect(x0, y0, 4, s); g.fillRect(x0 + s / 2 - 1, y0, 2, s * (1 - band));
    g.fillStyle = 'rgba(255,255,255,.10)'; g.beginPath(); g.moveTo(x0, y0 + s * 0.5); g.lineTo(x0 + s * 0.5, y0); g.lineTo(x0 + s * 0.7, y0); g.lineTo(x0, y0 + s * 0.7); g.fill();
  }
  const modernAtlas = (rough) => (g, w) => { const s = w / 4; MODERN_CELLS.forEach((cell, i) => modernCell(g, (i % 4) * s, Math.floor(i / 4) * s, s, cell, rough)); };
  const modernTex = canvasTex(512, 512, modernAtlas(false), true, false, true);
  const modernRough = canvasTex(512, 512, modernAtlas(true), true, true);
  modernTex.repeat.set(0.25, 0.25);
  modernRough.repeat.set(0.25, 0.25);
  const paveTex = canvasTex(256, 256, (g, w, h) => {
    // concrete slabs, 50 cm, each a slightly different shade
    const n = 8, s = w / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = Math.round(178 + rr(-12, 12));
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(c * s, r * s, s, s);
    }
    blotches(g, w, h, 30, '90,85,78', 0.14, 6, 26);
    grain(g, 0, 0, w, h, 9000, 'rgba(80,76,70,.25)', 'rgba(255,255,255,.22)', 1.2);
    g.fillStyle = 'rgba(70,66,60,.55)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1, 0, 2, h); g.fillRect(0, i * s - 1, w, 2); }
  }, true);
  // water ripples as a tileable normal map (sum of whole-number sine waves)
  const waterNormal = canvasTex(256, 256, (g, w, h) => {
    const waves = [];
    for (let i = 0; i < 14; i++) waves.push({ kx: Math.round(rr(-9, 9)), ky: Math.round(rr(1, 9)) * (rand() < 0.5 ? -1 : 1), a: rr(0.4, 1) / (1 + i * 0.25), p: rand() * TAU });
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dx = 0, dy = 0;
      for (const wv of waves) {
        const c = Math.cos(TAU * (wv.kx * x / w + wv.ky * y / h) + wv.p) * wv.a;
        dx += c * wv.kx; dy += c * wv.ky;
      }
      const nx = -dx * 0.05, ny = -dy * 0.05, l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, true, true);
  waterNormal.repeat.set(110, 110);
  // soft dark ellipse that sits under every car, where the sun's shadow map is too coarse to darken the road
  const blobTex = canvasTex(64, 128, (g, w, h) => {
    g.save(); g.scale(1, h / w);
    const r = w / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(0.6, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.restore();
  });
  const glowTex = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const plazaTex = canvasTex(256, 256, (g, w) => {
    const n = 8, s = w / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = c * s, y = r * s, f = (r + c) % 2;
      g.fillStyle = f ? '#1c1d1f' : '#f2f2ef'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(x, y + s); g.closePath(); g.fill();
      g.fillStyle = f ? '#f2f2ef' : '#1c1d1f'; g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s, y + s); g.lineTo(x, y + s); g.closePath(); g.fill();
    }
  }, true);
  const tTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 63, 0, TAU); g.fill();
    g.fillStyle = '#1062b4'; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.font = '900 84px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('T', 64, 70);
  });
