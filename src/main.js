'use strict';

  /* ================= loop ================= */
  function tick(dt) {
    const inp = readInput();
    if (!paused()) {
      for (const c of cars) c.input = c === driving ? inp : c.water ? WATER.think(c, dt) : c.bot ? (c.police ? policeThink(c, dt) : botThink(c, dt)) : null;
      for (const p of persons) if (p !== player && !p.asleep && !p.remote) p.intent = npcThink(p, dt);
      MP.update(dt);
      FLY.update(dt, inp);
      const pIntent = custodyIntent(dt) || playerIntent(inp);
      const steps = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < steps; i++) physicsStep(dt / steps, pIntent);
      jumpQueued = false;
      manageTraffic(dt);
      policeUpdate(dt);
      WATER.update(dt);
      updateHeli(dt);
      updateSurprises(dt);
      JOBS.update(dt);
      WORKSHOP.update();
      GARAGE.update();
      STATION.update(dt, player.x, player.z);
      nearCar = findNearCar();
      animate(dt);
      CHUTE.update(dt, inp);
      METRO.update(dt);
      RIDES.update(dt);
      VENDORS.update(dt);
      SPLASH.update(dt);
      WEATHER.update(dt);
      DAYNIGHT.update(dt);
      PROGRESS.update(dt);
      DAILY.update(dt);
    }
    PARTY.update();
    FLY.hud();
    updateCamera(dt);
    updateHUD(dt);
    drawMap();
    if (bigmap.open && performance.now() - bigmap.drawn > 250) drawBigmap();
    updateAudio(dt);
  }
  // dynamic resolution: render fewer pixels when the frame rate drops, and creep back up when there is room
  let dpr = MAX_DPR, perfSum = 0, perfN = 0, holdUp = 0, autoLevel = null, levelWait = 0;
  function adaptQuality(raw) {
    perfSum += Math.min(raw, 0.1); perfN++;
    if (perfSum < 2) return;
    const avg = perfSum / perfN, minDpr = POST.level === 0 ? 0.55 : 0.7;
    perfSum = 0; perfN = 0; holdUp -= 2; levelWait -= 2;
    let next = dpr;
    // still too slow at the lowest resolution: the graphics quality goes down a step at a time, a few seconds apart, all
    // the way to the simplest (but not once you have chosen it yourself with Q), and then the resolution a little further
    const ours = autoLevel === null || autoLevel === POST.level;
    if (avg > 1 / 32 && dpr <= 0.7 && POST.level > 0 && ours && levelWait <= 0) { POST.setLevel(POST.level - 1); autoLevel = POST.level; levelWait = 6; holdUp = 20; }
    else if (avg > 1 / 40 && dpr > minDpr) { next = Math.max(minDpr, dpr - 0.2); holdUp = 20; }
    else if (avg < 1 / 55 && dpr < MAX_DPR && holdUp <= 0) next = Math.min(MAX_DPR, dpr + 0.1);
    if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); renderer.setSize(window.innerWidth, window.innerHeight); }
  }
  // a browser that doesn't use the graphics card (hardware acceleration switched off) draws everything on the processor,
  // and then nothing runs smoothly: the start sign says so, and how to switch it on
  {
    let soft = false;
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
    } catch { /* can't tell: say nothing */ }
    $('slowGpu').hidden = !soft;
  }
  let last = performance.now(), testHold = false;
  function frame(now) {
    if (testHold) { requestAnimationFrame(frame); return; }
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw);
    last = now;
    adaptQuality(raw);
    tick(dt);
    POST.render();
    requestAnimationFrame(frame);
  }

  // test hooks: step the simulation without relying on animation frames
  window.gubbeTest = {
    run(seconds, dt = 1 / 60, draw = true) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) tick(dt); if (draw) POST.render(); return this.state(); },
    key(code, down) { keys[code] = down; },
    press(code) { keys[code] = true; onKey(code, false); keys[code] = false; },
    start() { startGame(); },
    teleport(x, z, y = 0) { player.x = x; player.z = z; player.y = y; camTarget.set(x, y + 1.6, z); },
    draken: DRAKEN, indoorSpan, lift: LIFT,
    // park one car of each model in a row (facing +x) and photograph them with a fixed camera
    showroom(ids, x, z, gap) {
      return ids.map((id, i) => {
        const M = MODEL[id], c = makeCar(M, M.colors[0]);
        c.x = x; c.z = z + i * gap; c.h = Math.PI / 2;
        for (const m of c.calipers) m.visible = true;
        c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.h;
        return { id, z: c.z, tris: c.geo.body.attributes.position.count / 3 + c.geo.glass.attributes.position.count / 3, wheel: wheelGeometry(M.R, M.rim).attributes.position.count / 3 };
      });
    },
    // stop the frame loop and draw what the game camera sees now (for screenshots), or let it run again
    hold(on) { testHold = !!on; if (on) POST.render(); },
    shot(cx, cy, cz, tx, ty, tz) { testHold = true; camera.position.set(cx, cy, cz); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(); sky.position.copy(camera.position); POST.render(); },
    quality(l) { POST.setLevel(l, true); }, get post() { return POST; }, jobs: JOBS, vendors: VENDORS, splash: SPLASH, workshop: WORKSHOP, garage: GARAGE, weather: WEATHER, daynight: DAYNIGHT, progress: PROGRESS, daily: DAILY,
    look(yaw, pitch) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; lastLook = performance.now(); },
    choose(id) { chooseModel(MODEL[id]); },
    openPicker, closePicker, crash, limitAt, startChase, endChase, openBigmap, closeBigmap, drawBigmap, bigmap, carShape, MODELS,
    info() {
      const r = renderer.info;
      return { calls: POST.level ? POST.stats.calls : r.render.calls, triangles: POST.level ? POST.stats.triangles : r.render.triangles, mirror: POST.stats.mirror, geometries: r.memory.geometries, programs: r.programs ? r.programs.length : 0, chunks: chunks.size, buildings: mapPolys.length, lamps: lamps.length, trees: lindens.length + cherries.length, loadMs: Math.round(loadMs) };
    },
    // landmarks that stand on a street or its pavement
    mapProblems() {
      const out = [];
      for (const L of landmarkList) for (const e of edges) {
        const A = nodes[e.a], B = nodes[e.b], d = segPolyDist(A.x, A.z, B.x, B.z, L.poly);
        if (d < e.hw + Math.min(e.walk, 1.5)) out.push(`${L.name || 'landmark at ' + centroid(L.poly).map(Math.round)} vs ${e.name}: ${d.toFixed(1)} m`);
      }
      return out;
    },
    // renders one second of an engine sound offline and measures it: loudness, peak, brightness, fundamental
    engineSample(key, rpm, load) {
      const ctx = new window.OfflineAudioContext(1, 44100, 44100), sr = 44100;
      const noise = ctx.createBuffer(1, sr * 2, sr), nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const v = makeEngineVoice(ctx, ctx.destination, noise), M = MODELS.find((m) => m.eng === key);
      setProfile(v, key);
      v.prevLoad = load;
      v.boost = load;
      driveVoice(v, { M, rpm, load, dead: false, limiter: false }, 1, 0, 0);
      return ctx.startRendering().then((buf) => {
        const d = buf.getChannelData(0).subarray(22050 - 4096, 22050);
        let sum = 0, peak = 0;
        for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
        let num = 0, den = 0, best = 0, bestF = 0;
        for (let k = 1; k < 400; k++) {
          let re = 0, im = 0;
          for (let i = 0; i < d.length; i++) { const a = (2 * Math.PI * k * i) / d.length; re += d[i] * Math.cos(a); im -= d[i] * Math.sin(a); }
          const m = Math.hypot(re, im), f = (k * sr) / d.length;
          num += f * m; den += m;
          if (m > best) { best = m; bestF = f; }
        }
        return { rms: +Math.sqrt(sum / d.length).toFixed(4), peak: +peak.toFixed(3), centroid: Math.round(num / den), strongest: Math.round(bestF), firing: Math.round((rpm / 60) * (ENGINE_SOUNDS[key].cyl / 2)) };
      });
    },
    mp: MP, get cars() { return cars; }, boatFits, findBerth, blockedAt: (x, z, r) => blockedAt(x, z, r), obstaclesNear(x, z, r) { const out = []; forNear(x - r, z - r, x + r, z + r, (o) => out.push({ ...o })); return out; }, distTo, get persons() { return persons; }, get player() { return player; }, get driving() { return driving; },
    get wanted() { return wanted; }, get heli() { return heli; }, updateStars, get fines() { return fines; }, get audio() { return audio; }, get stop() { return policeStop; }, footCops, STATION, useKey, walkWaypoint, walkLine, landmarkList, mapSquares, mapGreens, signTicket, beginStop, setCall, resyncBot, get horses() { return horses; }, fireworks(s) { fireworksT = s; },
    nodes, edges, walkable, fitsM, MODEL, driveAccel, limitAt, bridgeTrims, nearestEdgeAt(x, z) { const ne = nearestEdge(x, z); return ne.e && ne.d < ne.e.hw + ne.e.walk + 2 ? ne.e : null; },
    state() {
      const bad = [];
      for (const c of cars) { if (!isFinite(c.x + c.z + c.h + c.vx + c.vz)) bad.push('nan-car'); else if (!c.remote && !(c.M.boat ? boatFits(c.M, c.x, c.z, c.h) : fitsM(c.M, c.x, c.z, c.h))) bad.push('car-off ' + c.M.id + ' ' + c.x.toFixed(1) + ',' + c.z.toFixed(1)); }
      for (const p of persons) { if (!isFinite(p.x + p.z + p.y)) bad.push('nan-person'); else if (!p.remote && !walkable(p.x, p.z) && !(p === player && (driving || MP.ride) && (driving || MP.ride).M.boat) && !(p === player && policeStop && policeStop.phase === 'water') && !(p === player && (FLY.on || CHUTE.on || RIDES.on))) bad.push('person-off ' + p.x.toFixed(1) + ',' + p.z.toFixed(1)); }
      const bots = cars.filter((c) => c.bot);
      return {
        player: { x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2) },
        driving: driving ? driving.M.id : null, near: nearCar ? (nearCar.bot ? 'bot ' : '') + nearCar.M.id : null,
        kmh: driving ? Math.round(Math.hypot(driving.vx, driving.vz) * 3.6) : 0,
        cars: cars.length, bots: bots.length, movingBots: bots.filter((c) => Math.hypot(c.vx, c.vz) > 2).length,
        stuckBots: bots.filter((c) => c.bot.stuckTotal > 4).length, persons: persons.length, bad,
        street: el.locStreet.textContent, district: el.locDistrict.textContent, prompt: el.prompt.hidden ? '' : el.promptText.textContent,
        gear: driving ? el.gear.textContent : null, rpm: driving ? Math.round(driving.rpm) : 0, auto: driving ? driving.auto : null,
        health: driving ? Math.round(driving.health) : null, wanted: wanted ? [...wanted.kinds].join(',') : null, fines,
        police: cars.filter((c) => c.police).map((c) => c.police.state + (c.siren ? '+siren' : '')).join(' '),
        toast: el.toast.hidden ? '' : el.toast.textContent
      };
    }
  };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ p: { x: player.x, y: player.y, z: player.z, rot: player.rot }, started, muted }));
  function boot(data) {
    data = data || {};
    if (data.p && personFits(data.p.x, data.p.z)) { player.x = data.p.x; player.z = data.p.z; player.y = data.p.y || 0; player.rot = data.p.rot || 0; }
    if (data.muted) toggleMute();
    if (data.started) {
      started = true;
      el.start.hidden = true;
      document.body.classList.add('playing');
      setTouchMode(isTouch);
      camYaw = player.rot;
    }
    camTarget.set(player.x, player.y + 1.6, player.z);
    sizeMap();
    last = performance.now();
    requestAnimationFrame(frame);
  }
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});
