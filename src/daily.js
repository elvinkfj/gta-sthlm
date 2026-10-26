'use strict';

  /* ================= daily challenges ================= */
  // Three small challenges a day, an easy one, a harder one and a hard one, new at midnight. The day's date picks them
  // (the same date always gives the same three), from those that can be done (no more Dalahästar to find: not that
  // one). A challenge counts one of the things PROGRESS counts (it sends them all here: DAILY.add), or something
  // watched here every frame (the distance driven, on a taxi job, in a boat, in the dark, and the speed). Each one
  // done pays from the Kassa and gives XP, and all three a bonus. They show on the level board (I), and progress and a
  // challenge done show on the screen. Kept in the browser for the day.
  const DAILY = (() => {
    const KEY = 'gubbe-dagens';
    const fmt = (n) => Math.floor(n).toLocaleString('sv-SE');
    // stat: what it counts; n: how much; distinct: different things (each counted once); best: the most at one time;
    // unit: after the count; ok: whether it can be done
    const POOL = [
      { id: 'taxi', tier: 1, stat: 'job:taxi', n: 2, text: 'Kör 2 taxikunder' },
      { id: 'paket', tier: 1, stat: 'job:paket', n: 2, text: 'Kör ut paket 2 gånger med Sprintern' },
      { id: 'mat', tier: 1, stat: 'job:mat', n: 2, text: 'Kör ut mat 2 gånger på mopeden' },
      { id: 'rides', tier: 1, stat: 'rides', n: 2, text: 'Åk 2 attraktioner på Gröna Lund' },
      { id: 'metro', tier: 1, stat: 'metro', n: 2, text: 'Åk tunnelbana 2 gånger' },
      { id: 'wet', tier: 1, stat: 'wet', n: 3, text: 'Blöt ner 3 personer med vattenballonger' },
      { id: 'km', tier: 1, stat: 'km', n: 5, unit: ' km', text: 'Kör 5 km' },
      { id: 'models', tier: 1, stat: 'models', n: 4, distinct: true, text: 'Kör 4 olika fordon' },
      { id: 'scrap', tier: 1, stat: 'scrap', n: 1, text: 'Sälj en bil på bilskroten i Hammarby hamn' },
      { id: 'bags', tier: 1, stat: 'bags', n: 3, text: 'Hitta 3 pengapåsar' },
      { id: 'horses', tier: 2, stat: 'horses', n: 2, text: 'Hitta 2 dalahästar', ok: () => HORSES.length - horsesFound.size >= 2 },
      { id: 'taxiKm', tier: 2, stat: 'taxiKm', n: 5, unit: ' km', text: 'Kör 5 km taxi' },
      { id: 'races', tier: 2, stat: 'races', n: 2, text: 'Kör 2 gatlopp i mål' },
      { id: 'escapes', tier: 2, stat: 'escapes', n: 2, text: 'Kom undan polisen 2 gånger' },
      { id: 'jobKr', tier: 2, stat: 'jobKr', n: 3000, unit: ' kr', text: 'Tjäna 3 000 kr på jobb' },
      { id: 'fall', tier: 2, stat: 'fall', n: 50, best: true, unit: ' m', text: 'Hoppa fallskärm med 50 meters fritt fall' },
      { id: 'boatKm', tier: 2, stat: 'boatKm', n: 3, unit: ' km', text: 'Kör 3 km båt' },
      { id: 'battaxi', tier: 2, stat: 'job:battaxi', n: 2, text: 'Kör 2 resor med båttaxi' },
      { id: 'darkKm', tier: 2, stat: 'darkKm', n: 3, unit: ' km', text: 'Kör 3 km i mörkret, mellan tio på kvällen och fyra på natten' },
      { id: 'polis', tier: 3, stat: 'job:polis', n: 2, text: 'Gripa 2 rånare med polisbilen' },
      { id: 'escape3', tier: 3, stat: 'escape3', n: 1, text: 'Kom undan polisen från tre stjärnor' },
      { id: 'kmh', tier: 3, stat: 'kmh', n: 250, best: true, unit: ' km/h', text: 'Kör i 250 km/h' },
      { id: 'kaknas', tier: 3, stat: 'kaknas', n: 1, text: 'Landa helikoptern på Kaknästornet' },
      { id: 'jobKr3', tier: 3, stat: 'jobKr', n: 8000, unit: ' kr', text: 'Tjäna 8 000 kr på jobb' },
      { id: 'tour', tier: 3, stat: 'rides', n: 4, distinct: true, text: 'Åk alla fyra attraktionerna på Gröna Lund' }
    ];
    // what each tier pays, and all three
    const PAY = [null, { kr: 150, xp: 75 }, { kr: 300, xp: 150 }, { kr: 500, xp: 250 }], BONUS = { kr: 300, xp: 200 };

    /* ---------- the day and its three ---------- */
    const dayOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // the three for a day: one of each tier, picked by a random number seeded with the date
    function choose(day) {
      let h = 2166136261;
      for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
      const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
      return [1, 2, 3].map((t) => { const can = POOL.filter((c) => c.tier === t && (!c.ok || c.ok())); return can[Math.floor(next() * can.length)].id; });
    }
    // D: the day, its three (ids), how far each has got (v), the different things counted (seen), which are done, the bonus
    let D = null;
    function fresh(day) { const ids = choose(day); D = { day, ids, v: ids.map(() => 0), seen: ids.map(() => []), done: ids.map(() => false), bonus: false }; }
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.day === dayOf(new Date()) && Array.isArray(s.ids) && s.ids.length === 3 && s.ids.every((id) => POOL.some((c) => c.id === id))) {
        D = { day: s.day, ids: s.ids, v: s.ids.map((id, i) => Math.max(0, +(s.v && s.v[i]) || 0)), seen: s.ids.map((id, i) => (s.seen && Array.isArray(s.seen[i]) ? s.seen[i].filter((x) => typeof x === 'string').slice(0, 100) : [])), done: s.ids.map((id, i) => !!(s.done && s.done[i])), bonus: !!s.bonus };
      }
    } catch (e) { /* a private window: kept for this visit only */ }
    if (!D) fresh(dayOf(new Date()));
    let dirty = true, saveT = 0;
    function save() { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* kept for this visit */ } }
    window.addEventListener('pagehide', () => { if (dirty) save(); });
    const ch = (i) => POOL.find((c) => c.id === D.ids[i]);
    const shownOf = (c, v) => (c.unit === ' km' ? (Math.floor(Math.min(v, c.n) * 10) / 10).toString().replace('.', ',') : fmt(Math.min(v, c.n)));
    const andPay = (p) => '+' + fmt(p.kr) + ' kr och +' + p.xp + ' XP';

    /* ---------- counting ---------- */
    // something PROGRESS counted (n of it, or the thing what), or a distance or speed watched here
    function add(stat, n = 1, what) {
      D.ids.forEach((id, i) => {
        const c = ch(i);
        if (c.stat !== stat || D.done[i]) return;
        const was = D.v[i];
        if (c.best) D.v[i] = Math.max(was, n);
        else if (c.distinct) { const w = String(what); if (what === undefined || D.seen[i].includes(w)) return; D.seen[i].push(w); D.v[i] = D.seen[i].length; }
        else D.v[i] = was + n;
        if (D.v[i] === was) return;
        dirty = true;
        if (D.v[i] >= c.n) done(i);
        // (on the way: every whole one, and for a distance every whole km)
        else if (!c.best && Math.floor(D.v[i]) > Math.floor(was)) note(c.text + ': ' + shownOf(c, D.v[i]) + ' av ' + fmt(c.n) + (c.unit || ''));
      });
    }
    function done(i) {
      const c = ch(i), p = PAY[c.tier];
      D.done[i] = true; dirty = true;
      JOBS.reward(p.kr);
      PROGRESS.show({ cls: 'daily', kind: 'Dagens utmaning klar', title: c.text + '!', sub: andPay(p) });
      PROGRESS.gain(p.xp);
      if (D.done.every(Boolean) && !D.bonus) {
        D.bonus = true;
        JOBS.reward(BONUS.kr);
        PROGRESS.show({ cls: 'daily', kind: 'Dagens utmaningar', title: 'Alla tre klara!', sub: 'Bonus ' + andPay(BONUS) + '. Nya utmaningar i morgon.' });
        PROGRESS.gain(BONUS.xp);
      }
      save();
    }
    // a line over the +XP while a challenge goes on
    const noteEl = $('dailyNote');
    let noteT = 0;
    function note(text) {
      if (!started) return;
      noteEl.textContent = text; noteEl.hidden = false; noteT = 3.5;
      noteEl.classList.remove('go'); void noteEl.offsetWidth; noteEl.classList.add('go');
    }

    /* ---------- on the level board, and in the corner ---------- */
    const E = { list: $('trDaily'), left: $('trDailyLeft'), tag: $('dailyTag'), count: $('dailyCount') };
    let tagged = -1;
    function tag() { const n = D.done.filter(Boolean).length; if (n === tagged) return; tagged = n; E.count.textContent = n + '/3'; E.tag.classList.toggle('all', n === 3); }
    function render() {
      E.list.textContent = '';
      D.ids.forEach((id, i) => {
        const c = ch(i), p = PAY[c.tier], li = document.createElement('li'), txt = document.createElement('span'), b = document.createElement('b'), bar = document.createElement('span'), fill = document.createElement('i'), side = document.createElement('span'), sm = document.createElement('small');
        li.className = D.done[i] ? 'got' : '';
        b.textContent = c.text;
        bar.className = 'lv-bar'; fill.style.width = Math.min(100, (D.v[i] / c.n) * 100) + '%'; bar.append(fill);
        txt.append(b, bar);
        side.className = 'tr-side';
        side.textContent = D.done[i] ? 'Klar' : shownOf(c, D.v[i]) + ' / ' + fmt(c.n) + (c.unit || '');
        sm.textContent = '+' + fmt(p.kr) + ' kr · +' + p.xp + ' XP';
        side.append(sm);
        const n = document.createElement('span'); n.className = 'dl-num'; n.textContent = i + 1;
        li.append(n, txt, side);
        E.list.append(li);
      });
      // the time left until midnight, when new ones come
      const now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), m = Math.max(1, Math.ceil((mid - now) / 60000));
      E.left.textContent = (D.bonus ? 'Alla klara! ' : 'Alla tre: bonus ' + andPay(BONUS) + '. ') + 'Nya om ' + (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min.';
    }
    E.tag.addEventListener('click', () => PROGRESS.toggle());
    tag();

    /* ---------- every frame: the distances and the speed, a new day ---------- */
    let told = false, dayT = 0;
    function update(dt) {
      if (!started) return;
      // (the day's three, once you have started playing)
      if (!told) {
        told = true;
        if (!D.bonus) PROGRESS.show({ cls: 'daily', kind: 'Dagens utmaningar', title: D.done.some(Boolean) ? D.done.filter(Boolean).length + ' av 3 klara' : 'Tre nya utmaningar', sub: D.ids.filter((id, i) => !D.done[i]).map((id) => '• ' + POOL.find((c) => c.id === id).text).join('\n') + '\n' + (isTouch ? 'Tryck på Nivå för att se dem.' : 'Tryck I för att se dem.') });
      }
      if ((dayT -= dt) <= 0) {
        dayT = 10;
        const day = dayOf(new Date());
        if (day !== D.day) { fresh(day); dirty = true; told = false; }
      }
      const c = driving;
      if (c) {
        const v = Math.hypot(c.vx, c.vz), km = (v * dt) / 1000;
        if (v > 0.5) {
          add('km', km);
          const j = JOBS.job;
          if (j && j.kind === 'taxi') add('taxiKm', km);
          if (c.M.boat) add('boatKm', km);
          const h = DAYNIGHT.hour;
          if ((h >= 22 || h < 4) && !c.M.boat) add('darkKm', km);
        }
        add('kmh', Math.round(v * 3.6));
      }
      if (noteT > 0 && (noteT -= dt) <= 0) noteEl.hidden = true;
      if (dirty && (saveT -= dt) <= 0) { saveT = 3; save(); }
      tag();
    }

    return {
      update, add, render,
      // what is in memory into localStorage now (ACCOUNT, before it sends the save)
      flush() { if (dirty) save(); },
      get ids() { return D.ids.slice(); }, get done() { return D.done.slice(); },
      // for the tests: the three a day would get, and today's set to these (fresh)
      debug: { POOL, PAY, BONUS, choose, dayOf, get D() { return D; }, set(ids) { D = { day: D.day, ids, v: ids.map(() => 0), seen: ids.map(() => []), done: ids.map(() => false), bonus: false }; dirty = true; tag(); },
        // (as if the day had changed: the next frame gives today's three again, from nothing)
        newDay() { D.day = 'i går'; dayT = 0; } }
    };
  })();
