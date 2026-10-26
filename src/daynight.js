'use strict';

  /* ================= day and night ================= */
  // A day in the game takes twenty minutes. The sun rises at five in the north-east, stands highest at one in the south
  // and sets at nine in the north-west, as on a Swedish summer day; you start at ten, where it always stood before. As it
  // goes down the sky turns orange and then dark, with stars and a moon whose faint light is the sun's light moved. The
  // street lamps and the windows light up, and cars drive with their headlights on, lighting the road ahead. O winds the
  // clock on an hour. With friends, the one who has the room keeps the time for everyone (MP's 'time' event).
  const DAYNIGHT = (() => {
    const DAY_S = 1200, START = 10, RISE = 5, SET = 21, NOON = 13, NIGHT_DIP = 0.5;
    // the sun's path is drawn through where it stood before (SUN_DIR) at the start
    const AZ = (Math.atan2(SUN_DIR.x, SUN_DIR.z) * (NOON - RISE)) / (NOON - START), EL = Math.asin(SUN_DIR.y) / Math.sin((Math.PI * (START - RISE)) / (SET - RISE));
    let hour = START, baked = START, bakedSky = 0, sendT = 0, shownMin = -1;
    const sv = new THREE.Vector3(), mv = new THREE.Vector3(), lv = new THREE.Vector3();
    // where the sun is at an hour: azimuth from the south towards the east, and height
    function sunAt(h, out) {
      h = ((h % 24) + 24) % 24;
      let az, el;
      if (h >= RISE && h <= SET) { az = (AZ * (NOON - h)) / (NOON - RISE); el = EL * Math.sin((Math.PI * (h - RISE)) / (SET - RISE)); }
      else {
        const f = (((h - SET) % 24) + 24) % 24 / (24 - SET + RISE);
        az = -AZ - (2 * Math.PI - 2 * AZ) * f; el = -NIGHT_DIP * Math.sin(Math.PI * f);
      }
      return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    }

    /* ---------- the colours of the day, the sunset and the night ---------- */
    const col = (hx) => new THREE.Color(hx);
    const KEYS = {
      day: {
        zen: [0.075, 0.24, 0.62], hor: [0.55, 0.68, 0.82], glow: [1.0, 0.82, 0.58], sunVis: 1, cloud: [1, 1, 1], cloudGlow: 1, ground: 1, haze: [HAZE[0], HAZE[1], HAZE[2]],
        sky: col(0xdcecff), gnd: col(0x8a8172), hemi: 0.3, exposure: 1
      },
      sunset: {
        zen: [0.1, 0.15, 0.36], hor: [1.0, 0.52, 0.27], glow: [1.8, 0.75, 0.3], sunVis: 1, cloud: [0.95, 0.6, 0.5], cloudGlow: 1.6, ground: 0.6, haze: [0.86, 0.63, 0.5],
        sky: col(0xffc4a0), gnd: col(0x6a5548), hemi: 0.26, exposure: 1.05
      },
      night: {
        zen: [0.004, 0.008, 0.03], hor: [0.03, 0.045, 0.085], glow: [0, 0, 0], sunVis: 0, cloud: [0.07, 0.08, 0.11], cloudGlow: 0, ground: 0.1, haze: [0.045, 0.06, 0.1],
        sky: col(0x5868a0), gnd: col(0x1e1c24), hemi: 0.2, exposure: 1.2
      }
    };
    const SUN_DAY = col(0xffeccc), SUN_LOW = col(0xff9050), MOON = col(0x9fb4ff);
    const mixA = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    // the sky's uniforms on the dome and on the copy that lights everything
    const skies = [sky.material.uniforms, envSky.material.uniforms];
    const setV = (key, a) => { for (const u of skies) u[key].value.set(a[0], a[1], a[2]); };
    const setF = (key, v) => { for (const u of skies) u[key].value = v; };

    /* ---------- lamps and windows ---------- */
    // the lamps' diffusers glow (picked out by height in the lamp's own frame), and each lamp throws a pool of warm light
    // on the ground under it
    const lampU = { value: 0 };
    lampMat.onBeforeCompile = (sh) => {
      sh.uniforms.uLamp = lampU;
      sh.vertexShader = 'varying float vDiff;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvDiff = step(5.79, position.y) * step(position.y, 5.80) * step(1.1, position.z);');
      sh.fragmentShader = 'uniform float uLamp;\nvarying float vDiff;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vec3(1.0, 0.82, 0.55) * uLamp * vDiff;');
    };
    lampMat.customProgramCacheKey = () => 'lamp';
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc98a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const poolGeo = new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2).translate(0, 0.06, 1.4);
    poolGeo.computeBoundingSphere();
    const pools = instancedByArea(poolGeo, poolMat, lamps, (o, l) => { o.position.set(l.x, 0, l.z); o.rotation.y = l.rot; }, false);
    for (const p of pools) { p.visible = false; p.receiveShadow = false; }
    // lit windows: the same atlases as the facades (src/core.js), with light where the glass is; which windows are lit is
    // picked in the shader per window and per house, and fewer are lit late at night
    const TONES = ['#ffd38a', '#ffe7b8', '#ffc56e', '#fff0d0', '#c9dcff', '#ffb35c', '#ffe0a0', '#fff6e6'];
    const facadeLit = canvasTex(512, 512, (g, w) => {
      const s = w / 4;
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      FACADE_CELLS.forEach((cell, i) => {
        const x0 = (i % 4) * s, y0 = Math.floor(i / 4) * s, fx = x0 + s * 0.28, fy = y0 + s * 0.14, fw = s * 0.44, fh = s * 0.63;
        const gx = fx + 4, gy = fy + 4, gw = fw - 8, gh = fh - 8, gr = g.createLinearGradient(0, gy, 0, gy + gh);
        gr.addColorStop(0, '#5a4630'); gr.addColorStop(0.35, TONES[i % TONES.length]); gr.addColorStop(1, TONES[(i * 3) % TONES.length]);
        g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
        if (cell.kind === 'curtain') { g.fillStyle = cell.curtain; g.globalAlpha = 0.75; g.fillRect(gx, gy, gw * 0.24, gh); g.fillRect(gx + gw * 0.76, gy, gw * 0.24, gh); g.globalAlpha = 1; }
        else if (cell.kind === 'blind') { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(gx, gy, gw, gh * cell.blind); }
        else if (cell.kind === 'plant') { g.fillStyle = '#000'; g.beginPath(); g.arc(gx + gw * 0.3, gy + gh * 0.82, gw * 0.18, 0, TAU); g.fill(); }
        g.fillStyle = '#000'; g.fillRect(fx + fw / 2 - 2, gy, 4, gh); g.fillRect(gx, fy + fh * 0.34, gw, 4);
      });
    }, true);
    const modernLit = canvasTex(512, 512, (g, w) => {
      const s = w / 4;
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      MODERN_CELLS.forEach((cell, i) => {
        const x0 = (i % 4) * s, y0 = Math.floor(i / 4) * s, top = s * (1 - (cell.curtain ? 0.12 : 0.36));
        g.fillStyle = i % 3 ? '#e4ecff' : '#fff1d2'; g.fillRect(x0, y0, s, top);
        if (cell.blind) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x0, y0, s, top * cell.blind); }
        g.fillStyle = '#000'; g.fillRect(x0, y0, 4, s); g.fillRect(x0 + s / 2 - 1, y0, 2, top);
      });
    }, true);
    facadeLit.repeat.set(0.25, 0.25); modernLit.repeat.set(0.25, 0.25);
    const winShare = { value: 0 };
    for (const [m, map] of [[facadeMat, facadeLit], [modernMat, modernLit]]) {
      m.emissiveMap = map; m.emissive.setRGB(0, 0, 0);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uWinShare = winShare;
        sh.vertexShader = 'varying vec3 vWinPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWinPos = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = 'uniform float uWinShare;\nvarying vec3 vWinPos;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          '\tvec2 wc = floor(vUv * 4.0) + floor(vWinPos.xz / 19.0) * vec2(7.13, 3.71) + floor(vWinPos.y / 40.0);',
          '\ttotalEmissiveRadiance *= step(fract(sin(dot(wc, vec2(12.9898, 78.233))) * 43758.5453), uWinShare);'
        ].join('\n'));
      };
      m.customProgramCacheKey = () => 'windows';
    }

    /* ---------- headlights on the road ---------- */
    const beamTex = canvasTex(64, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,238,205,0.95)'); gr.addColorStop(0.35, 'rgba(255,232,195,0.45)'); gr.addColorStop(1, 'rgba(255,228,190,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // (soft at the sides)
      g.globalCompositeOperation = 'destination-in';
      const sd = g.createLinearGradient(0, 0, w, 0);
      sd.addColorStop(0, 'rgba(0,0,0,0)'); sd.addColorStop(0.3, 'rgba(0,0,0,1)'); sd.addColorStop(0.7, 'rgba(0,0,0,1)'); sd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sd; g.fillRect(0, 0, w, h);
    });
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const beamGeos = new Map();
    function beamOf(c) {
      if (c.beam) return c.beam;
      const M = c.M;
      if (!beamGeos.has(M.id)) beamGeos.set(M.id, new THREE.PlaneGeometry(M.W * 1.6, 11).rotateX(-Math.PI / 2).translate(0, 0.07, M.L / 2 + 5.3));
      c.beam = new THREE.Mesh(beamGeos.get(M.id), beamMat);
      c.beam.renderOrder = 1;
      c.group.add(c.beam);
      return c.beam;
    }

    /* ---------- every frame ---------- */
    // lights: how far the lamps, the windows and the headlights are on (0 by day, 1 at night)
    let L = 0, headK = HEAD_GLOW, parkedK = HEAD_GLOW, tailK = 1;
    const k3 = { sky: new THREE.Color(), gnd: new THREE.Color() };
    function apply() {
      sunAt(hour, sv);
      const s = sv.y;
      // the colours: between the day and the sunset, or the sunset and the night
      const hi = s >= 0.04, A = hi ? KEYS.sunset : KEYS.night, B = hi ? KEYS.day : KEYS.sunset, k = hi ? smooth(0.04, 0.35, s) : smooth(-0.16, 0.04, s);
      setV('uZen', mixA(A.zen, B.zen, k)); setV('uHor', mixA(A.hor, B.hor, k)); setV('uGlow', mixA(A.glow, B.glow, k)); setV('uCloud', mixA(A.cloud, B.cloud, k));
      setF('uSunVis', lerp(A.sunVis, B.sunVis, k)); setF('uCloudGlow', lerp(A.cloudGlow, B.cloudGlow, k)); setF('uGround', lerp(A.ground, B.ground, k));
      const haze = mixA(A.haze, B.haze, k);
      scene.fog.color.setRGB(haze[0], haze[1], haze[2]); scene.background.setRGB(haze[0], haze[1], haze[2]);
      sky.material.uniforms.haze.value.set(haze[0], haze[1], haze[2]);
      if (FAR.length) FAR[0].haze.setRGB(haze[0], haze[1], haze[2]).convertSRGBToLinear();
      hemi.color.lerpColors(A.sky, B.sky, k); hemi.groundColor.lerpColors(A.gnd, B.gnd, k); hemi.intensity = lerp(A.hemi, B.hemi, k);
      renderer.toneMappingExposure = lerp(A.exposure, B.exposure, k);
      // the sky's sun is the real one; the light is the sun while it is up and the moon (high in the south) after
      SUN_DIR.copy(sv);
      mv.set(-sv.x, 0.75, -sv.z).normalize();
      const night = 1 - smooth(-0.16, -0.02, s);
      setF('uNight', night);
      for (const u of skies) u.uMoonDir.value.copy(mv);
      if (s > -0.005) {
        lv.copy(sv); sun.intensity = 1.6 * Math.pow(clamp((s + 0.005) / 0.25, 0, 1), 0.6);
        sun.color.lerpColors(SUN_LOW, SUN_DAY, smooth(0.02, 0.4, s));
      } else { lv.copy(mv); sun.intensity = 0.32 * clamp((-s - 0.01) / 0.12, 0, 1); sun.color.copy(MOON); }
      SUN_OFF.copy(lv).multiplyScalar(157);
      // the lights in town
      L = 1 - smooth(-0.06, 0.1, s);
      lampU.value = L * 3.2;
      poolMat.opacity = L * 0.8;
      // (fewer windows are lit after midnight, and more again towards the morning)
      const since = (((hour - 18) % 24) + 24) % 24;
      winShare.value = 0.55 - 0.3 * smooth(5, 9.5, since) + 0.1 * smooth(10, 12, since);
      for (const m of [facadeMat, modernMat]) m.emissive.setRGB(L * 1.1, L * 1.1, L * 1.1);
      headK = lerp(HEAD_GLOW, 2.6, L); parkedK = lerp(HEAD_GLOW, 0.12, L); tailK = 1 + 1.6 * L;
      beamMat.opacity = L * 0.5;
      // and the clouds, the rain and the snow over it all
      WEATHER.tint();
    }
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    function update(dt) {
      hour = (hour + (dt * 24) / DAY_S) % 24;
      apply();
      // the light everything gets from the sky, baked again as the sky changes
      if (Math.abs(((hour - baked + 36) % 24) - 12) >= 0.25 || Math.abs(WEATHER.overcast - bakedSky) > 0.1) { baked = hour; bakedSky = WEATHER.overcast; bakeEnv(); }
      // the pools of lamplight near you (further off they are lost in the dark anyway)
      for (const p of pools) { const c = p.geometry.boundingSphere.center; p.visible = L > 0.01 && Math.abs(c.x - camera.position.x) + Math.abs(c.z - camera.position.z) < 520; }
      // the headlights on the road, for every car with someone in it
      for (const c of cars) {
        const on = L > 0.02 && !c.dead && !c.M.boat && (c === driving || !!c.occupant || !!c.bot) && c.group.visible;
        if (on) beamOf(c).visible = true;
        else if (c.beam) c.beam.visible = false;
      }
      // with friends, the one who has the room sends the time now and then
      if (MP.inRoom && MP.host && (sendT -= dt) <= 0) { sendT = 5; MP.event('time', { h: Math.round(hour * 1000) / 1000 }); }
      clockHud();
    }
    // the time on the street sign at the top
    const E = { time: $('locTime') };
    function clockHud() {
      const m = Math.floor(hour * 60);
      if (m === shownMin) return;
      shownMin = m;
      E.time.textContent = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }
    function set(h) {
      if (typeof h !== 'number' || !isFinite(h)) return;
      hour = ((h % 24) + 24) % 24;
      apply();
      baked = hour; bakeEnv();
      clockHud();
    }
    apply();
    clockHud();

    return {
      update, set,
      get hour() { return hour; }, get lights() { return L; }, get head() { return headK; }, get parked() { return parkedK; }, get tail() { return tailK; },
      // O: an hour on (with friends, only the one who has the room)
      // when the game starts: not always ten in the morning, often the evening or the night
      surprise() {
        const r = Math.random();
        set(r < 0.35 ? 9 + Math.random() * 8 : r < 0.5 ? 5.5 + Math.random() * 3 : r < 0.7 ? 19 + Math.random() * 2.5 : 22 + Math.random() * 6);
      },
      key() {
        if (MP.inRoom && !MP.host) { toast('Det är den som har rummet som bestämmer tiden.'); return; }
        set(hour + 1);
        sendT = 0;
        const h = Math.floor(hour);
        toast('Klockan är ' + String(h).padStart(2, '0') + ':' + String(Math.floor((hour - h) * 60)).padStart(2, '0') + '.' + (L > 0.5 ? ' Det är natt.' : ''));
      },
      // the time from the one who has the room (MP's 'time' event, and when you join)
      heard(fromHost, h) {
        if (!fromHost || typeof h !== 'number' || !isFinite(h)) return;
        // (a jump: straight there; a little out: halfway, so the clocks don't drift apart)
        const d = ((h - hour + 36) % 24) - 12;
        if (Math.abs(d) > 0.05) set(h); else hour = (hour + d * 0.5 + 24) % 24;
      },
      // for the tests
      debug: { sunAt, get pools() { return pools; }, KEYS, lampU, winShare }
    };
  })();
