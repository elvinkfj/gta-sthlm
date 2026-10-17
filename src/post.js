'use strict';

  /* ================= post-processing ================= */
  // Quality 2: the city mirrored in the water, ambient occlusion (the soft shade where things meet), bloom, anti-aliasing
  // and a photographic grade (contrast, colour, vignette, film grain). Quality 1: bloom, grade and anti-aliasing only.
  // Quality 0: straight to the screen as before. Q steps through them; a slow computer steps down by itself.
  // Everything is drawn to an off-screen picture first, in the same screen colours as before (tone mapping and fog
  // happen in the materials), and the passes work on that picture.
  const POST = (() => {
    const gl2 = renderer.capabilities.isWebGL2, depthOk = gl2 || renderer.extensions.has('WEBGL_depth_texture');
    const half = gl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = (w, h, o = {}) => {
      const t = new THREE.WebGLRenderTarget(w, h, Object.assign({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false }, o));
      t.texture.generateMipmaps = false;
      return t;
    };
    const VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false; fsScene.add(quad);
    const draw = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

    // the picture of the scene, with the depth the occlusion pass reads
    const main = rt(1, 1, { depthBuffer: true });
    main.texture.encoding = THREE.sRGBEncoding;
    // (32-bit float depth where there is WebGL2: finer than 24-bit integer depth far off, where the occlusion needs it)
    if (depthOk) { main.depthTexture = new THREE.DepthTexture(1, 1); main.depthTexture.type = gl2 ? THREE.FloatType : THREE.UnsignedIntType; }

    /* ambient occlusion, at half size: a dozen samples in the half sphere above each point, then a blur that keeps edges */
    const DEPTH_FN = [
      'uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec2 uTan;',
      'float viewZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return (uNear * uFar) / ((uFar - uNear) * d - uFar); }',
      'vec3 viewPos(vec2 uv) { float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * uTan * -z, z); }'
    ].join('\n');
    const aoU = { tDepth: { value: main.depthTexture }, uNear: { value: 0.1 }, uFar: { value: 2400 }, uTan: { value: new THREE.Vector2() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uSeed: { value: 0 } };
    const aoMat = pass([
      DEPTH_FN,
      'uniform mat4 uProj; uniform vec2 uRes; uniform float uSeed; varying vec2 vUv;',
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main() {',
      // read the depth at the middle of one full-size pixel, where its position is exactly known: a half-size pixel
      // falls on the corner between four of them, and flat ground seen at a low angle would come out jagged
      '  vec2 uv = (floor(vUv * uRes) + 0.5) / uRes;',
      '  if (texture2D(tDepth, uv).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
      '  vec3 P = viewPos(uv);',
      '  if (-P.z > 160.0) { gl_FragColor = vec4(1.0); return; }',
      '  vec2 px = 1.0 / uRes;',
      '  vec3 r = viewPos(uv + vec2(px.x, 0.0)), l = viewPos(uv - vec2(px.x, 0.0)), t = viewPos(uv + vec2(0.0, px.y)), b = viewPos(uv - vec2(0.0, px.y));',
      '  vec3 dx = abs(r.z - P.z) < abs(P.z - l.z) ? r - P : P - l, dy = abs(t.z - P.z) < abs(P.z - b.z) ? t - P : P - b;',
      '  vec3 N = normalize(cross(dx, dy));',
      '  float a = hash(gl_FragCoord.xy + uSeed) * 6.2831853;',
      '  vec3 rv = vec3(cos(a), sin(a), 0.3), T = normalize(rv - N * dot(rv, N)), B = cross(N, T);',
      // (the tolerance grows with distance: depth is stored more coarsely further off, and on some GPUs it is read
      // back with less precision, which would otherwise darken flat ground)
      '  float rad = 0.9 * clamp(-P.z / 14.0, 0.5, 3.0), bias = 0.03 * rad + 1.5e-4 * P.z * P.z, occ = 0.0;',
      '  for (int i = 0; i < 12; i++) {',
      '    float s = (float(i) + 0.5) / 12.0, ang = float(i) * 2.3999632, h = sqrt(1.0 - s);',
      '    vec3 k = vec3(cos(ang) * h, sin(ang) * h, sqrt(s)) * mix(0.15, 1.0, s * s);',
      '    vec3 S = P + (T * k.x + B * k.y + N * k.z) * rad;',
      '    vec4 c = uProj * vec4(S, 1.0);',
      '    vec2 suv = c.xy / c.w * 0.5 + 0.5;',
      '    float sz = viewZ((floor(suv * uRes) + 0.5) / uRes);',
      '    occ += (sz >= S.z + bias ? 1.0 : 0.0) * smoothstep(0.0, 1.0, rad / abs(P.z - sz));',
      '  }',
      '  float ao = 1.0 - occ / 12.0;',
      '  gl_FragColor = vec4(vec3(mix(ao, 1.0, smoothstep(100.0, 160.0, -P.z))), 1.0);',
      '}'
    ].join('\n'), aoU);
    const aoBlurU = { tAO: { value: null }, tDepth: { value: main.depthTexture }, uNear: aoU.uNear, uFar: aoU.uFar, uTan: aoU.uTan, uRes: { value: new THREE.Vector2() } };
    const aoBlur = pass([
      DEPTH_FN,
      'uniform sampler2D tAO; uniform vec2 uRes; varying vec2 vUv;',
      'void main() {',
      '  float z0 = -viewZ(vUv), sum = 0.0, wsum = 0.0;',
      '  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {',
      '    vec2 uv = vUv + vec2(float(x), float(y)) / uRes;',
      '    float w = exp(-abs(-viewZ(uv) - z0) / (0.03 * z0 + 0.15));',
      '    sum += texture2D(tAO, uv).r * w; wsum += w;',
      '  }',
      '  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);',
      '}'
    ].join('\n'), aoBlurU);
    const aoA = rt(1, 1), aoB = rt(1, 1);

    /* bloom: the brightest parts, blurred over a chain of ever smaller pictures and back up again (dual Kawase) */
    const bloomPre = pass([
      'uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;',
      'void main() {',
      '  vec3 c = (texture2D(tSrc, vUv + vec2(-uPx.x, -uPx.y)).rgb + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)).rgb + texture2D(tSrc, vUv + vec2(-uPx.x, uPx.y)).rgb + texture2D(tSrc, vUv + vec2(uPx.x, uPx.y)).rgb) * 0.25;',
      '  float br = max(c.r, max(c.g, c.b)), knee = 0.18, soft = clamp(br - 0.82 + knee, 0.0, 2.0 * knee);',
      '  soft = soft * soft / (4.0 * knee + 1e-4);',
      '  gl_FragColor = vec4(c * max(soft, br - 0.82) / max(br, 1e-4), 1.0);',
      '}'
    ].join('\n'), { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } });
    const down = pass([
      'uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;',
      'void main() {',
      '  vec4 s = texture2D(tSrc, vUv) * 4.0 + texture2D(tSrc, vUv - uPx) + texture2D(tSrc, vUv + uPx) + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)) + texture2D(tSrc, vUv - vec2(uPx.x, -uPx.y));',
      '  gl_FragColor = s / 8.0;',
      '}'
    ].join('\n'), { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } });
    const up = pass([
      'uniform sampler2D tSrc, tAdd; uniform vec2 uPx; varying vec2 vUv;',
      'void main() {',
      '  vec4 s = texture2D(tSrc, vUv + vec2(-uPx.x * 2.0, 0.0)) + texture2D(tSrc, vUv + vec2(0.0, uPx.y * 2.0)) + texture2D(tSrc, vUv + vec2(uPx.x * 2.0, 0.0)) + texture2D(tSrc, vUv + vec2(0.0, -uPx.y * 2.0));',
      '  s += (texture2D(tSrc, vUv + vec2(-uPx.x, uPx.y)) + texture2D(tSrc, vUv + vec2(uPx.x, uPx.y)) + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)) + texture2D(tSrc, vUv + vec2(-uPx.x, -uPx.y))) * 2.0;',
      '  gl_FragColor = s / 12.0 + texture2D(tAdd, vUv);',
      '}'
    ].join('\n'), { tSrc: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() } });
    const lvDown = [0, 1, 2, 3].map(() => rt(1, 1, { type: half })), lvUp = [0, 1, 2].map(() => rt(1, 1, { type: half }));

    /* the final picture: anti-aliasing (FXAA), occlusion, bloom and the grade */
    const finU = {
      tColor: { value: main.texture }, tAO: { value: aoB.texture }, tBloom: { value: lvUp[0].texture }, uPx: { value: new THREE.Vector2() },
      uAO: { value: 1 }, uBloom: { value: 0.32 }, uTime: { value: 0 }, uAspect: { value: 1 }, uShowAO: { value: 0 }
    };
    const finMat = pass([
      'uniform sampler2D tColor, tAO, tBloom; uniform vec2 uPx; uniform float uAO, uBloom, uTime, uAspect, uShowAO; varying vec2 vUv;',
      'vec3 fxaa(vec2 uv) {',
      '  vec3 nw = texture2D(tColor, uv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(tColor, uv + vec2(1.0, -1.0) * uPx).rgb;',
      '  vec3 sw = texture2D(tColor, uv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(tColor, uv + vec2(1.0, 1.0) * uPx).rgb, m = texture2D(tColor, uv).rgb;',
      '  vec3 L = vec3(0.299, 0.587, 0.114);',
      '  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);',
      '  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));',
      '  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));',
      '  float red = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125), rmin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);',
      '  dir = clamp(dir * rmin, vec2(-8.0), vec2(8.0)) * uPx;',
      '  vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);',
      '  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);',
      '  float lb = dot(b, L);',
      '  return (lb < lmin || lb > lmax) ? a : b;',
      '}',
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main() {',
      '  vec3 c = fxaa(vUv);',
      // a touch of colour fringing towards the corners, as in a real lens
      '  vec2 off = (vUv - 0.5) * 0.0016;',
      '  c.r = mix(c.r, texture2D(tColor, vUv + off).r, 0.5); c.b = mix(c.b, texture2D(tColor, vUv - off).b, 0.5);',
      '  vec3 lin = pow(max(c, 0.0), vec3(2.2));',
      '  lin *= mix(1.0, texture2D(tAO, vUv).r, uAO);',
      '  lin += pow(max(texture2D(tBloom, vUv).rgb, 0.0), vec3(2.2)) * uBloom;',
      // the grade: a little less candy colour, cool shadows and warm highlights, a soft S-curve
      '  float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));',
      '  lin = mix(vec3(lum), lin, 0.9);',
      '  lin *= mix(vec3(0.96, 1.0, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.02, 0.6, lum));',
      '  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));',
      '  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);',
      '  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);',
      '  c *= 1.0 - 0.32 * smoothstep(0.35, 1.05, length(q));',
      '  c += (hash(vUv * 1013.0 + uTime) - 0.5) * 0.022;',
      '  gl_FragColor = vec4(uShowAO > 0.5 ? texture2D(tAO, vUv).rrr : c, 1.0);',
      '}'
    ].join('\n'), finU);

    /* the city mirrored in the water: drawn from below the water surface, upside down, at about a third of the size */
    const refl = rt(1, 1, { depthBuffer: true });
    refl.texture.encoding = THREE.sRGBEncoding;
    const mirror = new THREE.PerspectiveCamera(), reflU = { tReflect: { value: refl.texture }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } };
    const WATER_Y = water.position.y, _p = new THREE.Plane(), _v4 = new THREE.Vector4(), _q = new THREE.Vector4(), _tgt = new THREE.Vector3(), _dir = new THREE.Vector3();
    water.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, reflU);
      sh.vertexShader = 'uniform mat4 uReflMatrix;\nvarying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvRefl = uReflMatrix * modelMatrix * vec4( transformed, 1.0 );');
      sh.fragmentShader = 'uniform sampler2D tReflect;\nuniform float uReflOn;\nvarying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <encodings_fragment>', [
        '#include <encodings_fragment>',
        '\tif ( uReflOn > 0.5 ) {',
        // the ripples break the mirror image up, less so far off where they are small on screen
        '\t\tvec2 wob = ( normal - geometryNormal ).xy * 0.05 * clamp( 14.0 / length( vViewPosition ), 0.1, 1.0 );',
        '\t\tvec3 refl = texture2D( tReflect, vRefl.xy / vRefl.w + wob ).rgb;',
        '\t\tfloat fres = 0.03 + 0.97 * pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 5.0 );',
        '\t\tgl_FragColor.rgb = mix( gl_FragColor.rgb, refl * vec3( 0.84, 0.92, 0.95 ), clamp( 0.22 + fres * 0.75, 0.0, 0.9 ) );',
        '\t}'
      ].join('\n'));
    };
    water.material.needsUpdate = true;
    // is any water in sight: look out from the camera across its field of view, each way until a house is in the way
    // (seen from up high, nothing is in the way)
    function waterInView() {
      camera.getWorldDirection(_dir);
      if (_dir.y > 0.6) return false;
      const yaw = Math.atan2(_dir.x, _dir.z), spread = (camera.fov * camera.aspect * Math.PI) / 360 + 0.15, high = camera.position.y > 25;
      for (let k = -4; k <= 4; k++) {
        const a = yaw + (k / 4) * spread, sx = Math.sin(a), sz = Math.cos(a);
        for (const d of [6, 12, 20, 32, 50, 80, 125, 200, 320, 500, 750]) {
          const x = camera.position.x + sx * d, z = camera.position.z + sz * d;
          if (!walkable(x, z)) return true;
          if (!high && blockedAt(x, z, 1)) break;
        }
      }
      return false;
    }
    function renderMirror() {
      camera.updateMatrixWorld();
      mirror.copy(camera);
      // (not the names over your friends' heads)
      mirror.layers.disable(1);
      mirror.position.set(camera.position.x, 2 * WATER_Y - camera.position.y, camera.position.z);
      camera.getWorldDirection(_dir);
      _tgt.copy(camera.position).add(_dir); _tgt.y = 2 * WATER_Y - _tgt.y;
      mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion); mirror.up.y = -mirror.up.y;
      mirror.lookAt(_tgt);
      mirror.updateMatrixWorld();
      mirror.updateProjectionMatrix();
      reflU.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
      // an oblique near plane on the water surface, so nothing below the water shows up in the mirror
      _p.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, WATER_Y, 0)).applyMatrix4(mirror.matrixWorldInverse);
      _v4.set(_p.normal.x, _p.normal.y, _p.normal.z, _p.constant);
      const e = mirror.projectionMatrix.elements;
      _q.set((Math.sign(_v4.x) + e[8]) / e[0], (Math.sign(_v4.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
      _v4.multiplyScalar(2 / _v4.dot(_q));
      e[2] = _v4.x; e[6] = _v4.y; e[10] = _v4.z + 1; e[14] = _v4.w;
      const sp = sky.position.clone(), sh = renderer.shadowMap.autoUpdate;
      water.visible = false; sky.position.copy(mirror.position); renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(refl); renderer.render(scene, mirror);
      water.visible = true; sky.position.copy(sp); renderer.shadowMap.autoUpdate = sh;
    }

    /* the street round the camera, for the reflections in the cars (CAR_PROBE): a small cube map, one side of it drawn a
       frame (every other frame at the middle setting) into the copy the cars are not reading from, and swapped in when
       all six sides are done. It sees 200 m out (the haze takes over beyond), without your own car or yourself, and the
       shadows are not drawn again for it. The sky dome is shrunk inside that range while it looks */
    const PROBE_SIZE = 256, probeRT = [0, 1].map(() => {
      const t = new THREE.WebGLCubeRenderTarget(PROBE_SIZE, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      t.texture.encoding = THREE.sRGBEncoding;
      return t;
    });
    const probeCam = new THREE.CubeCamera(0.3, 200, probeRT[0]), probeLast = new THREE.Vector3(1e9, 0, 0);
    let probeFace = 0, probeRead = 0, probeSkip = 0;
    CAR_PROBE.uProbeMip.value = Math.log2(PROBE_SIZE);
    function renderProbe() {
      const write = probeRT[1 - probeRead], at = camTarget;
      // moved far since the last side (into a car across the map, a teleport): start again, and show none until done
      if (probeLast.distanceToSquared(at) > 40 * 40) { probeFace = 0; CAR_PROBE.uProbeOn.value = 0; }
      probeLast.copy(at);
      probeCam.position.copy(at);
      probeCam.updateMatrixWorld();
      const car = driving || (policeStop && policeStop.riding ? policeStop.car : null) || MP.ride, hide = [player.model.group, car && car.group].filter((o) => o && o.visible);
      for (const o of hide) o.visible = false;
      const sp = sky.position.clone(), sh = renderer.shadowMap.autoUpdate;
      sky.position.copy(at); sky.scale.setScalar(0.12); renderer.shadowMap.autoUpdate = false;
      write.texture.generateMipmaps = probeFace === 5;
      renderer.setRenderTarget(write, probeFace);
      renderer.render(scene, probeCam.children[probeFace]);
      sky.position.copy(sp); sky.scale.setScalar(1); renderer.shadowMap.autoUpdate = sh;
      for (const o of hide) o.visible = true;
      if (++probeFace === 6) {
        probeFace = 0; probeRead = 1 - probeRead;
        CAR_PROBE.tProbe.value = write.texture; CAR_PROBE.uProbePos.value.copy(at); CAR_PROBE.uProbeOn.value = 1;
      }
    }

    let level = isTouch ? 1 : 2, W = 0, H = 0;
    const stats = { calls: 0, triangles: 0, mirror: false };
    let aoOn = true;
    const size = new THREE.Vector2();
    function resize() {
      renderer.getDrawingBufferSize(size);
      if (size.x === W && size.y === H) return;
      W = size.x; H = size.y;
      main.setSize(W, H);
      const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
      aoA.setSize(hw, hh); aoB.setSize(hw, hh);
      lvDown.forEach((t, i) => t.setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1))));
      lvUp.forEach((t, i) => t.setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1))));
      refl.setSize(Math.max(1, Math.round(W * 0.38)), Math.max(1, Math.round(H * 0.38)));
    }
    function render() {
      if (level === 0) {
        reflU.uReflOn.value = 0; CAR_PROBE.uProbeOn.value = 0; probeLast.set(1e9, 0, 0);
        renderer.setRenderTarget(null); renderer.render(scene, camera); return;
      }
      resize();
      if (level >= 2 || (probeSkip ^= 1)) renderProbe();
      const mirrored = level >= 2 && waterInView();
      reflU.uReflOn.value = mirrored ? 1 : 0;
      if (mirrored) renderMirror();
      renderer.setRenderTarget(main); renderer.render(scene, camera);
      stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles; stats.mirror = mirrored;
      const ao = level >= 2 && depthOk && aoOn;
      if (ao) {
        aoU.uNear.value = camera.near; aoU.uFar.value = camera.far;
        const ty = Math.tan((camera.fov * Math.PI) / 360);
        aoU.uTan.value.set(ty * camera.aspect, ty);
        aoU.uProj.value.copy(camera.projectionMatrix);
        aoU.uRes.value.set(W, H); aoU.uSeed.value = (aoU.uSeed.value + 1.37) % 100;
        draw(aoMat, aoA);
        aoBlurU.tAO.value = aoA.texture; aoBlurU.uRes.value.set(aoA.width, aoA.height);
        draw(aoBlur, aoB);
      }
      bloomPre.uniforms.tSrc.value = main.texture; bloomPre.uniforms.uPx.value.set(0.5 / W, 0.5 / H);
      draw(bloomPre, lvDown[0]);
      for (let i = 1; i < lvDown.length; i++) {
        down.uniforms.tSrc.value = lvDown[i - 1].texture; down.uniforms.uPx.value.set(0.5 / lvDown[i - 1].width, 0.5 / lvDown[i - 1].height);
        draw(down, lvDown[i]);
      }
      for (let i = lvUp.length - 1; i >= 0; i--) {
        const src = i === lvUp.length - 1 ? lvDown[i + 1] : lvUp[i + 1];
        up.uniforms.tSrc.value = src.texture; up.uniforms.tAdd.value = lvDown[i].texture; up.uniforms.uPx.value.set(0.5 / src.width, 0.5 / src.height);
        draw(up, lvUp[i]);
      }
      finU.uPx.value.set(1 / W, 1 / H); finU.uAO.value = ao ? 0.85 : 0; finU.uTime.value = (finU.uTime.value + 0.618) % 50; finU.uAspect.value = W / H;
      draw(finMat, null);
    }
    const NAMES = ['Enkel grafik', 'Mellangrafik: bloom, färgkorrigering och speglingar i bilarna', 'Högsta grafik: speglingar i vattnet och bilarna, skuggning och bloom'];
    return {
      render,
      get level() { return level; },
      setLevel(l, quiet) {
        level = clamp(l, 0, 2);
        sun.shadow.mapSize.setScalar(level >= 2 && renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        if (!quiet) toast(NAMES[level] + ' (Q byter).');
      },
      cycle() { this.setLevel((level + 2) % 3); },
      waterInView, stats,
      set ao(v) { aoOn = !!v; }, set showAO(v) { finU.uShowAO.value = v ? 1 : 0; }
    };
  })();
  POST.setLevel(POST.level, true);
