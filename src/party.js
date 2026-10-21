'use strict';

  /* ================= games with friends ================= */
  // Games for everyone in a room (MP). The one who has the room starts a game from the room sign (P) and keeps the score:
  // their game sends how it stands to the others every second and as soon as something happens, and every game shows it.
  // The first game is Polis och tjuv: one of you is the police and chases the others, and you take turns being the police.
  // Every second a thief is free gives them a point, and when the police catch a thief the police get the seconds that
  // were left. A thief is caught when the police (in a car or on foot) touch them, as the police's own game sees it.
  const PARTY = (() => {
    // seconds: the police count before the hunt, the hunt, the pause between rounds, the results at the end
    const COUNT = 10, HUNT = 180, BREAK = 7, RESULT = 15, REACH = 0.6, PHASES = ['count', 'hunt', 'end', 'over'];
    const E = {
      panel: $('party'), icon: $('partyIcon'), title: $('partyTitle'), sub: $('partySub'), clock: $('partyClock'), big: $('partyBig'),
      board: $('partyBoard'), boardTitle: $('partyBoardTitle'), boardList: $('partyBoardList'), start: $('gameCnr'), stop: $('gameStop'), hint: $('mpGamesHint')
    };
    // G: the game as it stands (kept by the one who has the room, or as it last came from them), or null.
    // ids: who plays, sc: their points, out: caught this round, r of R: the round, cop: who is the police this round
    let G = null, seen = null, last = performance.now(), sendT = 0, bigT = 0, beepAt = 0, lastHud = '', lastTags = '', lastSign = '';
    const names = new Map(), asked = new Map();
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0), str = (v) => (typeof v === 'string' ? v.slice(0, 64) : '');
    const nameOf = (id) => (id === MP.myId ? MP.myName : names.get(id) || 'Någon');
    const fmt = (t) => { const s = Math.ceil(Math.max(0, t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const thieves = () => G.ids.filter((id) => id !== G.cop);
    const isOut = (id) => G.out[G.ids.indexOf(id)];
    // you take part in a game that is on (rather than having come into the room after it started)
    const busy = () => !!G && G.ph !== 'over' && G.ids.includes(MP.myId);

    /* ---------- what goes between you ---------- */
    function clean(g) {
      if (!g || typeof g !== 'object') return null;
      if (g.a === 'catch') { const who = str(g.who); return who ? { a: 'catch', who } : null; }
      if (g.a !== 'state') return null;
      if (g.n !== 'cnr') return { a: 'state', n: '' };
      const ids = (Array.isArray(g.ids) ? g.ids : []).slice(0, 8).map(str), sc = Array.isArray(g.sc) ? g.sc : [], out = Array.isArray(g.out) ? g.out : [];
      const R = clamp(num(g.R) | 0, 1, 8);
      return {
        a: 'state', n: 'cnr', ph: PHASES.includes(g.ph) ? g.ph : 'over', r: clamp(num(g.r) | 0, 1, R), R, cop: str(g.cop), t: clamp(num(g.t), 0, 600),
        ids, sc: ids.map((_, i) => clamp(num(sc[i]), 0, 99999)), out: ids.map((_, i) => !!out[i])
      };
    }
    function heard(from, g) {
      // (the police saying they caught someone counts only with the one who has the room)
      if (g.a === 'catch') { if (MP.host) caught(from, g.who); return; }
      if (MP.host || from !== MP.hostId) return;
      if (!g.n) { if (G) { const early = G.ph !== 'over'; finish(); if (early) toast('Leken är avslutad.'); } return; }
      G = g;
      show();
    }
    function publish() {
      sendT = 1;
      if (!G) { MP.event('game', { g: { a: 'state', n: '' } }); return; }
      const { cops, ...w } = G;
      MP.event('game', { g: Object.assign(w, { t: Math.round(G.t * 10) / 10, sc: G.sc.map((v) => Math.round(v * 10) / 10) }) });
    }
    MP.games({ clean, heard, busy });

    /* ---------- keeping the game (the one who has the room) ---------- */
    // order: who is the police in which round (for the tests); otherwise drawn at random
    function begin(order) {
      if (!MP.inRoom || !MP.host || G) return;
      const ids = [MP.myId, ...MP.friends().filter((f) => f.at).map((f) => f.id)];
      if (ids.length < 2) return;
      const cops = Array.isArray(order) ? order.filter((id) => ids.includes(id)) : ids.slice();
      if (!Array.isArray(order)) for (let i = cops.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cops[i], cops[j]] = [cops[j], cops[i]]; }
      MP.closePanel();
      if (!started) startGame();
      G = { a: 'state', n: 'cnr', ph: 'count', r: 1, R: cops.length, cop: cops[0], t: COUNT, ids, sc: ids.map(() => 0), out: ids.map(() => false), cops };
      changed();
    }
    function changed() { publish(); show(); }
    function endRound() { G.ph = 'end'; G.t = BREAK; changed(); }
    function over() { G.ph = 'over'; G.t = RESULT; changed(); }
    function nextRound() {
      // (the next one whose turn it is to be the police, if they are still here)
      let r = G.r;
      while (r < G.R && !G.ids.includes(G.cops[r])) r++;
      if (r >= G.R) { over(); return; }
      Object.assign(G, { ph: 'count', r: r + 1, cop: G.cops[r], t: COUNT, out: G.ids.map(() => false) });
      changed();
    }
    function caught(from, who) {
      if (!G || G.ph !== 'hunt' || from !== G.cop || who === G.cop) return;
      const i = G.ids.indexOf(who), c = G.ids.indexOf(G.cop);
      if (i < 0 || G.out[i]) return;
      G.out[i] = true;
      if (c >= 0) G.sc[c] += G.t;
      if (thieves().every(isOut)) endRound(); else changed();
    }
    function run(dt) {
      // whoever has left the room has left the game: without the police the round is over, and alone there is no game
      const here = new Set([MP.myId, ...MP.friends().map((f) => f.id)]);
      for (let i = G.ids.length - 1; i >= 0; i--) if (!here.has(G.ids[i])) { G.ids.splice(i, 1); G.sc.splice(i, 1); G.out.splice(i, 1); sendT = 0; }
      if (G.ph !== 'over' && G.ids.length < 2) { over(); return; }
      if ((G.ph === 'count' || G.ph === 'hunt') && !G.ids.includes(G.cop)) { endRound(); return; }
      if (G.ph === 'hunt') {
        const k = Math.min(dt, G.t);
        G.ids.forEach((id, i) => { if (id !== G.cop && !G.out[i]) G.sc[i] += k; });
        if (thieves().every(isOut)) { endRound(); return; }
      }
      if ((G.t -= dt) > 0) { if ((sendT -= dt) <= 0) publish(); return; }
      if (G.ph === 'count') { G.ph = 'hunt'; G.t = HUNT; changed(); }
      else if (G.ph === 'hunt') endRound();
      else if (G.ph === 'end') nextRound();
      else { G = null; publish(); finish(); }
    }
    function stopGame() {
      if (!MP.host || !G) return;
      G = null;
      publish(); finish();
      toast('Du avslutade leken.');
    }

    /* ---------- catching (the police's own game) ---------- */
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
        if (Math.abs(f.at.y - me.y) > 2.5 || gap(me, f.at) > REACH) continue;
        // (asked once: the answer comes with how the game stands)
        asked.set(f.id, now + 1500);
        if (MP.host) caught(MP.myId, f.id); else MP.event('game', { g: { a: 'catch', who: f.id } });
      }
    }

    /* ---------- showing it ---------- */
    function big(text, sub, t) {
      E.big.textContent = text;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; E.big.append(s); }
      E.big.hidden = false; bigT = t;
    }
    // the police get a police car with the blue lights on
    function copCar() {
      if (policeStop && policeStop.locked) return;
      if (!driving || !driving.M.police) chooseModel(MODEL.polis);
      if (driving && driving.M.police && !driving.M.boat) { driving.siren = true; driving.yelp = false; }
    }
    // what has happened since the game was shown last
    function show() {
      const was = seen, me = MP.myId, iCop = G.cop === me, mine = G.ids.includes(me);
      seen = { ph: G.ph, r: G.r, out: new Set(G.ids.filter((id, i) => G.out[i])), copSc: G.sc[G.ids.indexOf(G.cop)] || 0 };
      const fresh = !was || was.ph !== G.ph || was.r !== G.r;
      if (fresh && G.ph === 'count') {
        beepAt = 0;
        if (mine && JOBS.job) JOBS.key();
        if (iCop) { big('DU ÄR POLIS!', 'Räkna till ' + COUNT + ', sedan jagar du de andra.', 3.5); copCar(); toast('Du är polis! Ta tjuvarna genom att köra in i dem eller springa ikapp dem.'); }
        else if (mine) big('SPRING!', nameOf(G.cop) + ' är polis och kommer efter dig om ' + COUNT + ' sekunder.', 3.5);
        else toast(nameOf(G.cop) + ' är polis i polis och tjuv. Du är med nästa gång.');
        beep([523, 659], 0.04, 0.3);
      } else if (fresh && G.ph === 'hunt') {
        if (iCop) big('JAGA!', 'Kör in i tjuvarna eller spring ikapp dem.', 2.2);
        else if (mine) big('POLISEN KOMMER!', 'Håll dig undan ' + nameOf(G.cop) + '.', 2.2);
        beep([784, 1047], 0.05, 0.45);
      } else if (fresh && G.ph === 'end') {
        const all = thieves().length > 0 && thieves().every(isOut);
        big(all ? 'ALLA TAGNA!' : 'TIDEN ÄR UTE!', G.r < G.R ? 'Nästa runda börjar snart.' : 'Det var sista rundan.', 3);
        beep([659, 523], 0.04, 0.4);
      } else if (fresh && G.ph === 'over') results();
      // thieves caught since then
      if (was && was.r === G.r) for (const id of G.ids) {
        if (!isOut(id) || was.out.has(id)) continue;
        if (id === me) { big('TAGEN!', nameOf(G.cop) + ' tog dig. Vänta på nästa runda.', 3); beep([392, 311, 233], 0.05, 0.5); }
        else if (iCop) { toast('Du tog ' + nameOf(id) + '! Du får sekunderna som var kvar: ' + Math.round(seen.copSc - was.copSc) + ' p.'); beep([880, 1175], 0.05, 0.3); }
        else toast(nameOf(G.cop) + ' tog ' + nameOf(id) + '!');
      }
    }
    function results() {
      const rows = G.ids.map((id, i) => ({ id, name: nameOf(id), sc: Math.floor(G.sc[i]) })).sort((a, b) => b.sc - a.sc);
      if (!rows.length) return;
      const tie = rows.length > 1 && rows[0].sc === rows[1].sc;
      E.boardTitle.textContent = 'Polis och tjuv: ' + (tie ? 'oavgjort!' : rows[0].id === MP.myId ? 'du vann!' : rows[0].name + ' vann!');
      E.boardList.textContent = '';
      for (const r of rows) {
        const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span');
        a.textContent = r.name + (r.id === MP.myId ? ' (du)' : ''); b.textContent = r.sc + ' p';
        li.append(a, b); E.boardList.append(li);
      }
      MP.note('Polis och tjuv är slut. ' + rows.map((r) => r.name + ' ' + r.sc + ' p').join(', ') + '.');
      beep([523, 659, 784, 1047], 0.04, 0.8);
    }
    function finish() {
      G = null; seen = null; bigT = 0;
      asked.clear();
      E.big.hidden = true;
      tags(); hud();
    }
    // the signs over the others' heads: who is the police, who is a thief, who has been caught
    function tags() {
      const key = G && G.ph !== 'over' ? G.cop + ':' + G.ids.join() + ':' + G.out.join() : '';
      if (key === lastTags) return;
      lastTags = key;
      for (const f of MP.friends()) {
        const i = key ? G.ids.indexOf(f.id) : -1;
        if (i < 0) MP.badge(f.id, '');
        else if (f.id === G.cop) MP.badge(f.id, 'POLIS', '#1d3f9e', true);
        else MP.badge(f.id, G.out[i] ? 'TAGEN' : 'TJUV', G.out[i] ? '#5b6168' : '#b3122b');
      }
    }
    // the panel at the top: the round, what you are, your points and the clock
    function hud() {
      const on = !!G && G.ph !== 'over';
      document.body.classList.toggle('party', on);
      E.panel.hidden = !on;
      E.board.hidden = !G || G.ph !== 'over';
      if (!on) { lastHud = ''; return; }
      const me = MP.myId, i = G.ids.indexOf(me), free = thieves().filter((id) => !isOut(id)).length;
      const role = i < 0 ? 'watch' : G.cop === me ? 'cop' : G.out[i] ? 'out' : 'thief';
      let sub;
      if (role === 'watch') sub = nameOf(G.cop) + ' är polis. Du är med nästa gång';
      else if (role === 'cop') sub = G.ph === 'count' ? 'Räkna till ' + COUNT + ' … tjuvarna sticker' : G.ph === 'end' ? 'Rundan är slut' : 'Du är polis: ' + (free === 1 ? '1 tjuv' : free + ' tjuvar') + ' kvar att ta';
      else if (role === 'out') sub = 'Du är tagen. Vänta på nästa runda';
      else sub = G.ph === 'end' ? 'Du klarade dig!' : 'Du är tjuv: håll dig undan ' + nameOf(G.cop);
      if (i >= 0) sub += ' · ' + Math.floor(G.sc[i]) + ' p';
      const title = 'Polis och tjuv, runda ' + G.r + ' av ' + G.R, clock = G.ph === 'end' ? '' : fmt(G.t), key = role + title + sub + clock;
      if (key === lastHud) return;
      lastHud = key;
      E.panel.classList.toggle('thief', role === 'thief'); E.panel.classList.toggle('out', role === 'out');
      E.icon.textContent = role === 'cop' ? '★' : role === 'out' ? '✕' : role === 'thief' ? 'T' : 'P';
      E.title.textContent = title; E.sub.textContent = sub; E.clock.textContent = clock;
    }
    // the games on the room sign
    function sign() {
      if (!MP.panelOpen) { lastSign = ''; return; }
      const n = MP.inRoom ? MP.friends().filter((f) => f.at).length + 1 : 0;
      const hint = G ? 'Polis och tjuv pågår, runda ' + G.r + ' av ' + G.R + '.' : !MP.host ? 'Den som har rummet startar leken.' : n < 2 ? 'Det behövs minst två i rummet för att leka.' : '';
      const key = MP.host + ':' + !!G + ':' + n + ':' + hint;
      if (key === lastSign) return;
      lastSign = key;
      E.start.hidden = !MP.host || !!G; E.start.disabled = n < 2;
      E.stop.hidden = !MP.host || !G;
      E.hint.textContent = hint;
    }
    E.start.addEventListener('click', () => begin());
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
          if (G.ph === 'hunt') G.ids.forEach((id, i) => { if (id !== G.cop && !G.out[i]) G.sc[i] += dt; });
        }
      }
      if (G) {
        hunt(now);
        // the last seconds of the count
        const n = Math.ceil(G.t);
        if (G.ph === 'count' && n <= 3 && n > 0 && n !== beepAt && G.ids.includes(MP.myId)) { beepAt = n; big(String(n), '', 0.9); beep([440], 0.04, 0.15); }
      }
      if (bigT > 0 && (bigT -= dt) <= 0) E.big.hidden = true;
      tags(); hud(); sign();
    }

    return {
      update, busy,
      // the police stand still while they count
      hold() { return !!G && G.ph === 'count' && G.cop === MP.myId; },
      // J: no jobs in the middle of a game
      noJobs() { if (!busy()) return false; toast('Inga jobb mitt i polis och tjuv!'); return true; },
      // for the tests
      debug: {
        get G() { return G; }, begin, caught, stopGame, gap, heard,
        // let s seconds pass on the game's clock
        advance(s) { while (s > 0) { const k = Math.min(5, s); last -= k * 1000; update(); s -= k; } }
      }
    };
  })();
