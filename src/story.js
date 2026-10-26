'use strict';

  /* ================= the story ================= */
  // Kuppen på Nationalmuseum: five missions in a row for kommissarie Kicki Lind, who stands outside the police station
  // on Stora Nygatan. A gang means to steal Rembrandt's self-portrait from Nationalmuseum, and you help the police stop
  // them: find and follow their car, look at the museum's roof from the helicopter, stop their car on the night of the
  // break-in, catch their boat on Saltsjön, and jump from Kaknästornet to land by the boss on Gärdet. The police are the
  // good ones all the way: while a mission is on they leave you alone (`duty`, read by `startChase`).
  // A mission is a list of steps, each with a text for the box at the top of the screen, a target (for the pillar of
  // light and the GPS) and a tick that says when it is done (true) or failed (a reason). Missions three to five follow
  // straight on from each other. How far you have come is kept in localStorage (gubbe-story), and on the account.
  // Nothing is built until it is needed (Kicki when you first come near the station), so the scene at load stays as it
  // was (see WAYPOINT for why).
  const STORY = (() => {
    const KEY = 'gubbe-story', COL = '#ef3e5c', HEX = 0xef3e5c, N = 5;
    let done = 0;
    try { done = clamp(Math.floor(Number(JSON.parse(localStorage.getItem(KEY) || '{}').done) || 0), 0, N); } catch (e) { /* a private window */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ done })); } catch (e) { /* kept for this visit */ } };
    const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km');
    const fmtClock = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const here = () => (FLY.on ? FLY.heli : driving || player);
    const speedOf = (c) => Math.hypot(c.vx, c.vz);

    /* ---------- the places ---------- */
    // Kicki on the pavement outside the station's door, the police car at its kerb; the gang's car on Östermalmstorg and
    // their garage on Regeringsgatan; Nationalmuseum and the quay below it, where the boats lie; the way the gang's boat
    // takes out over Saltsjön (all of it water: a test checks); and the boss's car on Gärdet, within a parachute's glide
    // of Kaknästornet
    const KICKI = { x: -195.4, z: 219.2 }, MUSEUM = { x: 335, z: -303 }, PAD = FLY.debug.PAD;
    const HIDEOUT = (() => { const n = nearestNode(-200, -1150); return { node: n, x: nodes[n].x, z: nodes[n].z }; })();
    const BOAT_PATH = [[440, -245], [700, -220], [960, -120], [980, 150], [1010, 420], [1150, 640], [1500, 690], [1850, 650], [2200, 560], [2550, 470], [2750, 420]];
    // (at the foot of the tower on the side towards Gärdet, so that you jump off that way)
    const BOSS = { x: 2332, z: -1098 }, TOWER = (() => { const dx = BOSS.x - KAKNAS.x, dz = BOSS.z - KAKNAS.z, d = Math.hypot(dx, dz); return { x: KAKNAS.x + (dx / d) * 9, z: KAKNAS.z + (dz / d) * 9 }; })();
    // a free place at the kerb of the street nearest to (x, z), facing along it
    function kerbSpot(M, x, z) {
      const ne = nearestEdge(x, z, (e) => e.drive);
      if (!ne.e) return null;
      const f = edgeFrame(ne.e.a, ne.e.b), s0 = (x - f.A.x) * f.ux + (z - f.A.z) * f.uz, park = f.park || f.e.hw - 1.1;
      for (const ds of [0, 8, -8, 16, -16, 24, -24, 36, -36, 50, -50, 64, -64]) for (const side of [1, -1]) {
        const s = clamp(s0 + ds, 6, f.len - 6), px = f.A.x + f.ux * s + f.rx * park * side, pz = f.A.z + f.uz * s + f.rz * park * side;
        const h = Math.atan2(f.ux, f.uz) + (side < 0 ? Math.PI : 0);
        if (spotFree(M, px, pz, h) && !STATION.inside(px, pz)) return { x: px, z: pz, h };
      }
      return null;
    }
    // a car of the story's own, standing still where it is put, kept until the mission is over
    function place(R, M, color, at) {
      if (!at) return null;
      const c = makeCar(M, color);
      c.x = at.x; c.z = at.z; c.h = at.h || 0; c.keep = true;
      R.own.push(c);
      return c;
    }
    // a parked car driven off by someone, along the streets towards goal
    function drive(c, goal, cruise, getaway) {
      if (!c.occupant) setOccupant(c, makeIdentity());
      c.bot = { from: 0, to: 0, next: 0, phase: 'edge', t: 0, passT: 0, waitT: 0, ignoreT: 0, revT: 0, stuckT: 0, stuckTotal: 0, honkT: 0, turnAge: 0, cruise, goal };
      c.getaway = !!getaway;
      resyncBot(c);
    }

    /* ---------- the missions ---------- */
    // a mission's start(R) puts out what it needs (and says false if there was no room for it). A step: text (what to
    // do), at (where: { x, z }, or a car), how ('road' for the GPS along the streets, else a straight line), limit
    // (seconds), start(R) and tick(R, dt): true when done, or a string, why it failed
    const K = (text) => ({ who: 'Kicki', text }), RADIO = (text) => ({ who: 'Kicki i radion', text });
    const TOOK = 'Du skulle bara ta en bild på Audin, inte ta den! Nu vet gänget att någon är efter dem.';
    const MISSIONS = [
      {
        id: 'tips', title: 'Tipset', kr: 1500, xp: 150,
        intro: [
          K('Hej! Jag heter Kicki Lind och är kommissarie här på polisstationen. Du verkar känna stan bra, och jag behöver hjälp.'),
          K('Vi har fått ett tips om att ett gäng planerar en kupp mot Nationalmuseum. De vill stjäla Rembrandts självporträtt.'),
          K('Ett vittne har sett deras bil, en svart Audi RS6, vid Östermalmstorg. Åk dit och ta en bild på registreringsskylten. Följ sedan efter bilen, men inte för nära, så att vi får veta var gänget gömmer sig.')
        ],
        outro: [K('Snyggt! Audin körde in i ett garage på Regeringsgatan, och skylten stämmer med en bil som har setts utanför museet. Nu vet vi var gänget håller till. Kom tillbaka till mig när du vill fortsätta.')],
        start(R) { R.car = place(R, MODEL.rs6, 0x15161a, kerbSpot(MODEL.rs6, 387, -903)); return !!R.car; },
        steps: [
          { text: 'Leta upp den svarta Audin vid Östermalmstorg', how: 'road', at: (R) => R.car, tick: (R) => (driving === R.car ? TOOK : dist(here(), R.car) < 25) },
          {
            text: 'Stå still nära Audin och ta en bild på skylten', at: (R) => R.car,
            tick(R, dt) {
              if (driving === R.car) return TOOK;
              const p = here(), still = (driving ? speedOf(driving) : Math.hypot(player.vx, player.vz)) < 1;
              R.held = dist(p, R.car) < 14 && still && !FLY.on ? R.held + dt : 0;
              R.note = R.held > 0 ? 'Fotar …' : '';
              if (R.held < 1.5) return false;
              beep([1600, 1200], 0.02, 0.12); toast('Klick! Du har en bild på skylten. Nu kör Audin iväg!');
              drive(R.car, HIDEOUT, 12);
              return true;
            }
          },
          {
            text: 'Följ efter Audin, men inte för nära', how: 'road', at: (R) => R.car,
            tick(R, dt) {
              const c = R.car, d = dist(here(), c), moving = speedOf(c) > 3;
              R.sus = d < 10 && moving ? R.sus + dt : Math.max(0, R.sus - dt * 0.5);
              R.lost = d > 130 ? R.lost + dt : 0;
              R.note = R.sus > 0.5 ? 'För nära, de ser dig!' : R.lost > 1 ? 'Kör ikapp, du tappar dem!' : fmtDist(d) + ' bakom';
              if (R.sus > 3) return 'Gänget såg dig och körde iväg.';
              if (R.lost > 8) return 'Du tappade bort Audin.';
              if (dist(c, HIDEOUT) > 30) return false;
              c.bot = null; c.vx *= 0.3; c.vz *= 0.3;
              return true;
            }
          }
        ]
      },
      {
        id: 'spaning', title: 'Spaningen', kr: 2000, xp: 200,
        intro: [
          K('Vi tror att gänget tänker ta sig in genom taket på Nationalmuseum. Jag behöver bilder på taket från luften.'),
          K('Ta den röda helikoptern på plattan vid Skeppsbron och flyg över museet. Håll den stilla en stund över taket, så att kameran hinner ta bilder. Landa sedan på plattan igen.')
        ],
        outro: [K('Titta här på bilderna: en lucka i taket som står på glänt. Gänget kommer i natt, det är jag säker på. Vila dig lite och kom till mig när du är redo.')],
        steps: [
          { text: 'Kliv in i helikoptern vid Skeppsbron', how: 'road', at: () => FLY.heli, tick: () => FLY.on },
          {
            text: 'Flyg över Nationalmuseum och håll helikoptern stilla över taket', at: () => MUSEUM,
            tick(R, dt) {
              const H = FLY.heli, over = FLY.on && dist(H, MUSEUM) < 45 && H.y > 30;
              if (over) R.shots += dt;
              const n = Math.min(4, Math.floor(R.shots));
              if (n > R.clicks) { R.clicks = n; beep([1600, 1200], 0.02, 0.1); }
              R.note = 'Bilder ' + n + ' av 4' + (FLY.on && dist(H, MUSEUM) < 45 && H.y <= 30 ? ' · flyg högre' : '');
              return R.shots >= 4;
            }
          },
          { text: 'Landa på plattan vid Skeppsbron', at: () => PAD, tick: () => FLY.on && FLY.heli.ground && dist(FLY.heli, PAD) < 14 }
        ]
      },
      {
        id: 'larm', title: 'Larmet', kr: 3000, xp: 300, night: true,
        intro: [
          K('Det är natt, och larmet har just gått på Nationalmuseum! Gänget är där inne.'),
          K('Ta polisbilen utanför stationen och kör dit. Slå på blåljuset med L. Försöker de fly, så stoppar du deras bil: kör ikapp och ställ dig tätt intill den tills den står still.')
        ],
        outro: [RADIO('Bra jobbat! Två av dem är gripna. Men tavlan är inte i bilen … Kollegorna säger att en båt just lade ut från kajen nedanför museet!')],
        start(R) { const at = STATION.curb(0); R.police = place(R, MODEL.polis, MODEL.polis.colors[0], spotFree(MODEL.polis, at.x, at.z, at.h) ? at : kerbSpot(MODEL.polis, at.x, at.z)); return !!R.police; },
        steps: [
          { text: 'Kliv in i polisbilen utanför stationen', at: (R) => R.police, tick: () => !!driving && !!driving.M.police && !driving.M.boat },
          {
            text: 'Kör till Nationalmuseum', how: 'road', at: () => MUSEUM,
            tick(R) {
              if (dist(here(), MUSEUM) > 110) return false;
              // the gang's Audi comes away from the museum and makes off
              R.car = place(R, MODEL.rs6, 0x15161a, kerbSpot(MODEL.rs6, MUSEUM.x + 40, MUSEUM.z + 50));
              if (!R.car) return false;
              drive(R.car, null, 20, true); R.car.bot.turnV = 9; R.fleeT = 0;
              toast('Där är Audin! Stoppa den!');
              return true;
            }
          },
          {
            text: 'Stoppa Audin! Kör ikapp och ställ dig tätt intill den', how: 'road', at: (R) => R.car, limit: 180,
            tick(R, dt) {
              const r = R.car, c = driving;
              if (!cars.includes(r)) return 'Gänget kom undan.';
              // the gang runs from you: now and then somewhere new to make for, well away from you (as the robber in JOBS)
              if (r.bot && (R.fleeT -= dt) <= 0) {
                R.fleeT = 3;
                const p = here(), ax = r.x - p.x, az = r.z - p.z, al = Math.hypot(ax, az) || 1;
                let best = -1, bv = -Infinity;
                for (let i = 0; i < 40; i++) {
                  const n = Math.floor(Math.random() * nodes.length), Nd = nodes[n];
                  if (!Nd.nb.length) continue;
                  const dd = Math.hypot(Nd.x - r.x, Nd.z - r.z), v = ((Nd.x - r.x) * ax + (Nd.z - r.z) * az) / al - Math.abs(dd - 450) * 0.3;
                  if (dd > 200 && v > bv) { bv = v; best = n; }
                }
                if (best >= 0) { r.bot.goal = { node: best, x: nodes[best].x, z: nodes[best].z }; if (r.bot.phase === 'edge') r.bot.next = chooseNext(r.bot.from, r.bot.to, r.bot.goal, true); }
              }
              const close = c && dist(r, c) < (r.M.L + c.M.L) / 2 + 3;
              R.held = speedOf(r) < 1.5 && close ? R.held + dt : 0;
              R.note = R.held > 0 ? 'Håll kvar …' : fmtDist(dist(here(), r));
              if (dist(here(), r) > 650) return 'Gänget kom undan.';
              if (!r.dead && R.held < 2) return false;
              // caught: out of the car in handcuffs
              const spot = exitSpot(r);
              if (spot && r.occupant) { const p = makePerson(r.occupant, spot.x, spot.z, { state: 'idle', face: r.h, dodgeT: 0 }); p.cuffed = true; p.rot = r.h; p.keep = true; R.people.push(p); }
              setOccupant(r, null); r.bot = null; r.getaway = false;
              return true;
            }
          }
        ]
      },
      {
        id: 'bat', title: 'Båtjakten', kr: 4000, xp: 400, chain: true,
        intro: [RADIO('Tjuvarna med tavlan flyr med båt ut mot Saltsjön! Det ligger en polisbåt vid kajen nedanför Nationalmuseum. Hoppa i och kör ikapp dem. Lägg dig bredvid deras båt tills de ger upp.')],
        outro: [RADIO('De gav upp, och sjöpolisen tar hand om dem. Men … tavlan i båten var en kopia! Bossen i gänget har den riktiga.')],
        start(R) {
          R.police = place(R, MODEL.polisbat, MODEL.polisbat.colors[0], findBerth(MODEL.polisbat, 362, -290, 80));
          const [x0, z0] = BOAT_PATH[0], [x1, z1] = BOAT_PATH[1];
          R.boat = place(R, MODEL.anytec, 0x1b1d22, { x: x0, z: z0, h: Math.atan2(x1 - x0, z1 - z0) });
          if (!R.police || !R.boat) return false;
          setOccupant(R.boat, makeIdentity());
          R.seg = 1; R.s = 0; R.v = 0; R.go = false;
          return true;
        },
        steps: [
          { text: 'Hoppa i polisbåten vid kajen nedanför Nationalmuseum', how: 'road', at: (R) => R.police, tick: () => !!driving && !!driving.M.boat },
          {
            text: 'Kör ikapp tjuvarnas båt och lägg dig bredvid den',
            at: (R) => R.boat,
            start(R) { R.go = true; toast('Tjuvarnas båt lägger ut! Kör ikapp den.'); },
            tick(R, dt) {
              const d = driving && driving.M.boat ? dist(driving, R.boat) : Infinity;
              R.held = d < 10 ? R.held + dt : Math.max(0, R.held - dt);
              R.note = R.held > 0 ? 'Håll dig bredvid …' : d < Infinity ? fmtDist(d) : 'Kliv i en båt!';
              if (R.held >= 3) { R.go = false; R.v = 0; return true; }
              return R.s < 0 ? 'Tjuvarnas båt kom undan.' : false;
            }
          }
        ]
      },
      {
        id: 'hopp', title: 'Hoppet', kr: 15000, xp: 800, chain: true,
        intro: [RADIO('Bossen kör mot Ladugårdsgärdet, där en helikopter ska hämta hen och tavlan. Vi hinner inte dit med bilarna! Det snabbaste sättet är uppifrån: åk upp i Kaknästornet och hoppa med fallskärm. Landa vid bossens röda bil, så kommer vi efter.')],
        outro: [
          K('Du landade precis bredvid bossen, och vi kom direkt efter. Rembrandten är räddad och hänger på Nationalmuseum igen i morgon!'),
          K('Tack för hjälpen. Hela polisen i Stockholm är stolt över dig. Du är en riktig hjälte!')
        ],
        start(R) {
          R.car = place(R, MODEL.dbs, 0xb0141c, { x: BOSS.x, z: BOSS.z, h: 1.2 });
          const p = makePerson(makeIdentity({ shirt: 0x2b2b2e, pants: 0x1c1c1f }), BOSS.x + 2.6, BOSS.z + 1.2, { state: 'idle', face: -1.9, dodgeT: 0 });
          p.keep = true; p.rot = -1.9; R.people.push(p); R.boss = p;
          return true;
        },
        steps: [
          { text: 'Åk upp i Kaknästornet (E vid foten) och hoppa', how: 'road', at: () => TOWER, tick: () => CHUTE.on },
          {
            text: 'Landa med fallskärmen vid bossens röda bil', at: () => BOSS,
            tick(R) {
              R.note = CHUTE.on ? fmtDist(dist(player, BOSS)) + (CHUTE.open ? '' : ' · mellanslag vecklar ut fallskärmen') : '';
              if (CHUTE.on) return false;
              if (player.knockT > 0) return 'Du landade för hårt. Kom ihåg att veckla ut fallskärmen med mellanslag.';
              if (dist(player, BOSS) > 45) return 'Du landade för långt bort, och bossen hann köra iväg.';
              R.boss.cuffed = true;
              return true;
            }
          }
        ]
      }
    ];

    /* ---------- a mission on ---------- */
    // R: the mission on now: k (which), M, i (the step), S (it), t (time on it), own (its cars), people, and what the
    // steps keep for themselves
    let R = null, beam = null, route = null, routeT = 0, quitT = 0;
    function newRun(k) { return { k, M: MISSIONS[k], i: -1, S: null, t: 0, own: [], people: [], held: 0, sus: 0, lost: 0, shots: 0, clicks: 0, note: '' }; }
    function begin(k) {
      if (R) cleanup();
      if (JOBS.job) JOBS.key();
      R = newRun(k);
      if (R.M.night && !(MP.inRoom && !MP.host)) DAYNIGHT.set(2);
      if (wanted) endChase(false);
      if (R.M.start && !R.M.start(R)) { cleanup(); toast('Det fanns ingen plats för uppdraget just nu. Försök igen om en stund.'); return; }
      next();
    }
    function next() {
      R.i++; R.S = R.M.steps[R.i]; R.t = 0; R.held = 0; R.note = '';
      if (R.S && R.S.start) R.S.start(R);
      routeT = 0; route = null;
    }
    // the mission is over: its cars and people go (the one you sit in stays, as an ordinary car)
    function cleanup() {
      if (!R) return;
      for (const c of R.own) {
        if (c === driving) { c.keep = false; continue; }
        if (cars.includes(c)) removeCar(c);
      }
      for (const p of R.people) if (persons.includes(p)) removePerson(p);
      R = null; route = null;
      if (beam) beam.visible = false;
    }
    function win() {
      const M = R.M, k = R.k;
      cleanup();
      if (k >= done) { done = k + 1; save(); }
      JOBS.reward(M.kr); PROGRESS.gain(M.xp); PROGRESS.did('story', M.id);
      beep([660, 880, 1320, 1760], 0.035, 0.4);
      sign('done', k);
    }
    function fail(why) {
      const k = R.k;
      cleanup();
      beep([440, 330], 0.04, 0.3);
      sign('fail', k, why);
    }
    function cancel(msg) { if (!R) return; cleanup(); if (msg) toast(msg); }

    /* ---------- Kicki ---------- */
    let kicki = null;
    function meetKicki() {
      if (kicki || !started || Math.hypot(player.x - KICKI.x, player.z - KICKI.z) > 220) return;
      kicki = makePerson(makeIdentity(OFFICER), KICKI.x, KICKI.z, { state: 'idle', face: Math.PI / 2, dodgeT: 0 });
      kicki.keep = true; kicki.rot = Math.PI / 2;
    }
    const nearKicki = () => !!kicki && !driving && !FLY.on && !CHUTE.on && Math.hypot(player.x - KICKI.x, player.z - KICKI.z) < 3.2;

    /* ---------- the sign ---------- */
    const E = { box: $('storySign'), kicker: $('stKicker'), title: $('stTitle'), lines: $('stLines'), pay: $('stPay'), go: $('stGo'), no: $('stNo') };
    let open = false, act = null, alt = null;
    function sign(kind, k, why) {
      const M = MISSIONS[k], nextM = MISSIONS[k + 1], chained = kind === 'done' && nextM && nextM.chain;
      E.kicker.textContent = 'Kuppen på Nationalmuseum · Uppdrag ' + (k + 1) + ' av ' + N;
      E.title.textContent = kind === 'fail' ? M.title + ': det gick inte' : kind === 'done' ? M.title + ': klart!' : kind === 'end' ? 'Tack!' : M.title;
      const lines = kind === 'offer' ? M.intro : kind === 'done' ? M.outro.concat(chained ? nextM.intro : []) : kind === 'end' ? [K('Tack igen för hjälpen med kuppen! Tack vare dig hänger Rembrandten kvar på museet. Det är lugnt i stan nu.')] : [{ who: '', text: why }];
      E.lines.replaceChildren(...lines.map((l) => { const p = document.createElement('p'); if (l.who) { const b = document.createElement('b'); b.textContent = l.who + ': '; p.append(b); } p.append(l.text); return p; }));
      E.pay.textContent = kind === 'offer' ? 'Belöning: ' + fmtKr(M.kr) + ' och ' + M.xp + ' XP' : kind === 'done' ? '+' + fmtKr(M.kr) + ' och ' + M.xp + ' XP' + (k === N - 1 ? '. Du har klarat hela storyn!' : '') : '';
      E.pay.hidden = !E.pay.textContent;
      if (kind === 'end') E.kicker.textContent = 'Kuppen på Nationalmuseum · Klar';
      // the buttons: what the yellow one does, and the white one
      const go = kind === 'offer' ? ['Kör!', () => begin(k)] : kind === 'fail' ? ['Försök igen', () => begin(k)] : chained ? ['Kör!', () => begin(k + 1)] : ['Okej', null];
      const no = kind === 'offer' ? 'Inte nu' : kind === 'fail' ? 'Stäng' : chained ? 'Senare' : null;
      E.go.textContent = go[0]; act = go[1];
      E.no.hidden = !no; E.no.textContent = no || ''; alt = null;
      if (chained) alt = () => toast('Prata med Kicki vid polisstationen när du vill fortsätta.');
      open = true; E.box.hidden = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const key in keys) keys[key] = false;
      joy.x = joy.y = 0;
      if (!isTouch) E.go.focus();
    }
    function close(yes) {
      if (!open) return;
      open = false; E.box.hidden = true;
      const f = yes ? act : alt;
      act = alt = null;
      if (f) f();
      requestLock();
    }
    E.go.addEventListener('click', () => close(true));
    E.no.addEventListener('click', () => close(false));
    function keydown(e) {
      if (!open) return false;
      if (e.code === 'Escape') { e.preventDefault(); close(false); } else if (e.code === 'Enter' && !e.repeat) { e.preventDefault(); close(true); }
      return true;
    }

    /* ---------- the box at the top ---------- */
    const B = { box: $('story'), title: $('storyTitle'), hint: $('storyHint'), clock: $('storyClock') };
    let shown = '';
    function hud() {
      document.body.classList.toggle('story', !!R);
      B.box.hidden = !R;
      if (!R || !R.S) { shown = ''; return; }
      const T = target(), d = T ? dist(here(), T) : 0;
      const hint = R.note || (T ? fmtDist(d) : ''), clock = R.S.limit ? fmtClock(Math.max(0, R.S.limit - R.t)) : '';
      const key = R.M.title + '|' + R.S.text + '|' + hint + '|' + clock;
      if (key === shown) return;
      shown = key;
      B.title.textContent = R.M.title + ': ' + R.S.text;
      B.hint.textContent = 'Uppdrag ' + (R.k + 1) + ' av ' + N + (hint ? ' · ' + hint : '');
      B.clock.textContent = clock;
    }
    function target() {
      if (!R || !R.S || !R.S.at) return null;
      const T = R.S.at(R);
      return T && T.x !== undefined ? T : null;
    }

    /* ---------- every frame ---------- */
    function update(dt) {
      if (!started) return;
      meetKicki();
      if (quitT > 0) quitT -= dt;
      // the marker over Kicki while she has a mission for you
      const offer = !R && done < N && !!kicki;
      if (offer || R) { if (!beam) beam = JOBS.beam(HEX, 1.3, 60); beam.visible = true; }
      else if (beam) beam.visible = false;
      if (!R) { if (offer) beam.position.set(KICKI.x, 0, KICKI.z); hud(); return; }
      if (PARTY.busy()) { cancel('Uppdraget avbröts för leken med vännerna.'); hud(); return; }
      R.t += dt;
      const S = R.S, res = S.tick(R, dt);
      if (res === true) {
        if (R.i + 1 < R.M.steps.length) next(); else { win(); hud(); return; }
      } else if (typeof res === 'string') { fail(res); hud(); return; }
      else if (S.limit && R.t > S.limit) { fail('Tiden tog slut.'); hud(); return; }
      if (R.M.id === 'bat') moveBoat(dt);
      const T = target();
      if (T) beam.position.set(T.x, 0, T.z); else beam.visible = false;
      // the GPS: along the streets, or (for a boat, the helicopter or the parachute) straight there
      if (T && (routeT -= dt) <= 0) {
        const p = here();
        routeT = 1.5;
        route = R.S.how === 'road' && !(driving && driving.M.boat) && !FLY.on && !CHUTE.on ? JOBS.routeTo(p.x, p.z, T.x, T.z) : [[p.x, p.z], [T.x, T.z]];
      }
      hud();
    }
    // the gang's boat out over the water along BOAT_PATH, faster and faster up to 16 m/s; past the end it has got away
    // (R.s < 0)
    function moveBoat(dt) {
      const b = R.boat;
      if (!b || !cars.includes(b)) return;
      if (!R.go) { b.vx = b.vz = 0; return; }
      R.v = Math.min(16, R.v + 3.5 * dt);
      let left = R.v * dt;
      while (left > 0 && R.seg < BOAT_PATH.length) {
        const [x0, z0] = BOAT_PATH[R.seg - 1], [x1, z1] = BOAT_PATH[R.seg], L = Math.hypot(x1 - x0, z1 - z0);
        if (R.s + left < L) { R.s += left; left = 0; } else { left -= L - R.s; R.s = 0; R.seg++; }
      }
      if (R.seg >= BOAT_PATH.length) { R.s = -1; return; }
      const [x0, z0] = BOAT_PATH[R.seg - 1], [x1, z1] = BOAT_PATH[R.seg], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      b.x = x0 + ux * R.s; b.z = z0 + uz * R.s;
      const h = Math.atan2(ux, uz);
      let dh = h - b.h; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
      b.h += dh * Math.min(1, 3 * dt);
      b.vx = ux * R.v; b.vz = uz * R.v;
    }

    /* ---------- on the maps ---------- */
    function dot(g, x, z, r, u) {
      g.fillStyle = COL; g.strokeStyle = '#ffffff'; g.lineWidth = 2 * u;
      g.beginPath(); g.arc(x, z, r * u, 0, TAU); g.fill(); g.stroke();
    }
    function drawMini(g, px, pz, u) {
      if (!R && done < N && Math.abs(KICKI.x - px) < 140 && Math.abs(KICKI.z - pz) < 140) {
        dot(g, KICKI.x, KICKI.z, 6, u);
        g.fillStyle = '#ffffff'; g.font = '900 ' + 8 * u + 'px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('K', KICKI.x, KICKI.z + 0.5 * u);
      }
      if (!R) return;
      if (route) { g.strokeStyle = 'rgba(239,62,92,.9)'; g.lineWidth = 4.2 * u; g.lineJoin = g.lineCap = 'round'; g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke(); }
      const T = target();
      if (T) dot(g, T.x, T.z, 5.5, u);
    }
    function drawBig(g, toX, toY) {
      if (!R && done < N) {
        const X = toX(KICKI.x), Y = toY(KICKI.z);
        dot(g, X, Y, 8, 1);
        g.fillStyle = '#ffffff'; g.font = '900 10px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('K', X, Y + 0.5);
        g.font = '800 12px Overpass, sans-serif'; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.9)';
        g.strokeText('Kicki: uppdrag ' + (done + 1), X + 11, Y); g.fillStyle = '#9b1530'; g.fillText('Kicki: uppdrag ' + (done + 1), X + 11, Y);
      }
      if (!R) return;
      if (route) { g.save(); g.strokeStyle = 'rgba(239,62,92,.9)'; g.lineWidth = 5; g.lineJoin = g.lineCap = 'round'; g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(toX(x), toY(z)) : g.moveTo(toX(x), toY(z)))); g.stroke(); g.restore(); }
      const T = target();
      if (T) dot(g, toX(T.x), toY(T.z), 7, 1);
    }

    hud();
    return {
      update, keydown, drawMini, drawBig,
      get active() { return !!R; }, get signOpen() { return open; }, get done() { return done; },
      // while you help the police they leave you alone (startChase)
      get duty() { return !!R; },
      prompt() { return nearKicki() && !R ? (done < N ? 'Prata med Kicki' : 'Kicki') : null; },
      // E by Kicki: the next mission, or her thanks
      use() {
        if (!nearKicki() || R) return false;
        if (PARTY.busy()) { toast('Inte mitt i en lek med vännerna.'); return true; }
        sign(done < N ? 'offer' : 'end', Math.min(done, N - 1));
        return true;
      },
      // J on a mission: twice to give it up
      key() {
        if (!R) return false;
        if (quitT > 0) { cancel('Uppdraget är avbrutet. Prata med Kicki vid polisstationen för att försöka igen.'); quitT = 0; }
        else { quitT = 3; toast('Tryck J igen för att avbryta uppdraget.'); }
        return true;
      },
      // for the job board: where you are in the story
      board() { return { done, n: N, next: done < N ? MISSIONS[done].title : null, at: KICKI }; },
      // for the tests
      debug: { MISSIONS, BOAT_PATH, BOSS, TOWER, KICKI, MUSEUM, HIDEOUT, begin, sign, get R() { return R; }, get kicki() { return kicki; }, set done(v) { done = v; save(); }, close }
    };
  })();
