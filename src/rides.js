'use strict';

  /* ================= the rides at Gröna Lund ================= */
  // Walk up to the Ferris wheel, the free-fall tower, the carousel or the roller coaster and press E: a ride costs 30 kr
  // from the Kassa, and the camera sits in the seat (the mouse looks round). The wheel turns faster while you ride it, one
  // lap; the tower and the coaster go when they are ready, so you may have to queue a moment first; the carousel turns
  // for twenty seconds. Your friends see you sitting in it, arms in the air. The rides themselves move in TIVOLI.
  const RIDES = (() => {
    const PRICE = 30, T = TIVOLI;
    const E = { dash: $('rideDash'), name: $('rideName'), info: $('rideInfo') };
    // where you can get on, and the name the prompt and the box use
    const C = T.coaster, station = C ? T.trackAt(0).p : null;
    const RIDE_LIST = [
      { id: 'wheel', name: 'pariserhjulet', title: 'Pariserhjulet', near: (x, z) => Math.abs(x - T.WHEEL.x) < 10 && Math.abs(z - T.WHEEL.z) < 7 },
      { id: 'tower', name: 'fritt fall', title: 'Fritt fall', near: (x, z) => Math.hypot(x - T.TOWER.x, z - T.TOWER.z) < 8.5 },
      { id: 'carousel', name: 'karusellen', title: 'Karusellen', near: (x, z) => Math.hypot(x - T.CAROUSEL.x, z - T.CAROUSEL.z) < 10.5 },
      { id: 'coaster', name: 'berg-och-dalbanan', title: 'Berg-och-dalbanan', near: (x, z) => !!station && Math.hypot(x - station.x, z - station.z) < 9 }
    ];
    // R: your ride. phase: queue (waiting your turn) or ride; k: your seat (gondola, horse); t: seconds on it;
    // yaw0, pitch0: where the camera looked when you sat down, so the mouse can look round from there
    let R = null, lastBox = '';
    const v = new THREE.Vector3(), dir = new THREE.Vector3(), seatPos = new THREE.Vector3();

    function here() {
      if (R || !started || driving || MP.ride || FLY.on || CHUTE.on || METRO.riding || (policeStop && policeStop.locked) || player.y > 1.5 || !T.wheel) return null;
      return RIDE_LIST.find((r) => r.near(player.x, player.z)) || null;
    }
    function use() {
      if (R) { if (R.phase === 'queue') { leave('Du gick ur kön.'); return true; } toast('Du kan inte kliva av mitt i åkturen. Håll i dig!'); return true; }
      const r = here();
      if (!r) return false;
      if (PARTY.busy()) { toast('Ingen åktur mitt i en lek!'); return true; }
      if (!JOBS.spend(PRICE)) { toast(r.title + ' kostar ' + PRICE + ' kr, och du har bara ' + JOBS.earned + ' kr. Tjäna pengar på ett jobb!'); return true; }
      R = { r, phase: 'queue', t: 0, k: 0, from: { x: player.x, z: player.z } };
      player.vx = player.vz = 0;
      if (r.id === 'wheel' || r.id === 'carousel') board();
      else toast('Du köpte en biljett till ' + r.name + '. Vänta på din tur …');
      return true;
    }
    // into the seat
    function board() {
      const r = R.r;
      R.phase = 'ride'; R.t = 0;
      PROGRESS.did('rides', r.id);
      if (r.id === 'wheel') {
        // the gondola nearest the bottom, and the wheel turns faster for a lap
        let best = 0, bd = Infinity;
        T.gondolas.forEach((g, k) => { if (g.position.y < bd) { bd = g.position.y; best = k; } });
        R.k = best; R.a0 = T.wheelA; T.wheelSpeed = 0.22;
      } else if (r.id === 'tower') T.fall = 0;
      else if (r.id === 'carousel') {
        // the horse nearest you
        let best = 0, bd = Infinity;
        for (let k = 0; k < 12; k++) { seat(k); const d = Math.hypot(seatPos.x - player.x, seatPos.z - player.z); if (d < bd) { bd = d; best = k; } }
        R.k = best;
      }
      player.model.group.visible = false;
      R.yaw0 = camYaw; R.pitch0 = camPitch;
      beep([523, 659, 784], 0.035, 0.3);
      toast({ wheel: 'Pariserhjulet: ett varv högt över Djurgården. Titta runt med musen!', tower: 'Fritt fall: upp 74 meter, och sedan … håll i dig!',
        carousel: 'Karusellen! Tjugo sekunder runt, runt.', coaster: 'Berg-och-dalbanan: två varv. Armarna upp!' }[r.id]);
    }
    // off, beside the ride where you got on
    function leave(msg) {
      if (!R) return;
      const from = R.from;
      if (R.r.id === 'wheel') T.wheelSpeed = 0.07;
      R = null;
      player.x = from.x; player.z = from.z; player.y = 0; player.vx = player.vz = player.vy = 0; player.grounded = true;
      player.model.group.visible = true;
      camTarget.set(player.x, 1.6, player.z);
      if (msg) toast(msg);
    }
    function bail() { if (R) leave(); }

    /* ---------- where you sit, and where you look ---------- */
    // the seat you are in, in the world (into seatPos), and the way it faces (into dir)
    function seat(k) {
      const r = R ? R.r.id : 'carousel';
      if (r === 'wheel') {
        const g = T.gondolas[R.k].position;
        seatPos.set(g.x, g.y - 1.9, g.z); dir.set(0, -0.12, -1);
      } else if (r === 'tower') {
        // the seat facing the city (west), on the outside of the ring
        seatPos.set(T.TOWER.x - 3.8, T.ring.position.y - 1.0, T.TOWER.z); dir.set(-1, -0.25, 0);
      } else if (r === 'carousel') {
        const a = (k / 12) * TAU, th = T.carousel.rotation.y, lx = Math.cos(a) * 5.4, lz = Math.sin(a) * 5.4;
        const x = lx * Math.cos(th) + lz * Math.sin(th), z = -lx * Math.sin(th) + lz * Math.cos(th);
        seatPos.set(T.CAROUSEL.x + x, 0.5 + 2.2 + (k % 2) * 0.4, T.CAROUSEL.z + z);
        // forwards as it turns
        dir.set(-z, 0, x).normalize().multiplyScalar(-1);
      } else {
        const { p, d } = T.trackAt(C.s);
        seatPos.copy(p).y += 1.1; dir.copy(d);
      }
      return seatPos;
    }
    // the camera in the seat: the way the seat faces, turned by as far as the mouse has looked since you sat down
    function view() {
      if (!R || R.phase !== 'ride') return null;
      seat(R.k);
      const yaw = camYaw - R.yaw0, pitch = -(camPitch - R.pitch0) * 1.5;
      const base = Math.atan2(dir.x, dir.z), up = Math.asin(clamp(dir.y / dir.length(), -1, 1)) + pitch;
      v.set(Math.sin(base + yaw) * Math.cos(up), Math.sin(up), Math.cos(base + yaw) * Math.cos(up));
      return { pos: seatPos.clone().add(new THREE.Vector3(0, 1.0, 0)), dir: v };
    }

    /* ---------- every frame ---------- */
    function update(dt) {
      if (R) {
        R.t += dt;
        const r = R.r.id;
        if (R.phase === 'queue') {
          // your turn: the tower's ring down at the bottom, or the train standing at the station
          if ((r === 'tower' && T.fall >= 17) || (r === 'coaster' && C.stopT > 0.5)) board();
        } else {
          if (r === 'wheel' && T.wheelA - R.a0 >= TAU) leave('Ett varv i pariserhjulet. Vilken utsikt!');
          else if (r === 'tower') {
            if (T.fall >= 12 && T.fall < 12 + dt * 1.5 && audio && !muted) noiseBurst(audio.ctx.currentTime, 2.5, 0.2, 'highpass', 900, 0.5, 0, 0.05);
            if (R.t > 5 && T.fall >= 17) leave('Fritt fall: 74 meter på tre sekunder!');
          } else if (r === 'carousel' && R.t > 20) leave('Karusellen stannar. Snurrigt!');
          else if (r === 'coaster') {
            if (C.stopT <= 0) R.moved = true;
            else if (R.moved) leave('Två varv i berg-och-dalbanan!');
          }
        }
        // (where you are for everyone else: in the seat)
        if (R && R.phase === 'ride') { seat(R.k); player.x = seatPos.x; player.y = seatPos.y; player.z = seatPos.z; }
      }
      hud();
    }
    // a box where the car's dashboard goes: the ride, and what is going on
    function hud() {
      const key = R ? R.r.id + R.phase : '';
      if (key === lastBox) return;
      lastBox = key;
      E.dash.hidden = !R;
      if (!R) return;
      E.name.textContent = R.r.title;
      E.info.textContent = R.phase === 'queue' ? (R.r.id === 'tower' ? 'I kön: ringen ska ner först. E går ur kön' : 'I kön: tåget ska in till stationen. E går ur kön') : 'Musen tittar runt';
    }

    return {
      update, use, bail, view,
      get on() { return !!R; }, get riding() { return !!R && R.phase === 'ride'; },
      prompt() { const r = here(); return r ? 'Åk ' + r.name + ' (' + PRICE + ' kr)' : R && R.phase === 'queue' ? 'Gå ur kön' : null; },
      // for the tests
      debug: { get R() { return R; }, RIDE_LIST, station }
    };
  })();
