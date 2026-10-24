'use strict';

  /* ================= weather ================= */
  // Most of the time the sun shines, but now and then it rains (or, in the winter months, snows) for a few minutes. Rain
  // greys the sky and brings the clouds and the fog in, the streets get wet and shine, cars hold the road less well, a
  // car's windscreen gets drops that the wipers sweep off, and in a heavy shower it thunders. Snow whitens the roofs,
  // the parks and the trees, turns the roads to slush, and makes them slippery. U changes the weather. With friends, the
  // one who has the room decides it (MP's 'weather' event). DAYNIGHT mixes the grey into its sky and light (tint).
  const WEATHER = (() => {
    const CLEAR = 0, RAIN = 1, SNOW = 2, NAMES = ['sol', 'regn', 'snö'];
    // (its own dice for the drops and flakes, so the traffic's Math.random draws come out as before)
    let seed = 7;
    const wrand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // kind: what is coming or falling (falls: what fell last, while it eases off); amount: how hard (eases to 1 or 0);
    // wet: the streets; cover: the snow lying
    let kind = CLEAR, falls = RAIN, amount = 0, wet = 0, cover = 0, nextT = 360 + wrand() * 480, flash = 0, thunderT = 30, sendT = 0;
    const winter = () => [10, 11, 0, 1, 2].includes(new Date().getMonth());

    /* ---------- wet streets and white roofs, in the ground's, the roofs' and the trees' shaders ---------- */
    const wetU = { value: 0 }, snowU = { value: 0 };
    // snowK: how white it gets (the roads only turn to slush); wetK: how much it shines when wet
    function weatherShader(mat, snowK, wetK) {
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.uWet = wetU; sh.uniforms.uSnow = snowU;
        sh.fragmentShader = 'uniform float uWet; uniform float uSnow;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          '\tfloat wUp = inverseTransformDirection(normal, viewMatrix).y;',
          '\tfloat snowK = uSnow * ' + snowK.toFixed(2) + ' * smoothstep(0.45, 0.8, wUp), wetK = uWet * ' + wetK.toFixed(2) + ' * (1.0 - snowK);',
          '\tdiffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.35 * wetK), vec3(0.88, 0.9, 0.94), snowK);',
          '\troughnessFactor = mix(mix(roughnessFactor, roughnessFactor * 0.3 + 0.05, wetK), 0.75, snowK);'
        ].join('\n'));
      };
      const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
      mat.customProgramCacheKey = () => key + 'weather' + snowK + wetK;
    }
    for (const k of ['road', 'avenue', 'median', 'junction', 'zebra']) weatherShader(GROUND[k], 0.35, 1);
    for (const k of ['pave', 'cobble', 'slab', 'plaza', 'rail']) weatherShader(GROUND[k], 0.95, 0.8);
    weatherShader(GROUND.grass, 1, 0.3);
    weatherShader(solidMat, 1, 0.6);
    weatherShader(leafMat, 0.7, 0.2);

    /* ---------- rain and snow round the camera ---------- */
    const R = 38, TOP = 28, N_RAIN = 2400, N_SNOW = 2600;
    const rainPos = new Float32Array(N_RAIN * 6), rainSeed = new Float32Array(N_RAIN * 3);
    for (let i = 0; i < N_RAIN; i++) { rainSeed[i * 3] = wrand(); rainSeed[i * 3 + 1] = wrand(); rainSeed[i * 3 + 2] = wrand(); }
    const rainGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0, depthWrite: false });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false; rain.visible = false;
    scene.add(rain);
    const flakeTex = canvasTex(32, 32, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    const snowPos = new Float32Array(N_SNOW * 3), snowSeed = new Float32Array(N_SNOW * 3);
    for (let i = 0; i < N_SNOW; i++) { snowSeed[i * 3] = wrand(); snowSeed[i * 3 + 1] = wrand(); snowSeed[i * 3 + 2] = wrand(); }
    const snowGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const snowMat = new THREE.PointsMaterial({ map: flakeTex, color: 0xffffff, size: 0.22, transparent: true, opacity: 0, depthWrite: false });
    const snow = new THREE.Points(snowGeo, snowMat);
    snow.frustumCulled = false; snow.visible = false;
    scene.add(snow);
    let fallT = 0;
    // every drop and flake has its own place in a box round the camera that wraps round as you move, so the camera is
    // always inside the shower
    function stepFall(dt) {
      fallT += dt;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, wrap = (v, c) => c - R + ((((v - c + R) % (2 * R)) + 2 * R) % (2 * R));
      if (rain.visible) {
        const n = Math.round(N_RAIN * Math.min(1, amount * 1.2));
        for (let i = 0; i < n; i++) {
          const a = rainSeed[i * 3], b = rainSeed[i * 3 + 1], c = rainSeed[i * 3 + 2];
          const x = wrap(a * 2 * R + fallT * 1.5, cx), z = wrap(b * 2 * R + fallT * 0.6, cz), y = cy - 6 + ((((c * TOP - fallT * 17) % TOP) + TOP) % TOP), k = i * 6;
          rainPos[k] = x; rainPos[k + 1] = y; rainPos[k + 2] = z; rainPos[k + 3] = x - 0.06; rainPos[k + 4] = y + 0.75; rainPos[k + 5] = z - 0.03;
        }
        rainGeo.setDrawRange(0, n * 2);
        rainGeo.attributes.position.needsUpdate = true;
      }
      if (snow.visible) {
        const n = Math.round(N_SNOW * Math.min(1, amount * 1.2));
        for (let i = 0; i < n; i++) {
          const a = snowSeed[i * 3], b = snowSeed[i * 3 + 1], c = snowSeed[i * 3 + 2], k = i * 3;
          snowPos[k] = wrap(a * 2 * R + Math.sin(fallT * 0.7 + c * 20) * 0.8 + fallT * 0.5, cx);
          snowPos[k + 1] = cy - 6 + ((((c * TOP - fallT * (0.9 + a * 0.6)) % TOP) + TOP) % TOP);
          snowPos[k + 2] = wrap(b * 2 * R + Math.cos(fallT * 0.6 + a * 20) * 0.8, cz);
        }
        snowGeo.setDrawRange(0, n);
        snowGeo.attributes.position.needsUpdate = true;
      }
    }

    /* ---------- the windscreen: drops, and the wipers sweeping them off ---------- */
    const glass = $('rainScreen'), sg = glass.getContext('2d'), drops = [];
    let wipeT = 0, glassOn = false;
    // the blades' angle at a time: up across from lying under the bottom edge to the right and back in 0.9 s, then a
    // rest of 0.4 s out of sight
    const blade = (t) => { const ph = (((t % 1.3) + 1.3) % 1.3) / 0.9; return ph >= 1 ? 0.02 * Math.PI : Math.PI * (0.02 + 0.84 * (ph < 0.5 ? ph * 2 : 2 - ph * 2)); };
    function stepScreen(dt) {
      const c = driving, on = !!c && kind === RAIN && amount > 0.08 && !c.M.moped && !c.M.boat && !paused() && !WORKSHOP.open;
      if (!on) { if (glassOn) { glassOn = false; glass.hidden = true; drops.length = 0; } return; }
      if (!glassOn) { glassOn = true; glass.hidden = false; }
      const w = Math.round(window.innerWidth / 2), h = Math.round(window.innerHeight / 2);
      if (glass.width !== w || glass.height !== h) { glass.width = w; glass.height = h; }
      // new drops, more the harder it rains (and the faster you drive into it)
      const sp = Math.hypot(c.vx, c.vz), rate = amount * (30 + sp * 1.5);
      for (let n = rate * dt + Math.random(); n >= 1; n--) drops.push({ x: Math.random() * w, y: Math.random() * h * 0.92, r: (1.5 + Math.random() * 4.5) * (w / 640) });
      if (drops.length > 260) drops.splice(0, drops.length - 260);
      // two wipers from pivots under the bottom edge, there and back every 1.3 s; a blade clears what it passes
      wipeT += dt;
      const ph = (wipeT % 1.3) / 0.9, ang = blade(wipeT), prev = blade(wipeT - dt);
      const len = h * 0.95, pivots = [[w * 0.2, h * 1.08], [w * 0.62, h * 1.08]];
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        for (const [px, py] of pivots) {
          const a = Math.PI - Math.atan2(py - d.y, d.x - px), r = Math.hypot(d.x - px, py - d.y);
          if (r < len && a >= Math.min(ang, prev) - 0.04 && a <= Math.max(ang, prev) + 0.04) { drops.splice(i, 1); break; }
        }
      }
      if (Math.abs(ph - 0.5) < dt / 0.9 || Math.abs(ph - 1) < dt / 0.9) thump();
      sg.clearRect(0, 0, w, h);
      for (const d of drops) {
        sg.fillStyle = 'rgba(190,210,230,0.16)'; sg.beginPath(); sg.arc(d.x, d.y, d.r, 0, TAU); sg.fill();
        sg.strokeStyle = 'rgba(255,255,255,0.22)'; sg.lineWidth = 1; sg.beginPath(); sg.arc(d.x, d.y, d.r * 0.8, -2.4, -0.6); sg.stroke();
      }
      sg.strokeStyle = 'rgba(12,12,14,0.6)'; sg.lineCap = 'round'; sg.lineWidth = Math.max(2, w / 240);
      for (const [px, py] of pivots) { sg.beginPath(); sg.moveTo(px, py); sg.lineTo(px - Math.cos(ang) * len, py - Math.sin(ang) * len); sg.stroke(); }
    }

    /* ---------- sound: the rain, the wipers, the thunder ---------- */
    let rainSnd = null;
    function rainSound() {
      if (!audio) return;
      if (!rainSnd) {
        const ctx = audio.ctx, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = audio.noise; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 2600; hp.type = 'highpass'; hp.frequency.value = 350; g.gain.value = 0;
        src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(audio.fx); src.start();
        rainSnd = g;
      }
      const v = muted || kind !== RAIN ? 0 : amount * (driving && !driving.M.moped && !driving.M.boat ? 0.05 : 0.09);
      rainSnd.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.4);
    }
    function thump() { if (audio && !muted) tone(audio.ctx.currentTime, 'sine', 120, 70, 0.07, 0.025); }
    function thunder() {
      flash = 1;
      if (audio && !muted) { const t = audio.ctx.currentTime + 0.8 + Math.random() * 2; noiseBurst(t, 3.2, 0.5, 'lowpass', 140, 0.7, 0, 0.15); noiseBurst(t + 0.1, 1.2, 0.18, 'lowpass', 400, 0.5, 0, 0.02); }
    }

    /* ---------- changing ---------- */
    function start(k, quiet) {
      if (k === kind) return;
      const was = kind;
      kind = k;
      if (k !== CLEAR) falls = k;
      nextT = k === CLEAR ? 360 + Math.random() * 480 : 180 + Math.random() * 180;
      if (quiet) return;
      if (k === RAIN) toast('Det börjar regna. Gatorna blir blöta och hala.');
      else if (k === SNOW) toast('Det börjar snöa! Det blir halt på vägarna.');
      else toast(was === SNOW ? 'Det har slutat snöa.' : 'Regnet har slutat.');
    }

    /* ---------- every frame ---------- */
    function update(dt) {
      // now and then it changes by itself (with friends, only for the one who has the room)
      if (!(MP.inRoom && !MP.host) && (nextT -= dt) <= 0) start(kind === CLEAR ? (winter() ? SNOW : RAIN) : CLEAR);
      amount = clamp(amount + (kind === CLEAR ? -dt : dt) / 20, 0, 1);
      wet = kind === RAIN ? Math.min(1, wet + (amount * dt) / 25) : Math.max(0, wet - dt / 120);
      cover = kind === SNOW ? Math.min(1, cover + (amount * dt) / 40) : Math.max(0, cover - dt / 150);
      wetU.value = wet; snowU.value = cover;
      rain.visible = falls === RAIN && amount > 0.01;
      snow.visible = falls === SNOW && amount > 0.01;
      if (rain.visible || snow.visible) stepFall(dt);
      // (the rain is lit by the day, or faintly by the town at night)
      const lit = clamp(dot3(sky.material.uniforms.uHor.value) * 1.6 + 0.12, 0.15, 1);
      rainMat.color.setRGB(0.67 * lit, 0.71 * lit, 0.75 * lit); rainMat.opacity = 0.45 * amount;
      snowMat.color.setRGB(Math.min(1, lit * 1.1 + 0.15), Math.min(1, lit * 1.1 + 0.15), Math.min(1, lit * 1.15 + 0.18)); snowMat.opacity = 0.9 * amount;
      // thunder in a heavy shower
      flash = Math.max(0, flash - dt * 6);
      if (kind === RAIN && amount > 0.8 && (thunderT -= dt) <= 0) { thunderT = 25 + Math.random() * 50; thunder(); }
      stepScreen(dt);
      rainSound();
      if (MP.inRoom && MP.host && (sendT -= dt) <= 0) { sendT = 10; MP.event('weather', { w: kind }); }
    }
    const dot3 = (v) => v.x * 0.3 + v.y * 0.55 + v.z * 0.15;
    // the grey of the clouds, mixed into the day's or the night's sky and light (DAYNIGHT calls this after its colours)
    const over = new THREE.Vector3();
    function tint() {
      const o = amount, U = [sky.material.uniforms, envSky.material.uniforms];
      if (o > 0) {
        const lum = dot3(U[0].uHor.value), snowy = falls === SNOW ? 1 : 0;
        for (const u of U) {
          over.set(lum * 0.95, lum, lum * 1.05).multiplyScalar(snowy ? 1.15 : 0.85);
          u.uHor.value.lerp(over, o); u.uZen.value.lerp(over.multiplyScalar(0.8), o);
          u.uGlow.value.multiplyScalar(1 - 0.85 * o); u.uSunVis.value *= 1 - o; u.uCloudGlow.value *= 1 - 0.8 * o;
          u.uCloud.value.lerp(over.set(lum, lum * 1.02, lum * 1.06).multiplyScalar(snowy ? 1.3 : 0.9), o * 0.85);
          u.uNight.value *= 1 - o; u.uCover.value = o;
        }
        const f = scene.fog.color, fl = f.r * 0.3 + f.g * 0.55 + f.b * 0.15, g = snowy ? Math.min(1, fl * 1.12) : fl * 0.92;
        f.setRGB(lerp(f.r, g * 0.97, o), lerp(f.g, g, o), lerp(f.b, g * 1.03, o));
        scene.background.copy(f); U[0].haze.value.set(f.r, f.g, f.b);
        if (FAR.length) FAR[0].haze.setRGB(f.r, f.g, f.b).convertSRGBToLinear();
        sun.intensity *= 1 - 0.75 * o;
        hemi.intensity *= 1 + 0.6 * o;
      } else for (const u of U) u.uCover.value = 0;
      scene.fog.far = lerp(1350, falls === SNOW ? 420 : 560, o);
      if (flash > 0) { renderer.toneMappingExposure *= 1 + flash * 2.2; hemi.intensity += flash * 1.5; }
    }
    function set(k) { if (k === CLEAR || k === RAIN || k === SNOW) start(k, false); }

    return {
      update, tint,
      get kind() { return kind; }, get name() { return NAMES[kind]; }, get amount() { return amount; }, get overcast() { return amount; },
      // the road under you: in the wet and on snow you hold it less well and stop later
      get grip() { return (1 - 0.2 * wet) * (1 - 0.45 * cover); }, get brake() { return (1 - 0.15 * wet) * (1 - 0.4 * cover); },
      // U: the next weather (with friends, only the one who has the room)
      key() {
        if (MP.inRoom && !MP.host) { toast('Det är den som har rummet som bestämmer vädret.'); return; }
        start((kind + 1) % 3);
        sendT = 0;
      },
      // the weather from the one who has the room (MP's 'weather' event, and when you join)
      heard(fromHost, w) { if (fromHost && (w === CLEAR || w === RAIN || w === SNOW)) start(w, false); },
      // for the tests
      debug: { set, now(k, a) { kind = k; if (k) falls = k; amount = a; wet = k === RAIN ? a : 0; cover = k === SNOW ? a : 0; nextT = 600; }, get wet() { return wet; }, get cover() { return cover; }, wetU, snowU, rain, snow }
    };
  })();
