'use strict';

  /* ================= the parachute ================= */
  // Jump out of the helicopter in the air (E), off a roof it has landed on, or from the top of Kaknästornet or one of the
  // Hötorgsskraporna: walk up to the foot of the tower, press E, and you go up and jump. You fall, steering with W A S D,
  // until Space (on a phone the Skärm button) opens the parachute; under it you glide, A and D turning, W faster and S
  // slower. Open it in time and you land softly; forget it and you hit the ground hard. Into the water and you swim
  // ashore; onto a roof and you climb down.
  const CHUTE = (() => {
    // freefall: how fast you fall at most, and steer; under the canopy: sinking, gliding (slow, normal, fast), turning
    const FALL = 50, TRACK = 14, SINK = 4.5, GLIDE = [4, 8, 12], TURN = 1.1, WARN = 40;
    const E = { dash: $('chuteDash'), alt: $('chuteAlt'), help: $('chuteHelp'), jump: $('btnJump') };
    // S: your jump. open: the canopy is out, k: how far it has unfolded (0 to 1)
    const S = { on: false, open: false, k: 0, t: 0, vx: 0, vy: 0, vz: 0, h: 0, warnT: 0 };
    let inp = { fwd: 0, right: 0 }, lastOn = null, lastWarn = null, told = false;

    /* ---------- the canopy ---------- */
    // a ram-air canopy: nine cells in an arc over you, red, yellow and white, and the lines down to your shoulders
    function canopy() {
      const m = new Merger(), cols = [0xc8102e, 0xf2c200, 0xf4f4f1], R = 5.2, top = 6.6, n = 9, span = 1.45;
      const lines = [];
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * span, x = Math.sin(a) * R, y = top - R + Math.cos(a) * R;
        m.add(new THREE.BoxGeometry(0.92, 0.34, 2.9), cols[i % 3], x, y, 0, 0, 0, -a);
        if (i % 2 === 0) for (const z of [1.1, -1.1]) lines.push(x * 0.97, y - 0.18, z, x > 0 ? 0.2 : -0.2, 1.55, 0);
      }
      const g = new THREE.Group();
      const cells = new THREE.Mesh(m.build(), std({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
      cells.castShadow = true;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      g.add(cells, new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2b2e33 })));
      g.visible = false;
      scene.add(g);
      return g;
    }
    const mine = canopy();

    /* ---------- where you can jump from ---------- */
    // the top of Kaknästornet (from anywhere round its foot), and the southernmost of the Hötorgsskraporna (from the
    // pavement of Sveavägen in front of it)
    const TOWERS = [{ name: 'Kaknästornet', x: KAKNAS.x, z: KAKNAS.z, top: 132, edge: 10.5, ring: [6.5, 11.5] }];
    {
      const f = edgeFrame(nodeIndex.get('S1'), nodeIndex.get('S2'));
      let t = null;
      forNear(f.A.x - 120, f.A.z - 120, f.A.x + 120, f.A.z + 120, (o) => {
        if (o.t === 2 && o.h === 72 && (!t || Math.hypot(o.cx - f.A.x, o.cz - f.A.z) < Math.hypot(t.cx - f.A.x, t.cz - f.A.z))) t = o;
      });
      if (t) {
        const side = (t.cx - f.A.x) * f.rx + (t.cz - f.A.z) * f.rz < 0 ? 1 : -1, ox = f.rx * side, oz = f.rz * side;
        const half = Math.abs(ox * t.c + oz * t.s) * t.hx + Math.abs(-ox * t.s + oz * t.c) * t.hz;
        // (the towers stand on a low block that reaches about 3 m further out: the door is on the pavement beyond it)
        TOWERS.push({ name: 'Hötorgsskrapan', x: t.cx, z: t.cz, top: 72, out: [ox, oz], half, door: { x: t.cx + ox * (half + 5), z: t.cz + oz * (half + 5) } });
      }
    }
    // the tower whose foot you stand at, and where you would jump from: just off its top, on your side of it
    function towerHere() {
      if (S.on || driving || MP.ride || FLY.on || !started || (policeStop && policeStop.locked) || player.y > 1.5) return null;
      for (const T of TOWERS) {
        if (T.door) {
          if (Math.hypot(player.x - T.door.x, player.z - T.door.z) < 4) return { T, x: T.x + T.out[0] * (T.half + 4), z: T.z + T.out[1] * (T.half + 4), h: Math.atan2(T.out[0], T.out[1]) };
          continue;
        }
        const d = Math.hypot(player.x - T.x, player.z - T.z);
        if (d > T.ring[0] && d < T.ring[1]) { const ux = (player.x - T.x) / d, uz = (player.z - T.z) / d; return { T, x: T.x + ux * T.edge, z: T.z + uz * T.edge, h: Math.atan2(ux, uz) }; }
      }
      return null;
    }

    /* ---------- jumping ---------- */
    function jump(x, y, z, vx, vz, h) {
      Object.assign(S, { on: true, open: false, k: 0, t: 0, vx, vy: 0, vz, h, warnT: 0 });
      player.x = x; player.y = y; player.z = z; player.vx = vx; player.vz = vz; player.vy = 0; player.rot = h; player.grounded = false;
      player.model.group.visible = true;
      camTarget.set(x, y + 1.6, z);
      if (!told) { told = true; toast(isTouch ? 'Du faller! Tryck på Skärm för att veckla ut fallskärmen.' : 'Du faller! Tryck Mellanslag för att veckla ut fallskärmen. W A S D styr.'); }
      noise(0.6, 0.12, 1800);
    }
    // E at the foot of a tower: up, and off
    function use() {
      const J = towerHere();
      if (!J) return false;
      if (PARTY.busy()) { toast('Inga fallskärmshopp mitt i en lek!'); return true; }
      jump(J.x, J.T.top + 0.5, J.z, Math.sin(J.h) * 3, Math.cos(J.h) * 3, J.h);
      camYaw = J.h; lastLook = -1e9;
      toast('Du åkte upp i ' + J.T.name + ' och hoppade! ' + (isTouch ? 'Tryck på Skärm' : 'Tryck Mellanslag') + ' för fallskärmen.');
      return true;
    }
    // Space, or the Skärm button: open the parachute while you fall
    function pull() {
      if (!S.on) return false;
      if (!S.open) { S.open = true; S.k = 0; noise(0.7, 0.2, 650); }
      return true;
    }
    function noise(len, vol, freq) { if (audio && !muted) noiseBurst(audio.ctx.currentTime, len, vol, 'bandpass', freq, 0.7, 0, 0.02); }
    // somewhere to stand near (x, z): for the swim ashore, or down from a roof (far out on the water: the nearest street
    // corner)
    function groundNear(x, z) {
      for (let r = 2; r <= 300; r += r < 12 ? 2 : r < 60 ? 8 : 20) for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (personFits(px, pz) && !blockedAt(px, pz, 0.4) && !STATION.inside(px, pz) && FLY.heightAt(px, pz, 0.5) === 0) return { x: px, z: pz };
      }
      let best = null, bd = Infinity;
      for (const n of nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && personFits(n.x, n.z)) { bd = d; best = { x: n.x, z: n.z }; } }
      return best;
    }
    function land(how) {
      S.on = false; S.open = false;
      mine.visible = false;
      player.model.inner.rotation.x = 0; player.model.legL.rotation.z = player.model.legR.rotation.z = 0;
      player.vx = player.vz = player.vy = 0; player.y = 0; player.grounded = true;
      if (how === 'water' || how === 'roof') {
        const g = groundNear(player.x, player.z);
        if (g) { player.x = g.x; player.z = g.z; }
        camTarget.set(player.x, 1.6, player.z);
        toast(how === 'water' ? 'Plask! Du simmade i land.' : 'Du landade på ett tak och klättrade ner.');
      } else if (how === 'hard') {
        player.vy = 3; player.grounded = false; player.knockT = 2.2;
        shake = 0.8; crashSound(player.x, player.z, 14, false);
        toast('Aj! Du glömde att veckla ut fallskärmen.');
      } else toast('Snygg landning!');
    }
    // straight down to the ground (when a game with friends starts, or you go to a friend)
    function bail() { if (S.on) { const g = FLY.heightAt(player.x, player.z, 0.4) > 0 || !walkable(player.x, player.z) ? groundNear(player.x, player.z) : null; if (g) { player.x = g.x; player.z = g.z; } land('soft'); } }

    /* ---------- falling and gliding ---------- */
    // one step of the physics (a few each frame)
    function step(dt) {
      S.t += dt;
      if (!S.open) {
        // freefall: you fall faster and faster, and W A S D push you along, as you would walk
        const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
        let mx = fx * inp.fwd + rx * inp.right, mz = fz * inp.fwd + rz * inp.right;
        const len = Math.hypot(mx, mz);
        if (len > 1) { mx /= len; mz /= len; }
        S.vx += (mx * TRACK - S.vx) * Math.min(1, 1.2 * dt); S.vz += (mz * TRACK - S.vz) * Math.min(1, 1.2 * dt);
        S.vy = Math.max(-FALL, S.vy - 9.8 * dt);
        if (len > 0.1) S.h = Math.atan2(mx, mz);
      } else {
        // under the canopy: gliding the way you face, slowing the fall in a moment
        S.h -= inp.right * TURN * dt;
        const v = GLIDE[inp.fwd > 0.3 ? 2 : inp.fwd < -0.3 ? 0 : 1];
        S.vx += (Math.sin(S.h) * v - S.vx) * Math.min(1, 1.5 * dt); S.vz += (Math.cos(S.h) * v - S.vz) * Math.min(1, 1.5 * dt);
        S.vy += (-(inp.fwd < -0.3 ? SINK * 0.7 : SINK) - S.vy) * Math.min(1, 2.5 * dt);
        S.k = Math.min(1, S.k + dt / 0.7);
      }
      // a house in the way: you slide down its wall
      let nx = player.x + S.vx * dt, nz = player.z + S.vz * dt;
      if (FLY.heightAt(nx, nz, 0.5) > player.y + 0.2) { nx = player.x; nz = player.z; S.vx = S.vz = 0; }
      player.x = clamp(nx, BOUNDS.x0 + 20, BOUNDS.x1 - 20); player.z = clamp(nz, BOUNDS.z0 + 20, BOUNDS.z1 - 20);
      player.y += S.vy * dt;
      player.vx = S.vx; player.vz = S.vz; player.rot = S.h;
      // down: on a roof, on the water or on the ground
      const roof = FLY.heightAt(player.x, player.z, 0.4), wet = !walkable(player.x, player.z);
      if (roof > 0 && player.y <= roof) land('roof');
      else if (wet && player.y <= WATER_Y) land('water');
      else if (!wet && player.y <= 0) land(S.open && S.k > 0.6 ? 'soft' : 'hard');
    }

    /* ---------- every frame ---------- */
    // (after the people are posed: in freefall you lie on your belly with your arms and legs spread)
    function update(dt, input) {
      inp = input;
      if (S.on) {
        const G = player.model;
        if (!S.open) {
          G.inner.rotation.x = 1.25; G.inner.position.y = 0.5;
          G.armL.rotation.set(0, 0, 1.35); G.armR.rotation.set(0, 0, -1.35); G.legL.rotation.x = 0.3; G.legR.rotation.x = 0.3;
          G.legL.rotation.z = 0.25; G.legR.rotation.z = -0.25;
        } else { G.inner.rotation.x = 0; G.legL.rotation.z = G.legR.rotation.z = 0; }
        mine.visible = S.open;
        if (S.open) { mine.position.set(player.x, player.y, player.z); mine.rotation.y = S.h; mine.scale.setScalar(0.25 + 0.75 * S.k); }
      }
      hud(dt);
    }
    // the height and what to do, in a box where the car's dashboard goes; low without a parachute: a warning, and beeps
    function hud(dt) {
      if (S.on !== lastOn) {
        lastOn = S.on;
        E.dash.hidden = !S.on;
        if (!driving && !FLY.on) E.jump.textContent = S.on ? 'Skärm' : 'Hoppa';
      }
      if (!S.on) return;
      const low = !S.open && player.y < WARN;
      E.alt.textContent = 'Höjd ' + Math.round(Math.max(0, player.y)) + ' m';
      const help = S.open ? (isTouch ? 'Spaken styr: framåt fortare, bakåt långsammare' : 'A D svänger · W fortare · S långsammare') : low ? 'VECKLA UT FALLSKÄRMEN!' : isTouch ? 'Tryck på Skärm för fallskärmen' : 'Mellanslag: fallskärmen · W A S D styr';
      if (help !== lastWarn) { lastWarn = help; E.help.textContent = help; E.dash.classList.toggle('warn', low); }
      if (low && (S.warnT -= dt) <= 0) { S.warnT = 0.4; beep([880], 0.04, 0.12); }
    }
    // on the big map: where you can jump from
    function drawBig(g, toX, toY, text) {
      for (const T of TOWERS) {
        const X = toX(T.door ? T.door.x : T.x), Y = toY(T.door ? T.door.z : T.z);
        g.fillStyle = '#2f6bff'; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
        g.beginPath(); g.arc(X, Y, 6, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
        text('Fallskärmshopp', X, Y + 13, '800 11px Overpass, sans-serif', '#1d4fae');
      }
    }

    return {
      step, update, use, pull, bail, canopy, drawBig,
      get on() { return S.on; }, get open() { return S.on && S.open; },
      prompt() { const J = towerHere(); return J ? 'Åk upp i ' + J.T.name + ' och hoppa' : null; },
      // out of the helicopter: from a point beside it, or (standing on a roof) from just past the edge of the roof
      jumpFrom(x, y, z, vx, vz, h) {
        let px = x - Math.cos(h) * 2.2, pz = z + Math.sin(h) * 2.2;
        if (FLY.heightAt(px, pz, 0.6) > y - 2) {
          let ok = false;
          for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
            const ux = Math.sin(h + a), uz = Math.cos(h + a);
            for (let d = 3; d <= 40 && !ok; d += 1) { px = x + ux * d; pz = z + uz * d; ok = FLY.heightAt(px, pz, 0.6) < y - 3; }
            if (ok) { px += ux * 1.5; pz += uz * 1.5; break; }
          }
          if (!ok) return false;
        }
        jump(px, y, pz, vx, vz, h);
        return true;
      },
      // for the tests
      debug: { S, TOWERS, towerHere }
    };
  })();
