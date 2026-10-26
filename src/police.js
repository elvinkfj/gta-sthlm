'use strict';

  /* ---------- police ---------- */
  // Patrol cars drive with the traffic and watch you. Speeding where they can see you, ramming them, stealing a car in
  // front of them or running someone over starts a chase: blue lights and siren, other cars pull over, and the police
  // follow the streets towards you, then drive straight at you once they have you in sight. Stop the car next to
  // them and you get a fine. Get out of sight for long enough and they give up.
  // TOLERANCE: how far over the limit you can go before a patrol bothers; SPEED_EYE: how far a patrol notices it
  const POLICE_TARGET = 4, CHASE_SPEED = 33, PATROL_SPEED = 14, TOLERANCE = 15, SPEED_EYE = 55;
  const OFFICER = { shirt: 0x1f3a6e, pants: 0x1c2333, hat: 'cap', hatColor: 0x1b2b4f, police: true, sleeves: true };
  const SOLDIER = { shirt: 0x5b6b45, pants: 0x55643f, hat: 'combat', soldier: true, sleeves: true };
  let sirenCars = [], wanted = null, fines = 0, policeCool = 0, policeSpawnT = 0;
  // The limit where you are. With a heading (the sign by the speedometer) it is the street you are driving along. Without
  // one (what the police go by) it is the fastest street there, so crossing a slower street at a junction is never
  // speeding. Off the streets (squares, quays, parks) 50 in Gamla stan and 70 elsewhere
  function limitAt(x, z, h) {
    let top = 0, along = 0, bs = -Infinity;
    // every street within 30 m of a point is listed in that point's cell
    for (const e of egCells.get(egKey(Math.floor(x / EG), Math.floor(z / EG))) || []) {
      const d = edgeDist(e, x, z);
      if (d >= e.hw + e.walk + 2) continue;
      top = Math.max(top, e.limit);
      if (h === undefined) continue;
      const A = nodes[e.a], B = nodes[e.b], s = Math.abs(((B.x - A.x) * Math.sin(h) + (B.z - A.z) * Math.cos(h)) / e.len) - d / 40;
      if (s > bs) { bs = s; along = e.limit; }
    }
    return (h === undefined ? top : along) || (districtAt(x, z) === 'Gamla stan' ? 50 : 70);
  }
  const fmtKr = (n) => n.toLocaleString('sv-SE') + ' kr';
  // the registration number on the car's plates (ABC 12D)
  const plateOf = (c) => c.reg || (c.reg = PLATE_REGS[c.plateSlot]);
  function makePolice(c) {
    c.police = { state: 'patrol', direct: false, goalNode: -1, callIn: 15 + Math.random() * 40 };
    c.siren = false; c.yelp = false;
    c.bot.cruise = PATROL_SPEED;
    setOccupant(c, makeIdentity(OFFICER));
    return c;
  }
  // the army: driven like the police in a chase, but with soldiers aboard, no blue lights, and it rams
  let armySpawnT = 0;
  // at five stars the army comes in force: two tanks, two trucks full of soldiers and five armoured cars on the streets
  const armyTarget = () => (wanted && wanted.stars >= 5 && !policeStop ? 9 : 0);
  function makeArmy(c) {
    makePolice(c);
    c.military = true; c.police.callIn = Infinity; c.aim = 0; c.fireT = 4 + Math.random() * 4;
    setOccupant(c, makeIdentity(SOLDIER));
    if (wanted) setChase(c, true);
    c.siren = false;
    return c;
  }
  // The tank's gun. The army only fires warning shots, over your head, with a blast you feel in your chest; take the tank
  // yourself and F fires a real round: it flies along the barrel to the first thing in its way, and the blast dents and
  // shoves the cars near by and knocks people off their feet (they get up again)
  function fireCannon(c, live) {
    const a = c.h + (c.aim || 0), fx = Math.sin(a), fz = Math.cos(a), co = Math.cos(c.h), si = Math.sin(c.h), hd = c.geo.head;
    const px = c.x + hd[0] * co + hd[2] * si, pz = c.z - hd[0] * si + hd[2] * co, my = hd[1] + 0.46;
    const mx = px + fx * 7.3, mz = pz + fz * 7.3;
    for (let i = 0; i < 16; i++) smokeFx.spawn({ x: mx, y: my, z: mz, vx: fx * (3 + Math.random() * 7) + (Math.random() - 0.5) * 3, vy: Math.random() * 1.5, vz: fz * (3 + Math.random() * 7) + (Math.random() - 0.5) * 3, life: 1.6 + Math.random(), size: [0.8, 4.5], alpha: 0.45, c: SMOKE_COL.grey, drag: 1.5, fadeIn: 0.02 });
    for (let i = 0; i < 24; i++) sparkFx.spawn({ x: mx, y: my, z: mz, vx: fx * (10 + Math.random() * 14) + (Math.random() - 0.5) * 6, vy: (Math.random() - 0.3) * 4, vz: fz * (10 + Math.random() * 14) + (Math.random() - 0.5) * 6, life: 0.12 + Math.random() * 0.1, size: [0.9, 0.3], alpha: 1, c: SPARK_COL, drag: 2 });
    // the whole tank rocks back, and the blast is felt close by
    c.pitch -= 0.05;
    cannonSound(mx, mz, 1);
    const dc = Math.hypot(mx - camera.position.x, mz - camera.position.z);
    if (dc < 120) bump(Math.max(4, 20 - dc * 0.15));
    if (!live) return;
    let hx = mx + fx * 160, hz = mz + fz * 160;
    for (let d = 1; d <= 160; d += 1.5) {
      const x = mx + fx * d, z = mz + fz * d;
      // (a friend's shell can hit you, on foot)
      const you = (p) => p === player && !(c.remote && !driving && !MP.ride && !(policeStop && policeStop.riding));
      if (blockedAt(x, z, 0.3) || cars.some((o) => o !== c && Math.hypot(o.x - x, o.z - z) < Math.min(o.M.W, o.M.L) / 2 + 0.3) || persons.some((p) => !you(p) && !p.asleep && Math.hypot(p.x - x, p.z - z) < 0.7)) { hx = x; hz = z; break; }
    }
    explode(hx, hz, walkable(hx, hz) ? 0.6 : WATER_Y + 0.3);
    // (a cannon going off in town: every police car hears it, unless it was a friend's tank: then they are after them)
    if (!c.remote) offense('skott', 0, c.x, c.z, true);
  }
  function explode(x, z, y) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU, sp = 2 + Math.random() * 7;
      smokeFx.spawn({ x, y: y + 0.5, z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, life: 2.5 + Math.random() * 2, size: [1.2, 6], alpha: 0.5, c: i % 3 ? SMOKE_COL.black : SMOKE_COL.grey, drag: 1.2, fadeIn: 0.05 });
      fireFx.spawn({ x, y: y + 0.6, z, vx: Math.cos(a) * sp * 0.7, vy: 2 + Math.random() * 5, vz: Math.sin(a) * sp * 0.7, life: 0.35 + Math.random() * 0.3, size: [2.4, 0.6], alpha: 1, color: i % 2 ? 0xffb347 : 0xff6a1a, drag: 2.2, grav: -1 });
    }
    sparkBurst(x, y + 0.4, z, 0, 0, 22);
    cannonSound(x, z, 1.3);
    if (Math.hypot(x - camera.position.x, z - camera.position.z) < 90) bump(14);
    for (const o of cars) {
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz) || 0.1;
      if (d > 9 || o.M.mil === 'tank') continue;
      const k = (9 - d) / 9, ux = dx / d, uz = dz / d;
      crash(o, x + ux * 0.5, z + uz * 0.5, ux, uz, 6 + k * 22, null);
      o.vx += (ux * k * 9) / Math.sqrt(o.M.mass); o.vz += (uz * k * 9) / Math.sqrt(o.M.mass);
    }
    for (const p of persons) {
      if (p.asleep || p.remote || (p === player && driving)) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 0.1;
      if (d > 8) continue;
      p.vx = (dx / d) * (8 - d) * 1.2; p.vz = (dz / d) * (8 - d) * 1.2; p.vy = 5; p.grounded = false; p.knockT = 1.6;
      if (p.ai && p.ai.state !== 'cop' && p.ai.state !== 'idle' && p.ai.state !== 'vendor') { p.ai.state = 'flee'; p.ai.t = 5; }
    }
  }
  function tankFire() {
    const c = driving;
    if (!c || c.M.mil !== 'tank' || paused()) return false;
    if ((c.reloadT || 0) > 0) { toast('Kanonen laddas om …'); return true; }
    c.reloadT = 2.5;
    fireCannon(c, true);
    MP.event('fire', { a: c.aim || 0 });
    return true;
  }
  // the turret (or the weapon station) turns to its target: you, when the army is after you, or where the camera looks
  // while you drive it yourself. An army tank in range fires a warning shot now and then
  function aimTurret(c, dt) {
    let want = 0;
    if (c === driving) want = wrapAngle(camYaw - c.h);
    else if (c.remote) want = c.aimWant || 0;
    else if (c.military && c.police && c.police.state === 'chase') { const T = playerTarget(); want = wrapAngle(Math.atan2(T.x - c.x, T.z - c.z) - c.h); }
    c.aim = (c.aim || 0) + clamp(wrapAngle(want - (c.aim || 0)), -0.9 * dt, 0.9 * dt);
    c.steerGroup.rotation.y = c.aim;
    if (c.reloadT > 0) c.reloadT -= dt;
    if (c.M.mil === 'tank' && c.military && c.police && c.police.state === 'chase' && wanted) {
      const T = playerTarget(), d = Math.hypot(T.x - c.x, T.z - c.z);
      if ((c.fireT -= dt) <= 0 && d < 140 && Math.abs(wrapAngle(want - c.aim)) < 0.08 && clearView(c.x, c.z, T.x, T.z)) {
        c.fireT = 7 + Math.random() * 6;
        fireCannon(c, false);
        if (!wanted.warned) { wanted.warned = true; toast('Stridsvagnen skjuter varningsskott! Stanna, eller kör för livet.'); }
      }
    }
  }
  function playerTarget() {
    return driving ? { x: driving.x, z: driving.z, vx: driving.vx, vz: driving.vz } : { x: player.x, z: player.z, vx: player.vx, vz: player.vz };
  }
  // nothing taller than a person between two points
  function clearView(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    let clear = true;
    forNear(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1, (o) => {
      if (!clear || o.t === 1 || o.h < 2.5) return;
      if (rayBox(o, ax, az, dx, dz) < 1) clear = false;
    });
    return clear;
  }
  const sees = (c, x, z, range) => Math.hypot(x - c.x, z - c.z) < range && clearView(c.x, c.z, x, z);
  // a patrol only clocks your speed if you are in front of it (within 75° of where it is heading) or right beside it
  const clocks = (c, x, z) => {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
    return (d < 15 || (dx * Math.sin(c.h) + dz * Math.cos(c.h)) / (d || 1) > 0.26) && sees(c, x, z, SPEED_EYE);
  };
  // can a car drive in a straight line from a to b: land all the way, no lamp posts, trees or other cars in the way
  const landAround = (x, z) => walkable(x - 1, z - 1) && walkable(x + 1, z - 1) && walkable(x - 1, z + 1) && walkable(x + 1, z + 1);
  function drivableLine(ax, az, bx, bz, skipA, skipB) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 2.5);
    for (let i = 1; i < n; i++) {
      const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n);
      if (!landAround(x, z) || blockedAt(x, z, 1.1)) return false;
    }
    const ux = (bx - ax) / (len || 1), uz = (bz - az) / (len || 1);
    for (const o of cars) {
      if (o === skipA || o === skipB) continue;
      const ox = o.x - ax, oz = o.z - az, along = ox * ux + oz * uz;
      if (along < 2 || along > len - 2) continue;
      if (Math.abs(-ox * uz + oz * ux) < o.M.W / 2 + 1.4) return false;
    }
    return true;
  }
  // something the police might care about happened at x, z; seenBy is a police car that certainly saw it
  function offense(kind, over, x, z, seenBy) {
    if (policeCool > 0 && !seenBy) return;
    let seen = !!seenBy;
    if (!seen) for (const c of cars) if (c.police && !c.dead && sees(c, x, z, 70)) { seen = true; break; }
    if (seen) startChase(kind, over);
  }
  // on a police job (J in a police car), or helping Kicki in the story, you are one of them: they don't stop you for
  // anything
  const onDuty = () => (!!JOBS.job && JOBS.job.kind === 'polis') || STORY.duty;
  function startChase(kind, over) {
    // in a game with friends the police leave you alone, and on a police job too
    if (PARTY.busy() || onDuty()) return;
    if (!wanted) {
      wanted = { kinds: new Set(), counts: {}, bonus: 0, stars: 1, starT: 0, over: 0, lostT: 0, searchT: 0, stopT: 0, t: 0, fleeT: 0, seen: playerTarget(), inSight: true };
      toast(kind === 'fart' ? 'Polisen såg dig köra för fort. Stanna bilen!' : kind === 'ballong' ? 'Plask! Du träffade polisen med en vattenballong. Nu är de efter dig!' : 'Polisen är efter dig!');
    }
    wanted.kinds.add(kind);
    wanted.over = Math.max(wanted.over, over || 0);
    // the same thing again (another police car rammed, someone else run over, another car stolen) is one more star
    // (one crash can come in as a few hits in a row: a repeat counts once it is a few seconds after the last)
    const last = wanted.counts[kind];
    if (last === undefined || wanted.t - last > 3) {
      if (last !== undefined && kind !== 'fart' && kind !== 'smitning') wanted.bonus++;
      wanted.counts[kind] = wanted.t;
    }
    updateStars(wanted);
    for (const c of cars) if (c.police && !c.dead && (c.police.state === 'patrol' || c.police.state === 'call') && Math.hypot(c.x - player.x, c.z - player.z) < chaseRadius()) setChase(c, true);
  }
  // Efterlyst: one to five stars. A chase starts at one star. Driving 30 over the limit, ramming a police car, stealing a
  // car in front of them or running someone over makes it two; 50 over or running from a stop three. Every time it
  // happens again, and every STAR_FLEE seconds on the run, adds one more. Stars never go down while the chase lasts.
  // From three stars the police helicopter comes, and every star brings more and faster patrols (the piket van from four).
  const STAR_FLEE = 15;
  function updateStars(w) {
    let s = w.over >= 30 || w.kinds.has('krock') || w.kinds.has('stöld') || w.kinds.has('påkörning') ? 2 : 1;
    if (w.over >= ARREST_OVER || w.kinds.has('smitning')) s = 3;
    if (w.kinds.has('skott')) s = 4;
    s = clamp(s + w.bonus + Math.floor((w.fleeT || 0) / STAR_FLEE), 1, 5);
    if (s <= w.stars) return;
    const was = w.stars;
    w.stars = s; w.starT = 0;
    if (s >= 3 && was < 3) toast(s === 3 ? 'Tre stjärnor! Polishelikoptern är på väg.' : 'Polishelikoptern är på väg, och fler polisbilar kallas in.');
    else if (s === 4) toast('Fyra stjärnor! Piketen och fler polisbilar kallas in.');
    else if (s === 5) toast('Fem stjärnor! Militären rycker ut med stridsvagnar, pansarbilar och soldater.');
  }
  const stars = () => (wanted ? wanted.stars : 0);
  // with more stars the police drive faster, come from further away, are more of them and search longer
  const chaseSpeed = () => CHASE_SPEED + Math.max(0, stars() - 1) * 2;
  const chaseRadius = () => 400 + Math.max(0, stars() - 1) * 120;
  const policeTarget = () => POLICE_TARGET + (wanted && !policeStop ? [0, 0, 1, 3, 5, 7][wanted.stars] : 0);
  function setChase(c, on) {
    const P = c.police, b = c.bot;
    // a car whose crew is out on foot, or which is busy with a stop or a prisoner, stays as it is
    if (!P || !b || P.out || P.state === 'wait' || P.state === 'stop' || P.state === 'transport') return;
    P.state = on ? 'chase' : 'patrol';
    c.siren = on && !c.military; c.yelp = false;
    b.cruise = on ? chaseSpeed() : PATROL_SPEED; b.turnV = on ? 11 : 5.5; b.goal = null; b.passT = 0; P.goalNode = -1; P.cut = null;
    if (P.direct) { P.direct = false; resyncBot(c); }
    if (!on) b.next = chooseNext(b.from, b.to, null);
  }
  // the fine, line by line as it goes on the ticket (rough Swedish ordningsbot amounts)
  function fineFor(w) {
    const rows = [];
    if (w.kinds.has('fart')) {
      const o = Math.max(1, Math.round(w.over));
      rows.push({ why: o + ' km/h för fort', text: 'Hastighetsöverträdelse, ' + o + ' km/h över ' + (w.limit || 50) + ' km/h', kr: o <= 20 ? 1500 : o <= 25 ? 2000 : o <= 30 ? 2400 : o <= 40 ? 3200 : 4000 });
    }
    if (w.kinds.has('krock')) rows.push({ why: 'krock med polisbil', text: 'Vårdslöshet i trafik, krock med polisfordon', kr: 3000 });
    if (w.kinds.has('stöld')) rows.push({ why: 'bilstöld', text: 'Olovligt brukande av fordon', kr: 5000 });
    if (w.kinds.has('påkörning')) rows.push({ why: 'påkörning', text: 'Påkörning av fotgängare', kr: 4000 });
    if ((w.fleeT || 0) > FLEE_ARREST) rows.push({ why: 'du stannade inte', text: 'Underlåtenhet att stanna på polisens tecken', kr: 1500 });
    if (w.over >= ARREST_OVER) rows.push({ why: 'grov hastighetsöverträdelse', text: 'Grov hastighetsöverträdelse, körkortet dras in', kr: 2000 });
    if (w.kinds.has('skott')) rows.push({ why: 'skottlossning', text: 'Skottlossning med stridsvagn i tätort', kr: 25000 });
    if (w.kinds.has('smitning')) rows.push({ why: 'du smet från kontrollen', text: 'Avvikande från poliskontroll', kr: 3000 });
    if (w.kinds.has('ballong')) rows.push({ why: 'vattenballong på polisen', text: 'Ordningsstörning, vattenballong på polis', kr: 1000 });
    if (!rows.length) rows.push({ why: 'ordningsstörning', text: 'Ordningsstörning', kr: 800 });
    return { f: rows.reduce((a, r) => a + r.kr, 0), why: rows.map((r) => r.why), rows };
  }
  function endChase(caught) {
    if (caught) {
      const { f, why } = fineFor(wanted);
      fines += f;
      toast('Polisen stoppade dig: ' + why.join(', ') + '. Böter ' + fmtKr(f) + '.' + (wanted.over >= ARREST_OVER ? ' Körkortet dras in.' : ''));
    } else toast('Du kom undan polisen.');
    for (const fc of footCops) fc.mode = 'return';
    wanted = null;
    policeCool = caught ? 30 : 15;
    for (const c of cars) if (c.police && c.police.state === 'chase') setChase(c, false);
  }
  // put a bot back on the street it is closest to, facing the way it points
  function resyncBot(c) {
    const b = c.bot, ne = nearestEdge(c.x, c.z, c.police ? (e) => e.emerg : (e) => e.drive);
    if (!b || !ne.e) return;
    const A = nodes[ne.e.a], B = nodes[ne.e.b], fwd = (B.x - A.x) * Math.sin(c.h) + (B.z - A.z) * Math.cos(c.h) >= 0;
    b.from = fwd ? ne.e.a : ne.e.b; b.to = fwd ? ne.e.b : ne.e.a;
    b.next = chooseNext(b.from, b.to, b.goal, onBlueLights(c)); b.phase = 'edge'; b.t = 0;
  }
  // now and then a patrol gets a call somewhere in town and goes there on blue lights (utryckning), then back to patrol
  function setCall(c, on) {
    const P = c.police, b = c.bot;
    P.state = on ? 'call' : 'patrol';
    c.siren = on; c.yelp = false;
    b.cruise = on ? CHASE_SPEED * 0.85 : PATROL_SPEED; b.turnV = on ? 8.5 : 5.5; b.passT = 0;
    if (on) {
      const far = nodes.map((n, i) => i).filter((i) => { const d = Math.hypot(nodes[i].x - c.x, nodes[i].z - c.z); return d > 250 && d < 700 && nodes[i].nbE.length; });
      const n = far.length ? rpick(far) : nearestNode(c.x, c.z);
      b.goal = { node: n, x: nodes[n].x, z: nodes[n].z };
      P.callT = 45; P.goalNode = -1;
    } else { b.goal = null; P.callIn = 40 + Math.random() * 60; }
    if (b.phase === 'edge') b.next = chooseNext(b.from, b.to, b.goal, on);
  }
  function policeThink(c, dt) {
    const P = c.police;
    if (P.state === 'stop') return stopDrive(c, dt);
    if (P.state === 'wait') return parkDrive(c, null);
    if (P.state === 'transport') return transportDrive(c, dt);
    if (P.state === 'patrol' && !wanted && !c.military && (P.callIn -= dt) <= 0) setCall(c, true);
    if (P.state === 'call') {
      const g = c.bot.goal;
      if ((P.callT -= dt) <= 0 || !g || Math.hypot(g.x - c.x, g.z - c.z) < 30) setCall(c, false);
    }
    if (P.state !== 'chase') return botThink(c, dt);
    const T = playerTarget(), d = Math.hypot(T.x - c.x, T.z - c.z);
    c.yelp = d < 70;
    if (P.banT > 0) P.banT -= dt;
    // (banT: how long they keep to the streets after getting stuck going straight; nothing set means no ban)
    const free = !(P.banT > 0);
    // in sight and nothing in the way: straight for you, across pavements, squares and the wrong side of the road
    if (d < 140 && free && clearView(c.x, c.z, T.x, T.z) && drivableLine(c.x, c.z, T.x, T.z, c, driving)) { P.cut = null; P.direct = true; return policeDirect(c, dt, T, d); }
    // out of sight they head for where you were last seen; while any of them can see you, the radio keeps them updated
    const G = wanted && !wanted.inSight ? wanted.seen : T, gn = nearestNode(G.x, G.z);
    c.bot.goal = { node: gn, x: G.x, z: G.z };
    // On the way they cut every corner they can: the furthest point of the way ahead that can be reached in a straight
    // line, over a square, a park, the pavement or the wrong side of the road, and they go straight for it flat out
    if (P.cut && (Math.hypot(P.cut.x - c.x, P.cut.z - c.z) < 9 || !free)) P.cut = null;
    if (!P.cut && free && (P.cutT = (P.cutT || 0) - dt) <= 0) { P.cutT = 0.5; P.cut = shortcut(c, c.bot.goal); }
    // (stuck on the way: back to the streets for a few seconds)
    if (P.cut && c.bot.revT > 0) { P.cut = null; P.cutT = 4; }
    if (P.cut) { P.direct = true; return rush(c, dt, P.cut.x, P.cut.z, chaseSpeed()); }
    if (P.direct) { P.direct = false; resyncBot(c); }
    // along the streets: full speed while far away, easing off to pull up a few metres from you
    c.bot.cruise = d < 45 ? clamp((d - 10) * 0.9, 0, chaseSpeed()) : chaseSpeed();
    if (gn !== P.goalNode && c.bot.phase === 'edge') { c.bot.next = chooseNext(c.bot.from, c.bot.to, c.bot.goal, true); P.goalNode = gn; }
    return botThink(c, dt);
  }
  // the next junctions on the way to the goal for blue lights, about 250 m of them
  function aheadPath(c, goal) {
    const b = c.bot, D = distTo(goal.node, true), pts = [nodes[b.to]];
    let prev = b.from, n = b.to, len = Math.hypot(nodes[n].x - c.x, nodes[n].z - c.z);
    for (let k = 0; k < 8 && n !== goal.node && len < 260; k++) {
      let best = -1, bv = Infinity;
      for (const m of nodes[n].nbE) {
        if (m === prev) continue;
        const v = D[m] + Math.hypot(nodes[m].x - nodes[n].x, nodes[m].z - nodes[n].z);
        if (v < bv) { bv = v; best = m; }
      }
      if (best < 0) break;
      len += Math.hypot(nodes[best].x - nodes[n].x, nodes[best].z - nodes[n].z);
      prev = n; n = best; pts.push(nodes[n]);
    }
    if (n === goal.node) pts.push({ x: goal.x, z: goal.z });
    return pts;
  }
  // the furthest of them (past the next junction at least) there is a clear straight line to, or nothing
  function shortcut(c, goal) {
    if (c.bot.phase !== 'edge') return null;
    const pts = aheadPath(c, goal);
    for (let i = pts.length - 1; i >= 1; i--) {
      // (only somewhere more or less ahead: a sharp turn would sweep the car into whatever is beside the line)
      const p = pts[i], d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d > 25 && d < 240 && Math.abs(wrapAngle(Math.atan2(p.x - c.x, p.z - c.z) - c.h)) < 0.6 && drivableLine(c.x, c.z, p.x, p.z, c, driving)) return { x: p.x, z: p.z };
    }
    return null;
  }
  // in sight: drive straight for the target, aiming a little ahead of it, and stop beside it once it stops. From three
  // stars (and the army always) they don't pull up alongside while you are on the move: they ram you
  function policeDirect(c, dt, T, d) {
    const tsp = Math.hypot(T.vx, T.vz), ram = (c.military || stars() >= 3) && tsp > 5, lead = Math.min(1.2, d / 20) * (ram ? 0.6 : 1);
    let vT = ram ? chaseSpeed() : clamp((d - 8) * 1.1 + tsp * 1.1, 0, chaseSpeed());
    if (d < 11 && tsp < 2) vT = c.military ? Math.min(chaseSpeed(), 9) : 0;
    return rush(c, dt, T.x + T.vx * lead, T.z + T.vz * lead, vT);
  }
  // straight for (tx, tz) at vT, whatever is in between; backs off and tries again when stuck, and after two goes takes
  // the streets for a while
  function rush(c, dt, tx, tz, vT) {
    const M = c.M, b = c.bot, fx = Math.sin(c.h), fz = Math.cos(c.h), lxv = Math.cos(c.h), lzv = -Math.sin(c.h);
    const vf = c.vx * fx + c.vz * fz;
    const dx = tx - c.x, dz = tz - c.z, lz = dx * fx + dz * fz, lx = dx * lxv + dz * lzv;
    const maxSteer = 0.6 / (1 + Math.abs(vf) * 0.03);
    const delta = lz < 0.3 ? Math.sign(lx || 1) * maxSteer : Math.atan((2 * M.wb * lx) / (lx * lx + lz * lz));
    const right = -clamp(delta / maxSteer, -1, 1);
    let fwd = vT < 0.3 ? (vf > 0.3 ? -1 : 0) : clamp((vT - vf) * 0.5, -1, 1);
    if (Math.abs(right) > 0.85 && vf > 13) fwd = Math.min(fwd, -0.4);
    if (b.revT > 0) { b.revT -= dt; return { fwd: -0.8, right: -right, brake: false }; }
    if (fwd > 0.3 && Math.abs(vf) < 0.5) {
      b.stuckT += dt;
      // backed off twice and still stuck: take the streets for a while instead
      if (b.stuckT > 1.2) { b.revT = 1.1; b.stuckT = 0; c.police.fails = (c.police.fails || 0) + 1; if (c.police.fails >= 2) { c.police.banT = 5; c.police.fails = 0; } }
    } else b.stuckT = 0;
    return { fwd, right, brake: false };
  }
  function policeUpdate(dt) {
    if (policeCool > 0) policeCool -= dt;
    sirenCars = cars.filter((c) => c.siren || (c.military && c.police && c.police.state === 'chase'));
    updateFootCops(dt);
    if (policeStop) { stopUpdate(dt); return; }
    const T = playerTarget();
    // speeding where a patrol can see it
    if (driving && !driving.M.boat && !wanted && policeCool <= 0 && !driving.siren) {
      const kmh = Math.hypot(driving.vx, driving.vz) * 3.6, over = kmh - limitAt(driving.x, driving.z);
      if (over > TOLERANCE) for (const c of cars) if (c.police && !c.dead && clocks(c, T.x, T.z)) { startChase('fart', over); if (wanted) wanted.limit = limitAt(driving.x, driving.z); break; }
    }
    if (!wanted) return;
    wanted.t += dt;
    let nearest = Infinity, inSight = false, chasers = 0, nearCop = null;
    // on foot somewhere a car can't follow (a park, the stairs, a lane too narrow, indoors)?
    const ne = driving ? null : nearestEdge(T.x, T.z, (e) => e.emerg), offRoad = !driving && (!ne.e || ne.d > ne.e.hw + 1.5);
    for (const c of cars) {
      if (!c.police || c.dead) continue;
      const st = c.police.state, d = Math.hypot(T.x - c.x, T.z - c.z);
      // (the boats on the water are steered by WATER: here they only count for keeping you in sight)
      if (c.water) {
        if (c.water.leave) continue;
        chasers++;
        if (d < nearest && !c.military) nearest = d;
        if (!inSight && d < 160 && clearView(c.x, c.z, T.x, T.z)) inSight = true;
        continue;
      }
      if (st === 'wait' || st === 'transport' || st === 'stop') continue;
      if (st !== 'chase') { if (d < chaseRadius()) setChase(c, true); else continue; }
      chasers++;
      if (d < nearest && !c.military) { nearest = d; nearCop = c; }
      if (!inSight && d < 130 && clearView(c.x, c.z, T.x, T.z)) inSight = true;
      // you are on foot close by, or out of reach of a car: pull up and send the constable after you
      if (!driving && c.M.mil !== 'tank' && (d < 24 || (d < 90 && (offRoad || c.bot.stuckT > 1.5 || c.bot.stuckTotal > 5)))) { c.police.state = 'wait'; c.siren = false; c.beacon = !c.military; c.police.direct = false; }
    }
    for (const fc of footCops) {
      if (fc.mode !== 'chase') continue;
      const d = Math.hypot(T.x - fc.p.x, T.z - fc.p.z);
      chasers++;
      if (!inSight && d < 90 && clearView(fc.p.x, fc.p.z, T.x, T.z)) inSight = true;
    }
    // the helicopter sees you from above, where nothing on the ground is in the way (but not indoors or deep in a lane)
    if (heli && heli.state !== 'leave') { chasers++; if (heli.sees) inSight = true; }
    // speeding in front of them during the chase goes on the ticket too
    if (driving && inSight) {
      const lim = limitAt(driving.x, driving.z), over = Math.hypot(driving.vx, driving.vz) * 3.6 - lim;
      if (over > wanted.over) { wanted.over = over; wanted.limit = lim; }
      if (over > TOLERANCE) wanted.kinds.add('fart');
    }
    wanted.inSight = inSight;
    // running from them: on the move, fast, with the police on your tail
    const sp = driving ? Math.hypot(driving.vx, driving.vz) : Math.hypot(player.vx, player.vz);
    if ((driving ? sp > 6 : sp > 5.5) && (nearest < 130 || (heli && heli.sees) || footCops.some((fc) => fc.mode === 'chase' && Math.hypot(fc.p.x - T.x, fc.p.z - T.z) < 60))) wanted.fleeT += dt;
    updateStars(wanted);
    wanted.starT += dt;
    if (inSight) { wanted.seen = { x: T.x, z: T.z, vx: 0, vz: 0 }; wanted.lostT = 0; wanted.searchT = 0; }
    else {
      // they give up after searching where they last saw you without finding you, or after a long while without a trace
      wanted.lostT += dt;
      if (cars.some((c) => c.police && c.police.state === 'chase' && Math.hypot(c.x - wanted.seen.x, c.z - wanted.seen.z) < 40) || footCops.some((fc) => Math.hypot(fc.p.x - wanted.seen.x, fc.p.z - wanted.seen.z) < 12)
        || (heli && heli.state !== 'leave' && Math.hypot(heli.x - wanted.seen.x, heli.z - wanted.seen.z) < 60)) wanted.searchT += dt;
      // (with more stars they search for longer)
      const more = wanted.stars - 1;
      if (wanted.searchT > 8 + more * 4 || wanted.lostT > 45 + more * 15 || (!chasers && wanted.lostT > 6)) { PROGRESS.escaped(wanted.stars); CASH.bounty(wanted.stars); endChase(false); return; }
    }
    // pull over (stop, ideally by the kerb) with a patrol close behind and in sight, and they pull in by you
    if (driving && !driving.M.boat && nearCop && nearest < 70 && inSight && sp < 2) {
      wanted.stopT += dt;
      if (wanted.stopT > 0.9) beginStop(nearCop);
    } else wanted.stopT = Math.max(0, wanted.stopT - dt);
    // on foot: caught when a constable reaches you
    if (!driving) for (const fc of footCops) if (fc.mode === 'chase' && Math.hypot(fc.p.x - player.x, fc.p.z - player.z) < 1.1 && Math.abs(fc.p.y - player.y) < 1.2) { caughtOnFoot(fc); return; }
  }
  // blue lights flash left and right in double bursts
  function policeLights(c, dt) {
    const g = c.mat.userData.glow;
    if (c.flashSeed === undefined) c.flashSeed = Math.random();
    if (!(c.siren || c.beacon) || c.dead) {
      g.z = g.w = 0.05;
      if (c.flashers) for (const s of c.flashers) s.material.opacity = 0;
      return;
    }
    const ph = (clock * 1.9 + c.flashSeed) % 1;
    const L = ph < 0.1 || (ph > 0.18 && ph < 0.28), R = (ph > 0.5 && ph < 0.6) || (ph > 0.68 && ph < 0.78);
    g.z = L ? 9 : 0.05; g.w = R ? 9 : 0.05;
    if (c.flashers) { c.flashers[0].material.opacity = L ? 0.95 : 0; c.flashers[1].material.opacity = R ? 0.95 : 0; }
  }
  // only your fault if you were the one going faster; a police car ramming you to stop you doesn't count
  function policeRammed(c) { if (Math.hypot(driving.vx, driving.vz) > Math.hypot(c.vx, c.vz) + 1) offense('krock', 0, c.x, c.z, c); }
  // you drive a police car yourself: L switches the blue lights and siren
  function toggleSiren() {
    if (!driving || !driving.M.police) return;
    driving.siren = !driving.siren; driving.yelp = false;
    toast(driving.siren ? 'Blåljus och siren på. Trafiken väjer för dig.' : 'Blåljus av.');
  }

  /* ---------- the sjöpolis and the navy ---------- */
  // Run from the police out on the water and the sjöpolis comes after you: patrol boats from one star, a jet ski too from
  // three, and at five stars the navy's Stridsbåt 90, which fires warning bursts from its machine gun. They find their way
  // round the islands and under the bridges by a map of the water in 10-metre squares: from where you are, how many
  // squares away every square of water is (worked out again as you move), and each boat heads downhill along it, cutting
  // straight across to the furthest square it can see over open water. Stop with a police boat alongside and you are
  // caught: a fine, or, if it is bad enough to be arrested for, a trip to the cell. Once the chase is over, or you have
  // been ashore for a while, they go back where they came from.
  const WATER = (() => {
    const CELL = 10, GX = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL), GZ = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL), FAR = 65535;
    let wet = null, dist = null, queue = null, fieldCell = -1, fieldT = 0;
    let spawnT = 0, offT = 99, said = { police: false, army: false, fire: false };
    const cellOf = (x, z) => clamp(Math.floor((z - BOUNDS.z0) / CELL), 0, GZ - 1) * GX + clamp(Math.floor((x - BOUNDS.x0) / CELL), 0, GX - 1);
    const centre = (k) => ({ x: BOUNDS.x0 + ((k % GX) + 0.5) * CELL, z: BOUNDS.z0 + (Math.floor(k / GX) + 0.5) * CELL });
    const water = (x, z) => !(groundAt(x, z) & 1);
    // the squares a boat can be in: open water at the middle and 3 m round it, not too near the edge of the map
    function grid() {
      if (wet) return;
      wet = new Uint8Array(GX * GZ); dist = new Uint16Array(GX * GZ); queue = new Int32Array(GX * GZ);
      for (let j = 3; j < GZ - 3; j++) for (let i = 3; i < GX - 3; i++) {
        const x = BOUNDS.x0 + (i + 0.5) * CELL, z = BOUNDS.z0 + (j + 0.5) * CELL;
        wet[j * GX + i] = water(x, z) && water(x - 3, z) && water(x + 3, z) && water(x, z - 3) && water(x, z + 3) ? 1 : 0;
      }
    }
    // how far, in squares, every square of water is from the one nearest (x, z)
    function flood(x, z) {
      let s = cellOf(x, z);
      if (!wet[s]) {
        let best = -1, bd = Infinity;
        const ci = s % GX, cj = Math.floor(s / GX);
        for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= GX || j >= GZ || !wet[j * GX + i]) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = j * GX + i; }
        }
        if (best < 0) return false;
        s = best;
      }
      if (s === fieldCell) return true;
      fieldCell = s;
      dist.fill(FAR);
      let head = 0, tail = 0;
      dist[s] = 0; queue[tail++] = s;
      while (head < tail) {
        const k = queue[head++], d = dist[k] + 1, i = k % GX;
        if (i > 0 && wet[k - 1] && dist[k - 1] === FAR) { dist[k - 1] = d; queue[tail++] = k - 1; }
        if (i < GX - 1 && wet[k + 1] && dist[k + 1] === FAR) { dist[k + 1] = d; queue[tail++] = k + 1; }
        if (k >= GX && wet[k - GX] && dist[k - GX] === FAR) { dist[k - GX] = d; queue[tail++] = k - GX; }
        if (k < GX * (GZ - 1) && wet[k + GX] && dist[k + GX] === FAR) { dist[k + GX] = d; queue[tail++] = k + GX; }
      }
      return true;
    }
    // open water all the way from a to b, r metres either side, and nothing in the way at the waterline (bridge piers)
    function waterLine(ax, az, bx, bz, r) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 3)), ux = (bx - ax) / (len || 1), uz = (bz - az) / (len || 1);
      for (let i = 1; i <= n; i++) {
        const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n);
        if (!water(x, z) || !water(x - uz * r, z + ux * r) || !water(x + uz * r, z - ux * r)) return false;
        if (i % 2 === 0 && resolveWorld(x, z, r * 0.6, WATER_Y).hit) return false;
      }
      return true;
    }
    // the way towards you: downhill on the map of the water, as far along it as there is open water in a straight line
    function waypoint(c) {
      let k = cellOf(c.x, c.z);
      if (dist[k] === FAR) {
        // (not on a square of the map: the nearest one that is)
        let best = -1, bd = FAR;
        for (const o of [-1, 1, -GX, GX, -GX - 1, -GX + 1, GX - 1, GX + 1]) if (dist[k + o] < bd) { bd = dist[k + o]; best = k + o; }
        if (best < 0) return null;
        return centre(best);
      }
      const path = [];
      for (let n = 0; n < 18 && dist[k] > 0; n++) {
        let best = -1, bd = dist[k];
        for (const o of [-1, 1, -GX, GX, -GX - 1, -GX + 1, GX - 1, GX + 1]) { const m = k + o; if (m >= 0 && m < dist.length && dist[m] < bd) { bd = dist[m]; best = m; } }
        if (best < 0) break;
        k = best; path.push(k);
      }
      const r = c.M.W / 2 + 0.6;
      for (let i = path.length - 1; i >= 0; i--) { const p = centre(path[i]); if (waterLine(c.x, c.z, p.x, p.z, r)) return p; }
      return path.length ? centre(path[0]) : null;
    }
    // where you are: in your boat, in a friend's, or on foot by the water
    const onWater = () => !!(driving && driving.M.boat) || !!(MP.ride && MP.ride.M.boat);
    function target() {
      const b = driving || MP.ride;
      return b ? { x: b.x, z: b.z, vx: b.vx, vz: b.vz, L: b.M.L } : { x: player.x, z: player.z, vx: player.vx, vz: player.vz, L: 1 };
    }
    const units = () => cars.filter((c) => c.water);
    function spawn(M, role) {
      const T = target();
      for (let tries = 0; tries < 80; tries++) {
        const a = Math.random() * TAU, r = 160 + Math.random() * 240, x = T.x + Math.sin(a) * r, z = T.z + Math.cos(a) * r, k = cellOf(x, z);
        if (!wet[k] || dist[k] === FAR || dist[k] * CELL > 700) continue;
        // (out of sight where possible: behind the camera, or far off)
        const cx = x - camera.position.x, cz = z - camera.position.z, fw = new THREE.Vector3(); camera.getWorldDirection(fw);
        if (tries < 50 && (cx * fw.x + cz * fw.z) / (Math.hypot(cx, cz) || 1) > 0.5 && r < 300) continue;
        const p = centre(k), h = Math.atan2(T.x - p.x, T.z - p.z);
        if (!boatFree(M, p.x, p.z, h)) continue;
        const c = makeCar(M, M.colors[0]);
        Object.assign(c, { x: p.x, z: p.z, h, keep: true, vx: Math.sin(h) * 8, vz: Math.cos(h) * 8 });
        c.water = { role, stuckT: 0, revT: 0, fireT: 4 + Math.random() * 3, caughtT: 0, leave: false, leaveT: 0, home: { x: p.x, z: p.z } };
        c.police = { state: 'chase', direct: false, goalNode: -1, callIn: Infinity };
        if (role === 'army') { c.military = true; setOccupant(c, makeIdentity(SOLDIER)); c.siren = false; }
        else { setOccupant(c, makeIdentity(OFFICER)); c.siren = true; c.yelp = false; }
        return c;
      }
      return null;
    }
    function think(c, dt) {
      const W = c.water, M = c.M, T = target(), fx = Math.sin(c.h), fz = Math.cos(c.h), lxv = Math.cos(c.h), lzv = -Math.sin(c.h);
      const vf = c.vx * fx + c.vz * fz, d = Math.hypot(T.x - c.x, T.z - c.z), tsp = Math.hypot(T.vx, T.vz), wet = onWater();
      let gx = T.x, gz = T.z, vT = M.max * 0.95;
      if (W.leave) {
        // going home: back where it came from, out of your way
        gx = W.home.x; gz = W.home.z;
        if (!waterLine(c.x, c.z, gx, gz, M.W / 2 + 0.6)) { const a = Math.atan2(c.x - T.x, c.z - T.z); gx = c.x + Math.sin(a) * 60; gz = c.z + Math.cos(a) * 60; }
        vT = M.max * 0.7;
      } else {
        const r = M.W / 2 + 0.6, ram = W.role === 'police' && stars() >= 3 && tsp > 5;
        if (d < 240 && waterLine(c.x, c.z, T.x, T.z, r)) {
          const lead = Math.min(1.2, d / 25) * (ram ? 0.5 : 1);
          gx = T.x + T.vx * lead; gz = T.z + T.vz * lead;
        } else { const p = waypoint(c); if (p) { gx = p.x; gz = p.z; } }
        // the police come alongside and keep pace (from three stars they ram you), the navy stays off at gun range
        if (!wet) vT = d > 30 ? M.max : 0;
        else if (W.role === 'army') vT = d > 60 ? M.max : clamp(tsp * 1.05 + (d - 35) * 0.3, 1.5, M.max);
        else vT = ram ? M.max : d > 35 ? M.max : clamp(tsp * 1.15 + (d - (T.L + M.L) / 2 - 2) * 0.7, 0, M.max);
      }
      const dx = gx - c.x, dz = gz - c.z, err = Math.atan2(dx * lxv + dz * lzv, dx * fx + dz * fz);
      const right = -clamp(err * 2.2, -1, 1);
      let fwd = clamp((vT - vf) * 0.35, -1, 1);
      if (Math.abs(err) > 1.3 && vf > 6) fwd = Math.min(fwd, 0.15);
      if (W.revT > 0) { W.revT -= dt; return { fwd: -0.8, right: -right, brake: false }; }
      if (fwd > 0.3 && Math.abs(vf) < 0.6) { if ((W.stuckT += dt) > 1.5) { W.revT = 1.6; W.stuckT = 0; } } else W.stuckT = 0;
      return { fwd, right, brake: false };
    }
    // the navy's warning: a burst from the machine gun into the water just short of you
    function burst(c, T) {
      const co = Math.cos(c.h), si = Math.sin(c.h), hd = c.geo.head, gx = c.x + hd[0] * co + hd[2] * si, gz = c.z - hd[0] * si + hd[2] * co, gy = c.body.position.y + hd[1] + 0.4;
      const a = Math.atan2(T.x - gx, T.z - gz), short = 9 + Math.random() * 6;
      for (let i = 0; i < 8; i++) {
        const sa = a + (Math.random() - 0.5) * 0.12, dd = Math.max(8, Math.hypot(T.x - gx, T.z - gz) - short + (Math.random() - 0.5) * 8);
        const hx = gx + Math.sin(sa) * dd, hz = gz + Math.cos(sa) * dd, tt = 0.25 + i * 0.03;
        sparkFx.spawn({ x: gx, y: gy, z: gz, vx: (hx - gx) / tt, vy: (WATER_Y - gy) / tt, vz: (hz - gz) / tt, life: tt, size: [0.5, 0.25], alpha: 1, c: SPARK_COL, drag: 0 });
        for (let k = 0; k < 6; k++) foamFx.spawn({ x: hx + (Math.random() - 0.5) * 0.6, y: WATER_Y + 0.1, z: hz + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 2, life: 0.8 + Math.random() * 0.5, size: [0.3, 0.9], alpha: 0.85, c: FOAM_COL, grav: 9, drag: 0.6 });
      }
      if (audio && !muted) {
        const s = placeSound(gx, gz, 400), t = audio.ctx.currentTime;
        for (let k = 0; k < 9; k++) noiseBurst(t + k * 0.085, 0.07, 0.28 * s.level + 0.01, 'bandpass', 700 + Math.random() * 300, 1.1, s.pan, 0.002);
      }
      if (c.aim !== undefined) c.pitch -= 0.01;
    }
    // caught on the water by the sjöpolis
    function caught() {
      if (!arrestable(wanted)) { endChase(true); return; }
      // arrested: the boat is left where it lies, and they take you to the station
      const boat = driving;
      if (boat) { setOccupant(boat, null); boat.vx = boat.vz = 0; driving = null; }
      if (MP.ride) MP.unride();
      player.model.group.visible = false; player.vx = player.vz = 0;
      policeStop = { car: null, mode: 'arrest', phase: 'water', t: 0, at: { x: player.x, z: player.z }, officer: null, crew: null, name: rpick(CONSTABLES), title: 'Konstapel',
        ticket: null, nav: {}, pnav: {}, locked: true, spot: null, door: null, vehicle: boat ? boat.M.name : 'Gående' };
      toast('Sjöpolisen griper dig. Du förs till polisstationen.');
      fadeThen(jailDirect);
    }
    function update(dt) {
      const list = units(), wet = onWater();
      offT = wet ? 0 : offT + dt;
      const hunting = !!wanted && !policeStop && offT < 25;
      if (!list.length && !(hunting && wet)) return;
      grid();
      const T = target();
      if ((fieldT -= dt) <= 0 || !list.length) { fieldT = 0.7; flood(T.x, T.z); }
      // how many of each: more police boats with more stars, the jet ski from three, the navy at five
      const n = (id) => list.filter((c) => c.M.id === id && !c.water.leave).length, s = stars();
      if (hunting && wet && (spawnT -= dt) <= 0) {
        spawnT = 2.5;
        const want = [['polisbat', [0, 1, 2, 2, 3, 3][s], 'police'], ['polisjet', [0, 0, 0, 1, 1, 2][s], 'police'], ['strb90', s >= 5 ? 2 : 0, 'army']];
        for (const [id, k, role] of want) if (n(id) < k && spawn(MODEL[id], role)) {
          if (role === 'army' && !said.army) { said.army = true; toast('Marinen skickar stridsbåtar efter dig!'); }
          else if (role === 'police' && !said.police) { said.police = true; toast('Sjöpolisen är på väg!'); }
          break;
        }
      }
      if (!wanted) said = { police: false, army: false, fire: false };
      for (const c of list) {
        const W = c.water, d = Math.hypot(T.x - c.x, T.z - c.z);
        if (!hunting || c.dead) W.leave = true;
        if (W.leave) {
          c.siren = false;
          if ((W.leaveT += dt) > 40 || d > 320) removeCar(c);
          continue;
        }
        // stuck somewhere far off (a pier, a narrow sound): gone, and another comes in its place
        if (Math.hypot(c.vx, c.vz) < 1.2 && d > 80) { if ((W.stuckTotal = (W.stuckTotal || 0) + dt) > 8) { removeCar(c); continue; } }
        else W.stuckTotal = 0;
        // caught: you stopped with a police boat alongside, in plain view
        if (W.role === 'police' && driving && driving.M.boat) {
          const sp = Math.hypot(driving.vx, driving.vz);
          if (d < (c.M.L + driving.M.L) / 2 + 3 && sp < 2.2 && clearView(c.x, c.z, T.x, T.z)) {
            if ((W.caughtT += dt) > 1.4) { caught(); return; }
          } else W.caughtT = Math.max(0, W.caughtT - dt);
        }
        // the navy: warning bursts from the gun when it has you in its sights
        if (W.role === 'army' && wet && d < 160 && (W.fireT -= dt) <= 0 && Math.abs(wrapAngle(Math.atan2(T.x - c.x, T.z - c.z) - c.h - (c.aim || 0))) < 0.15 && clearView(c.x, c.z, T.x, T.z)) {
          W.fireT = 6 + Math.random() * 4;
          burst(c, T);
          if (!said.fire) { said.fire = true; toast('Stridsbåten skjuter varningsskott! Stanna, eller kör för livet.'); }
        }
      }
    }
    return { update, think, units, get wet() { return wet; }, flood, waypoint };
  })();

  /* ---------- the police helicopter ---------- */
  // From three stars Polisflyget's helicopter joins the chase: a Bell 429, blue on top and white underneath, with the
  // blue and yellow checks along the cabin and POLIS on the tail boom and the belly. It flies in, then circles over you
  // with its searchlight on you. While it sees you the patrols always know where you are. It can't see you indoors, nor
  // deep in a narrow lane of Gamla stan unless it is right overhead, and it can't keep up with the fastest cars on a
  // straight. Lose it and it searches where it saw you last; when the chase is over it climbs away.
  const HELI = { speed: 46, alt: 36, radius: 52, eye: 120 };
  let heli = null, heliModel = null;
  // civil: red on top with a dark band instead of the checks and no POLIS, for the helicopter you fly yourself (FLY)
  function buildHeli(civil) {
    const BLUE = civil ? 0xc8102e : 0x163d8c, WHITE = 0xf1f2ef, YEL = 0xf2c200, DARK = 0x24272b, ROTOR = 0x2b2e33;
    const m = new Merger(), gl = new Merger(), lamp = new Merger();
    // one triangle at a time, coloured by where its middle is (so the checks stay sharp) or sent to the glass
    const put = (geo, colOf, glassOf) => {
      const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i += 9) {
        const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cy = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
        const toGlass = glassOf && glassOf(cx, cy, cz), tgt = toGlass ? gl : m;
        _c.set(toGlass ? 0xffffff : colOf(cx, cy, cz));
        for (let k = 0; k < 9; k += 3) { tgt.p.push(P[i + k], P[i + k + 1], P[i + k + 2]); tgt.n.push(N[i + k], N[i + k + 1], N[i + k + 2]); tgt.c.push(_c.r, _c.g, _c.b); }
      }
      g.dispose(); geo.dispose();
    };
    // a tube from a to b
    const tube = (M, a, b, r, col, n = 8) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), g = new THREE.CylinderGeometry(r, r, len, n);
      g.applyMatrix4(_m4.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      M.add(g, col);
    };
    // the cabin: turned from a profile along the length, oval in section, nose forwards (+z), skids at y = 0
    const prof = [[0.0, -1.75], [0.3, -1.68], [0.58, -1.42], [0.78, -0.85], [0.86, -0.2], [0.87, 0.7], [0.84, 1.5], [0.76, 2.15], [0.6, 2.65], [0.4, 2.98], [0.18, 3.18], [0.0, 3.24]];
    const cab = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    cab.rotateX(Math.PI / 2); cab.scale(0.92, 1.12, 1); cab.translate(0, 1.42, 0);
    const checks = (y, z) => (civil ? DARK : (Math.floor((z + 20) / 0.42) + (y > 1.06 ? 1 : 0)) % 2 ? BLUE : YEL);
    put(cab, (x, y, z) => (y > 1.5 ? BLUE : y > 0.86 && y < 1.26 && z < 2.55 && z > -1.45 ? checks(y, z) : WHITE), (x, y, z) =>
      // windscreen over the nose, and the side windows of the cockpit and the cabin with a pillar between the doors
      (z > 1.55 && y > 1.38 && Math.abs(x) < 0.82 && !(Math.abs(x) < 0.04 && z > 2.2)) || (Math.abs(x) > 0.55 && y > 1.38 && y < 2.12 && z > -1.05 && z < 1.55 && Math.abs(z - 0.32) > 0.07));
    // the engine fairing on the roof and the two exhausts at its back
    const fair = new THREE.SphereGeometry(1, 18, 10); fair.scale(0.6, 0.36, 1.55); fair.translate(0, 2.26, -0.35);
    put(fair, () => BLUE);
    for (const s of [1, -1]) tube(m, [s * 0.28, 2.38, -1.55], [s * 0.36, 2.48, -1.95], 0.11, DARK);
    // tail boom, the fin with the tail rotor on its left, the stabiliser with end plates, a skid under the tail
    const boom = new THREE.CylinderGeometry(0.2, 0.42, 5.2, 14); boom.rotateX(-Math.PI / 2 + 0.035); boom.translate(0, 1.82, -4.05);
    put(boom, (x, y) => (y > 2.02 ? BLUE : WHITE));
    m.hexa([[-0.06, 1.55, -6.95], [0.06, 1.55, -6.95], [0.06, 1.62, -6.3], [-0.06, 1.62, -6.3], [-0.05, 3.15, -7.35], [0.05, 3.15, -7.35], [0.05, 3.1, -6.95], [-0.05, 3.1, -6.95]], BLUE);
    m.hexa([[-1.35, 1.78, -5.25], [1.35, 1.78, -5.25], [1.35, 1.8, -4.75], [-1.35, 1.8, -4.75], [-1.35, 1.84, -5.25], [1.35, 1.84, -5.25], [1.35, 1.86, -4.75], [-1.35, 1.86, -4.75]], WHITE);
    for (const s of [1, -1]) m.box(0.04, 0.55, 0.5, BLUE, s * 1.37, 1.85, -5.0);
    tube(m, [0, 1.6, -6.6], [0, 1.25, -6.9], 0.03, DARK);
    tube(m, [0.12, 2.45, -6.9], [0.0, 2.45, -6.9], 0.09, DARK);
    // skids on their cross tubes
    for (const s of [1, -1]) {
      tube(m, [s * 1.12, 0.07, -1.25], [s * 1.12, 0.07, 1.7], 0.05, DARK);
      tube(m, [s * 1.12, 0.07, 1.7], [s * 1.12, 0.26, 2.05], 0.05, DARK);
      for (const z of [1.15, -0.75]) tube(m, [s * 1.12, 0.07, z], [s * 0.55, 0.78, z], 0.045, DARK);
    }
    // mast and hub; under the nose the searchlight and the camera ball
    tube(m, [0, 2.5, 0.15], [0, 3.05, 0.15], 0.11, 0x6a6f75);
    m.add(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12), 0x6a6f75, 0, 3.08, 0.15);
    tube(m, [0.42, 0.62, 2.35], [0.42, 0.62, 2.7], 0.13, DARK, 12);
    m.add(new THREE.SphereGeometry(0.19, 12, 8), 0x3a3e44, -0.38, 0.62, 2.55);
    lamp.add(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), 0xfff6dc, 0.42, 0.62, 2.71, Math.PI / 2, 0, 0);
    // navigation lights: red to the left (+x, the nose being +z), green to the right, white at the tail
    lamp.box(0.07, 0.07, 0.1, 0xff2a2a, 1.4, 1.95, -5.0); lamp.box(0.07, 0.07, 0.1, 0x2aff6a, -1.4, 1.95, -5.0); lamp.box(0.06, 0.06, 0.06, 0xffffff, 0, 3.18, -7.36);
    // POLIS along both sides of the tail boom and big on the belly, the word from the police cars' decal
    const db = new Builder(), POL = [[0, 0.5], [1, 0.5], [1, 1], [0, 1]];
    for (const s of [1, -1]) {
      const x = s * 0.4, z0 = -2.0, z1 = -3.7, y0 = 1.66, y1 = 2.0;
      if (s > 0) db.quad([x, y0, z0], [x - 0.07, y0, z1], [x - 0.07, y1, z1], [x, y1, z0], 0xffffff, POL, [1, 0, 0]);
      else db.quad([x + 0.07, y0, z1], [x, y0, z0], [x, y1, z0], [x + 0.07, y1, z1], 0xffffff, POL, [-1, 0, 0]);
    }
    db.quad([0.55, 0.37, 1.6], [0.55, 0.37, -0.9], [-0.55, 0.37, -0.9], [-0.55, 0.37, 1.6], 0xffffff, [[0, 0.5], [0, 1], [1, 1], [1, 0.5]], [0, -1, 0]);
    const group = new THREE.Group(), body = new THREE.Group();
    group.add(body);
    body.rotation.order = 'YXZ';
    // (plain standard materials like the rest of the city's, so nothing new has to be compiled when it turns up)
    const mat = std({ vertexColors: true, roughness: 0.3, metalness: 0.15, envMapIntensity: 1.2 });
    const shell = new THREE.Mesh(m.build(), mat); shell.castShadow = true;
    body.add(shell, new THREE.Mesh(gl.build(), glassMat), new THREE.Mesh(lamp.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    if (!civil) body.add(new THREE.Mesh(db.build(), decalMat));
    // the rotors spin in their own groups; a faint disc stands for the blur of the blades
    const blades = new Merger();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU, g = new THREE.BoxGeometry(0.3, 0.035, 5.3);
      g.translate(0, 0, 2.85); g.rotateY(a); blades.add(g, ROTOR);
      const t = new THREE.BoxGeometry(0.31, 0.04, 0.35); t.translate(0, 0, 5.35); t.rotateY(a); blades.add(t, YEL);
    }
    const rotor = new THREE.Mesh(blades.build(), mat);
    rotor.position.set(0, 3.13, 0.15); rotor.castShadow = true;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40), new THREE.MeshBasicMaterial({ color: 0x3a3f46, transparent: true, opacity: 0.085, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(0, 3.12, 0.15);
    const tb = new Merger();
    for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(0.02, 0.86, 0.13); g.translate(0, 0.43, 0); g.rotateX((k / 4) * TAU + (k % 2) * 0.35); tb.add(g, ROTOR); }
    const tail = new THREE.Mesh(tb.build(), rotor.material);
    tail.position.set(0.16, 2.45, -6.9);
    // the red beacon on top flashes
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    beacon.position.set(0, 2.66, -0.9);
    body.add(rotor, disc, tail, beacon);
    // the searchlight: a faint beam down to a bright patch on the ground
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 3.2, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3d2, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -0.5, 0);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff1cc, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    patch.rotation.x = -Math.PI / 2; patch.scale.setScalar(9); patch.renderOrder = 2;
    group.visible = beam.visible = patch.visible = false;
    scene.add(group, beam, patch);
    return { group, body, rotor, tail, beacon, beam, patch };
  }
  // can it see you: close enough, not indoors, and not hidden between the houses of a narrow lane unless right overhead
  function heliSees(H, T) {
    const hd = Math.hypot(T.x - H.x, T.z - H.z);
    if (hd > HELI.eye) return false;
    if (!driving && (indoorSpan(player.x, player.z, player.y) || STATION.inside(player.x, player.z))) return false;
    const ne = nearestEdge(T.x, T.z);
    if (hd > 22 && ne.e && ne.e.kind === 'lane' && ne.e.hw < 2.3 && ne.d < ne.e.hw + 1.2) return false;
    return true;
  }
  // the tallest thing under a point, so the helicopter keeps clear of towers and spires
  function roofAt(x, z, r) {
    let top = 0;
    forNear(x - r, z - r, x + r, z + r, (o) => { if (o.h < 300 && o.h > top) top = o.h; });
    return top;
  }
  function spawnHeli() {
    if (!heliModel) heliModel = buildHeli();
    const T = playerTarget(), a = Math.random() * TAU, d = 480;
    const x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d;
    heli = { x, y: 95, z, vx: 0, vy: 0, vz: 0, h: Math.atan2(T.x - x, T.z - z), pitch: 0, roll: 0, spin: 0, state: 'in', sees: false, seen: { x: T.x, z: T.z }, orbit: a, spot: { x: T.x, z: T.z }, lostT: 0, t: 0, ax: 0, az: 0 };
    heliModel.group.visible = true;
  }
  function updateHeli(dt) {
    const want = !!wanted && wanted.stars >= 3 && !(policeStop && policeStop.locked);
    if (!heli) { if (want) spawnHeli(); else return; }
    const H = heli, T = playerTarget();
    H.t += dt;
    if (!want && H.state !== 'leave') { H.state = 'leave'; H.sees = false; const a = Math.atan2(H.x - T.x, H.z - T.z); H.away = [Math.sin(a), Math.cos(a)]; }
    let gx, gz, gy, tvx = 0, tvz = 0;
    if (H.state === 'leave') {
      gx = H.x + H.away[0] * 300; gz = H.z + H.away[1] * 300; gy = 140;
      if (Math.hypot(H.x - T.x, H.z - T.z) > 900) { heli = null; heliModel.group.visible = heliModel.beam.visible = heliModel.patch.visible = false; return; }
    } else {
      H.sees = heliSees(H, T);
      if (H.sees) { H.seen = { x: T.x, z: T.z }; H.lostT = 0; if (H.state === 'in' && Math.hypot(T.x - H.x, T.z - H.z) < 140) { H.state = 'track'; toast('Polishelikoptern har dig i strålkastaren!'); } }
      else H.lostT += dt;
      // circle over you a little ahead of where you are going; lost, circle tighter over where you were last seen
      const focus = H.sees ? T : wanted && !wanted.inSight ? wanted.seen : H.seen, lead = H.sees ? 1.2 : 0;
      const fx = focus.x + (T.vx || 0) * lead * (H.sees ? 1 : 0), fz = focus.z + (T.vz || 0) * lead * (H.sees ? 1 : 0);
      const R = H.sees ? HELI.radius : 26 + 10 * Math.sin(H.t * 0.3);
      H.orbit += dt * (H.sees ? 0.22 : 0.4);
      const far = Math.hypot(fx - H.x, fz - H.z) > R + 90;
      gx = far ? fx : fx + Math.cos(H.orbit) * R; gz = far ? fz : fz + Math.sin(H.orbit) * R;
      if (H.sees && !far) { tvx = T.vx || 0; tvz = T.vz || 0; }
      gy = far ? 70 : HELI.alt;
    }
    // keep well above whatever is underneath and just ahead
    const ahead = 1.5;
    gy = Math.max(gy, roofAt(H.x, H.z, 14) + 16, roofAt(H.x + H.vx * ahead, H.z + H.vz * ahead, 18) + 16);
    // fly: a speed towards the goal (plus the target's own speed when circling it), reached with a limited push
    const dx = gx - H.x, dz = gz - H.z, d = Math.hypot(dx, dz) || 1, v = Math.min(HELI.speed, d * 0.7);
    let wx = (dx / d) * v + tvx, wz = (dz / d) * v + tvz;
    const wl = Math.hypot(wx, wz);
    if (wl > HELI.speed) { wx *= HELI.speed / wl; wz *= HELI.speed / wl; }
    const acc = 9, ax = clamp((wx - H.vx) * 1.6, -acc, acc), az = clamp((wz - H.vz) * 1.6, -acc, acc);
    H.vx += ax * dt; H.vz += az * dt;
    H.vy += (clamp((gy - H.y) * 0.7, -6, 9) - H.vy) * Math.min(1, 2 * dt);
    H.x += H.vx * dt; H.y += H.vy * dt; H.z += H.vz * dt;
    H.ax += (ax - H.ax) * Math.min(1, 3 * dt); H.az += (az - H.az) * Math.min(1, 3 * dt);
    // nose: towards you while it circles (the camera and the light are in front), along its way when it travels
    const sp = Math.hypot(H.vx, H.vz), faceYou = H.state !== 'leave' && Math.hypot(T.x - H.x, T.z - H.z) < 160;
    const hw = faceYou ? Math.atan2(T.x - H.x, T.z - H.z) : sp > 3 ? Math.atan2(H.vx, H.vz) : H.h;
    H.h += clamp(wrapAngle(hw - H.h), -1.2 * dt, 1.2 * dt);
    // tilted into the push: nose down to speed up or to fly forwards, a bank to the side it pushes towards
    const fwx = Math.sin(H.h), fwz = Math.cos(H.h), rgx = Math.cos(H.h), rgz = -Math.sin(H.h);
    const vf = H.vx * fwx + H.vz * fwz, af = H.ax * fwx + H.az * fwz, al = H.ax * rgx + H.az * rgz;
    H.pitch += (clamp(vf * 0.005 + af * 0.025, -0.22, 0.3) - H.pitch) * Math.min(1, 3 * dt);
    H.roll += (clamp(-al * 0.03 - (H.vx * rgx + H.vz * rgz) * 0.004, -0.4, 0.4) - H.roll) * Math.min(1, 3 * dt);
    // the patch of light follows you (where it last saw you, sweeping, when it has lost you)
    const st = H.sees ? T : { x: H.seen.x + Math.sin(H.t * 0.9) * 9, z: H.seen.z + Math.cos(H.t * 0.7) * 9 };
    H.spot.x += (st.x - H.spot.x) * Math.min(1, (H.sees ? 4 : 1) * dt); H.spot.z += (st.z - H.spot.z) * Math.min(1, (H.sees ? 4 : 1) * dt);
    // the model
    const G = heliModel;
    G.group.position.set(H.x, H.y, H.z);
    G.body.rotation.set(H.pitch, H.h, H.roll);
    H.spin += dt * 41;
    G.rotor.rotation.y = H.spin; G.tail.rotation.x = H.spin * 5.3;
    G.beacon.visible = H.t % 1.2 < 0.12;
    const on = H.state !== 'leave' && Math.hypot(H.spot.x - H.x, H.spot.z - H.z) < 140;
    G.beam.visible = G.patch.visible = on;
    if (on) {
      const lx = H.x + Math.sin(H.h) * 2.5, ly = H.y + 0.6, lz = H.z + Math.cos(H.h) * 2.5, gy0 = 0.08;
      const bx = H.spot.x - lx, by = gy0 - ly, bz = H.spot.z - lz, bl = Math.hypot(bx, by, bz);
      G.beam.position.set(lx, ly, lz);
      G.beam.scale.set(1, bl, 1);
      G.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(bx / bl, by / bl, bz / bl));
      G.patch.position.set(H.spot.x, gy0, H.spot.z);
      G.patch.material.opacity = H.sees ? 0.42 : 0.28;
    }
  }
