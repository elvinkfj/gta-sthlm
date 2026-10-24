'use strict';

  /* ================= the helicopter you fly ================= */
  // A helicopter of your own, a red and white Bell 429 (the police helicopter's model in other colours), waiting on a pad
  // at the far end of the car park on Skeppsbron. Walk up to it and press E: the rotor runs up, and then W and S fly
  // forwards and back, A and D turn, Space climbs and Shift sinks (on a phone the stick and the ▲ ▼ buttons). It sets down
  // on whatever is under it, roofs too, but you can only get out on the ground. The roof of Kaknästornet, 132 m up, is a
  // landing to try for. Left somewhere far off, it is flown back to its pad.
  const FLY = (() => {
    // top speed forwards and backwards (m/s), how hard it speeds up, how fast it turns (rad/s), climbs and sinks (m/s), how
    // high it may go, how long the rotor takes to run up (s); half its width, and the reach of its skids
    const MAX = 60, BACK = 12, ACC = 9, TURN = 1.3, UP = 12, DOWN = 10, TOP = 200, SPIN_UP = 4, BODY = 2.2, SKIDS = 1.3;
    const PAD = (() => { const [x, z] = LOT.at(147, 23); return { x, z, h: Math.atan2(LOT.f.ux, LOT.f.uz) }; })();
    // the roof of Kaknästornet: the deck at 132 m round the mast (see the tower in src/city/blocks.js)
    const KAK = { x: KAKNAS.x, z: KAKNAS.z, deck: 132, mast: 1.6, r: 9.6 }, KAK_KEY = 'gubbe-kaknas';
    const E = {
      dash: $('heliDash'), kmh: $('heliKmh'), alt: $('heliAlt'), help: $('heliHelp'), up: $('btnUp'), down: $('btnDown'), jump: $('btnJump')
    };
    // where it is and how it moves, how it leans, and how fast the rotor turns (0 standing still, 1 ready to fly)
    const H = { x: PAD.x, y: 0, z: PAD.z, h: PAD.h, vx: 0, vy: 0, vz: 0, pitch: 0, roll: 0, ax: 0, az: 0, spin: 0, rotor: 0, ground: true, onKak: false };
    let on = false, upHeld = false, downHeld = false, lastOn = null, told = false, bumpT = 0, kakDone = false;
    try { kakDone = localStorage.getItem(KAK_KEY) === '1'; } catch { /* a private window: once a visit */ }
    const model = buildHeli(true);
    model.group.visible = true;

    /* ---------- the pads ---------- */
    // a dark circle with a yellow ring and a big white H, on the quay; and a yellow ring round the mast on Kaknästornet
    const padTex = canvasTex(256, 256, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#3a3f45'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, TAU); g.fill();
      g.strokeStyle = '#f2c200'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 16, 0, TAU); g.stroke();
      g.fillStyle = '#ffffff'; g.font = '900 150px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, w / 2 + 8);
    });
    {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), std({ map: padTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      pad.rotation.set(-Math.PI / 2, 0, -PAD.h); pad.position.set(PAD.x, 0.045, PAD.z); pad.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 6.4, 40), new THREE.MeshBasicMaterial({ color: 0xf2c200, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(KAK.x, KAK.deck + 0.03, KAK.z);
      scene.add(pad, ring);
    }

    /* ---------- what is under it ---------- */
    // does the circle (x, z, r) reach into the obstacle o
    function touches(o, x, z, r) {
      if (o.t === 0) return Math.hypot(x - clamp(x, o.x0, o.x1), z - clamp(z, o.z0, o.z1)) < r;
      if (o.t === 1) return Math.hypot(x - o.x, z - o.z) < o.r + r;
      const dx = x - o.cx, dz = z - o.cz, lx = dx * o.c + dz * o.s, lz = -dx * o.s + dz * o.c;
      return Math.hypot(lx - clamp(lx, -o.hx, o.hx), lz - clamp(lz, -o.hz, o.hz)) < r;
    }
    // the top of the tallest house within r of (x, z); lamp posts and trees don't count, and Kaknästornet has its own shape
    function heightAt(x, z, r) {
      const dk = Math.hypot(x - KAK.x, z - KAK.z);
      if (dk < KAK.mast + r) return 172;
      if (dk < KAK.r + r) return KAK.deck;
      let top = 0;
      if (dk > 30) forNear(x - r, z - r, x + r, z + r, (o) => {
        if (o.y0 !== undefined || o.h <= top || o.h >= 300 || (o.t === 1 && o.r < 1.5)) return;
        if (touches(o, x, z, r)) top = o.h;
      });
      return top;
    }
    // where it comes down: the street, the water, or a roof
    function floorAt(x, z) {
      const roof = heightAt(x, z, SKIDS);
      return roof > 0 ? roof : walkable(x, z) ? 0 : WATER_Y + 0.3;
    }

    /* ---------- in and out ---------- */
    const near = () => !on && started && !driving && !MP.ride && !(policeStop && policeStop.locked) && player.y < 1.5 && H.y < 1 && Math.hypot(player.x - H.x, player.z - H.z) < 4.5;
    // out on the side, or in front of the nose
    function exitSpot() {
      const co = Math.cos(H.h), si = Math.sin(H.h);
      for (const [lx, lz] of [[2.6, 0.5], [-2.6, 0.5], [2.6, -1.5], [-2.6, -1.5], [0, 4.6]]) {
        const x = H.x + lx * co + lz * si, z = H.z - lx * si + lz * co;
        if (personFits(x, z) && !blockedAt(x, z, 0.36)) return { x, z };
      }
      return null;
    }
    function enter() {
      on = true;
      player.model.group.visible = false;
      player.vx = player.vz = player.vy = 0;
      camYaw = H.h; lastLook = -1e9;
      if (!told) {
        told = true;
        toast(isTouch ? 'Helikoptern! Rotorn varvar upp. Styrspaken flyger och svänger, ▲ stiger och ▼ sjunker. Kliv ur när du har landat.'
          : 'Helikoptern! Rotorn varvar upp. Mellanslag stiger, Shift sjunker, W och S flyger framåt och bakåt, A och D svänger. E kliver ur när du har landat.');
      } else toast('Rotorn varvar upp …');
    }
    // high enough to jump with the parachute: the ground (or the water) far enough below
    const canJump = () => H.y - (walkable(H.x, H.z) ? 0 : WATER_Y) >= 8 && (!H.ground || H.y > 1);
    function leave() {
      // up in the air, or on a roof: out with the parachute (the helicopter sinks and sets itself down)
      if (canJump()) {
        if (!CHUTE.jumpFrom(H.x, H.y - 0.3, H.z, H.vx, H.vz, H.h)) { toast('Härifrån går det inte att hoppa.'); return; }
        on = false;
        toast(isTouch ? 'Du hoppade! Tryck på Skärm för att veckla ut fallskärmen.' : 'Du hoppade! Tryck Mellanslag för att veckla ut fallskärmen.');
        return;
      }
      if (!H.ground) { toast(isTouch ? 'För lågt för att hoppa. Landa först, håll in ▼ för att sjunka.' : 'För lågt för att hoppa. Landa först, håll in Shift för att sjunka.'); return; }
      if (H.y > 1) { toast('Landa på marken först, så att du kan kliva ur.'); return; }
      const out = exitSpot();
      if (!out) { toast(walkable(H.x, H.z) ? 'Det finns ingen plats att kliva ur här.' : 'Landa på land, så att du kan kliva ur.'); return; }
      on = false;
      player.x = out.x; player.z = out.z; player.y = 0; player.vx = player.vz = player.vy = 0; player.rot = H.h;
      player.model.group.visible = true;
      camTarget.set(player.x, 1.6, player.z);
    }
    // E: in, or out once it has landed
    function use() {
      if (on) { leave(); return true; }
      if (!near()) return false;
      if (PARTY.busy()) { toast('Ingen helikopter mitt i en lek!'); return true; }
      enter();
      return true;
    }
    // straight down to the ground below, and the helicopter back to its pad (when a game with friends starts, or you go
    // to a friend)
    function bail() {
      if (!on) return;
      on = false;
      let out = null;
      for (let r = 0; r <= 120 && !out; r += r < 10 ? 2.5 : 10) for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU, x = H.x + Math.sin(a) * r, z = H.z + Math.cos(a) * r;
        if (personFits(x, z) && !blockedAt(x, z, 0.4) && !STATION.inside(x, z)) { out = { x, z }; break; }
      }
      if (!out) out = exitSpot() || { x: PAD.x + 4, z: PAD.z };
      player.x = out.x; player.z = out.z; player.y = 0; player.vx = player.vz = player.vy = 0;
      player.model.group.visible = true;
      camTarget.set(player.x, 1.6, player.z);
      home();
    }
    function home() { Object.assign(H, { x: PAD.x, y: 0, z: PAD.z, h: PAD.h, vx: 0, vy: 0, vz: 0, pitch: 0, roll: 0, ax: 0, az: 0, rotor: 0, ground: true, onKak: false }); }

    /* ---------- flying ---------- */
    function update(dt, inp) {
      const spun = H.rotor > 0.95;
      H.rotor = clamp(H.rotor + (on ? dt / SPIN_UP : -dt / 6), 0, 1);
      // left far off: flown home while you are away
      if (!on && Math.hypot(player.x - H.x, player.z - H.z) > 700 && (H.x !== PAD.x || H.z !== PAD.z)) home();
      // W and S along the way it points, A and D turn, Space (or ▲) up and Shift (or ▼) down; on a phone, the stick
      // pushed all the way doesn't mean down (it means running)
      const fwd = on ? inp.fwd : 0, turn = on && H.rotor > 0.5 ? inp.right : 0;
      const lift = on && spun ? (inp.brake || upHeld ? 1 : 0) - ((!isTouch && inp.run) || downHeld ? 1 : 0) : 0;
      H.h -= turn * TURN * dt;
      // the speed along and across the way it points: towards what the stick asks for, or slowing to a hover
      const fx = Math.sin(H.h), fz = Math.cos(H.h), rx = -Math.cos(H.h), rz = Math.sin(H.h);
      let vf = H.vx * fx + H.vz * fz, vl = H.vx * rx + H.vz * rz;
      const air = !H.ground || lift > 0;
      const want = air && spun ? (fwd > 0 ? fwd * MAX : fwd * BACK) : 0, rate = air ? (fwd ? ACC : 5) : 30;
      vf += clamp(want - vf, -rate * dt, rate * dt);
      vl += clamp(-vl, -(air ? 6 : 30) * dt, (air ? 6 : 30) * dt);
      const ox = H.vx, oz = H.vz;
      H.vx = fx * vf + rx * vl; H.vz = fz * vf + rz * vl;
      // up and down: held where it is when nothing is pressed; without the rotor it settles
      const vyWant = lift > 0 ? UP : lift < 0 ? -DOWN : spun && on ? 0 : -6;
      H.vy += (vyWant - H.vy) * Math.min(1, 3 * dt);
      // a house in the way: it stops (and a knock if it was going fast)
      let nx = clamp(H.x + H.vx * dt, BOUNDS.x0 + 50, BOUNDS.x1 - 50), nz = clamp(H.z + H.vz * dt, BOUNDS.z0 + 50, BOUNDS.z1 - 50);
      bumpT -= dt;
      if (heightAt(nx, nz, BODY) > H.y + 0.4) {
        const sp = Math.hypot(H.vx, H.vz);
        if (sp > 12 && bumpT <= 0) { bumpT = 1.5; crashSound(H.x, H.z, sp, false); shake = Math.min(1.2, sp * 0.03); toast('Aj! Akta husen.'); }
        nx = H.x; nz = H.z; H.vx = H.vy > 0 ? 0 : -H.vx * 0.2; H.vz = H.vy > 0 ? 0 : -H.vz * 0.2;
      }
      H.x = nx; H.z = nz;
      // down on whatever is under it
      const floor = floorAt(H.x, H.z), wasDown = H.ground;
      H.y = Math.min(TOP, H.y + H.vy * dt);
      if (H.y <= floor) {
        if (!wasDown && H.vy < -7) { crashSound(H.x, H.z, -H.vy * 1.5, false); shake = 0.5; }
        H.y = floor; H.vy = Math.max(0, H.vy); H.ground = true;
      } else H.ground = false;
      if (H.y >= TOP && lift > 0 && !update.ceil) { update.ceil = true; toast('Högre än så här får du inte flyga.'); }
      if (H.y < TOP - 10) update.ceil = false;
      // set down on Kaknästornet
      const onKak = on && H.ground && Math.abs(H.y - KAK.deck) < 0.5 && Math.hypot(H.x - KAK.x, H.z - KAK.z) < KAK.r + SKIDS;
      if (onKak && !H.onKak) {
        PROGRESS.did('kaknas');
        if (!kakDone) {
          kakDone = true;
          try { localStorage.setItem(KAK_KEY, '1'); } catch { /* counted anyway */ }
          JOBS.reward(500);
          toast('Du landade på Kaknästornet, 132 meter upp! 500 kr i belöning.');
          beep([784, 988, 1319, 1568], 0.04, 0.5);
        } else toast('Du landade på Kaknästornet, 132 meter upp!');
      }
      H.onKak = onKak;
      // leaning into the push: nose down to go forwards, a bank into the turn (as the police helicopter does)
      H.ax += ((H.vx - ox) / Math.max(dt, 1e-3) - H.ax) * Math.min(1, 3 * dt); H.az += ((H.vz - oz) / Math.max(dt, 1e-3) - H.az) * Math.min(1, 3 * dt);
      const af = H.ax * fx + H.az * fz, al = H.ax * -rx + H.az * -rz, v = H.ground ? 0 : 1;
      H.pitch += (clamp((vf * 0.005 + af * 0.025) * v, -0.22, 0.3) - H.pitch) * Math.min(1, 3 * dt);
      H.roll += (clamp((-al * 0.03 + turn * Math.min(1, Math.abs(vf) / 25) * 0.35) * v, -0.4, 0.4) - H.roll) * Math.min(1, 3 * dt);
      // the model
      H.spin += dt * 41 * H.rotor;
      model.group.position.set(H.x, H.y, H.z);
      model.body.rotation.set(H.pitch, H.h, H.roll);
      model.rotor.rotation.y = H.spin; model.tail.rotation.x = H.spin * 5.3;
      model.beacon.visible = on && clock % 1.2 < 0.12;
    }

    /* ---------- on the screen ---------- */
    // speed and height in a box where the car's dashboard goes, and the ▲ ▼ buttons on a phone
    function hud() {
      if (on !== lastOn) {
        lastOn = on;
        E.dash.hidden = !on;
        document.body.classList.toggle('flying', on);
        E.up.hidden = E.down.hidden = !on && !driving;
        E.jump.textContent = on ? 'Upp' : driving ? 'Broms' : CHUTE.on ? 'Skärm' : 'Hoppa';
        E.help.textContent = isTouch ? '▲ stiger · ▼ sjunker' : 'Mellanslag stiger · Shift sjunker · A D svänger';
        upHeld = downHeld = false;
      }
      if (!on) return;
      E.kmh.textContent = Math.round(Math.hypot(H.vx, H.vz) * 3.6);
      E.alt.textContent = H.rotor < 0.95 ? 'Rotorn varvar upp' : 'Höjd ' + Math.round(Math.max(0, H.y)) + ' m';
    }
    for (const [b, up] of [[E.up, true], [E.down, false]]) {
      b.addEventListener('pointerdown', () => { if (on) { if (up) upHeld = true; else downHeld = true; } });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { if (up) upHeld = false; else downHeld = false; });
    }
    // on the maps: the helicopter where it stands (a red H), and the landing on Kaknästornet on the big map
    function mark(g, x, z, r, lw) {
      g.fillStyle = '#c8102e'; g.strokeStyle = '#ffffff'; g.lineWidth = lw;
      g.beginPath(); g.arc(x, z, r, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.font = '900 ' + (r * 1.3).toFixed(1) + 'px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', x, z + r * 0.08);
    }
    function drawMini(g, px, pz, u) {
      if (!on && Math.hypot(H.x - px, H.z - pz) < 110) mark(g, H.x, H.z, 6.5 * u, 1.8 * u);
    }
    function drawBig(g, toX, toY, text) {
      if (!on) { mark(g, toX(H.x), toY(H.z), 8, 2); text('Helikoptern', toX(H.x), toY(H.z) - 16, '800 12px Overpass, sans-serif', '#c8102e'); }
      g.strokeStyle = '#f2c200'; g.lineWidth = 3; g.beginPath(); g.arc(toX(KAK.x), toY(KAK.z), 7, 0, TAU); g.stroke();
    }

    return {
      update, hud, use, bail, drawMini, drawBig,
      get on() { return on; }, get heli() { return H; },
      prompt() { return on ? (canJump() ? 'Hoppa ut med fallskärm' : H.ground && H.y < 1 && exitSpot() ? 'Kliv ur' : null) : near() ? 'Flyg helikoptern' : null; },
      heightAt,
      // where your helicopter is, for your friends: [x, y, z, heading, pitch, roll, rotor] (see MP's state)
      net() { const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000; return [r2(H.x), r2(H.y), r2(H.z), r3(H.h), r3(H.pitch), r3(H.roll), r2(H.rotor)]; },
      // the rotor's sound: how loud, from where
      sound() { return H.rotor > 0.01 ? H : null; },
      // for the tests
      debug: { PAD, KAK, heightAt, floorAt, home, model }
    };
  })();
