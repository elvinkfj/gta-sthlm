'use strict';

  /* ================= the tunnelbana ================= */
  // At every T-bana entrance (the blue T signs, see src/city/blocks.js) E opens the board: pick a station, pay for a
  // ticket from the Kassa, and the train takes you there through the tunnel (a ride of a few seconds, seen from inside
  // the car) and you come up at that station's entrance. The three lines run as they do in Stockholm: the green, the red
  // and the blue, changing at T-Centralen. Without the money for a ticket you can dodge the fare, but the ticket
  // inspectors may be on the train.
  const METRO = (() => {
    const PRICE = 39, FINE = 1500, CATCH = 0.35, HOP = 1.6, CHANGE = 1.5;
    const LINES = [
      { name: 'Gröna linjen', col: '#3ea34a', stops: ['Hötorget', 'T-Centralen', 'Gamla stan', 'Slussen', 'Medborgarplatsen'] },
      { name: 'Röda linjen', col: '#d6202a', stops: ['Östermalmstorg', 'T-Centralen', 'Gamla stan', 'Slussen', 'Mariatorget'] },
      { name: 'Blå linjen', col: '#1f6bc4', stops: ['Kungsträdgården', 'T-Centralen', 'Rådhuset'] }
    ];
    // the entrances: where the T signs stand
    const STOPS = mapLabels.filter((l) => l[3] === 'tbana').map(([name, x, z]) => ({ name, x, z }));
    const E = {
      board: $('metro'), title: $('metroTitle'), info: $('metroInfo'), list: $('metroList'), close: $('metroClose'),
      ride: $('metroRide'), line: $('metroLine'), next: $('metroNext'), bar: $('metroBar')
    };
    // at: the entrance you stand at; R: the ride (legs: one per station passed, dur: the whole ride in seconds)
    let at = null, open = false, R = null;

    /* ---------- the way there ---------- */
    // the stations passed, each with the line that takes you there: straight along one line, or changing at a station
    // two lines share (the fewest stops)
    function route(a, b) {
      const along = (L, x, y) => { const i = L.stops.indexOf(x), j = L.stops.indexOf(y), s = []; for (let k = i; k !== j; k += j > i ? 1 : -1) s.push({ name: L.stops[k + (j > i ? 1 : -1)], L }); return s; };
      for (const L of LINES) if (L.stops.includes(a) && L.stops.includes(b)) return along(L, a, b);
      let best = null;
      for (const A of LINES) for (const B of LINES) {
        if (A === B || !A.stops.includes(a) || !B.stops.includes(b)) continue;
        for (const c of A.stops) if (B.stops.includes(c) && c !== a && c !== b) {
          const legs = [...along(A, a, c), ...along(B, c, b)];
          if (!best || legs.length < best.length) best = legs;
        }
      }
      return best || [];
    }
    const linesAt = (name) => LINES.filter((L) => L.stops.includes(name));
    const changes = (legs) => legs.filter((l, i) => i && l.L !== legs[i - 1].L).length;
    const minutes = (legs) => legs.length * 2 + changes(legs) * 3;

    /* ---------- the board ---------- */
    function stopHere() {
      if (!started || driving || MP.ride || FLY.on || CHUTE.on || R || (policeStop && policeStop.locked) || player.y > 1) return null;
      for (const s of STOPS) if (Math.hypot(player.x - s.x, player.z - s.z) < 3.5) return s;
      return null;
    }
    function show(s) {
      at = s; open = true;
      E.board.hidden = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0;
      E.title.textContent = s.name;
      const broke = JOBS.earned < PRICE;
      E.info.textContent = broke ? 'En biljett kostar ' + PRICE + ' kr, och du har bara ' + JOBS.earned + ' kr. Du kan planka, men då kan det bli biljettkontroll.' : 'Vart vill du åka? En biljett kostar ' + PRICE + ' kr.';
      E.list.textContent = '';
      let n = 0;
      for (const o of STOPS) {
        if (o === s) continue;
        const legs = route(s.name, o.name);
        if (!legs.length) continue;
        n++;
        const li = document.createElement('li'), b = document.createElement('button'), dots = document.createElement('span'), nm = document.createElement('b'), sm = document.createElement('small');
        b.type = 'button'; b.className = 'metro-stop';
        dots.className = 'metro-dots';
        for (const L of linesAt(o.name)) { const d = document.createElement('i'); d.style.background = L.col; d.title = L.name; dots.append(d); }
        nm.textContent = (n <= 9 ? n + '  ' : '') + o.name;
        const ci = legs.findIndex((l, i) => i && l.L !== legs[i - 1].L);
        sm.textContent = minutes(legs) + ' min' + (ci > 0 ? ', byte vid ' + legs[ci - 1].name : '');
        b.append(dots, nm, sm);
        b.addEventListener('click', () => go(o));
        li.append(b);
        E.list.append(li);
      }
      const first = E.list.querySelector('button');
      if (first && !isTouch) first.focus();
    }
    function hide() {
      if (!open) return;
      open = false;
      E.board.hidden = true;
      if (E.board.contains(document.activeElement)) document.activeElement.blur();
      requestLock();
    }
    E.close.addEventListener('click', hide);
    E.board.addEventListener('click', (e) => { if (e.target === E.board) hide(); });

    /* ---------- the ride ---------- */
    function go(to) {
      const from = at, legs = route(from.name, to.name);
      hide();
      if (!legs.length) return;
      // a ticket from the Kassa, or dodging the fare
      const paid = JOBS.spend(PRICE);
      const dur = legs.length * HOP + changes(legs) * CHANGE + 1.2;
      R = { from, to, legs, t: 0, dur, paid, shown: -1 };
      player.model.group.visible = false;
      player.vx = player.vz = 0;
      E.ride.hidden = false;
      document.body.classList.add('metro');
      beep([659, 523], 0.035, 0.35);
      if (audio && !muted) noiseBurst(audio.ctx.currentTime, 1.2, 0.08, 'lowpass', 300, 0.7, 0, 0.2);
    }
    function arrive() {
      const r = R;
      R = null;
      E.ride.hidden = true;
      document.body.classList.remove('metro');
      // up the stairs, beside the sign
      let spot = null;
      for (let d = 1.6; d <= 12 && !spot; d += 1.2) for (let i = 0; i < 8 && !spot; i++) {
        const a = (i / 8) * TAU, x = r.to.x + Math.sin(a) * d, z = r.to.z + Math.cos(a) * d;
        if (personFits(x, z) && !blockedAt(x, z, 0.4)) spot = { x, z };
      }
      const p = spot || { x: r.to.x, z: r.to.z };
      player.x = p.x; player.z = p.z; player.y = 0; player.vx = player.vz = player.vy = 0;
      player.model.group.visible = true;
      camTarget.set(player.x, 1.6, player.z);
      if (!r.paid && Math.random() < CATCH) {
        fines += FINE;
        beep([392, 330], 0.05, 0.5);
        toast('Biljettkontroll! Du hade ingen biljett och fick en tilläggsavgift på ' + fmtKr(FINE) + '.');
      } else {
        toast('Du kom upp vid ' + r.to.name + '.' + (r.paid ? '' : ' Ingen kontroll den här gången!'));
        if (!r.paid) PROGRESS.did('dodge');
      }
    }
    function update(dt) {
      if (!R) return;
      R.t += dt;
      // the sign in the car: the next station (or the change), and how far along the ride you are
      const k = clamp((R.t - 0.6) / (R.dur - 1.2), 0, 0.999), i = Math.min(R.legs.length - 1, Math.floor(k * R.legs.length)), leg = R.legs[i];
      if (i !== R.shown) {
        R.shown = i;
        const swap = i && leg.L !== R.legs[i - 1].L;
        E.line.textContent = leg.L.name; E.line.style.background = leg.L.col;
        E.next.textContent = (swap ? 'Byte till ' + leg.L.name.toLowerCase() + '. ' : '') + 'Nästa: ' + leg.name + (i === R.legs.length - 1 ? '. Här kliver du av.' : '');
        if (i) beep([784, 659], 0.025, 0.25);
      }
      E.bar.style.width = (k * 100).toFixed(1) + '%';
      if (R.t >= R.dur) arrive();
    }
    // straight up at the station you were going to (a game with friends starts, or you go to a friend)
    function bail() { if (R) { R.paid = true; arrive(); } }

    return {
      update, bail,
      get boardOpen() { return open; }, get riding() { return !!R; },
      prompt() { const s = stopHere(); return s ? 'Åk tunnelbana från ' + s.name : null; },
      // E at an entrance
      use() {
        const s = stopHere();
        if (!s) return false;
        if (PARTY.busy()) { toast('Ingen tunnelbana mitt i en lek!'); return true; }
        show(s);
        return true;
      },
      // keys while the board is open (Esc and E close it, 1–9 pick a station) or the train runs (only a few work)
      keydown(e) {
        if (open) {
          if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); hide(); return true; }
          const m = /^Digit([1-9])$/.exec(e.code), b = m && E.list.querySelectorAll('button')[Number(m[1]) - 1];
          if (b) { e.preventDefault(); b.click(); }
          return true;
        }
        return !!R && !['KeyT', 'KeyH', 'KeyQ'].includes(e.code);
      },
      // for the tests
      debug: { STOPS, LINES, route, show, go, get R() { return R; } }
    };
  })();
