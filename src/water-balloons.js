'use strict';

  /* ================= water balloons ================= */
  // Beside every balloon seller stands a bucket of water balloons: E buys five for 25 kr. A click (with the mouse caught
  // in the game), or F on foot, throws one the way you look: from your hand, out of the car window, from the helicopter
  // or from a ride. It bursts on whatever it hits with a splash, and leaves a wet patch where it lands on the ground.
  // Whoever it hits is soaked for a while (dark, shiny clothes that drip): people run off, and a wet police officer or
  // police car starts a chase. Your friends see the balloons you throw, and their own game finds out whether one hit
  // them; then it tells everyone (MP's 'wet' event), and they show up soaked in the state they send (flag 16).
  const SPLASH = (() => {
    const PACK = 5, PACK_PRICE = 25, MAX = 10, SPEED = 16, G = 9.81, COOL = 0.4, SOAK = 25;
    const COLS = [0xe0203a, 0x2f6fdb, 0xf7c600, 0x2fae5a, 0xff6fb0, 0xff8a1f];
    const E = { tag: $('wbTag'), count: $('wbCount'), btn: $('btnThrow'), screen: $('wetScreen') };
    // count: balloons you carry; throwT: seconds since you threw (the arm swings); screenT: water on your screen
    let count = 0, nextCol = 0, coolT = 0, throwT = 9, screenT = 0, near = null, lastCount = -1, splashes = 0, lastSplash = null;
    const r2 = (v) => Math.round(v * 100) / 100;

    /* ---------- the balloon, in flight and in your hand ---------- */
    const balloonGeo = (() => {
      const m = new Merger();
      m.add(new THREE.SphereGeometry(0.1, 12, 9).scale(1, 1.15, 1), 0xffffff, 0, 0, 0);
      m.add(new THREE.ConeGeometry(0.025, 0.05, 6), 0xffffff, 0, -0.125, 0, Math.PI, 0, 0);
      return m.build();
    })();
    const mats = COLS.map((c) => std({ color: c, vertexColors: true, roughness: 0.25, metalness: 0.05 }));
    const hand = new THREE.Mesh(balloonGeo, mats[0]);
    hand.position.set(0, -0.68, 0.05); hand.visible = false;
    player.model.armR.add(hand);

    /* ---------- the bucket beside each balloon seller ---------- */
    const bucketGeo = (() => {
      const m = new Merger();
      m.add(new THREE.CylinderGeometry(0.27, 0.21, 0.4, 16, 1, true), 0x2f6fdb, 0, 0.2, 0);
      m.add(new THREE.CircleGeometry(0.21, 16).rotateX(-Math.PI / 2), 0x2f6fdb, 0, 0.005, 0);
      m.add(new THREE.TorusGeometry(0.27, 0.018, 6, 20), 0x2557b0, 0, 0.4, 0, Math.PI / 2, 0, 0);
      m.add(new THREE.CircleGeometry(0.255, 16).rotateX(-Math.PI / 2), 0x6fc3ee, 0, 0.33, 0);
      // the handle, leaning back, and the balloons heaped up in the water
      m.add(new THREE.TorusGeometry(0.27, 0.01, 4, 16, Math.PI), 0xb0b6bc, 0, 0.4, 0, -0.5, 0, 0);
      [[0, 0.42, 0], [0.12, 0.38, 0.05], [-0.11, 0.38, 0.07], [0.04, 0.37, -0.13], [-0.08, 0.38, -0.1], [0.14, 0.37, -0.08], [0.02, 0.5, 0.04], [-0.05, 0.47, -0.04], [0.07, 0.46, -0.05]]
        .forEach(([x, y, z], i) => m.add(new THREE.SphereGeometry(0.075, 10, 7).scale(1, 1.15, 1), COLS[i % COLS.length], x, y, z, i * 0.7, 0, i * 0.4));
      // a sign on a stick
      m.box(0.035, 1.05, 0.035, 0x7a5230, 0.36, 0.525, -0.12);
      return m.build();
    })();
    const bucketMat = std({ vertexColors: true, roughness: 0.35, side: THREE.DoubleSide });
    const signTex = canvasTex(256, 176, (g, w, h) => {
      g.fillStyle = '#1f6bc4'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; roundRect(g, 7, 7, w - 14, h - 14, 12); g.stroke();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 34px Overpass, "Arial Black", Arial, sans-serif'; g.fillText('VATTEN-', w / 2, 40); g.fillText('BALLONGER', w / 2, 76);
      g.font = '900 30px Overpass, Arial, sans-serif'; g.fillStyle = '#f7c600'; g.fillText(PACK + ' st · ' + PACK_PRICE + ' kr', w / 2, 116);
      COLS.forEach((c, i) => { g.fillStyle = hex(c); g.beginPath(); g.ellipse(w / 2 + (i - 2.5) * 30, 148, 9, 11, 0, 0, TAU); g.fill(); });
    });
    const signGeo = new THREE.PlaneGeometry(0.58, 0.4), signMat = std({ map: signTex, roughness: 0.7, side: THREE.DoubleSide });
    const buckets = VENDORS.sellers.map((s) => {
      const P = s.p.ai.post, at = (lx, lz) => [P.x + lx * Math.cos(P.face) + lz * Math.sin(P.face), P.z - lx * Math.sin(P.face) + lz * Math.cos(P.face)];
      // on the seller's left (the hand that doesn't hold the bunch), or wherever there is room
      const spots = [[1.5, 0.3], [-1.6, 0.3], [0, -1.5], [1.2, 1.3]].map(([lx, lz]) => at(lx, lz));
      const [x, z] = spots.find(([sx, sz]) => personFits(sx, sz) && !blockedAt(sx, sz, 0.5)) || spots[0];
      const g = new THREE.Group(), body = new THREE.Mesh(bucketGeo, bucketMat), sign = new THREE.Mesh(signGeo, signMat);
      body.castShadow = true; body.receiveShadow = true;
      sign.position.set(0.36, 1.15, -0.1); sign.castShadow = true;
      g.add(body, sign);
      g.position.set(x, 0, z); g.rotation.y = P.face;
      scene.add(g);
      addCircle(x, z, 0.3, 0.5);
      return { x, z, s };
    });

    /* ---------- buying ---------- */
    function nearBucket() {
      if (!started || driving || FLY.on || METRO.riding || RIDES.on || (policeStop && (policeStop.locked || policeStop.riding)) || player.y > 1.5) return null;
      for (const b of buckets) {
        const d = Math.hypot(player.x - b.x, player.z - b.z);
        if (d < 1.5 && d < Math.hypot(player.x - b.s.p.x, player.z - b.s.p.z)) return b;
      }
      return null;
    }
    function use() {
      if (!near || paused()) return false;
      if (count >= MAX) { toast('Du har redan ' + MAX + ' vattenballonger. Kasta några först!'); return true; }
      if (!JOBS.spend(PACK_PRICE)) { toast(PACK + ' vattenballonger kostar ' + fmtKr(PACK_PRICE) + ', men du har bara ' + fmtKr(JOBS.earned) + '. Tjäna pengar på ett jobb!'); return true; }
      const first = !count;
      count = Math.min(MAX, count + PACK);
      beep([660, 990], 0.03, 0.16);
      toast(PACK + ' vattenballonger! −' + fmtKr(PACK_PRICE) + (first ? (isTouch ? ' Tryck på Kasta för att kasta.' : ' Klicka med musen, eller tryck F när du går, för att kasta.') : ''));
      return true;
    }

    /* ---------- throwing ---------- */
    const _d = new THREE.Vector3();
    // how tall a vehicle is above where it stands, roughly, for hitting it and for throwing out of its window
    const topOf = (M) => (M.bus ? 3.3 : M.mil ? 2.7 : M.boat ? (M.L > 12 ? 3 : 1.6) : M.moped ? 1.6 : M.L > 5.6 ? 2.4 : 1.6);
    function toss() {
      if (!started || paused() || count <= 0 || coolT > 0 || METRO.riding || player.cuffed || (policeStop && (policeStop.locked || policeStop.riding))) return false;
      // the way the camera looks, and up a bit more the higher you look
      camera.getWorldDirection(_d);
      let hx = _d.x, hz = _d.z;
      const hl = Math.hypot(hx, hz);
      if (hl < 0.05) { hx = Math.sin(player.rot); hz = Math.cos(player.rot); } else { hx /= hl; hz /= hl; }
      const up = clamp(0.5 + Math.asin(clamp(_d.y, -1, 1)) * 0.6, -0.6, 0.95);
      let vx = hx * Math.cos(up) * SPEED, vy = Math.sin(up) * SPEED, vz = hz * Math.cos(up) * SPEED, x, y, z;
      // from the helicopter, out of the car window, from your seat on a ride, or from your hand
      const car = driving || MP.ride, H = FLY.on ? FLY.heli : null;
      if (H) { x = H.x + hx * 1.2; y = H.y + 0.6; z = H.z + hz * 1.2; vx += H.vx; vy += H.vy || 0; vz += H.vz; }
      else if (car) { x = car.x; y = car.group.position.y + topOf(car.M) + 0.2; z = car.z; vx += car.vx; vz += car.vz; }
      else if (RIDES.riding) { x = camera.position.x + _d.x * 0.6; y = camera.position.y + _d.y * 0.6; z = camera.position.z + _d.z * 0.6; }
      else {
        x = player.x + hx * 0.35; y = player.y + 1.75; z = player.z + hz * 0.35;
        if (!CHUTE.on) player.rot = Math.atan2(hx, hz);
        throwT = 0;
      }
      const c = nextCol;
      nextCol = (nextCol + 1) % COLS.length;
      launch(x, y, z, vx, vy, vz, c, { mine: true, by: null, skipCar: car, skipPerson: player });
      count--; coolT = COOL;
      MP.event('wb', { p: [r2(x), r2(y), r2(z)], v: [r2(vx), r2(vy), r2(vz)], c });
      if (audio && !muted) noiseBurst(audio.ctx.currentTime, 0.2, 0.05, 'bandpass', 800, 0.7, 0, 0.04);
      if (!count) toast('Slut på vattenballonger. Köp fler i hinken bredvid ballongförsäljaren.');
      return true;
    }
    // a balloon in the air: yours, or one a friend threw (by), and the car and the person it leaves from
    const flying = [];
    function launch(x, y, z, vx, vy, vz, c, o) {
      if (flying.length >= 24) scene.remove(flying.shift().mesh);
      const mesh = new THREE.Mesh(balloonGeo, mats[c] || mats[0]);
      mesh.position.set(x, y, z); mesh.castShadow = true;
      scene.add(mesh);
      flying.push(Object.assign({ mesh, x, y, z, vx, vy, vz, t: 0, spin: Math.random() * TAU }, o));
    }
    // a friend threw one (MP's 'wb' event)
    function heard(P, m) {
      const now = performance.now();
      if (now - (P.wbAt || -1e9) < 250) return;
      const p = m.p, v = m.v;
      if (!Array.isArray(p) || !Array.isArray(v) || p.length !== 3 || v.length !== 3 || ![...p, ...v].every((n) => typeof n === 'number' && isFinite(n)) || Math.hypot(v[0], v[1], v[2]) > 120) return;
      P.wbAt = now;
      const c = P.car && P.car.occupant === P.ident ? P.car : null;
      launch(p[0], clamp(p[1], -5, 400), p[2], v[0], v[1], v[2], clamp(m.c | 0, 0, COLS.length - 1), { mine: false, by: { id: P.id, name: P.name }, skipCar: c, skipPerson: P.person });
    }
    // a friend says one hit them (MP's 'wet' event): if it was yours, a hit!
    function wetBy(P, by) {
      if (by !== MP.myId) return;
      beep([784, 988, 1319], 0.03, 0.22);
      toast('Träff! ' + P.name + ' blev blöt.');
    }

    /* ---------- the flight, and what it hits ---------- */
    // something solid at (x, y, z): a house, a wall, a kiosk, a tree
    function solidAt(x, y, z) {
      let hit = false;
      forNear(x - 0.1, z - 0.1, x + 0.1, z + 0.1, (o) => {
        if (hit || y >= o.h || (o.y0 !== undefined && y < o.y0)) return;
        if (o.t === 0) hit = x > o.x0 - 0.1 && x < o.x1 + 0.1 && z > o.z0 - 0.1 && z < o.z1 + 0.1;
        else if (o.t === 1) hit = Math.hypot(x - o.x, z - o.z) < o.r + 0.1;
        else { const dx = x - o.cx, dz = z - o.cz, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c; hit = Math.abs(lx) < o.hx + 0.1 && Math.abs(lz) < o.hz + 0.1; }
      });
      return hit;
    }
    function hits(b) {
      const { x, y, z } = b;
      for (const p of persons) {
        if (p === b.skipPerson || p.asleep || !p.model.group.visible || y < p.y - 0.1 || y > p.y + 1.85) continue;
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz > 0.42 * 0.42) continue;
        burst(b, x, y, z, p.y);
        wetPerson(p, b);
        return true;
      }
      for (const c of cars) {
        if (c === b.skipCar || !c.group.visible) continue;
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz > 120) continue;
        const sn = Math.sin(c.h), cs = Math.cos(c.h), y0 = c.group.position.y;
        if (Math.abs(dx * cs - dz * sn) > c.M.W / 2 + 0.05 || Math.abs(dx * sn + dz * cs) > c.M.L / 2 + 0.05 || y < y0 - 0.3 || y > y0 + topOf(c.M)) continue;
        burst(b, x, y, z, c.M.boat ? WATER_Y : 0);
        wetCar(c, b);
        return true;
      }
      const sea = !walkable(x, z), floor = sea ? WATER_Y : 0;
      if (y <= floor + 0.08) { burst(b, x, floor + 0.05, z, floor, sea ? 'water' : 'ground'); return true; }
      if (solidAt(x, y, z)) { burst(b, x, y, z, floor); return true; }
      return false;
    }
    function step(b, dt) {
      const n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy, b.vz) * dt) / 0.2)), h = dt / n;
      for (let i = 0; i < n; i++) {
        b.vy -= G * h;
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        b.t += h;
        if (hits(b)) return true;
      }
      return false;
    }
    // soaked: people run off, the police come after you
    function wetPerson(p, b) {
      if (p === player) { if (!b.mine) hitMe(b, null); return; }
      // (a friend: their own game finds out, and tells everyone)
      if (p.remote) return;
      p.wetT = SOAK;
      const ai = p.ai;
      if (!ai) return;
      if (ai.state === 'cop') { if (b.mine) { startChase('ballong'); PROGRESS.did('wetCop'); } }
      else if (ai.state !== 'idle' && ai.state !== 'vendor' && ai.state !== 'board') { ai.state = 'flee'; ai.t = 4; ai.dodgeT = 0; }
    }
    function wetCar(c, b) {
      if (c === driving) { if (!b.mine) hitMe(b, c); return; }
      if (c.remote || !b.mine) return;
      if (c.police && !c.dead) { startChase('ballong'); PROGRESS.did('wetCop'); }
      else if (c.bot && !c.M.boat) honkAt(c.x, c.z);
    }
    // a friend's balloon hit you, or the car you drive (in a closed car only the windscreen gets wet)
    function hitMe(b, c) {
      const open = !c || c.M.moped || c.M.boat === 'jetski';
      if (open) player.wetT = SOAK;
      wetScreen();
      toast((b.by ? b.by.name : 'Någon') + ' träffade ' + (open ? 'dig' : c.M.boat ? 'båten' : 'bilen') + ' med en vattenballong. Plask!');
      if (b.by) MP.event('wet', { by: b.by.id });
    }

    /* ---------- splashes: drops, wet patches and the sound ---------- */
    const DROPS = 600, dropPos = new Float32Array(DROPS * 3), dropV = new Float32Array(DROPS * 3), dropLife = new Float32Array(DROPS), dropFloor = new Float32Array(DROPS);
    let nDrops = 0;
    const dropGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    dropGeo.setDrawRange(0, 0);
    const dotTex = canvasTex(32, 32, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(225,242,255,0.9)'); gr.addColorStop(1, 'rgba(200,230,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const dropPoints = new THREE.Points(dropGeo, new THREE.PointsMaterial({ map: dotTex, color: 0xdff1ff, size: 0.16, transparent: true, depthWrite: false }));
    dropPoints.frustumCulled = false;
    scene.add(dropPoints);
    function drop(x, y, z, vx, vy, vz, life, floor) {
      if (nDrops >= DROPS) return;
      const i = nDrops++, k = i * 3;
      dropPos[k] = x; dropPos[k + 1] = y; dropPos[k + 2] = z;
      dropV[k] = vx; dropV[k + 1] = vy; dropV[k + 2] = vz;
      dropLife[i] = life; dropFloor[i] = floor;
    }
    function stepDrops(dt) {
      for (let i = nDrops - 1; i >= 0; i--) {
        const k = i * 3;
        dropLife[i] -= dt;
        dropV[k + 1] -= G * dt;
        dropPos[k] += dropV[k] * dt; dropPos[k + 1] += dropV[k + 1] * dt; dropPos[k + 2] += dropV[k + 2] * dt;
        if (dropLife[i] > 0 && dropPos[k + 1] > dropFloor[i]) continue;
        // gone: the last one takes its place
        const j = --nDrops, l = j * 3;
        dropPos[k] = dropPos[l]; dropPos[k + 1] = dropPos[l + 1]; dropPos[k + 2] = dropPos[l + 2];
        dropV[k] = dropV[l]; dropV[k + 1] = dropV[l + 1]; dropV[k + 2] = dropV[l + 2];
        dropLife[i] = dropLife[j]; dropFloor[i] = dropFloor[j];
      }
      dropGeo.setDrawRange(0, nDrops);
      dropGeo.attributes.position.needsUpdate = true;
    }
    // wet patches on the ground, drying in a quarter of a minute
    const puddles = [];
    let puddleGeo = null, nextPuddle = 0;
    function puddle(x, z) {
      if (!puddleGeo) puddleGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
      let P = puddles[nextPuddle];
      if (!P) {
        P = new THREE.Mesh(puddleGeo, new THREE.MeshBasicMaterial({ color: 0x0d1a26, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        P.renderOrder = 1;
        scene.add(P);
        puddles[nextPuddle] = P;
      }
      nextPuddle = (nextPuddle + 1) % 12;
      const r = 0.7 + Math.random() * 0.4;
      P.position.set(x, 0.05, z); P.scale.set(r, 1, r * (0.7 + Math.random() * 0.3)); P.rotation.y = Math.random() * TAU;
      P.userData.t = 15; P.visible = true;
    }
    function burst(b, x, y, z, floor, kind) {
      const n = kind === 'water' ? 24 : 44;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = 0.6 + Math.random() * 3.4;
        drop(x, y + 0.05, z, Math.cos(a) * s + b.vx * 0.12, 1 + Math.random() * 3.6, Math.sin(a) * s + b.vz * 0.12, 0.5 + Math.random() * 0.6, floor);
      }
      if (kind === 'ground') puddle(x, z);
      const s = placeSound(x, z, 70);
      if (audio && !muted && s.level > 0) {
        const t = audio.ctx.currentTime;
        noiseBurst(t, 0.32, 0.3 * s.level + 0.01, 'bandpass', kind === 'water' ? 600 : 1500, 0.9, s.pan, 0.002);
        tone(t, 'sine', kind === 'water' ? 500 : 1100, 260, 0.12, 0.06 * s.level, s.pan);
      }
      splashes++; lastSplash = { x, y, z, kind: kind || 'thing' };
    }
    // drops on your screen when you are hit, running down and drying off
    function wetScreen() {
      screenT = 3;
      E.screen.textContent = '';
      for (let i = 0; i < 16; i++) {
        const d = document.createElement('i'), s = 18 + Math.random() * 70;
        d.style.width = s + 'px'; d.style.height = s * 1.1 + 'px';
        d.style.left = Math.random() * 96 + '%'; d.style.top = Math.random() * 90 + '%';
        d.dataset.v = String(10 + Math.random() * 40);
        E.screen.append(d);
      }
      E.screen.hidden = false;
      beep([330, 247], 0.03, 0.2);
    }

    /* ---------- soaked people: dark, shiny clothes that drip ---------- */
    const wetMat = std({ vertexColors: true, color: 0x8796ab, roughness: 0.25, metalness: 0.08 });
    function dress(p, wet) {
      if (!!p.wetLook === wet) return;
      p.wetLook = wet;
      p.model.group.traverse((o) => { if (o.isMesh && (o.material === personMat || o.material === wetMat)) o.material = wet ? wetMat : personMat; });
    }

    /* ---------- every frame, after the people have been posed ---------- */
    function update(dt) {
      coolT = Math.max(0, coolT - dt);
      near = nearBucket();
      for (let i = flying.length - 1; i >= 0; i--) {
        const b = flying[i];
        if (step(b, dt) || b.t > 8) { scene.remove(b.mesh); flying.splice(i, 1); continue; }
        // wobbling as it flies
        const w = Math.sin(b.t * 22) * 0.12;
        b.mesh.position.set(b.x, b.y, b.z); b.mesh.scale.set(1 + w, 1 - w, 1 + w); b.mesh.rotation.set(b.t * 4, b.spin, 0);
      }
      for (const p of persons) {
        if (!(p.wetT > 0) && !p.wetLook) continue;
        p.wetT = Math.max(0, (p.wetT || 0) - dt);
        dress(p, p.wetT > 0);
        if (p.wetT > 0 && !p.asleep && p.model.group.visible && Math.random() < dt * (3 + p.wetT * 0.3)) {
          const dx = p.x - camera.position.x, dz = p.z - camera.position.z;
          if (dx * dx + dz * dz < 1600) drop(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.5 + Math.random() * 0.9, p.z + (Math.random() - 0.5) * 0.4, 0, -0.3, 0, 0.8, p.y);
        }
      }
      stepDrops(dt);
      for (const P of puddles) {
        if (!P.visible) continue;
        P.userData.t -= dt;
        P.material.opacity = 0.32 * clamp(P.userData.t / 5, 0, 1);
        P.visible = P.userData.t > 0;
      }
      // the arm swings over when you throw; the next balloon waits in your hand
      throwT += dt;
      const G2 = player.model;
      if (throwT < 0.3 && G2.group.visible) { G2.armR.rotation.x = lerp(-2.9, -0.6, throwT / 0.3); G2.armR.rotation.z = 0.1; }
      hand.visible = count > 0 && throwT > 0.3 && G2.group.visible && !driving && !FLY.on && !RIDES.on && !VENDORS.ice && !player.cuffed;
      if (hand.visible) hand.material = mats[nextCol];
      // the water on your screen
      if (screenT > 0) {
        screenT = Math.max(0, screenT - dt);
        E.screen.style.opacity = clamp(screenT / 1.2, 0, 1).toFixed(2);
        for (const d of E.screen.children) d.style.transform = 'translateY(' + ((3 - screenT) * Number(d.dataset.v)).toFixed(1) + 'px)';
        if (!screenT) E.screen.hidden = true;
      }
      if (count !== lastCount) {
        lastCount = count;
        E.tag.hidden = !count; E.count.textContent = count;
        E.btn.textContent = 'Kasta ' + count;
      }
      const btn = count > 0 && started && !METRO.riding;
      if (E.btn.hidden === btn) E.btn.hidden = !btn;
    }

    return {
      update, use, toss, heard, wetBy,
      get near() { return near; }, get count() { return count; }, get wet() { return player.wetT > 0; },
      prompt() { return near ? (count >= MAX ? 'Fullt med vattenballonger' : 'Köp ' + PACK + ' vattenballonger · ' + fmtKr(PACK_PRICE)) : null; },
      // for the tests
      debug: { buckets, flying, get splashes() { return splashes; }, get lastSplash() { return lastSplash; }, get drops() { return nDrops; }, give(n) { count = clamp(n, 0, MAX); } }
    };
  })();
