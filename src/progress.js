'use strict';

  /* ================= levels and trophies ================= */
  // XP for what you do: a job's pay (a third of it as XP; the street races pay too), every Dalahäst, getting away from
  // the police (more for more stars) and the games with friends (more for winning). Each level needs a little more XP
  // than the one before, and some levels unlock the workshop's best parts (WORKSHOP.unlocks). A trophy is a number to
  // reach in one of the counts kept here (S.st): some are counted where they happen (did, from the other files), the
  // rest are watched every frame (update). Every trophy gives XP too. I opens the board with the level, what the levels
  // unlock and the trophies (so does a click or a tap on the level). Everything is kept in the browser.
  const PROGRESS = (() => {
    const KEY = 'gubbe-niva';
    // the XP from one level to the next
    const need = (lv) => 150 + 75 * (lv - 1);
    // stat: the count it looks at (a number, or a list of the different things done); n: how much of it; unit: after the count
    const TROPHIES = [
      { id: 'jobb', name: 'Första lönen', text: 'Få betalt för ett jobb.', stat: 'jobs', n: 1, xp: 50 },
      { id: 'undan', name: 'Undan!', text: 'Kom undan polisen.', stat: 'escapes', n: 1, xp: 100 },
      { id: 'hopp', name: 'Mjuklandning', text: 'Landa mjukt med fallskärmen.', stat: 'chute', n: 1, xp: 100 },
      { id: 'plask', name: 'Plask!', text: 'Träffa en polis med en vattenballong.', stat: 'wetCop', n: 1, xp: 100 },
      { id: 'planka', name: 'Plankaren', text: 'Planka i tunnelbanan utan att åka fast.', stat: 'dodge', n: 1, xp: 100 },
      { id: 'natt', name: 'Nattugglan', text: 'Kör bil mitt i natten, mellan ett och fyra.', stat: 'night', n: 1, xp: 100 },
      { id: 'kaknas', name: 'Tornpiloten', text: 'Landa helikoptern på Kaknästornet.', stat: 'kaknas', n: 1, xp: 250 },
      { id: 'tivoli', name: 'Tivolikungen', text: 'Åk alla fyra attraktioner på Gröna Lund.', stat: 'rides', n: 4, xp: 250 },
      { id: 'lek', name: 'Lekkungen', text: 'Vinn en lek med dina vänner.', stat: 'wins', n: 1, xp: 250 },
      { id: 'trim', name: 'Trimmad', text: 'Kör en bil med motor steg 3 från verkstaden.', stat: 'trim', n: 1, xp: 250 },
      { id: 'lopp', name: 'Gatans kung', text: 'Kör alla ' + JOBS.RACES.length + ' gatlopp i mål.', stat: 'races', n: JOBS.RACES.length, xp: 400 },
      { id: 'bilar', name: 'Bilsamlaren', text: 'Kör 25 olika fordon.', stat: 'models', n: 25, xp: 400 },
      { id: 'mil', name: 'Långfärden', text: 'Kör 100 km.', stat: 'km', n: 100, unit: ' km', xp: 400 },
      { id: 'slit', name: 'Slitvargen', text: 'Tjäna 20 000 kr på jobb.', stat: 'jobKr', n: 20000, unit: ' kr', xp: 400 },
      { id: 'pasar', name: 'Skattjägaren', text: 'Hitta 50 pengapåsar.', stat: 'bags', n: 50, xp: 400 },
      { id: 'fart', name: '300 km/h', text: 'Kör i 300 km/h.', stat: 'kmh', n: 300, unit: ' km/h', xp: 500 },
      { id: 'fem', name: 'Ogripbar', text: 'Kom undan polisen från fem stjärnor.', stat: 'escape5', n: 1, xp: 500 },
      { id: 'dala', name: 'Dalahästjägaren', text: 'Hitta alla ' + HORSES.length + ' dalahästar.', stat: 'horses', n: HORSES.length, xp: 500 },
      { id: 'niva', name: 'Nivå 10', text: 'Nå nivå 10.', stat: 'level', n: 10, xp: 500 }
    ];

    /* ---------- what you have, kept in the browser ---------- */
    // xp: all you have got; got: the trophies taken; st: the counts (checked, so an old or edited entry can't break anything)
    const S = { xp: 0, got: {}, st: {} };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') {
        S.xp = Math.max(0, Math.floor(+s.xp) || 0);
        for (const t of TROPHIES) if (s.got && s.got[t.id]) S.got[t.id] = 1;
        for (const k in s.st || {}) {
          const v = s.st[k];
          if (Array.isArray(v)) S.st[k] = v.filter((x) => typeof x === 'string').slice(0, 200);
          else if (typeof v === 'number' && isFinite(v) && v > 0) S.st[k] = v;
        }
      }
    } catch (e) { /* a private window: kept for this visit only */ }
    let dirty = false, saveT = 0;
    function save() { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* kept for this visit */ } }
    window.addEventListener('pagehide', () => { if (dirty) save(); });
    const val = (k) => { const v = S.st[k]; return Array.isArray(v) ? v.length : v || 0; };
    function levelOf(xp) { let lv = 1; while (xp >= need(lv)) { xp -= need(lv); lv++; } return { lv, into: xp, need: need(lv) }; }
    let L = levelOf(S.xp);
    const fmt = (n) => Math.floor(n).toLocaleString('sv-SE');
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' och ' + a[a.length - 1]);

    /* ---------- counting ---------- */
    // one more of something, or (with what) one more of the different things of a kind, each counted once
    // (DAILY is told of every one, new or not, but not of the Dalahästar counted from before: quiet)
    function did(k, what, quiet) {
      if (!quiet) DAILY.add(k, 1, what);
      if (what === undefined) S.st[k] = val(k) + 1;
      else {
        const list = Array.isArray(S.st[k]) ? S.st[k] : (S.st[k] = []), w = String(what);
        if (list.includes(w)) return;
        list.push(w);
      }
      dirty = true;
      check();
    }
    const once = (k) => { if (!val(k)) did(k); };
    function best(k, v) { if (v > val(k)) { S.st[k] = v; dirty = true; check(); } }
    // the trophies reached since last time
    function check() {
      for (const t of TROPHIES) {
        if (S.got[t.id] || val(t.stat) < t.n) continue;
        S.got[t.id] = 1; dirty = true;
        show({ trophy: true, title: t.name, sub: t.text + ' +' + t.xp + ' XP' });
        gain(t.xp);
      }
    }
    function gain(xp) {
      xp = Math.round(xp);
      if (!(xp > 0)) return 0;
      const was = L.lv;
      S.xp += xp; L = levelOf(S.xp); dirty = true;
      pop(xp);
      for (let lv = was + 1; lv <= L.lv; lv++) {
        const u = WORKSHOP.unlocks.filter((x) => x.lv === lv).map((x) => x.text);
        show({ title: 'Nivå ' + lv + '!', sub: u.length ? 'Nu kan du köpa ' + andList(u) + ' i verkstaden.' : 'Nästa nivå om ' + fmt(need(lv)) + ' XP.' });
      }
      if (L.lv > was) best('level', L.lv);
      hud();
      return xp;
    }

    /* ---------- on the screen: the level in the corner, +XP, a new trophy or level ---------- */
    const E = {
      tag: $('lvTag'), num: $('lvNum'), bar: $('lvBar'), btn: $('btnLevel'), pop: $('xpPop'),
      award: $('award'), awardKind: $('awardKind'), awardTitle: $('awardTitle'), awardSub: $('awardSub'),
      board: $('trophies'), close: $('trClose'), level: $('trLevel'), trBar: $('trBar'), xp: $('trXp'), total: $('trTotal'), unlocks: $('trUnlocks'), count: $('trCount'), list: $('trList')
    };
    let shown = '';
    function hud() {
      const k = L.lv + ':' + Math.floor((L.into / L.need) * 100);
      if (k === shown) return;
      shown = k;
      E.num.textContent = L.lv; E.btn.textContent = 'Nivå ' + L.lv;
      E.bar.style.width = E.trBar.style.width = Math.floor((L.into / L.need) * 100) + '%';
      E.btn.style.setProperty('--p', Math.floor((L.into / L.need) * 100) + '%');
      E.tag.title = 'Nivå ' + L.lv + ': ' + fmt(L.into) + ' av ' + fmt(L.need) + ' XP till nästa. Klicka för utmaningarna och troféerna (I)';
    }
    // +XP over the toast, added up while they come close together
    let popN = 0, popAt = 0;
    function pop(xp) {
      if (!started) return;
      const now = performance.now();
      popN = now - popAt < 1500 ? popN + xp : xp; popAt = now;
      E.pop.textContent = '+' + fmt(popN) + ' XP';
      E.pop.hidden = false;
      E.pop.classList.remove('go'); void E.pop.offsetWidth; E.pop.classList.add('go');
    }
    E.pop.addEventListener('animationend', () => { E.pop.hidden = true; });
    // a new trophy or level, one at a time, with a fanfare
    const queue = [];
    let showT = 0;
    // a: title and sub; trophy, or cls and kind for something else (a level when neither)
    function show(a) { queue.push(a); }
    function fanfare(notes) { notes.forEach((f, i) => setTimeout(() => beep([f], 0.035, 0.18), i * 110)); }
    function award(dt) {
      if (showT > 0) { if ((showT -= dt) <= 0) E.award.hidden = true; return; }
      if (!queue.length || !started) return;
      const a = queue.shift();
      E.award.className = a.cls || (a.trophy ? '' : 'level');
      E.awardKind.textContent = a.kind || (a.trophy ? 'Ny trofé' : 'Ny nivå');
      E.awardTitle.textContent = a.title; E.awardSub.textContent = a.sub;
      E.award.hidden = false;
      E.award.classList.remove('go'); void E.award.offsetWidth; E.award.classList.add('go');
      showT = 4.5;
      fanfare(a.trophy ? [784, 988, 1175, 1568] : a.cls ? [659, 784, 1047] : [523, 659, 784, 1047, 1319]);
    }
    hud();

    /* ---------- the board: the level, what the levels unlock, the trophies ---------- */
    // a cup, as on every trophy
    function cup() {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'cup');
      p.setAttribute('d', 'M7 3h10v2h3.5v2.5a4.5 4.5 0 0 1-4.6 4.5A5 5 0 0 1 13 15v2.5h3V21H8v-3.5h3V15a5 5 0 0 1-2.9-3A4.5 4.5 0 0 1 3.5 7.5V5H7zm0 4H5.5v.5A2.5 2.5 0 0 0 7.4 10 5 5 0 0 1 7 8zm10 0v1a5 5 0 0 1-.4 2 2.5 2.5 0 0 0 1.9-2.5V7z');
      s.append(p);
      return s;
    }
    const countOf = (t) => (t.stat === 'km' ? (Math.floor(Math.min(val(t.stat), t.n) * 10) / 10).toString().replace('.', ',') : fmt(Math.min(val(t.stat), t.n)));
    let open = false;
    function render() {
      DAILY.render();
      E.level.textContent = L.lv;
      E.xp.textContent = fmt(L.into) + ' av ' + fmt(L.need) + ' XP till nivå ' + (L.lv + 1);
      E.total.textContent = fmt(S.xp) + ' XP i allt';
      E.unlocks.textContent = '';
      for (const u of WORKSHOP.unlocks) {
        const li = document.createElement('li'), b = document.createElement('b'), s = document.createElement('span');
        li.className = L.lv >= u.lv ? 'done' : '';
        b.textContent = 'Nivå ' + u.lv; s.textContent = cap(u.text) + ' i verkstaden';
        li.append(b, s); E.unlocks.append(li);
      }
      const got = TROPHIES.filter((t) => S.got[t.id]).length;
      E.count.textContent = got + ' av ' + TROPHIES.length;
      E.list.textContent = '';
      for (const t of TROPHIES) {
        const li = document.createElement('li'), txt = document.createElement('span'), b = document.createElement('b'), sm = document.createElement('small'), side = document.createElement('span');
        li.className = S.got[t.id] ? 'got' : '';
        b.textContent = t.name; sm.textContent = t.text;
        txt.append(b, sm);
        side.className = 'tr-side';
        side.textContent = S.got[t.id] ? 'Klar' : t.n > 1 ? countOf(t) + ' / ' + fmt(t.n) + (t.unit || '') : '';
        const xp = document.createElement('small'); xp.textContent = '+' + t.xp + ' XP';
        side.append(xp);
        li.append(cup(), txt, side); E.list.append(li);
      }
    }
    function openBoard() {
      if (open || !started || paused()) return;
      open = true;
      render();
      E.board.hidden = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0;
      if (!isTouch) E.close.focus();
      beep([523, 659], 0.03, 0.2);
    }
    function closeBoard() {
      if (!open) return;
      open = false;
      E.board.hidden = true;
      if (E.board.contains(document.activeElement)) document.activeElement.blur();
      requestLock();
    }
    E.close.addEventListener('click', closeBoard);
    E.board.addEventListener('click', (e) => { if (e.target === E.board) closeBoard(); });
    E.tag.addEventListener('click', openBoard);
    E.btn.addEventListener('pointerdown', (e) => { e.preventDefault(); openBoard(); });

    /* ---------- every frame: what is watched ---------- */
    let seeded = false;
    function update(dt) {
      // the Dalahästar you had found before there were trophies count too (on the first frame, not while this file loads:
      // all of them found gives a trophy, and showing it needs the files after this one)
      if (!seeded) { seeded = true; for (const h of horsesFound) did('horses', h, true); }
      const c = driving;
      if (c && started) {
        const v = Math.hypot(c.vx, c.vz);
        if (v > 0.5) { S.st.km = val('km') + (v * dt) / 1000; dirty = true; }
        best('kmh', Math.round(v * 3.6));
        if (v > 2) {
          did('models', c.M.id);
          const h = DAYNIGHT.hour;
          if (h >= 1 && h < 4 && !c.M.boat) once('night');
          if (c.tune && c.tune.engine >= 3) once('trim');
        }
        check();
      }
      award(dt);
      if (dirty && (saveT -= dt) <= 0) { saveT = 3; save(); }
    }

    return {
      update, did, gain, hud, show,
      get level() { return L.lv; }, get xp() { return S.xp; }, get open() { return open; },
      // a job of this kind paid kr (JOBS)
      job(kr, kind) { did('jobs'); did('job:' + kind); S.st.jobKr = val('jobKr') + kr; DAILY.add('jobKr', kr); check(); return gain(Math.max(10, Math.round(kr / 6))); },
      // you got away from the police with this many stars
      escaped(stars) { did('escapes'); if (stars >= 3) did('escape3'); if (stars >= 5) did('escape5'); gain(40 * stars); },
      // a game with friends is over: you played, and maybe won
      played(won) { if (won) did('wins'); gain(won ? 225 : 75); },
      toggle() { if (open) closeBoard(); else openBoard(); },
      // keys while the board is open: Esc and I close it, the rest wait
      keydown(e) {
        if (!open) return false;
        if (e.code === 'Escape' || e.code === 'KeyI') { e.preventDefault(); closeBoard(); }
        return true;
      },
      // for the tests
      debug: { S, TROPHIES, need, levelOf, best, render, closeBoard, get queue() { return queue; } }
    };
  })();
