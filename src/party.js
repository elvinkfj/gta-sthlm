'use strict';

  /* ================= games with friends ================= */
  // Games for everyone in a room (MP). The one who has the room starts a game from the room sign (P) and keeps the score:
  // their game sends how it stands to the others every second and as soon as something happens, and every game shows it.
  // Polis och tjuv: one of you is the police and chases the others, and you take turns being the police. Every second a
  // thief is free gives them a point, and when the police catch a thief the police get the seconds that were left. A thief
  // is caught when the police (in a car or on foot) touch them, as the police's own game sees it.
  // Kurragömma goes the same way, but the one who seeks first counts to 60 in the dark while the others hide, and then
  // can't see them on the maps or their names through the walls. Coming near enough to someone finds them.
  // Gatlopp mot varandra: everyone is put on a starting grid at one of the street races, and you race it at the same time.
  // Each game runs its own race (JOBS) and tells the one who has the room how far it has got, and its time at the finish.
  const PARTY = (() => {
    // seconds: the police count before the hunt, the hunt, the pause between rounds, the results at the end; on the grid
    // before a race, the longest a race may go on, and how long the others have left once the first one is home. Kurragömma:
    // the counting in the dark, the seeking, and how near is near enough to find someone
    const COUNT = 10, HUNT = 180, BREAK = 7, RESULT = 15, REACH = 0.6, GRID = 15, RACE_MAX = 600, AFTER = 60, HIDE = 60, SEEK = 240, FIND = 3;
    const PHASES = { cnr: ['count', 'hunt', 'end', 'over'], hide: ['count', 'hunt', 'end', 'over'], race: ['grid', 'race', 'over'] };
    const countOf = (n) => (n === 'hide' ? HIDE : COUNT), huntOf = (n) => (n === 'hide' ? SEEK : HUNT), gameName = (n) => (n === 'hide' ? 'Kurragömma' : 'Polis och tjuv');
    const E = {
      panel: $('party'), icon: $('partyIcon'), title: $('partyTitle'), sub: $('partySub'), clock: $('partyClock'), big: $('partyBig'),
      board: $('partyBoard'), boardTitle: $('partyBoardTitle'), boardList: $('partyBoardList'), start: $('gameCnr'), startHide: $('gameHide'), races: $('gameRaces'),
      stop: $('gameStop'), hint: $('mpGamesHint'), blind: $('partyBlind'), blindClock: $('partyBlindClock')
    };
    // G: the game as it stands (kept by the one who has the room, or as it last came from them), or null. n: which game,
    // ph: its phase, t: seconds left of it, ids: who plays. Polis och tjuv and kurragömma: sc their points, out caught (or
    // found) this round, r of R the round, cop who is the police (or seeks) this round. Gatlopp: race, prog how far each has
    // got (checkpoints), fin their time at the finish (0 still racing, -1 out)
    let G = null, seen = null, last = performance.now(), sendT = 0, bigT = 0, beepAt = 0, lastHud = '', lastTags = '', lastSign = '';
    const names = new Map(), asked = new Map();
    // your own race: your place on the grid and the car put there, how far you have got, your time at the finish
    const mine = { spot: null, car: null, racing: false, prog: 0, progT: 0, fin: 0 };
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0), str = (v) => (typeof v === 'string' ? v.slice(0, 64) : '');
    const nameOf = (id) => (id === MP.myId ? MP.myName : names.get(id) || 'Någon');
    const fmt = (t) => { const s = Math.ceil(Math.max(0, t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const fmtRace = (t) => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0').replace('.', ',');
    const ord = (n) => n + (n <= 2 ? ':a' : ':e');
    const thieves = () => G.ids.filter((id) => id !== G.cop);
    const isOut = (id) => G.out[G.ids.indexOf(id)];
    const raceOf = () => JOBS.RACES.find((r) => r.id === G.race);
    // you take part in a game that is on (rather than having come into the room after it started)
    const busy = () => !!G && G.ph !== 'over' && G.ids.includes(MP.myId);

    /* ---------- what goes between you ---------- */
    function clean(g) {
      if (!g || typeof g !== 'object') return null;
      if (g.a === 'catch') { const who = str(g.who); return who ? { a: 'catch', who } : null; }
      if (g.a === 'prog') return { a: 'prog', p: clamp(num(g.p), 0, 99) };
      if (g.a === 'fin') return { a: 'fin', t: clamp(num(g.t), 1, 3600) };
      if (g.a === 'out') return { a: 'out' };
      if (g.a !== 'state') return null;
      if (!PHASES[g.n]) return { a: 'state', n: '' };
      const ids = (Array.isArray(g.ids) ? g.ids : []).slice(0, 8).map(str), list = (v) => (Array.isArray(v) ? v : []);
      const s = { a: 'state', n: g.n, ph: PHASES[g.n].includes(g.ph) ? g.ph : 'over', t: clamp(num(g.t), 0, 900), ids };
      if (g.n !== 'race') {
        const R = clamp(num(g.R) | 0, 1, 8), sc = list(g.sc), out = list(g.out);
        return Object.assign(s, { r: clamp(num(g.r) | 0, 1, R), R, cop: str(g.cop), sc: ids.map((_, i) => clamp(num(sc[i]), 0, 99999)), out: ids.map((_, i) => !!out[i]) });
      }
      const race = JOBS.RACES.find((r) => r.id === g.race), prog = list(g.prog), fin = list(g.fin);
      if (!race) return { a: 'state', n: '' };
      return Object.assign(s, { race: race.id, prog: ids.map((_, i) => clamp(num(prog[i]), 0, 99)), fin: ids.map((_, i) => clamp(num(fin[i]), -1, 3600)) });
    }
    function heard(from, g) {
      // (what the players do counts only with the one who has the room, and how the game stands only comes from them)
      if (g.a !== 'state') { if (MP.host) told(from, g); return; }
      if (MP.host || from !== MP.hostId) return;
      if (!g.n) { if (G) { const early = G.ph !== 'over'; finish(); if (early) toast('Leken är avslutad.'); } return; }
      G = g;
      show();
    }
    function told(from, g) { if (g.a === 'catch') caught(from, g.who); else raceNews(from, g); }
    // what your own game has to tell the one who has the room (which may be you)
    function tell(g) { if (MP.host) told(MP.myId, g); else MP.event('game', { g }); }
    function publish() {
      // (twice a second during a race, so that everyone's place is up to date)
      sendT = G && G.n === 'race' && G.ph === 'race' ? 0.5 : 1;
      if (!G) { MP.event('game', { g: { a: 'state', n: '' } }); return; }
      const { cops, ...w } = G, r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
      w.t = r1(G.t);
      if (G.sc) w.sc = G.sc.map(r1);
      if (G.prog) { w.prog = G.prog.map(r2); w.fin = G.fin.map(r2); }
      MP.event('game', { g: w });
    }
    MP.games({ clean, heard, busy });

    /* ---------- keeping the game (the one who has the room) ---------- */
    // who plays: you and everyone who has come into the game
    function players() {
      if (!MP.inRoom || !MP.host || G) return null;
      const ids = [MP.myId, ...MP.friends().filter((f) => f.at).map((f) => f.id)];
      return ids.length < 2 ? null : ids;
    }
    function open(game) {
      MP.closePanel();
      if (!started) startGame();
      G = game;
      changed();
    }
    // n: polis och tjuv (cnr) or kurragömma (hide). order: who is the police, or seeks, in which round (for the tests);
    // otherwise drawn at random
    function begin(order, n = 'cnr') {
      const ids = players();
      if (!ids) return;
      const cops = Array.isArray(order) ? order.filter((id) => ids.includes(id)) : ids.slice();
      if (!Array.isArray(order)) for (let i = cops.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cops[i], cops[j]] = [cops[j], cops[i]]; }
      open({ a: 'state', n, ph: 'count', r: 1, R: cops.length, cop: cops[0], t: countOf(n), ids, sc: ids.map(() => 0), out: ids.map(() => false), cops });
    }
    function beginRace(id) {
      const ids = players(), race = JOBS.RACES.find((r) => r.id === id);
      if (!ids || !race) return;
      open({ a: 'state', n: 'race', ph: 'grid', race: race.id, t: GRID, ids, prog: ids.map(() => 0), fin: ids.map(() => 0) });
    }
    function changed() { publish(); show(); }
    function endRound() { G.ph = 'end'; G.t = BREAK; changed(); }
    function over() { G.ph = 'over'; G.t = RESULT; changed(); }
    function close() { G = null; publish(); finish(); }
    function nextRound() {
      // (the next one whose turn it is to be the police, if they are still here)
      let r = G.r;
      while (r < G.R && !G.ids.includes(G.cops[r])) r++;
      if (r >= G.R) { over(); return; }
      Object.assign(G, { ph: 'count', r: r + 1, cop: G.cops[r], t: countOf(G.n), out: G.ids.map(() => false) });
      changed();
    }
    function caught(from, who) {
      if (!G || G.n === 'race' || G.ph !== 'hunt' || from !== G.cop || who === G.cop) return;
      const i = G.ids.indexOf(who), c = G.ids.indexOf(G.cop);
      if (i < 0 || G.out[i]) return;
      G.out[i] = true;
      if (c >= 0) G.sc[c] += G.t;
      if (thieves().every(isOut)) endRound(); else changed();
    }
    function raceNews(from, g) {
      if (!G || G.n !== 'race' || G.ph !== 'race') return;
      const i = G.ids.indexOf(from);
      if (i < 0 || G.fin[i]) return;
      if (g.a === 'prog') { G.prog[i] = g.p; return; }
      if (g.a === 'fin') {
        G.fin[i] = g.t;
        // the first one home: the others have a minute left
        if (G.fin.filter((f) => f > 0).length === 1) G.t = Math.min(G.t, AFTER);
      } else if (g.a === 'out') G.fin[i] = -1;
      else return;
      if (G.fin.every((f) => f)) over(); else changed();
    }
    // the clock: true when it has run out
    function due(dt) {
      if ((G.t -= dt) > 0) { if ((sendT -= dt) <= 0) publish(); return false; }
      return true;
    }
    function run(dt) {
      // whoever has left the room has left the game, and alone there is no game
      const here = new Set([MP.myId, ...MP.friends().map((f) => f.id)]);
      for (let i = G.ids.length - 1; i >= 0; i--) {
        if (here.has(G.ids[i])) continue;
        for (const k of ['ids', 'sc', 'out', 'prog', 'fin']) if (G[k]) G[k].splice(i, 1);
        sendT = 0;
      }
      if (G.ph !== 'over' && G.ids.length < 2) { over(); return; }
      if (G.n === 'race') {
        if (G.ph === 'race' && G.fin.every((f) => f)) { over(); return; }
        if (!due(dt)) return;
        if (G.ph === 'grid') { G.ph = 'race'; G.t = RACE_MAX; changed(); }
        else if (G.ph === 'race') { G.fin = G.fin.map((f) => f || -1); over(); }
        else close();
        return;
      }
      // without the police (or the one who seeks) the round is over
      if ((G.ph === 'count' || G.ph === 'hunt') && !G.ids.includes(G.cop)) { endRound(); return; }
      if (G.ph === 'hunt') {
        const k = Math.min(dt, G.t);
        G.ids.forEach((id, i) => { if (id !== G.cop && !G.out[i]) G.sc[i] += k; });
        if (thieves().every(isOut)) { endRound(); return; }
      }
      if (!due(dt)) return;
      if (G.ph === 'count') { G.ph = 'hunt'; G.t = huntOf(G.n); changed(); }
      else if (G.ph === 'hunt') endRound();
      else if (G.ph === 'end') nextRound();
      else close();
    }
    function stopGame() {
      if (!MP.host || !G) return;
      close();
      toast('Du avslutade leken.');
    }

    /* ---------- polis och tjuv and kurragömma: catching (the police's, or the seeker's, own game) ---------- */
    // where you are: in a car (its length and width) or on foot
    function myBody() {
      const c = driving || MP.ride;
      return c ? { x: c.x, y: 0, z: c.z, h: c.h, L: c.M.L, W: c.M.W } : { x: player.x, y: player.y, z: player.z, h: 0, L: 0, W: 0 };
    }
    // each of you as a line with a thickness: a car a line along its middle as wide as the car, someone on foot a point
    function ends(b) {
      const r = b.W ? b.W / 2 : 0.4, hl = b.L ? Math.max(0, b.L / 2 - r) : 0, sx = Math.sin(b.h) * hl, sz = Math.cos(b.h) * hl;
      return { ax: b.x - sx, az: b.z - sz, bx: b.x + sx, bz: b.z + sz, r };
    }
    function toLine(px, pz, s) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz, k = l2 ? clamp(((px - s.ax) * dx + (pz - s.az) * dz) / l2, 0, 1) : 0;
      return Math.hypot(px - s.ax - dx * k, pz - s.az - dz * k);
    }
    // the gap between two of you (below zero: overlapping)
    function gap(a, b) {
      const A = ends(a), B = ends(b);
      return Math.min(toLine(A.ax, A.az, B), toLine(A.bx, A.bz, B), toLine(B.ax, B.az, A), toLine(B.bx, B.bz, A)) - A.r - B.r;
    }
    function hunt(now) {
      if (G.ph !== 'hunt' || G.cop !== MP.myId) return;
      const me = myBody();
      for (const f of MP.friends()) {
        const i = G.ids.indexOf(f.id);
        if (i < 0 || G.out[i] || !f.at || (asked.get(f.id) || 0) > now) continue;
        if (Math.abs(f.at.y - me.y) > 2.5 || gap(me, f.at) > (G.n === 'hide' ? FIND : REACH)) continue;
        // (asked once: the answer comes with how the game stands)
        asked.set(f.id, now + 1500);
        tell({ a: 'catch', who: f.id });
      }
    }
    // the police get a police car with the blue lights on
    function copCar() {
      if (policeStop && policeStop.locked) return;
      if (!driving || !driving.M.police) chooseModel(MODEL.polis);
      if (driving && driving.M.police && !driving.M.boat) { driving.siren = true; driving.yelp = false; }
    }

    /* ---------- gatlopp mot varandra: your own race ---------- */
    // your place on the starting grid: two by two up the street from the start towards the first checkpoint
    function gridSpot(R, slot, M) {
      const ns = R.route.split(' ').map((id) => nodeIndex.get(id)), f = edgeFrame(ns[0], ns[1]), h = Math.atan2(f.ux, f.uz);
      const lane = Math.abs(f.lane), side = slot % 2 ? -1 : 1, s0 = 12 + (slot >> 1) * 8;
      const at = (s, lat) => ({ x: f.A.x + f.ux * s + f.rx * lat, z: f.A.z + f.uz * s + f.rz * lat, h });
      for (const ds of [0, 3, -3, 6]) for (const k of [1, 0.6, 0.25]) {
        const p = at(clamp(s0 + ds, 6, f.len - 12), side * lane * k);
        if (spotFree(M, p.x, p.z, p.h, driving)) return p;
      }
      return at(clamp(s0, 6, f.len - 12), side * lane * 0.5);
    }
    function park(c, p) {
      c.x = p.x; c.z = p.z; c.h = p.h; c.vx = c.vz = 0; c.steer = 0;
      c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.h;
    }
    // off to the start, in the car you sit in (or the one you chose last, or a Porsche)
    function toGrid() {
      const R = raceOf(), slot = G.ids.indexOf(MP.myId);
      if (!R || slot < 0 || (policeStop && policeStop.locked)) return;
      if (MP.ride) MP.unride();
      // out on the water: the boat is left where it is
      if (driving && driving.M.boat) {
        const b = driving;
        setOccupant(b, null); driving = null; player.model.group.visible = true;
        if (b === spawnedCar) { removeCar(b); spawnedCar = null; }
      }
      if (JOBS.job) JOBS.key();
      const M = driving ? driving.M : spawnedCar && !spawnedCar.M.boat ? spawnedCar.M : MODEL.sport;
      // (the traffic in the way is cleared off the street)
      let p = gridSpot(R, slot, M);
      for (const c of cars.slice()) if (c.bot && !c.police && !c.keep && Math.hypot(c.x - p.x, c.z - p.z) < 12) removeCar(c);
      p = gridSpot(R, slot, M);
      player.x = p.x; player.z = p.z; player.y = 0; player.vx = player.vz = player.vy = 0;
      if (!driving) chooseModel(M);
      if (driving) park(driving, p);
      mine.spot = p; mine.car = driving;
      camYaw = p.h; camTarget.set(p.x, 1.6, p.z);
    }
    function startMine() {
      Object.assign(mine, { racing: false, prog: 0, progT: 0, fin: 0 });
      if (!driving || driving.M.boat || (policeStop && policeStop.locked)) { tell({ a: 'out' }); toast('Du satt inte i en bil när gatloppet startade, så du är inte med.'); return; }
      // (told once the race has had its say about the finish, so that your place is the last word)
      JOBS.partyRace(raceOf(), (t) => { mine.fin = t; mine.racing = false; setTimeout(() => tell({ a: 'fin', t }), 0); });
      mine.racing = true;
    }
    // the race is over for everyone: yours too, if you are still out there
    function stopMine() {
      mine.racing = false;
      if (JOBS.job && JOBS.job.party && !mine.fin) JOBS.key();
    }
    function raceTick(dt) {
      if (!G.ids.includes(MP.myId)) return;
      // on the grid: a car chosen with B goes to your place too
      if (G.ph === 'grid' && driving && driving !== mine.car && mine.spot && !driving.M.boat) { park(driving, mine.spot); mine.car = driving; camYaw = mine.spot.h; }
      if (G.ph !== 'race' || !mine.racing) return;
      const j = JOBS.job;
      // (out of the car too long, the car wrecked or arrested: the race is over for you)
      if (!j || !j.party) { mine.racing = false; tell({ a: 'out' }); toast('Du är ute ur gatloppet.'); return; }
      // how far you have got: the checkpoints passed, and the way to the next
      const R = j.race, A = R.pts[j.i - 1], B = R.pts[Math.min(j.i, R.pts.length - 1)], c = j.car;
      const L = Math.hypot(B.x - A.x, B.z - A.z) || 1, d = Math.hypot(B.x - c.x, B.z - c.z);
      mine.prog = j.i - 1 + clamp(1 - d / L, 0, 0.99);
      if ((mine.progT -= dt) <= 0) { mine.progT = 0.5; tell({ a: 'prog', p: Math.round(mine.prog * 100) / 100 }); }
    }
    // the order: home first (fastest first), then those still racing (furthest first), then those who are out
    function standings() {
      const key = (s) => (s.fin > 0 ? s.fin : s.fin === 0 ? 1e5 - s.p : 2e5);
      return G.ids.map((id, i) => ({ id, fin: G.fin[i], p: id === MP.myId && mine.racing ? mine.prog : G.prog[i] })).sort((a, b) => key(a) - key(b));
    }
    const placeOf = (id) => standings().findIndex((s) => s.id === id) + 1;

    /* ---------- showing it ---------- */
    function big(text, sub, t) {
      E.big.textContent = text;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; E.big.append(s); }
      E.big.hidden = false; bigT = t;
    }
    // what has happened since the game was shown last
    function show() {
      const was = seen && seen.n === G.n ? seen : null, fresh = !was || was.ph !== G.ph || was.r !== G.r;
      seen = { n: G.n, ph: G.ph, r: G.r };
      // (no helicopter in a game: down to the ground with you)
      // (and the police give up the chase: while you play they leave you alone)
      if (fresh && (G.ph === 'count' || G.ph === 'grid') && G.ids.includes(MP.myId)) {
        FLY.bail(); CHUTE.bail(); METRO.bail(); RIDES.bail(); WORKSHOP.bail();
        if (wanted) { endChase(false); toast('Polisen lämnar dig i fred medan ni leker.'); }
      }
      if (G.n !== 'race') {
        Object.assign(seen, { out: new Set(G.ids.filter((id, i) => G.out[i])), copSc: G.sc[G.ids.indexOf(G.cop)] || 0 });
        showCnr(was, fresh);
      } else {
        seen.fin = new Map(G.ids.map((id, i) => [id, G.fin[i]]));
        showRace(was, fresh);
      }
    }
    function showCnr(was, fresh) {
      const me = MP.myId, iCop = G.cop === me, mineIn = G.ids.includes(me), hide = G.n === 'hide', who = nameOf(G.cop);
      if (fresh && G.ph === 'count') {
        beepAt = 0;
        if (mineIn && JOBS.job) JOBS.key();
        if (hide) {
          // (the dark screen says it all)
          if (iCop) toast('Du letar! De andra gömmer sig medan du blundar.');
          else if (mineIn) big('GÖM DIG!', who + ' blundar i ' + HIDE + ' sekunder. Hitta ett bra gömställe!', 3.5);
          else toast(who + ' letar i kurragömma. Du är med nästa gång.');
        } else if (iCop) { big('DU ÄR POLIS!', 'Räkna till ' + COUNT + ', sedan jagar du de andra.', 3.5); copCar(); toast('Du är polis! Ta tjuvarna genom att köra in i dem eller springa ikapp dem.'); }
        else if (mineIn) big('SPRING!', who + ' är polis och kommer efter dig om ' + COUNT + ' sekunder.', 3.5);
        else toast(who + ' är polis i polis och tjuv. Du är med nästa gång.');
        beep([523, 659], 0.04, 0.3);
      } else if (fresh && G.ph === 'hunt') {
        if (hide && iCop) { big('LETA!', 'Gå eller kör nära någon så har du hittat hen.', 2.2); toast('De andra syns inte på kartan nu. Leta med ögonen!'); }
        else if (hide && mineIn) big('NU KOMMER JAG!', who + ' letar efter dig. Håll dig gömd!', 2.2);
        else if (iCop) big('JAGA!', 'Kör in i tjuvarna eller spring ikapp dem.', 2.2);
        else if (mineIn) big('POLISEN KOMMER!', 'Håll dig undan ' + who + '.', 2.2);
        beep([784, 1047], 0.05, 0.45);
      } else if (fresh && G.ph === 'end') {
        const all = thieves().length > 0 && thieves().every(isOut);
        big(all ? (hide ? 'ALLA HITTADE!' : 'ALLA TAGNA!') : 'TIDEN ÄR UTE!', G.r < G.R ? 'Nästa runda börjar snart.' : 'Det var sista rundan.', 3);
        beep([659, 523], 0.04, 0.4);
      } else if (fresh && G.ph === 'over') results();
      // thieves caught (or hiders found) since then
      if (was && was.r === G.r) for (const id of G.ids) {
        if (!isOut(id) || was.out.has(id)) continue;
        const pts = Math.round(seen.copSc - was.copSc);
        if (id === me) { big(hide ? 'HITTAD!' : 'TAGEN!', who + (hide ? ' hittade dig.' : ' tog dig.') + ' Vänta på nästa runda.', 3); beep([392, 311, 233], 0.05, 0.5); }
        else if (iCop) { toast((hide ? 'Du hittade ' : 'Du tog ') + nameOf(id) + '! Du får sekunderna som var kvar: ' + pts + ' p.'); beep([880, 1175], 0.05, 0.3); }
        else toast(who + (hide ? ' hittade ' : ' tog ') + nameOf(id) + '!');
      }
    }
    function showRace(was, fresh) {
      const R = raceOf(), me = MP.myId, mineIn = G.ids.includes(me);
      if (fresh && G.ph === 'grid') {
        Object.assign(mine, { spot: null, car: null, racing: false, fin: 0 });
        if (mineIn) { toGrid(); big('GATLOPP!', R.name + '. Byt bil med B om du vill.', 3.5); toast('Alla är på väg till starten av ' + R.name + '. Loppet börjar om ' + GRID + ' sekunder.'); }
        else toast('Gatlopp: ' + R.name + '. Du är med nästa gång.');
        beep([523, 659], 0.04, 0.3);
      } else if (fresh && G.ph === 'race' && mineIn) {
        // (the grid missed: straight to the start, then off)
        if (!was) toGrid();
        startMine();
      } else if (fresh && G.ph === 'over') { stopMine(); results(); }
      // who has crossed the line, or dropped out, since then
      if (was) for (const [id, f] of seen.fin) {
        const before = was.fin.get(id) || 0;
        if (f === before) continue;
        if (f > 0) {
          const p = [...seen.fin.values()].filter((v) => v > 0 && v <= f).length;
          if (id === me) { toast('Du kom ' + ord(p) + ' på ' + fmtRace(f) + '!' + (p === 1 ? ' Grattis!' : '')); beep([784, 988, 1319], 0.04, 0.4); }
          else toast(nameOf(id) + ' gick i mål som ' + ord(p) + ' på ' + fmtRace(f) + '.' + (p === 1 && mine.racing ? ' Du har en minut på dig!' : ''));
        } else if (f < 0 && id !== me) toast(nameOf(id) + ' är ute ur gatloppet.');
      }
    }
    // the results at the end, best first
    function results() {
      let rows, title, line;
      if (G.n !== 'race') {
        rows = G.ids.map((id, i) => ({ id, sc: Math.floor(G.sc[i]) })).sort((a, b) => b.sc - a.sc).map((r) => ({ ...r, v: r.sc + ' p' }));
        const tie = rows.length > 1 && rows[0].sc === rows[1].sc;
        title = gameName(G.n) + ': ' + (!rows.length ? '' : tie ? 'oavgjort!' : rows[0].id === MP.myId ? 'du vann!' : nameOf(rows[0].id) + ' vann!');
        line = gameName(G.n) + ' är slut.';
      } else {
        rows = standings().map((s) => ({ id: s.id, v: s.fin > 0 ? fmtRace(s.fin) : 'kom inte i mål', home: s.fin > 0 }));
        title = raceOf().name + ': ' + (!rows.length || !rows[0].home ? 'ingen kom i mål' : rows[0].id === MP.myId ? 'du vann!' : nameOf(rows[0].id) + ' vann!');
        line = 'Gatloppet ' + raceOf().name + ' är slut.';
      }
      if (!rows.length) return;
      // XP for playing, more for winning
      if (G.ids.includes(MP.myId)) PROGRESS.played(rows[0].id === MP.myId && (G.n === 'race' ? rows[0].home : !(rows.length > 1 && rows[0].sc === rows[1].sc)));
      E.boardTitle.textContent = title;
      E.boardList.textContent = '';
      for (const r of rows) {
        const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span');
        a.textContent = nameOf(r.id) + (r.id === MP.myId ? ' (du)' : ''); b.textContent = r.v;
        li.append(a, b); E.boardList.append(li);
      }
      MP.note(line + ' ' + rows.map((r) => nameOf(r.id) + ' ' + r.v).join(', ') + '.');
      beep([523, 659, 784, 1047], 0.04, 0.8);
    }
    function finish() {
      if (G && G.n === 'race') stopMine();
      G = null; seen = null; bigT = 0;
      Object.assign(mine, { spot: null, car: null, racing: false, fin: 0 });
      asked.clear();
      E.big.hidden = true;
      tags(); hud();
    }
    // the signs over the others' heads: who is the police, a thief or caught; who seeks, hides or has been found (and to the
    // one who seeks, those hiding have no sign and no dot on the maps); or their place in the race
    function tags() {
      const on = !!G && G.ph !== 'over', order = on && G.n === 'race' ? standings() : null;
      const key = !on ? '' : order ? order.map((s) => s.id + s.fin).join() : G.cop + ':' + G.ids.join() + ':' + G.out.join();
      if (key === lastTags) return;
      lastTags = key;
      for (const f of MP.friends()) {
        const i = on ? G.ids.indexOf(f.id) : -1;
        if (i < 0 || (order && G.ph === 'grid')) MP.badge(f.id, '');
        else if (order) { const p = order.findIndex((s) => s.id === f.id) + 1, fin = G.fin[i]; MP.badge(f.id, fin < 0 ? 'UTE' : ord(p), fin < 0 ? '#5b6168' : fin > 0 ? '#1f7a3a' : '#0a5ba8'); }
        else if (G.n === 'hide') {
          if (f.id === G.cop) MP.badge(f.id, 'LETAR', '#6a3d9a', true);
          else MP.badge(f.id, G.out[i] ? 'HITTAD' : 'GÖMD', G.out[i] ? '#5b6168' : '#2e8b57', false, !G.out[i] && G.cop === MP.myId);
        } else if (f.id === G.cop) MP.badge(f.id, 'POLIS', '#1d3f9e', true);
        else MP.badge(f.id, G.out[i] ? 'TAGEN' : 'TJUV', G.out[i] ? '#5b6168' : '#b3122b');
      }
    }
    // the panel at the top: what you are, your points or place, and the clock. (While you race, the race's own panel
    // shows your place instead)
    function hud() {
      const on = !!G && G.ph !== 'over' && !(JOBS.job && JOBS.job.party);
      // the one who seeks counts in the dark
      const blind = !!G && G.n === 'hide' && G.ph === 'count' && G.cop === MP.myId;
      E.blind.hidden = !blind;
      if (blind) E.blindClock.textContent = fmt(G.t);
      document.body.classList.toggle('party', on);
      E.panel.hidden = !on;
      E.board.hidden = !G || G.ph !== 'over';
      if (!on) { lastHud = ''; return; }
      const me = MP.myId, i = G.ids.indexOf(me);
      let role, title, sub, clock, icon;
      if (G.n === 'race') {
        const R = raceOf(), home = G.fin.some((f) => f > 0), lead = standings()[0];
        role = i < 0 || G.fin[i] >= 0 ? 'race' : 'out'; icon = '⚑'; title = 'Gatlopp: ' + R.name;
        if (i < 0) sub = 'Gatloppet pågår. Du är med nästa gång';
        else if (G.ph === 'grid') sub = 'Alla till start! Byt bil med B om du vill';
        else if (G.fin[i] > 0 || mine.fin) sub = 'Du kom ' + ord(placeOf(me)) + '! Väntar på de andra';
        else sub = 'Du är ute' + (lead && lead.id !== me ? '. ' + nameOf(lead.id) + (lead.fin > 0 ? ' vann' : ' leder') : '');
        clock = G.ph === 'grid' || home ? fmt(G.t) : '';
      } else {
        const free = thieves().filter((id) => !isOut(id)).length, who = nameOf(G.cop), hide = G.n === 'hide';
        role = i < 0 ? 'watch' : G.cop === me ? 'cop' : G.out[i] ? 'out' : 'thief';
        if (hide) {
          if (role === 'watch') sub = who + ' letar. Du är med nästa gång';
          else if (role === 'cop') sub = G.ph === 'count' ? 'Du blundar … de andra gömmer sig' : G.ph === 'end' ? 'Rundan är slut' : 'Du letar: ' + free + ' kvar att hitta';
          else if (role === 'out') sub = 'Du är hittad. Vänta på nästa runda';
          else sub = G.ph === 'count' ? 'Göm dig! ' + who + ' blundar' : G.ph === 'end' ? 'Du klarade dig!' : 'Håll dig gömd för ' + who;
        } else if (role === 'watch') sub = who + ' är polis. Du är med nästa gång';
        else if (role === 'cop') sub = G.ph === 'count' ? 'Räkna till ' + COUNT + ' … tjuvarna sticker' : G.ph === 'end' ? 'Rundan är slut' : 'Du är polis: ' + (free === 1 ? '1 tjuv' : free + ' tjuvar') + ' kvar att ta';
        else if (role === 'out') sub = 'Du är tagen. Vänta på nästa runda';
        else sub = G.ph === 'end' ? 'Du klarade dig!' : 'Du är tjuv: håll dig undan ' + who;
        if (i >= 0) sub += ' · ' + Math.floor(G.sc[i]) + ' p';
        title = gameName(G.n) + ', runda ' + G.r + ' av ' + G.R; clock = G.ph === 'end' ? '' : fmt(G.t);
        icon = role === 'cop' ? (hide ? '?' : '★') : role === 'out' ? '✕' : role === 'thief' ? (hide ? 'G' : 'T') : 'P';
      }
      const key = role + title + sub + clock;
      if (key === lastHud) return;
      lastHud = key;
      E.panel.classList.toggle('thief', role === 'thief'); E.panel.classList.toggle('out', role === 'out'); E.panel.classList.toggle('race', role === 'race');
      E.icon.textContent = icon; E.title.textContent = title; E.sub.textContent = sub; E.clock.textContent = clock;
    }
    // the games on the room sign: one button for Polis och tjuv, one for Kurragömma, one for each street race
    const raceButtons = JOBS.RACES.map((r) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-sign small'; b.textContent = r.name;
      b.addEventListener('click', () => beginRace(r.id));
      E.races.append(b);
      return b;
    });
    function sign() {
      if (!MP.panelOpen) { lastSign = ''; return; }
      const n = MP.inRoom ? MP.friends().filter((f) => f.at).length + 1 : 0;
      const hint = G ? (G.n === 'race' ? 'Gatloppet ' + raceOf().name + ' pågår.' : gameName(G.n) + ' pågår, runda ' + G.r + ' av ' + G.R + '.')
        : !MP.host ? 'Den som har rummet startar lekarna.' : n < 2 ? 'Det behövs minst två i rummet för att leka.' : '';
      const key = MP.host + ':' + !!G + ':' + n + ':' + hint;
      if (key === lastSign) return;
      lastSign = key;
      E.start.hidden = E.startHide.hidden = !MP.host || !!G; E.start.disabled = E.startHide.disabled = n < 2;
      E.races.hidden = !MP.host || !!G;
      for (const b of raceButtons) b.disabled = n < 2;
      E.stop.hidden = !MP.host || !G;
      E.hint.textContent = hint;
    }
    E.start.addEventListener('click', () => begin());
    E.startHide.addEventListener('click', () => begin(null, 'hide'));
    E.stop.addEventListener('click', stopGame);

    /* ---------- every frame ---------- */
    // (by the clock rather than the frame: the game goes on for the others while your map or the room sign is open)
    function update() {
      const now = performance.now(), dt = Math.min(5, (now - last) / 1000);
      last = now;
      for (const f of MP.friends()) names.set(f.id, f.name);
      if (G && !MP.inRoom) finish();
      if (G) {
        if (MP.host) run(dt);
        else {
          // in between the updates: the clock runs, and so do the free thieves' points
          G.t = Math.max(0, G.t - dt);
          if (G.n === 'cnr' && G.ph === 'hunt') G.ids.forEach((id, i) => { if (id !== G.cop && !G.out[i]) G.sc[i] += dt; });
        }
      }
      if (G && G.n === 'race') raceTick(dt);
      else if (G) {
        hunt(now);
        // the last seconds of the count
        const n = Math.ceil(G.t);
        if (G.ph === 'count' && n <= 3 && n > 0 && n !== beepAt && G.ids.includes(MP.myId)) {
          beepAt = n; beep([440], 0.04, 0.15);
          if (G.n !== 'hide' || G.cop !== MP.myId) big(String(n), '', 0.9);
        }
      }
      if (bigT > 0 && (bigT -= dt) <= 0) E.big.hidden = true;
      tags(); hud(); sign();
    }

    return {
      update, busy,
      // the police stand still while they count (and the one who seeks while they count in the dark), and everyone waits on
      // the grid before a race
      hold() { return !!G && G.ids.includes(MP.myId) && (G.n === 'race' ? G.ph === 'grid' : G.ph === 'count' && G.cop === MP.myId); },
      // J: no jobs in the middle of a game
      noJobs() { if (!busy()) return false; toast('Inga jobb mitt i ' + (G.n === 'race' ? 'gatloppet' : gameName(G.n).toLowerCase()) + '!'); return true; },
      // your place in the race, for the race's own panel
      place() { return G && G.n === 'race' && G.ids.includes(MP.myId) ? ord(placeOf(MP.myId)) + ' av ' + G.ids.length : ''; },
      // for the tests
      debug: {
        get G() { return G; }, get mine() { return mine; }, begin, beginRace, caught, stopGame, gap, heard, gridSpot,
        // let s seconds pass on the game's clock
        advance(s) { while (s > 0) { const k = Math.min(5, s); last -= k * 1000; update(); s -= k; } }
      }
    };
  })();
