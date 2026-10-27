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
  // Chapter 2, Kungakronan, follows on: the boss worked for someone called Mästaren, who means to steal the crown from
  // Skattkammaren under the palace. Take the tunnelbana to a tipster at Hötorget, find his helper among the tourists at
  // the changing of the guard and run them down, spot his chauffeur from the Ferris wheel at Gröna Lund and soak his
  // phone with a water balloon, follow his jeep from the helicopter on a stormy night, and catch his jet ski.
  // Chapter 3, Mästarens hämnd (made up with Elvin): Mästaren escapes. Chase his car from Centralbron until he runs for
  // it, follow his helper on foot from Birger Jarlsgatan to a meeting at Stureplan, photograph the gang's warehouse in
  // Hammarby sjöstad from the helicopter without flying so low that they hear it, stop their van before it reaches
  // Globen, and land on Globen's roof to follow him from the air and run him down.
  // Nothing is built until it is needed (Kicki when you first come near the station), so the scene at load stays as it
  // was (see WAYPOINT for why).
  const STORY = (() => {
    const KEY = 'gubbe-story', COL = '#ef3e5c', HEX = 0xef3e5c;
    let done = 0;
    try { done = Math.max(0, Math.floor(Number(JSON.parse(localStorage.getItem(KEY) || '{}').done) || 0)); } catch (e) { /* a private window */ }
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
    // chapter 2: the tunnelbana from Gamla stan to Hötorget, where the tipster waits on the square; the tourists on Yttre
    // borggården; the Ferris wheel at Gröna Lund and the chauffeur's van on Djurgårdsvägen; the palace, and Slottsbacken
    // where Mästaren's jeep stands; the police jet ski at Strandvägen, and the way his jet ski takes out along
    // Djurgårdsbrunnsviken (all water: a test checks)
    const station = (name) => { const L = mapLabels.find((l) => l[3] === 'tbana' && l[0] === name); return { x: L[1], z: L[2] }; };
    const GAMLA = station('Gamla stan'), HOTORGET = station('Hötorget'), SQUARE = { x: -461, z: -918 }, CROWD = { x: -79, z: -6 }, GUARD = { x: -79, z: 30 };
    const WHEEL = { x: TIVOLI.WHEEL.x, z: TIVOLI.WHEEL.z }, VAN = { x: 1385, z: 560 }, PALACE = { x: 0, z: 0 }, SLOTTSBACKEN = { x: 126, z: 5 };
    const JET_PATH = [[640, -585], [800, -560], [1068, -522], [1300, -525], [1500, -538], [1800, -560], [2000, -580], [2300, -615], [2500, -645], [2640, -662], [2740, -666]], JET_QUAY = { x: 600, z: -680 };
    // chapter 3: Centralbron, where Mästaren's car comes from; Birger Jarlsgatan, where his helper sets off, and
    // Stureplan, where she meets someone (200 m on foot); the gang's warehouse in Hammarby sjöstad and the three places
    // over it to photograph from (below LOW they hear the helicopter: the roofs there are under 27 m); Globen, whose roof
    // the helicopter can land on 85 m up, and Arenavägen in front of it, where the gang's van makes for
    const CENTRALBRON = { x: -252, z: 548 }, BIRGER = { x: 210, z: -838 }, STUREPLAN = { x: 160, z: -925 };
    const LAGER = { x: 1350, z: 2330 }, SHOTS = [{ x: 1300, z: 2290 }, { x: 1400, z: 2290 }, { x: 1350, z: 2390 }], LOW = 45;
    const GLOBEN = { x: GLOBE.x, z: GLOBE.z }, ARENA = { x: 566, z: 2523 };
    // Mästaren: just out of the prison van, and in his suit at Globen
    const PRISONER = { shirt: 0xe46f2a, pants: 0xe46f2a }, MASTER = { shirt: 0x2b2b2e, pants: 0x1c1c1f, hat: 'cap', hatColor: 0x1b1d22 };
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
    // a free place to stand near (x, z), on the ground
    function footSpot(x, z) {
      for (let r = 0; r <= 20; r += 1.5) for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (walkable(px, pz) && personFits(px, pz) && !blockedAt(px, pz, 0.5) && FLY.heightAt(px, pz, 0.5) === 0) return { x: px, z: pz };
      }
      return { x, z };
    }
    // someone of the story's own, standing where they are put (facing face), kept until the mission is over
    function person(R, id, at, face) {
      const p = makePerson(id, at.x, at.z, { state: 'idle', face, dodgeT: 0 });
      p.keep = true; p.rot = face; R.people.push(p);
      return p;
    }
    // a car of the story's own, standing still where it is put, kept until the mission is over
    function place(R, M, color, at) {
      if (!at) return null;
      const c = makeCar(M, color);
      c.x = at.x; c.z = at.z; c.h = at.h || 0; c.keep = true;
      R.own.push(c);
      return c;
    }
    // the police car at the station's kerb
    function policeCar(R) {
      const at = STATION.curb(0);
      R.police = place(R, MODEL.polis, MODEL.polis.colors[0], spotFree(MODEL.polis, at.x, at.z, at.h) ? at : kerbSpot(MODEL.polis, at.x, at.z));
      return !!R.police;
    }
    // a parked car driven off by someone, along the streets towards goal
    function drive(c, goal, cruise, getaway) {
      if (!c.occupant) setOccupant(c, makeIdentity());
      c.bot = { from: 0, to: 0, next: 0, phase: 'edge', t: 0, passT: 0, waitT: 0, ignoreT: 0, revT: 0, stuckT: 0, stuckTotal: 0, honkT: 0, turnAge: 0, cruise, goal };
      c.getaway = !!getaway;
      resyncBot(c);
    }
    // a getaway car runs from you: now and then somewhere new to make for, well away from you (as the robber in JOBS)
    function flee(R, r, dt) {
      if (!r.bot || (R.fleeT -= dt) > 0) return;
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
    // a getaway boat or jet ski (R.boat) caught: you beside it (within near metres) in a boat of your own for 3 s
    function chase(R, dt, near, why) {
      const d = driving && driving.M.boat ? dist(driving, R.boat) : Infinity;
      R.held = d < near ? R.held + dt : Math.max(0, R.held - dt);
      R.note = R.held > 0 ? 'Håll dig bredvid …' : d < Infinity ? fmtDist(d) : 'Kliv i en båt!';
      if (R.held >= 3) { R.go = false; R.v = 0; return true; }
      return R.s < 0 ? why : false;
    }
    // keeping up with a getaway car (R.car), on the ground or (air) from the helicopter: within near metres of it for
    // secs seconds in all; further off than far for 8 s, and it has got away (why)
    function keepUp(R, dt, near, far, secs, air, why) {
      const r = R.car;
      if (!cars.includes(r)) return why;
      flee(R, r, dt);
      const d = !air || FLY.on ? dist(here(), r) : Infinity;
      if (d < near) R.held += dt;
      R.lost = d > far ? R.lost + dt : 0;
      R.note = (air ? 'Följ honom ' : 'Håll dig nära ') + Math.min(secs, Math.floor(R.held)) + ' av ' + secs + ' s' + (d >= near ? (air ? ' · flyg närmare!' : ' · kör ikapp!') : '');
      if (R.lost > 8) return why;
      return R.held >= secs;
    }
    // a car stopped by you: your car tight beside it while it stands still for 2 s (or it is wrecked), and its driver
    // gets out in handcuffs
    function pinned(R, r, dt) {
      const c = driving, close = c && dist(r, c) < (r.M.L + c.M.L) / 2 + 3;
      R.held = speedOf(r) < 1.5 && close ? R.held + dt : 0;
      R.note = R.held > 0 ? 'Håll kvar …' : fmtDist(dist(here(), r));
      if (!r.dead && R.held < 2) return false;
      const spot = exitSpot(r);
      if (spot && r.occupant) { const p = makePerson(r.occupant, spot.x, spot.z, { state: 'idle', face: r.h, dodgeT: 0 }); p.cuffed = true; p.rot = r.h; p.keep = true; R.people.push(p); }
      setOccupant(r, null); r.bot = null; r.getaway = false;
      return true;
    }
    // the driver leaves the car where it stops and runs from you
    function runFor(R, r) {
      r.bot = null; r.getaway = false; r.vx *= 0.3; r.vz *= 0.3;
      const p = person(R, r.occupant || makeIdentity(), exitSpot(r) || footSpot(r.x, r.z), r.h);
      p.ai = { state: 'flee', t: 999, dodgeT: 0 };
      setOccupant(r, null);
      return p;
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
        id: 'larm', title: 'Larmet', kr: 3000, xp: 300, night: 2,
        intro: [
          K('Det är natt, och larmet har just gått på Nationalmuseum! Gänget är där inne.'),
          K('Ta polisbilen utanför stationen och kör dit. Slå på blåljuset med L. Försöker de fly, så stoppar du deras bil: kör ikapp och ställ dig tätt intill den tills den står still.')
        ],
        outro: [RADIO('Bra jobbat! Två av dem är gripna. Men tavlan är inte i bilen … Kollegorna säger att en båt just lade ut från kajen nedanför museet!')],
        start: policeCar,
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
              const r = R.car;
              if (!cars.includes(r)) return 'Gänget kom undan.';
              flee(R, r, dt);
              if (dist(here(), r) > 650) return 'Gänget kom undan.';
              return pinned(R, r, dt);
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
          Object.assign(R, { path: BOAT_PATH, top: 16, seg: 1, s: 0, v: 0, go: false });
          return true;
        },
        steps: [
          { text: 'Hoppa i polisbåten vid kajen nedanför Nationalmuseum', how: 'road', at: (R) => R.police, tick: () => !!driving && !!driving.M.boat },
          {
            text: 'Kör ikapp tjuvarnas båt och lägg dig bredvid den',
            at: (R) => R.boat,
            start(R) { R.go = true; toast('Tjuvarnas båt lägger ut! Kör ikapp den.'); },
            tick: (R, dt) => chase(R, dt, 10, 'Tjuvarnas båt kom undan.')
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
      },

      /* ---------- chapter 2: Kungakronan ---------- */
      {
        id: 'tipsare', title: 'Tipsaren', kr: 2000, xp: 200,
        intro: [
          K('Hej igen, hjälten! Bossen vi grep på Gärdet har börjat prata. Hen jobbade åt någon som bara kallas Mästaren.'),
          K('Mästaren planerar något ännu större: att stjäla kungakronan från Skattkammaren under slottet. En tipsare vill träffa dig vid Hötorget, men Mästarens folk håller koll på gatorna.'),
          K('Ta tunnelbanan från Gamla stan till Hötorget, så syns du inte. Tipsaren har en gul mössa.')
        ],
        outro: [K('Tipsaren berättade att Mästarens medhjälpare spanar på vaktavlösningen vid slottet. Hen har grön jacka och röd keps. Kom till mig när du vill fortsätta.')],
        start(R) { R.tip = person(R, makeIdentity({ shirt: 0x3a4a6b, hat: 'beanie', hatColor: 0xf2c200 }), footSpot(SQUARE.x, SQUARE.z), 0); return true; },
        steps: [
          {
            text: 'Åk tunnelbana från Gamla stan till Hötorget', how: 'road', at: (R) => (METRO.riding ? null : R.rode ? HOTORGET : GAMLA),
            tick(R) {
              if (METRO.riding) { R.rode = true; R.note = 'Tåget går …'; return false; }
              if (!R.rode) return false;
              if (dist(player, HOTORGET) < 40) return true;
              R.rode = false; R.note = 'Fel station! Åk till Hötorget.';
              return false;
            }
          },
          { text: 'Hitta tipsaren med den gula mössan', at: (R) => R.tip, tick: (R) => !driving && dist(player, R.tip) < 2.5 }
        ]
      },
      {
        id: 'vakt', title: 'Vaktavlösningen', kr: 3000, xp: 300,
        intro: [
          K('Mästarens medhjälpare spanar på vaktavlösningen vid slottet, sa tipsaren. Hen har grön jacka och röd keps.'),
          K('Gå till Yttre borggården och leta upp hen bland turisterna. Gå fram till rätt person. Hen kommer säkert att springa, så spring ikapp med Shift!')
        ],
        outro: [K('Bra sprungit! Medhjälparen hade en lapp i fickan: ”Chauffören väntar vid Gröna Lund. Signal från pariserhjulet.” Kom till mig, så letar vi upp chauffören.')],
        start(R) {
          // six people watching the guard, one of them the helper (green jacket, red cap: nobody else wears either)
          const looks = [{ shirt: 0xc8102e }, { shirt: 0x1d3f8f, hat: 'beanie', hatColor: 0xffffff }, { shirt: 0xf2c200 }, { shirt: 0x6b3fa0, hat: 'cap', hatColor: 0x1b1d22 }, { shirt: 0xe46f2a, hat: 'beanie', hatColor: 0x1d3f8f }];
          const at = Math.floor(Math.random() * 6);
          R.crowd = [];
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + 0.3, s = footSpot(CROWD.x + Math.sin(a) * 7, CROWD.z + Math.cos(a) * 6);
            const p = person(R, makeIdentity(i === at ? { shirt: 0x2e8b3d, hat: 'cap', hatColor: 0xc8102e } : looks[i % looks.length]), s, Math.atan2(GUARD.x - s.x, GUARD.z - s.z));
            R.crowd.push(p);
            if (i === at) R.sus = p;
          }
          return true;
        },
        steps: [
          { text: 'Gå till Yttre borggården vid slottet', how: 'road', at: () => CROWD, tick: () => dist(here(), CROWD) < 25 },
          {
            text: 'Leta upp personen med grön jacka och röd keps', at: () => CROWD,
            tick(R) {
              if (driving || FLY.on) { R.note = 'Kliv ur och gå till fots'; return false; }
              R.note = '';
              // (the helper sees you coming a few metres off, and runs)
              for (const p of R.crowd) {
                const d = dist(player, p);
                if (p === R.sus && d < 4.5) { p.ai = { state: 'flee', t: 999, dodgeT: 0 }; toast('Hen såg dig och springer! Spring ikapp med Shift!'); return true; }
                if (p !== R.sus && d < 2.4 && !p.told) { p.told = true; toast('Det där är en turist. Leta vidare!'); }
              }
              return false;
            }
          },
          {
            text: 'Spring ikapp medhjälparen (Shift)', at: (R) => R.sus, limit: 60,
            tick(R) {
              const d = dist(player, R.sus);
              R.note = fmtDist(d);
              if (d > 90) return 'Medhjälparen sprang ifrån dig.';
              if (d > 1.7 || driving || R.t < 1) return false;
              R.sus.ai = { state: 'idle', face: R.sus.rot, dodgeT: 0 }; R.sus.cuffed = true;
              return true;
            }
          }
        ]
      },
      {
        id: 'hjulet', title: 'Pariserhjulet', kr: 3500, xp: 350,
        intro: [
          K('Mästarens chaufför väntar någonstans vid Gröna Lund, men vi vet inte var. Åk pariserhjulet, så ser du hela området från toppen.'),
          K('När du har hittat honom får han inte hinna ringa Mästaren! Jag ger dig några vattenballonger. En blöt telefon fungerar inte.')
        ],
        outro: [K('Plask! Chaufförens telefon dog, och kollegorna tog hand om honom. I bilen låg en plan: Mästaren bryter sig in i Skattkammaren i natt, mitt i ovädret. Kom till mig när du är redo.')],
        start(R) {
          R.van = place(R, MODEL.skapbil, MODEL.skapbil.colors[0], kerbSpot(MODEL.skapbil, VAN.x, VAN.z));
          if (!R.van) return false;
          const s = exitSpot(R.van) || footSpot(R.van.x, R.van.z);
          R.driver = person(R, makeIdentity({ shirt: 0x1b1d22, pants: 0x2b2b2e, hat: 'cap', hatColor: 0x1b1d22 }), s, R.van.h + Math.PI / 2);
          return true;
        },
        steps: [
          { text: 'Åk pariserhjulet på Gröna Lund', how: 'road', at: () => WHEEL, tick: () => RIDES.riding && RIDES.ride === 'wheel' },
          {
            text: 'Titta ut över området från toppen av hjulet', at: () => null,
            tick(R, dt) {
              if (!(RIDES.riding && RIDES.ride === 'wheel')) { R.note = 'Åk hjulet igen'; return false; }
              R.spin += dt; R.note = '';
              if (R.spin < 8) return false;
              toast('Där! Chauffören står vid en vit skåpbil på Djurgårdsvägen.');
              return true;
            }
          },
          {
            text: 'Blöt ner chauffören med en vattenballong (F eller klick)', at: (R) => R.driver, limit: 150,
            start() { SPLASH.give(5); toast('Kicki: Här har du fem vattenballonger. Kasta med F eller ett klick!'); },
            tick(R) {
              if (R.driver.wetT > 0) { R.driver.cuffed = true; return true; }
              if (!SPLASH.count) { SPLASH.give(5); toast('Kicki: Här har du fem till!'); }
              R.note = fmtDist(dist(here(), R.driver)) + ' · ' + SPLASH.count + ' ballonger';
              return false;
            }
          }
        ]
      },
      {
        id: 'storm', title: 'Stormen', kr: 5000, xp: 500, night: 23.5, storm: true,
        intro: [
          K('Det är natt och storm, och larmet har gått i Skattkammaren under slottet! Mästaren har kronan och kommer att fly i bil.'),
          K('I det här vädret ser vi honom bäst uppifrån. Ta helikoptern, flyg till slottet och följ hans bil från luften, så att polisbilarna hittar honom.')
        ],
        outro: [RADIO('Polisen har spärrat broarna, och Mästaren lämnade bilen vid Strandvägen. Men han flyr vidare på en vattenskoter!')],
        steps: [
          { text: 'Kliv in i helikoptern', how: 'road', at: () => FLY.heli, tick: () => FLY.on },
          {
            text: 'Flyg till Kungliga slottet', at: () => PALACE,
            tick(R) {
              if (!FLY.on || dist(FLY.heli, PALACE) > 120 || FLY.heli.y < 15) return false;
              R.car = place(R, MODEL.g63, 0x15161a, kerbSpot(MODEL.g63, SLOTTSBACKEN.x, SLOTTSBACKEN.z));
              if (!R.car) return false;
              drive(R.car, null, 19, true); R.car.bot.turnV = 9; R.fleeT = 0;
              toast('Där kör Mästaren, i den svarta jeepen! Följ honom.');
              return true;
            }
          },
          {
            text: 'Följ Mästarens jeep från luften', at: (R) => R.car,
            tick(R, dt) {
              const res = keepUp(R, dt, 90, 220, 45, true, 'Mästaren försvann i stormen.');
              if (res === true) { R.car.bot = null; R.car.getaway = false; }
              return res;
            }
          }
        ]
      },
      {
        id: 'jet', title: 'Vattenskotern', kr: 20000, xp: 1000, chain: true,
        intro: [RADIO('Mästaren har kronan i en väska och flyr på vattenskoter mot Djurgårdsbrunnsviken! Landa och hoppa på polisens vattenskoter vid kajen på Strandvägen. Kör ikapp honom och lägg dig bredvid tills han ger upp.')],
        outro: [
          K('Mästaren gav upp, och kungakronan ligger tryggt kvar i Skattkammaren. Kungen själv har ringt och vill tacka dig!'),
          K('Först Grevinnan och nu Mästaren. Stockholm har tur som har dig!')
        ],
        start(R) {
          R.police = place(R, MODEL.polisjet, MODEL.polisjet.colors[0], findBerth(MODEL.polisjet, JET_QUAY.x, JET_QUAY.z, 80));
          const [x0, z0] = JET_PATH[0], [x1, z1] = JET_PATH[1];
          R.boat = place(R, MODEL.jetski, MODEL.jetski.colors[0], { x: x0, z: z0, h: Math.atan2(x1 - x0, z1 - z0) });
          if (!R.police || !R.boat) return false;
          setOccupant(R.boat, makeIdentity({ shirt: 0x1b1d22 }));
          Object.assign(R, { path: JET_PATH, top: 21, seg: 1, s: 0, v: 0, go: false });
          return true;
        },
        steps: [
          { text: 'Hoppa på polisens vattenskoter vid Strandvägen', how: 'road', at: (R) => R.police, tick: () => !!driving && !!driving.M.boat },
          {
            text: 'Kör ikapp Mästaren och lägg dig bredvid honom', at: (R) => R.boat,
            start(R) { R.go = true; toast('Mästaren gasar iväg! Kör ikapp honom.'); },
            tick: (R, dt) => chase(R, dt, 8, 'Mästaren kom undan.')
          }
        ]
      },

      /* ---------- chapter 3: Mästarens hämnd ---------- */
      {
        id: 'rymning', title: 'Rymningen', kr: 4000, xp: 400, night: 1.5,
        intro: [
          K('Dåliga nyheter! Mästaren har rymt. Hans gäng stoppade fångtransporten på Centralbron, och nu flyr han i en stulen bil.'),
          K('Ta polisbilen utanför stationen och kör mot Centralbron. Slå på blåljuset med L. Kör ikapp honom och håll dig nära, så att han inte kommer undan.')
        ],
        outro: [K('Mästaren sprang ner i tunnelbanan och försvann, men han glömde sin telefon i bilen. Den ska vi titta på. Kom till mig när du vill fortsätta.')],
        start: policeCar,
        steps: [
          { text: 'Kliv in i polisbilen utanför stationen', at: (R) => R.police, tick: () => !!driving && !!driving.M.police && !driving.M.boat },
          {
            text: 'Kör mot Centralbron', how: 'road', at: () => CENTRALBRON,
            tick(R) {
              if (dist(here(), CENTRALBRON) > 160) return false;
              R.car = place(R, MODEL.m4, 0x9aa3ad, kerbSpot(MODEL.m4, CENTRALBRON.x, CENTRALBRON.z));
              if (!R.car) return false;
              setOccupant(R.car, makeIdentity(PRISONER));
              drive(R.car, null, 19, true); R.car.bot.turnV = 9; R.fleeT = 0;
              toast('Där är han, i den silvriga BMW:n! Kör ikapp honom.');
              return true;
            }
          },
          {
            text: 'Jaga Mästaren och håll dig nära honom', how: 'road', at: (R) => R.car, limit: 240,
            tick(R, dt) {
              const res = keepUp(R, dt, 50, 350, 30, false, 'Mästaren kom undan.');
              if (res !== true) return res;
              R.boss = runFor(R, R.car);
              toast('Mästaren tvärnitade och sprang ner i tunnelbanan! Men han lämnade något i bilen …');
              return true;
            }
          },
          {
            text: 'Kliv ur och leta i Mästarens bil', at: (R) => R.car,
            tick(R) {
              if (dist(player, R.car) > 3.5 || driving) return false;
              beep([880, 1320], 0.03, 0.15); toast('Du hittade Mästarens telefon!');
              return true;
            }
          }
        ]
      },
      {
        id: 'telefon', title: 'Telefonen', kr: 4000, xp: 400,
        intro: [
          K('I Mästarens telefon fanns ett meddelande: hans medhjälpare ska träffa någon vid Stureplan. Hon väntar på Birger Jarlsgatan och har lila jacka.'),
          K('Följ efter henne till fots. Inte för nära, för då ser hon dig, och inte för långt efter, för då tappar du henne. Ta sedan bilder på mötet i smyg.')
        ],
        outro: [K('Bilderna är jättebra! Hon gav nycklar till en känd tjuv, och nycklarna går till ett lager i Hammarby sjöstad. Kom till mig när du vill fortsätta.')],
        start(R) {
          R.helper = person(R, makeIdentity({ shirt: 0x6b3fa0, hat: 'beanie', hatColor: 0x1b1d22 }), footSpot(BIRGER.x, BIRGER.z), Math.PI);
          R.contact = person(R, makeIdentity({ shirt: 0x8a6d3b, pants: 0x2b2b2e, hat: 'cap', hatColor: 0x2b2b2e }), footSpot(STUREPLAN.x, STUREPLAN.z), 0);
          return true;
        },
        steps: [
          {
            text: 'Gå till Birger Jarlsgatan och leta upp kvinnan med lila jacka', how: 'road', at: (R) => R.helper,
            tick(R) {
              if (dist(here(), R.helper) > 35) return false;
              const c = R.contact;
              R.helper.ai = { state: 'goto', x: c.x + Math.sin(c.rot) * 1.4, z: c.z + Math.cos(c.rot) * 1.4, speed: 1.8, dodgeT: 0 };
              toast('Där är hon, och nu går hon! Följ efter till fots.');
              return true;
            }
          },
          {
            text: 'Följ efter henne till fots, men inte för nära', at: (R) => R.helper, limit: 240,
            tick(R, dt) {
              const h = R.helper, d = dist(here(), h), inCar = !!driving || FLY.on, seen = inCar ? d < 60 : d < 7;
              R.sus = seen ? R.sus + dt : Math.max(0, R.sus - dt * 0.5);
              R.lost = d > 45 ? R.lost + dt : 0;
              R.note = R.sus > 0.3 ? (inCar ? 'Hon ser dig, gå till fots!' : 'För nära, hon ser dig!') : R.lost > 1 ? 'Skynda dig, du tappar henne!' : fmtDist(d) + ' bakom';
              if (R.sus > 3) return 'Medhjälparen såg dig och gick därifrån.';
              if (R.lost > 10) return 'Du tappade bort medhjälparen.';
              if (dist(h, R.contact) > 2.2) return false;
              h.ai = { state: 'idle', face: Math.atan2(R.contact.x - h.x, R.contact.z - h.z), dodgeT: 0 };
              R.contact.ai.face = Math.atan2(h.x - R.contact.x, h.z - R.contact.z);
              return true;
            }
          },
          {
            text: 'Ta bilder på mötet i smyg (stå still)', at: (R) => R.helper, limit: 60,
            start(R) { R.sus = 0; },
            tick(R, dt) {
              const d = dist(here(), R.helper), inCar = !!driving || FLY.on, still = !inCar && Math.hypot(player.vx, player.vz) < 1;
              R.sus = (inCar ? d < 60 : d < 7) ? R.sus + dt : Math.max(0, R.sus - dt * 0.5);
              if (R.sus > 2) return 'De såg dig, och mötet blev inte av.';
              if (still && d < 30) R.shots += dt;
              const n = Math.min(3, Math.floor(R.shots));
              if (n > R.clicks) { R.clicks = n; beep([1600, 1200], 0.02, 0.1); }
              R.note = R.sus > 0.3 ? 'För nära, de ser dig!' : d >= 30 ? 'Gå närmare · ' + fmtDist(d) : 'Bilder ' + n + ' av 3' + (still ? '' : ' · stå still');
              return R.shots >= 3;
            }
          }
        ]
      },
      {
        id: 'lager', title: 'Gömstället', kr: 4500, xp: 450,
        intro: [
          K('Lagret i Hammarby sjöstad kan vara Mästarens gömställe. Ta helikoptern vid Skeppsbron och fota lagret från tre håll.'),
          K('Håll helikoptern stilla en stund över varje ställe, så att kameran hinner. Och flyg inte för lågt, för då hör de dig!')
        ],
        outro: [K('På bilderna syns gänget lasta en vit skåpbil. De ska flytta något i kväll. Kom till mig när du är redo att stoppa dem.')],
        steps: [
          { text: 'Kliv in i helikoptern vid Skeppsbron', how: 'road', at: () => FLY.heli, tick: () => FLY.on },
          {
            text: 'Fota lagret i Hammarby sjöstad från tre håll', at: (R) => SHOTS[Math.min(R.clicks, SHOTS.length - 1)],
            tick(R, dt) {
              const H = FLY.heli, S = SHOTS[R.clicks], d = FLY.on ? dist(H, S) : Infinity, low = FLY.on && dist(H, LAGER) < 110 && H.y < LOW;
              R.sus = low ? R.sus + dt : Math.max(0, R.sus - dt * 0.5);
              if (R.sus > 4) return 'Gänget hörde helikoptern och gömde sig.';
              if (d < 25 && !low) R.shots += dt;
              if (R.shots >= 2) { R.clicks++; R.shots = 0; beep([1600, 1200], 0.02, 0.1); }
              R.note = low ? 'För lågt, de hör dig! Flyg högre.' : 'Bilder ' + R.clicks + ' av 3' + (d < 25 ? ' · håll stilla …' : '');
              return R.clicks >= SHOTS.length;
            }
          }
        ]
      },
      {
        id: 'fallan', title: 'Fällan', kr: 6000, xp: 600, night: 22,
        intro: [
          K('Nu är det kväll, och gänget kör snart iväg med skåpbilen från lagret. Vi vill veta vad som finns i den, och vem som kör.'),
          K('Ta polisbilen utanför stationen och kör till Hammarby sjöstad. Stoppa skåpbilen: kör ikapp och ställ dig tätt intill den tills den står still.')
        ],
        outro: [K('I skåpbilen låg en ritning över Globen och en plan: Mästaren ska stjäla kassan från den stora konserten på Globen i kväll, och han är där själv. Kom till mig, så tar vi honom!')],
        start(R) {
          R.van = place(R, MODEL.skapbil, MODEL.skapbil.colors[0], kerbSpot(MODEL.skapbil, LAGER.x, LAGER.z));
          return policeCar(R) && !!R.van;
        },
        steps: [
          { text: 'Kliv in i polisbilen utanför stationen', at: (R) => R.police, tick: () => !!driving && !!driving.M.police && !driving.M.boat },
          {
            text: 'Kör till lagret i Hammarby sjöstad', how: 'road', at: () => LAGER,
            tick(R) {
              if (dist(here(), LAGER) > 260) return false;
              const n = nearestNode(ARENA.x, ARENA.z);
              R.goal = { node: n, x: nodes[n].x, z: nodes[n].z };
              drive(R.van, R.goal, 14, true); R.van.bot.turnV = 9;
              toast('Skåpbilen kör iväg mot Globen! Stoppa den!');
              return true;
            }
          },
          {
            text: 'Stoppa skåpbilen innan den kommer fram till Globen', how: 'road', at: (R) => R.van, limit: 180,
            tick(R, dt) {
              const r = R.van;
              if (!cars.includes(r) || dist(r, R.goal) < 40) return 'Skåpbilen kom fram till Globen.';
              return pinned(R, r, dt);
            }
          }
        ]
      },
      {
        id: 'globen', title: 'Finalen på Globen', kr: 30000, xp: 1500, night: 21.5,
        intro: [
          K('Nu tar vi Mästaren! Han är på Globen, där konserten just har börjat. Polisen står vid alla dörrar, så han kan bara fly en väg: över taket och ut på baksidan.'),
          K('Ta helikoptern vid Skeppsbron och landa högst upp på Globens tak. Därifrån ser du allt.')
        ],
        outro: [
          K('Där satt han! Mästaren har handbojor på sig, och konsertkassan är kvar. Den här gången rymmer han inte, för nu sitter han i den säkraste cellen i hela Sverige.'),
          K('Tack, hjälten. Utan dig hade vi aldrig klarat det. Hela polisen i Stockholm tackar dig!')
        ],
        steps: [
          { text: 'Kliv in i helikoptern vid Skeppsbron', how: 'road', at: () => FLY.heli, tick: () => FLY.on },
          {
            text: 'Landa högst upp på Globens tak', at: () => GLOBEN,
            tick(R) {
              const H = FLY.heli, d = FLY.on ? dist(H, GLOBEN) : Infinity;
              R.note = d < 200 ? (H.y < 86 && !H.ground ? 'Flyg högre, taket är 85 m upp' : 'Landa mitt på taket') : '';
              if (!(FLY.on && H.ground && d < 30 && H.y > 70)) return false;
              R.car = place(R, MODEL.mclaren720, 0xff7a00, kerbSpot(MODEL.mclaren720, ARENA.x, ARENA.z));
              if (!R.car) return false;
              setOccupant(R.car, makeIdentity(MASTER));
              drive(R.car, null, 19, true); R.car.bot.turnV = 9; R.fleeT = 0;
              toast('Där! Mästaren sprang ut på baksidan och hoppade in i en orange McLaren. Lyft och följ honom!');
              return true;
            }
          },
          {
            text: 'Lyft och följ Mästarens bil från luften', at: (R) => R.car,
            tick(R, dt) {
              const res = keepUp(R, dt, 100, 250, 30, true, 'Mästaren kom undan.');
              if (res !== true) return res;
              R.boss = runFor(R, R.car);
              toast('Polisen har spärrat vägen, och Mästaren springer! Landa och spring ikapp honom (Shift).');
              return true;
            }
          },
          {
            text: 'Landa och spring ikapp Mästaren (Shift)', at: (R) => R.boss, limit: 150,
            tick(R) {
              const d = dist(here(), R.boss);
              R.note = (FLY.on ? 'Landa och kliv ur (E) · ' : '') + fmtDist(d);
              if (d > 400) return 'Mästaren sprang ifrån dig.';
              if (FLY.on || driving || dist(player, R.boss) > 1.7) return false;
              R.boss.ai = { state: 'idle', face: R.boss.rot, dodgeT: 0 }; R.boss.cuffed = true;
              return true;
            }
          }
        ]
      }
    ];
    const N = MISSIONS.length;
    done = Math.min(done, N);
    // the chapters: their names, and which missions are theirs
    const CHAPTERS = [{ title: 'Kuppen på Nationalmuseum', first: 0, n: 5 }, { title: 'Kungakronan', first: 5, n: 5 }, { title: 'Mästarens hämnd', first: 10, n: 5 }];
    const chapterOf = (k) => { let i = CHAPTERS.length - 1; while (i > 0 && k < CHAPTERS[i].first) i--; return Object.assign({ i }, CHAPTERS[i]); };
    const inChapter = (k) => { const c = chapterOf(k); return 'uppdrag ' + (k - c.first + 1) + ' av ' + c.n; };

    /* ---------- a mission on ---------- */
    // R: the mission on now: k (which), M, i (the step), S (it), t (time on it), own (its cars), people, and what the
    // steps keep for themselves
    let R = null, beam = null, route = null, routeT = 0, quitT = 0;
    function newRun(k) { return { k, M: MISSIONS[k], i: -1, S: null, t: 0, own: [], people: [], held: 0, sus: 0, lost: 0, shots: 0, clicks: 0, spin: 0, rode: false, path: null, note: '' }; }
    function begin(k) {
      if (R) cleanup();
      if (JOBS.job) JOBS.key();
      R = newRun(k);
      // (the time and the weather: not as a friend in someone else's room, where theirs count)
      const own = !(MP.inRoom && !MP.host);
      if (R.M.night && own) DAYNIGHT.set(R.M.night);
      if (R.M.storm && own) WEATHER.force(1);
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
      const C = chapterOf(k), last = k === C.first + C.n - 1;
      E.kicker.textContent = 'Kapitel ' + (C.i + 1) + ': ' + C.title + ' · ' + inChapter(k);
      E.title.textContent = kind === 'fail' ? M.title + ': det gick inte' : kind === 'done' ? M.title + ': klart!' : kind === 'end' ? 'Tack!' : M.title;
      const lines = kind === 'offer' ? M.intro : kind === 'done' ? M.outro.concat(chained ? nextM.intro : []) : kind === 'end' ? [K('Tack igen för all hjälp! Tack vare dig hänger Rembrandten kvar på museet, kungakronan ligger kvar i Skattkammaren och Mästaren sitter inlåst för gott. Det är lugnt i stan nu.')] : [{ who: '', text: why }];
      E.lines.replaceChildren(...lines.map((l) => { const p = document.createElement('p'); if (l.who) { const b = document.createElement('b'); b.textContent = l.who + ': '; p.append(b); } p.append(l.text); return p; }));
      E.pay.textContent = kind === 'offer' ? 'Belöning: ' + fmtKr(M.kr) + ' och ' + M.xp + ' XP' : kind === 'done' ? '+' + fmtKr(M.kr) + ' och ' + M.xp + ' XP' + (k === N - 1 ? '. Du har klarat hela storyn!' : last ? '. Du har klarat kapitel ' + (C.i + 1) + '!' : '') : '';
      E.pay.hidden = !E.pay.textContent;
      if (kind === 'end') E.kicker.textContent = 'Storyn · Klar';
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
      B.hint.textContent = 'Kapitel ' + (chapterOf(R.k).i + 1) + ', ' + inChapter(R.k) + (hint ? ' · ' + hint : '');
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
      if (R.path) moveBoat(dt);
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
    // the getaway boat (or jet ski) out over the water along R.path, faster and faster up to R.top m/s; past the end it
    // has got away (R.s < 0)
    function moveBoat(dt) {
      const b = R.boat, P = R.path;
      if (!b || !cars.includes(b)) return;
      if (!R.go) { b.vx = b.vz = 0; return; }
      R.v = Math.min(R.top, R.v + 3.5 * dt);
      let left = R.v * dt;
      while (left > 0 && R.seg < P.length) {
        const [x0, z0] = P[R.seg - 1], [x1, z1] = P[R.seg], L = Math.hypot(x1 - x0, z1 - z0);
        if (R.s + left < L) { R.s += left; left = 0; } else { left -= L - R.s; R.s = 0; R.seg++; }
      }
      if (R.seg >= P.length) { R.s = -1; return; }
      const [x0, z0] = P[R.seg - 1], [x1, z1] = P[R.seg], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
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
        g.strokeText('Kicki: nytt uppdrag', X + 11, Y); g.fillStyle = '#9b1530'; g.fillText('Kicki: nytt uppdrag', X + 11, Y);
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
      board() { return { done, n: N, next: done < N ? 'Kapitel ' + (chapterOf(done).i + 1) + ', ' + chapterOf(done).title + ', ' + inChapter(done) + ': ' + MISSIONS[done].title : null, at: KICKI }; },
      // for the tests
      debug: { MISSIONS, BOAT_PATH, BOSS, TOWER, KICKI, MUSEUM, HIDEOUT, GAMLA, HOTORGET, CROWD, WHEEL, PALACE, JET_PATH, CENTRALBRON, BIRGER, STUREPLAN, LAGER, SHOTS, LOW, GLOBEN, ARENA, begin, sign, get R() { return R; }, get kicki() { return kicki; }, set done(v) { done = v; save(); }, close }
    };
  })();
