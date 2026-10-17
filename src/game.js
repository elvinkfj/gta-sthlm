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
  function startChase(kind, over) {
    if (!wanted) {
      wanted = { kinds: new Set(), counts: {}, bonus: 0, stars: 1, starT: 0, over: 0, lostT: 0, searchT: 0, stopT: 0, t: 0, fleeT: 0, seen: playerTarget(), inSight: true };
      toast(kind === 'fart' ? 'Polisen såg dig köra för fort. Stanna bilen!' : 'Polisen är efter dig!');
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
      if (over > TOLERANCE) for (const c of cars) if (c.police && !c.dead && clocks(c, T.x, T.z)) { startChase('fart', over); wanted.limit = limitAt(driving.x, driving.z); break; }
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
      if (wanted.searchT > 8 + more * 4 || wanted.lostT > 45 + more * 15 || (!chasers && wanted.lostT > 6)) { endChase(false); return; }
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
  function buildHeli() {
    const BLUE = 0x163d8c, WHITE = 0xf1f2ef, YEL = 0xf2c200, DARK = 0x24272b, ROTOR = 0x2b2e33;
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
    const checks = (y, z) => (Math.floor((z + 20) / 0.42) + (y > 1.06 ? 1 : 0)) % 2 ? BLUE : YEL;
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
    body.add(shell, new THREE.Mesh(gl.build(), glassMat), new THREE.Mesh(lamp.build(), new THREE.MeshBasicMaterial({ vertexColors: true })), new THREE.Mesh(db.build(), decalMat));
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

  /* ---------- police on the ground: stops, constables on foot, arrests and the cells ---------- */
  // Pull over and the nearest patrol turns its siren off (blue lights stay on) and parks right behind you, or in front
  // of you facing you if it is already ahead, lined up with your car and just as far out from the kerb. A constable
  // gets out and walks up to your window. For an ordinary offence that means an ordningsbot (E signs it). Drive far
  // too fast (50 km/h or more over the limit) or run from them, and it is an arrest instead: out of the car, handcuffs,
  // the back seat of the police car and a ride to the station on Stora Nygatan, where you are put in a cell.
  // On foot the patrols pull up and the constables get out and run after you, along the streets, through the lanes,
  // up the stairs and into buildings. Get into a car and they run back to theirs and chase you by car again.
  let policeStop = null;
  const footCops = [];
  const CONSTABLES = ['Andersson', 'Lindqvist', 'Nyström', 'Berg', 'Holm', 'Karlsson', 'Ek', 'Sandberg', 'Öberg', 'Lundin'];
  const COP_RUN = 9.7, ARREST_OVER = 50, FLEE_ARREST = 20, IDLE = () => ({ mx: 0, mz: 0, speed: 0, jump: false });
  const arrestable = (w) => w.over >= ARREST_OVER || w.kinds.has('smitning') || (w.fleeT || 0) > FLEE_ARREST || w.stars >= 3;
  const stopTarget = () => (driving ? { x: driving.x, z: driving.z, h: driving.h, L: driving.M.L } : { x: player.x, z: player.z, h: player.rot, L: 1 });
  // the phases in which you have no say in where you go
  const inCustody = () => !!(policeStop && policeStop.locked && policeStop.phase !== 'jail');

  /* walking routes for people: straight there when nothing is in the way, through the station's rooms, or along the
     streets, lanes and stairs (every street a person can walk) */
  function walkLine(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.8));
    for (let i = 1; i <= n; i++) {
      const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n);
      if (!walkable(x, z) || blockedAt(x, z, 0.26)) return false;
    }
    return true;
  }
  const SP = STATION.P, CELL_GUARD = [STATION.P.C2[0] + 1.8, 223.2]; // where the constable waits while you go into cell 2
  function stationPath(ka, kb) {
    const dist = { [ka]: 0 }, prev = {}, todo = new Set(Object.keys(SP));
    while (todo.size) {
      let u = null;
      for (const k of todo) if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k;
      if (u === null || u === kb) break;
      todo.delete(u);
      for (const [a, b] of STATION.LINKS) {
        const v = a === u ? b : b === u ? a : null;
        if (!v || !todo.has(v)) continue;
        const nd = dist[u] + Math.hypot(SP[u][0] - SP[v][0], SP[u][1] - SP[v][1]);
        if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    const path = [kb];
    while (path[0] !== ka && prev[path[0]]) path.unshift(prev[path[0]]);
    return path;
  }
  function nearestRoomPoint(x, z) {
    let best = null, bd = Infinity;
    for (const k in SP) {
      const d = Math.hypot(SP[k][0] - x, SP[k][1] - z) + (walkLine(x, z, SP[k][0], SP[k][1]) ? 0 : 50);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  let walkNode = null;
  function streetWaypoint(x, z, tx, tz) {
    if (!walkNode) walkNode = (px, pz) => { let b = 0, bd = Infinity; nodes.forEach((n, i) => { const d = Math.hypot(n.x - px, n.z - pz); if (d < bd && n.nbW.length) { bd = d; b = i; } }); return b; };
    const goal = walkNode(tx, tz), D = distTo(goal, 'nbW'), ne = nearestEdge(x, z);
    if (!ne.e) return { x: tx, z: tz };
    const e = ne.e, A = nodes[e.a], B = nodes[e.b];
    const t = clamp(((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / (e.len * e.len), 0, 1);
    let n = t * e.len + D[e.a] <= (1 - t) * e.len + D[e.b] ? e.a : e.b;
    if (n === goal && Math.hypot(nodes[n].x - x, nodes[n].z - z) < 4) return { x: tx, z: tz };
    if (Math.hypot(nodes[n].x - x, nodes[n].z - z) < 2.5) {
      let best = n, bv = Infinity;
      for (const m of nodes[n].nbW) { const v = D[m] + Math.hypot(nodes[m].x - nodes[n].x, nodes[m].z - nodes[n].z); if (v < bv) { bv = v; best = m; } }
      n = best;
    }
    return { x: nodes[n].x, z: nodes[n].z };
  }
  // Cars standing in the way of someone on foot (your car after an arrest, the patrol car, cars parked at the kerb):
  // the walk goes round the nearest one the straight line would run into, by the shorter way round its corners.
  // Each car is a box as big as the car plus room for a person; the corners are a little further out still.
  const CAR_ROOM = 0.6, CORNER = 0.35;
  function carBox(c) {
    return { c, co: Math.cos(c.h), si: Math.sin(c.h), hx: c.M.W / 2 + CAR_ROOM, hz: c.M.L / 2 + CAR_ROOM };
  }
  const toLocal = (b, x, z) => { const dx = x - b.c.x, dz = z - b.c.z; return [dx * b.co - dz * b.si, dx * b.si + dz * b.co]; };
  const toWorld = (b, lx, lz) => ({ x: b.c.x + lx * b.co + lz * b.si, z: b.c.z - lx * b.si + lz * b.co });
  // where (0..1) a segment in the box's own frame first enters the box, or Infinity if it never does
  function segEntersBox(ax, az, bx, bz, hx, hz) {
    let t0 = 0, t1 = 1;
    for (const [p, d, h] of [[ax, bx - ax, hx], [az, bz - az, hz]]) {
      if (Math.abs(d) < 1e-9) { if (p <= -h || p >= h) return Infinity; continue; }
      let ta = (-h - p) / d, tb = (h - p) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 >= t1) return Infinity;
    }
    return t0;
  }
  const insideBox = (b, x, z) => { const [lx, lz] = toLocal(b, x, z); return Math.abs(lx) < b.hx && Math.abs(lz) < b.hz; };
  // is (x, z) within pad metres of the body of car c
  const byCar = (c, x, z, pad) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.h), si = Math.sin(c.h); return Math.abs(dx * co - dz * si) < c.M.W / 2 + pad && Math.abs(dx * si + dz * co) < c.M.L / 2 + pad; };
  function aroundCars(x, z, wp) {
    const len = Math.hypot(wp.x - x, wp.z - z);
    if (len < 0.3) return wp;
    // only cars standing still: one rolling past is gone again before anyone could walk round it
    const boxes = [];
    for (const c of cars) {
      if (Math.hypot(c.vx, c.vz) > 0.5 || Math.abs(c.x - x) > len + c.M.L + 2 || Math.abs(c.z - z) > len + c.M.L + 2) continue;
      if (policeStop && policeStop.riding && c === policeStop.car) continue;
      boxes.push(carBox(c));
    }
    const S0 = { x, z }, d0 = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    const free = (p, b) => personFits(p.x, p.z) && !blockedAt(p.x, p.z, 0.3) && !boxes.some((o) => o !== b && insideBox(o, p.x, p.z));
    // squeezed in close beside a car: first step out of the room kept round it, along its side (never through it)
    for (const b of boxes) {
      if (!insideBox(b, x, z) || insideBox(b, wp.x, wp.z)) continue;
      const [lx, lz] = toLocal(b, x, z), sx = Math.sign(lx) || 1, sz = Math.sign(lz) || 1;
      const outs = [[sx * (b.hx + 0.15), lz], [lx, sz * (b.hz + 0.15)], [lx, -sz * (b.hz + 0.15)]].map(([a, c]) => toWorld(b, a, c)).filter((p) => free(p, b));
      if (!outs.length) continue;
      outs.sort((p, q) => d0(S0, p) + d0(p, wp) * 0.5 - d0(S0, q) - d0(q, wp) * 0.5);
      return outs[0];
    }
    let hit = null, ht = Infinity;
    for (const b of boxes) {
      // already inside the box (being pushed out of it) or going to a spot inside it: nothing to go round
      if (insideBox(b, x, z) || insideBox(b, wp.x, wp.z)) continue;
      const [ax, az] = toLocal(b, x, z), [bx, bz] = toLocal(b, wp.x, wp.z), t = segEntersBox(ax, az, bx, bz, b.hx, b.hz);
      if (t < ht) { ht = t; hit = b; }
    }
    if (!hit) return wp;
    const b = hit, X = b.hx + CORNER, Z = b.hz + CORNER;
    const C = [[-X, -Z], [X, -Z], [X, Z], [-X, Z]].map(([lx, lz]) => toWorld(b, lx, lz));
    // a corner is no good in a wall, in the water or inside another car
    const ok = C.map((p) => free(p, b));
    const sees = (p, q) => { const [ax, az] = toLocal(b, p.x, p.z), [bx, bz] = toLocal(b, q.x, q.z); return segEntersBox(ax, az, bx, bz, b.hx, b.hz) === Infinity; };
    const S = { x, z }, dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    let best = null, bl = Infinity;
    for (let i = 0; i < 4; i++) {
      if (!ok[i] || !sees(S, C[i])) continue;
      for (const d of [1, 3]) {
        const path = [i];
        let j = i, L = dist(S, C[i]), good = true;
        while (good && !sees(C[j], wp)) {
          const n = (j + d) % 4;
          if (path.length >= 4 || !ok[n]) good = false;
          else { L += dist(C[j], C[n]); j = n; path.push(n); }
        }
        if (!good) continue;
        L += dist(C[j], wp);
        // (a corner you are already standing at is passed: the next one along, or the goal, is where to go)
        if (L < bl) { bl = L; const k = path.find((q) => dist(S, C[q]) > 0.5); best = k === undefined ? wp : C[k]; }
      }
    }
    return best || wp;
  }
  function walkWaypoint(nav, x, z, tx, tz, dt) {
    if ((nav.t = (nav.t || 0) - dt) > 0 && nav.wp && Math.hypot(nav.wp.x - x, nav.wp.z - z) > 0.6) return nav.wp;
    nav.t = 0.25;
    const d = Math.hypot(tx - x, tz - z), aIn = STATION.inside(x, z), bIn = STATION.inside(tx, tz);
    let wp;
    if (d < 1 || (d < 80 && walkLine(x, z, tx, tz))) wp = { x: tx, z: tz };
    else if (aIn || bIn) {
      const E0 = SP.E0;
      if (!aIn && Math.hypot(E0[0] - x, E0[1] - z) > 1.5) wp = walkLine(x, z, E0[0], E0[1]) ? { x: E0[0], z: E0[1] } : streetWaypoint(x, z, E0[0], E0[1]);
      else {
        // head for the furthest room point along the way that can be walked to in a straight line
        const ka = aIn ? nearestRoomPoint(x, z) : 'E0', kb = bIn ? nearestRoomPoint(tx, tz) : 'E0', path = stationPath(ka, kb);
        let k = path.length - 1;
        while (k > 0 && !walkLine(x, z, SP[path[k]][0], SP[path[k]][1])) k--;
        const P = SP[path[k]];
        wp = k === path.length - 1 && Math.hypot(P[0] - x, P[1] - z) < 0.7 ? (bIn ? { x: tx, z: tz } : streetWaypoint(x, z, tx, tz)) : { x: P[0], z: P[1] };
      }
    } else wp = streetWaypoint(x, z, tx, tz);
    wp = aroundCars(x, z, wp);
    // a waypoint on the way (a corner, a junction, a room) is walked through, not stopped at
    wp.via = Math.hypot(wp.x - tx, wp.z - tz) > 0.05;
    nav.wp = wp;
    return wp;
  }
  function seek(p, wp, speed, stopAt = 0.15) {
    const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
    if (wp.via) return d < 0.02 ? IDLE() : { mx: dx / d, mz: dz / d, speed, jump: false };
    if (d <= stopAt) return IDLE();
    return { mx: dx / d, mz: dz / d, speed: Math.min(speed, (d - stopAt) * 3 + 0.4), jump: false };
  }
  function face(p, x, z) { if (p) p.rot = lerpAngle(p.rot, Math.atan2(x - p.x, z - p.z), 0.25); }
  // a door of a car: the driver's (+1) or the passenger side (-1), at the front or the back seat
  function doorSpot(c, side, rear) {
    const co = Math.cos(c.h), si = Math.sin(c.h), lx = side * (c.M.W / 2 + 0.75), lz = rear && c.geo.rear ? c.geo.rear.z : c.driver.position.z;
    return { x: c.x + lx * co + lz * si, z: c.z - lx * si + lz * co };
  }
  // the door on the side nearest a point, unless that side is up against something
  function doorNear(c, x, z, rear) {
    const a = doorSpot(c, 1, rear), b = doorSpot(c, -1, rear), free = (q) => personFits(q.x, q.z) && !blockedAt(q.x, q.z, 0.3);
    const [first, second] = Math.hypot(a.x - x, a.z - z) <= Math.hypot(b.x - x, b.z - z) ? [a, b] : [b, a];
    return free(first) || !free(second) ? first : second;
  }

  /* the stop itself */
  function stopSpot(pc, T) {
    const fx = Math.sin(T.h), fz = Math.cos(T.h), ahead = (pc.x - T.x) * fx + (pc.z - T.z) * fz > 4;
    const gap = T.L / 2 + 2.2 + pc.M.L / 2, sg = ahead ? 1 : -1, h = ahead ? T.h + Math.PI : T.h;
    for (const k of [1, 1.35, 1.8]) {
      const x = T.x + fx * gap * k * sg, z = T.z + fz * gap * k * sg;
      if (spotFree(pc.M, x, z, h, pc)) return { x, z, h, fx: Math.sin(h), fz: Math.cos(h), ahead };
    }
    return null;
  }
  // where the constable stands to talk to you: by the driver's window, or a step from you if you are on foot
  function windowSpot(o) {
    if (driving) {
      const c = driving, co = Math.cos(c.h), si = Math.sin(c.h), lz = c.driver.position.z + 0.35;
      const at = (s) => { const lx = s * (c.M.W / 2 + 0.75); return { x: c.x + lx * co + lz * si, z: c.z - lx * si + lz * co, fx: c.x, fz: c.z }; };
      // the driver's window, unless a wall or another car is in the way there: then the passenger's
      const free = (p) => personFits(p.x, p.z) && !blockedAt(p.x, p.z, 0.35) && !cars.some((q) => q !== c && byCar(q, p.x, p.z, 0.4));
      if (policeStop && policeStop.winSide === undefined) policeStop.winSide = free(at(1)) || !free(at(-1)) ? 1 : -1;
      return at(policeStop ? policeStop.winSide : 1);
    }
    const dx = o.x - player.x, dz = o.z - player.z, d = Math.hypot(dx, dz) || 1;
    return { x: player.x + (dx / d) * 1.0, z: player.z + (dz / d) * 1.0, fx: player.x, fz: player.z };
  }
  function newStop(c, mode, phase, officer) {
    const T = stopTarget();
    policeStop = {
      car: c, mode, phase, t: 0, at: { x: T.x, z: T.z }, officer: officer || null, crew: c.occupant || makeIdentity(OFFICER), name: rpick(CONSTABLES), title: 'Konstapel',
      ticket: null, nav: {}, pnav: {}, locked: false, spot: phase === 'approach' && driving ? stopSpot(c, T) : null, door: null,
      vehicle: driving ? driving.M.name + ', ' + plateOf(driving) : 'Gående'
    };
    // (a constable of this car who was out on foot is the one dealing with you now)
    c.police.state = 'stop'; c.police.out = null; c.siren = false; c.yelp = false; c.beacon = true; c.police.direct = false;
    for (const o of cars) if (o !== c && o.police && o.police.state === 'chase') setChase(o, false);
    for (const fc of footCops) fc.mode = 'return';
    return policeStop;
  }
  function beginStop(c) {
    newStop(c, arrestable(wanted) ? 'arrest' : 'ticket', 'approach');
    toast(policeStop.spot && policeStop.spot.ahead ? 'Polisen stannar framför dig. Sitt kvar i bilen.' : 'Polisen kör in bakom dig. Sitt kvar i bilen.');
  }
  // a constable on foot has reached you
  function caughtOnFoot(fc) {
    footCops.splice(footCops.indexOf(fc), 1);
    // their own car, or (if it was taken from them) the nearest other patrol
    let car = fc.car && fc.car.police && !fc.car.military && cars.indexOf(fc.car) >= 0 && !fc.car.dead ? fc.car : null;
    // (a soldier hands you over to the police: the nearest patrol is called up)
    if (!car && fc.car && fc.car.military) { const pc = spawnBot(25, MODEL.polis, 140); if (pc) { makePolice(pc); pc.vx = pc.vz = 0; } }
    if (!car) {
      let bd = Infinity;
      for (const c of cars) if (c.police && !c.military && c.bot && !c.dead && (c.police.state === 'patrol' || c.police.state === 'chase' || c.police.state === 'call')) { const d = Math.hypot(c.x - fc.p.x, c.z - fc.p.z); if (d < bd) { bd = d; car = c; } }
      if (car) fc.door = doorNear(car, fc.p.x, fc.p.z, false);
    }
    if (!car) {
      // no patrol anywhere: the fine there and then, and the constable goes on their way
      const { f } = fineFor(wanted);
      fines += f;
      toast('Konstapeln skriver ut böter på plats: ' + fmtKr(f) + '.');
      removePerson(fc.p);
      for (const o of footCops) o.mode = 'return';
      wanted = null; policeCool = 30;
      return;
    }
    if (car !== fc.car) { car.vx = car.vz = 0; fc.crew = fc.crew || car.occupant; setOccupant(car, null); }
    const S = newStop(car, arrestable(wanted) ? 'arrest' : 'ticket', 'talk', fc.p);
    S.crew = fc.crew; S.door = fc.door;
    if (fc.car && fc.car.military) S.title = 'Soldat';
    fc.p.ai.role = 'stop';
    if (S.mode === 'arrest') { S.phase = 'cuff'; S.locked = true; toast(S.title + ' ' + S.name + ': Stå still! Du är gripen.'); }
    else showTicket();
  }
  // the patrol's driving while it pulls in: line up a few metres short of the spot, then roll into it and stop
  function parkDrive(c, sp, slow) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h), lxv = Math.cos(c.h), lzv = -Math.sin(c.h), vf = c.vx * fx + c.vz * fz;
    const halt = { fwd: vf > 0.3 ? -1 : vf < -0.3 ? 1 : 0, right: 0, brake: Math.abs(vf) < 0.3 };
    if (!sp) return halt;
    const sfx = Math.sin(sp.h), sfz = Math.cos(sp.h), along = (c.x - sp.x) * sfx + (c.z - sp.z) * sfz, d = Math.hypot(sp.x - c.x, sp.z - c.z);
    const tx = along < -8 ? sp.x - sfx * 6 : sp.x + sfx * 2, tz = along < -8 ? sp.z - sfz * 6 : sp.z + sfz * 2;
    if (d < 1.4 || along > 0.5) return halt;
    const dx = tx - c.x, dz = tz - c.z, lz = dx * fx + dz * fz, lx = dx * lxv + dz * lzv;
    const maxSteer = 0.6 / (1 + Math.abs(vf) * 0.03);
    const delta = lz < 0.3 ? Math.sign(lx || 1) * maxSteer : Math.atan((2 * c.M.wb * lx) / (lx * lx + lz * lz));
    const vT = clamp(d * 0.7, 1.5, slow || 11);
    return { fwd: clamp((vT - vf) * 0.5, -1, 1), right: -clamp(delta / maxSteer, -1, 1), brake: false };
  }
  function stopDrive(c) { return parkDrive(c, policeStop && policeStop.car === c && policeStop.phase === 'approach' ? policeStop.spot : null); }
  // the ride to the station: along the streets at the limit, then into the kerb outside the door
  const STATION_NODE = (() => { let b = -1, bd = Infinity; nodes.forEach((n, i) => { const d = Math.hypot(n.x - STATION.X1, n.z - 222); if (n.nb.length && d < bd) { bd = d; b = i; } }); return b; })();
  function transportDrive(c, dt) {
    const S = policeStop;
    if (!S || S.car !== c || S.phase !== 'transport') return parkDrive(c, S && S.car === c && S.phase === 'park' ? S.curb : null, 6);
    const curb = STATION.curb(c.h), d = Math.hypot(curb.x - c.x, curb.z - c.z);
    if (d < 40 && clearView(c.x, c.z, curb.x, curb.z)) { S.curb = STATION.curb(c.h); S.phase = 'park'; S.t = 0; return parkDrive(c, S.curb, 6); }
    c.bot.goal = { node: STATION_NODE, x: curb.x, z: curb.z };
    return botThink(c, dt);
  }
  function showTicket() {
    const S = policeStop, { f, rows } = fineFor(wanted), now = new Date();
    S.ticket = { f, rows };
    const place = (el.locStreet.textContent ? el.locStreet.textContent + ', ' : '') + el.locDistrict.textContent;
    $('tkPlace').textContent = place;
    $('tkTime').textContent = now.toLocaleDateString('sv-SE') + ' ' + now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    $('tkCar').textContent = S.vehicle;
    const ul = $('tkRows');
    ul.textContent = '';
    for (const r of rows) {
      const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('b');
      a.textContent = r.text; b.textContent = fmtKr(r.kr); li.append(a, b); ul.append(li);
    }
    $('tkSum').textContent = fmtKr(f);
    $('tkOfficer').textContent = S.title + ' ' + S.name;
    $('tkTitle').textContent = S.mode === 'arrest' ? 'Gripen: anmälan om brott' : 'Föreläggande av ordningsbot';
    $('tkSignText').textContent = S.mode === 'arrest' ? 'Tagen del' : 'Skriv under';
    $('ticket').hidden = false;
    if (S.mode !== 'arrest') toast(S.title + ' ' + S.name + ': ' + (wanted.kinds.has('fart') ? 'Hej, polisen här. Vet du hur fort du körde?' : 'Hej, polisen här. Det där gick inte bra.'));
  }
  // E: sign the ticket. The fine is yours, and the constable walks back to the car
  function signTicket() {
    if (!policeStop || policeStop.phase !== 'talk' || !policeStop.ticket) return;
    fines += policeStop.ticket.f;
    $('ticket').hidden = true;
    toast('Du skrev under. Böter ' + fmtKr(policeStop.ticket.f) + '.' + (wanted.over > 35 ? ' Körkortet dras in.' : ' Kör försiktigt nu!'));
    policeStop.phase = 'back'; policeStop.t = 0;
  }
  // E during a stop or an arrest
  function useKey() {
    const S = policeStop;
    if (S && S.phase === 'talk') { signTicket(); return true; }
    if (S && (S.phase === 'transport' || S.phase === 'park') && !S.fade) { skipRide(); return true; }
    if (S && S.phase === 'jail') { S.wait = !S.wait; toast(S.wait ? 'Du sover på britsen. Tiden går fortare.' : 'Du vaknar.'); return true; }
    return inCustody();
  }
  // fade to black, do something, fade back
  function fadeThen(fn) { if (policeStop) policeStop.fade = { t: 0, fn, done: false }; $('fade').classList.add('on'); }
  function skipRide() {
    fadeThen(() => {
      const c = policeStop.car, curb = STATION.curb(0);
      c.x = curb.x; c.z = curb.z - 4; c.h = curb.h; c.vx = c.vz = 0;
      policeStop.curb = curb; policeStop.phase = 'park'; policeStop.t = 0;
      camTarget.set(c.x, 1.7, c.z);
    });
  }
  // the police car you are put in, or the cell, if the car was lost on the way
  function jailDirect() {
    const S = policeStop;
    if (S.officer) { removePerson(S.officer); S.officer = null; }
    const c = S.car;
    if (driving) exitCar();
    S.riding = false;
    if (c && c.rearSeat) c.rearSeat.visible = false;
    if (c && c.police && cars.indexOf(c) >= 0) { setOccupant(c, S.crew); c.beacon = false; c.police.state = 'patrol'; resyncBot(c); setChase(c, false); }
    const cell = STATION.doors[1], [x0, z0, x1, z1] = cell.inside;
    player.x = (x0 + x1) / 2; player.z = (z0 + z1) / 2; player.y = 0; player.vx = player.vz = 0;
    player.model.group.visible = true; player.cuffed = false;
    cell.want = 0;
    camTarget.set(player.x, 1.6, player.z);
    startJail();
  }
  function startJail() {
    const S = policeStop, w = wanted || { over: 0, kinds: new Set(), fleeT: 0 };
    S.jailT = Math.min(90, 30 + Math.max(0, Math.round((w.over - ARREST_OVER) / 10)) * 10 + (w.kinds.has('smitning') || (w.fleeT || 0) > FLEE_ARREST ? 15 : 0));
    S.phase = 'jail'; S.t = 0; S.wait = false; S.locked = true;
    if (!S.ticket) S.ticket = fineFor(w);
    wanted = null;
    toast('Du sitter i häktet på polisstationen i Gamla stan. Tryck E för att sova så går tiden fortare.');
  }
  function stopUpdate(dt) {
    const S = policeStop, c = S.car, T = stopTarget();
    S.t += dt;
    if (S.fade) {
      S.fade.t += dt;
      if (!S.fade.done && S.fade.t > 0.45) { S.fade.done = true; S.fade.fn(); }
      if (S.fade.t > 0.6) { $('fade').classList.remove('on'); S.fade = null; }
      if (policeStop !== S) return;
    }
    const carOk = c && c.police && cars.indexOf(c) >= 0 && !c.dead;
    if (!carOk && ['approach', 'parked', 'walk', 'talk', 'back', 'flee'].includes(S.phase)) { endStop(false); return; }
    if (!carOk && ['order', 'cuff', 'escort', 'board', 'transport', 'park'].includes(S.phase)) { if (!S.fade) fadeThen(jailDirect); return; }
    // driving off (or running off) before the paperwork is done turns it back into a chase
    if (!S.locked && ['approach', 'parked', 'walk', 'talk'].includes(S.phase)) {
      const away = Math.hypot(T.x - S.at.x, T.z - S.at.z);
      if (driving ? away > 8 && Math.hypot(driving.vx, driving.vz) > 3 : away > 6) {
        $('ticket').hidden = true;
        if (wanted) wanted.kinds.add('smitning');
        toast('Du smet från poliskontrollen! Nu blir du gripen om de får tag i dig.');
        if (!S.officer) { endStop(true); return; }
        if (driving) { S.phase = 'flee'; S.t = 0; }
        else {
          // you ran: the constable runs after you, the car waits for them
          const fc = { p: S.officer, car: c, crew: S.crew, door: S.door || doorNear(c, S.officer.x, S.officer.z, false), mode: 'chase', retT: 0 };
          S.officer.ai = { state: 'cop', role: 'foot', fc, nav: {}, dodgeT: 0 };
          footCops.push(fc);
          policeStop = null;
          c.police.state = 'wait'; c.police.out = fc; c.beacon = true;
          if (wanted) { wanted.lostT = 0; wanted.stopT = 0; wanted.seen = playerTarget(); }
          return;
        }
      }
    }
    const o = S.officer, arrived = o && o.arrived;
    switch (S.phase) {
      case 'approach': {
        const vs = Math.hypot(c.vx, c.vz);
        if (S.spot ? (Math.hypot(S.spot.x - c.x, S.spot.z - c.z) < 1.6 || (S.spot.x - c.x) * S.spot.fx + (S.spot.z - c.z) * S.spot.fz < -0.5) && vs < 0.4 : vs < 0.4) S.phase = 'parked', S.t = 0;
        else if (S.t > 14 && vs < 0.6) S.phase = 'parked', S.t = 0;
        break;
      }
      case 'parked':
        if (S.t > 0.9) {
          const ex = exitSpot(c) || doorSpot(c, 1, false);
          S.door = ex;
          setOccupant(c, null);
          S.officer = makePerson(S.crew, ex.x, ex.z, { state: 'cop', role: 'stop', nav: {}, dodgeT: 0 });
          S.officer.keep = true; S.officer.rot = c.h;
          S.phase = 'walk'; S.t = 0;
        }
        break;
      case 'walk':
        if (S.t > 16) { const w = windowSpot(o); if (personFits(w.x, w.z)) { o.x = w.x; o.z = w.z; } o.arrived = true; }
        if (o.arrived) {
          S.t = 0;
          if (S.mode === 'arrest') { S.phase = 'order'; S.locked = true; toast(S.title + ' ' + S.name + ': Kliv ur bilen! Du är gripen' + (wanted.over >= ARREST_OVER ? ' för grov hastighetsöverträdelse.' : ' för att du försökte köra ifrån oss.')); }
          else { S.phase = 'talk'; showTicket(); }
        }
        break;
      case 'talk': {
        const w = windowSpot(o);
        face(o, w.fx, w.fz);
        if (S.t > 12) signTicket();
        break;
      }
      case 'order': {
        const w = windowSpot(o);
        face(o, w.fx, w.fz);
        if (S.t > 1.8 && driving) exitCar();
        if (S.t > 2.0) { S.phase = 'cuff'; S.t = 0; }
        break;
      }
      case 'cuff':
        if (Math.hypot(o.x - player.x, o.z - player.z) < 1.05 || S.t > 8) {
          face(o, player.x, player.z);
          S.cuffT = (S.cuffT || 0) + dt;
          if (S.cuffT > 1.1) {
            player.cuffed = true;
            if (!S.ticket) showTicket();
            S.rearDoor = doorNear(c, player.x, player.z, true);
            S.phase = 'escort'; S.t = 0;
            toast(S.title + ' ' + S.name + ': Följ med till bilen.');
            // a long way to the car: the patrol comes round instead (a short fade and you are both beside it)
            if (Math.hypot(S.rearDoor.x - player.x, S.rearDoor.z - player.z) > 30) fadeThen(() => {
              const rd = S.rearDoor;
              player.x = rd.x; player.z = rd.z; player.vx = player.vz = 0;
              if (S.officer) { S.officer.x = rd.x + Math.sin(c.h) * 1.3; S.officer.z = rd.z + Math.cos(c.h) * 1.3; }
              camTarget.set(player.x, 1.6, player.z);
            });
          }
        }
        break;
      case 'escort':
        $('ticket').hidden = S.t > 6;
        // held up and left behind (traffic, a crowd): a short fade and you are both at the car
        S.lagT = Math.hypot(o.x - player.x, o.z - player.z) > 6 ? (S.lagT || 0) + dt : 0;
        if (S.lagT > 4 && !S.fade) {
          S.lagT = 0;
          fadeThen(() => {
            const rd = S.rearDoor;
            player.x = rd.x; player.z = rd.z; player.vx = player.vz = 0;
            if (S.officer) { S.officer.x = rd.x + Math.sin(c.h) * 1.3; S.officer.z = rd.z + Math.cos(c.h) * 1.3; }
          });
        }
        if ((Math.hypot(o.x - S.rearDoor.x, o.z - S.rearDoor.z) < 1.4 && Math.hypot(player.x - S.rearDoor.x, player.z - S.rearDoor.z) < 1.6) || S.t > 40) {
          $('ticket').hidden = true;
          player.model.group.visible = false; player.vx = player.vz = 0;
          if (c.rearSeat) { c.rearSeat.geometry = playerId.driverGeo; c.rearSeat.visible = true; }
          S.riding = true;
          S.door = doorNear(c, o.x, o.z, false);
          S.phase = 'board'; S.t = 0;
        }
        break;
      case 'board':
        if (arrived || S.t > 8) {
          removePerson(o); S.officer = null;
          setOccupant(c, S.crew);
          c.beacon = false; c.police.state = 'transport';
          resyncBot(c);
          c.bot.cruise = 17; c.bot.turnV = 6; c.bot.passT = 5; c.bot.revT = 0.8; c.bot.waitT = 0;
          S.phase = 'transport'; S.t = 0;
          toast('Du sitter i baksätet på väg till polisstationen i Gamla stan. Tryck E för att hoppa fram.');
        }
        break;
      case 'transport':
        if ((S.t > 55 || (c.bot && c.bot.stuckTotal > 8)) && !S.fade) skipRide();
        break;
      case 'park':
        if (Math.hypot(c.vx, c.vz) < 0.4 && (Math.hypot(S.curb.x - c.x, S.curb.z - c.z) < 3.5 || S.t > 10)) {
          // out of the car: you from the back seat, the constable from the front, both on the side of the door
          const E0 = { x: SP.E0[0], z: SP.E0[1] }, pd = doorNear(c, E0.x, E0.z, true), od = doorNear(c, E0.x, E0.z, false);
          if (c.rearSeat) c.rearSeat.visible = false;
          player.x = pd.x; player.z = pd.z; player.y = 0; player.rot = c.h; player.model.group.visible = true;
          setOccupant(c, null);
          S.door = od;
          S.officer = makePerson(S.crew, od.x, od.z, { state: 'cop', role: 'stop', nav: {}, dodgeT: 0 });
          S.officer.keep = true;
          S.riding = false;
          S.phase = 'walkin'; S.t = 0;
        }
        break;
      case 'walkin': {
        const C2 = CELL_GUARD;
        if (Math.hypot(o.x - C2[0], o.z - C2[1]) < 0.9 || S.t > 45) {
          if (S.t > 45) { o.x = C2[0]; o.z = C2[1]; }
          STATION.doors[1].want = 1;
          S.phase = 'incell'; S.t = 0;
          toast(S.title + ' ' + S.name + ': In i cellen.');
        }
        break;
      }
      case 'incell': {
        face(o, SP.D2[0], SP.D2[1]);
        const [x0, z0, x1, z1] = STATION.doors[1].inside;
        if ((player.x > x0 && player.x < x1 && player.z > z0 && player.z < z1 - 0.6) || S.t > 25) {
          if (S.t > 25) { player.x = (x0 + x1) / 2; player.z = (z0 + z1) / 2; }
          STATION.doors[1].want = 0;
          player.cuffed = false;
          S.copLeaving = true;
          startJail();
        }
        break;
      }
      case 'jail': {
        S.jailT -= dt * (S.wait ? 8 : 1);
        if (S.copLeaving && S.officer && (S.officer.arrived || S.t > 40)) {
          removePerson(S.officer); S.officer = null; S.copLeaving = false;
          if (c && c.police && cars.indexOf(c) >= 0) { setOccupant(c, S.crew); c.beacon = false; c.police.state = 'patrol'; resyncBot(c); setChase(c, false); }
        }
        if (S.jailT <= 0) {
          STATION.doors[1].want = 1;
          const f = S.ticket ? S.ticket.f : 0;
          fines += f;
          toast('Du är fri att gå. Böter ' + fmtKr(f) + ' har lagts till. Gå ut genom receptionen.');
          if (S.officer) { removePerson(S.officer); if (c && c.police && cars.indexOf(c) >= 0) { setOccupant(c, S.crew); c.police.state = 'patrol'; resyncBot(c); setChase(c, false); } }
          policeStop = null; wanted = null; policeCool = 60;
        }
        break;
      }
      case 'back':
      case 'flee': {
        const near = S.door && Math.hypot(S.door.x - o.x, S.door.z - o.z) < 2.5;
        if (arrived || (near && S.t > 3) || S.t > 12) endStop(S.phase === 'flee');
        break;
      }
    }
  }
  // what the constable of the stop does, phase by phase
  function stopOfficerIntent(S, p, dt) {
    switch (S.phase) {
      case 'walk': { const w = windowSpot(p), it = seek(p, walkWaypoint(S.nav, p.x, p.z, w.x, w.z, dt), 1.8, 0.1); p.arrived = Math.hypot(w.x - p.x, w.z - p.z) < 0.6; return it; }
      case 'cuff': return seek(p, walkWaypoint(S.nav, p.x, p.z, player.x, player.z, dt), 2.2, 0.85);
      case 'escort': { p.arrived = Math.hypot(S.rearDoor.x - p.x, S.rearDoor.z - p.z) < 0.6; return seek(p, walkWaypoint(S.nav, p.x, p.z, S.rearDoor.x, S.rearDoor.z, dt), 2.2, 0.1); }
      case 'walkin': return seek(p, walkWaypoint(S.nav, p.x, p.z, CELL_GUARD[0], CELL_GUARD[1], dt), 2.0, 0.1);
      case 'board': case 'back': case 'flee': {
        const d = S.door || doorSpot(S.car, 1, false);
        p.arrived = Math.hypot(d.x - p.x, d.z - p.z) < 0.6;
        return seek(p, walkWaypoint(S.nav, p.x, p.z, d.x, d.z, dt), S.phase === 'flee' ? 5.8 : 1.7, 0.1);
      }
      case 'jail': {
        if (!S.copLeaving) return IDLE();
        const d = S.door;
        p.arrived = Math.hypot(d.x - p.x, d.z - p.z) < 0.7;
        return seek(p, walkWaypoint(S.nav, p.x, p.z, d.x, d.z, dt), 1.7, 0.1);
      }
      default: return IDLE();
    }
  }
  // where you go while in custody: beside the constable, then into the cell
  function custodyIntent(dt) {
    const S = policeStop;
    if (!S || !S.locked || S.phase === 'jail') return null;
    const o = S.officer;
    if (S.phase === 'escort' || S.phase === 'walkin') {
      if (!o) return IDLE();
      const d = Math.hypot(o.x - player.x, o.z - player.z);
      return d < 1.5 ? IDLE() : seek(player, walkWaypoint(S.pnav, player.x, player.z, o.x, o.z, dt), d > 3 ? 3.4 : 2.3, 1.3);
    }
    if (S.phase === 'incell') {
      const [x0, z0, x1, z1] = STATION.doors[1].inside;
      return STATION.doors[1].open > 0.7 ? seek(player, walkWaypoint(S.pnav, player.x, player.z, (x0 + x1) / 2, (z0 + z1) / 2 - 1, dt), 1.7, 0.2) : IDLE();
    }
    return IDLE();
  }
  // the constable is back in the car: drive on (or, if you ran, give chase again)
  function endStop(chase) {
    const S = policeStop, c = S.car;
    policeStop = null;
    $('ticket').hidden = true;
    if (S.officer) removePerson(S.officer);
    if (c && c.police && cars.indexOf(c) >= 0) {
      setOccupant(c, S.crew);
      c.beacon = false;
      c.police.state = 'patrol';
      resyncBot(c);
      setChase(c, !!chase);
    }
    if (chase) { if (wanted) { wanted.lostT = 0; wanted.stopT = 0; wanted.seen = playerTarget(); } }
    else { wanted = null; policeCool = 30; }
  }

  /* constables on foot */
  // a constable already out of the car becomes one running after you
  function footCop(p, car, crew, door) {
    const fc = { p, car, crew, door: door || { x: p.x, z: p.z }, mode: 'chase', retT: 0 };
    p.ai = { state: 'cop', role: 'foot', fc, nav: {}, dodgeT: 0 };
    p.keep = true;
    footCops.push(fc);
    return fc;
  }
  // you take a police car: that is theft, and its crew, whether in the car or out on foot, come after you on foot
  function policeCarTaken(c) {
    if (policeStop && policeStop.car === c && !policeStop.locked) {
      const S = policeStop;
      policeStop = null;
      $('ticket').hidden = true;
      if (S.officer) footCop(S.officer, null, S.crew);
    }
    for (const fc of footCops) if (fc.car === c) fc.car = null;
    if (c.occupant && c.bot) {
      const spot = exitSpot(c) || doorSpot(c, -1, false), p = makePerson(c.occupant, spot.x, spot.z, { state: 'cop' });
      p.rot = c.h;
      footCop(p, null, c.occupant);
    }
    c.police = null; c.siren = false; c.beacon = false; c.yelp = false;
    offense('stöld', 0, c.x, c.z, c);
    toast(c.military ? 'Du tog ' + c.M.def + '! Militären är efter dig.' : 'Du tog polisbilen! Det räknas som stöld.');
  }
  function deployCop(c) {
    const ex = exitSpot(c) || doorSpot(c, 1, false);
    const crew = c.occupant || makeIdentity(c.military ? SOLDIER : OFFICER), fc = { p: null, car: c, crew, door: ex, mode: 'chase', retT: 0 };
    fc.p = makePerson(crew, ex.x, ex.z, { state: 'cop', role: 'foot', fc, nav: {}, dodgeT: 0 });
    fc.p.keep = true; fc.p.rot = c.h;
    setOccupant(c, null);
    c.police.out = fc; c.beacon = !c.military; c.siren = false; c.yelp = false;
    footCops.push(fc);
    // the truck has a squad in the back: they jump down and spread out after you
    if (c.M.mil === 'truck') for (let i = 0; i < 5; i++) {
      const co = Math.cos(c.h), si = Math.sin(c.h), lx = ((i % 3) - 1) * 1.1, lz = -c.M.L / 2 - 1.0 - Math.floor(i / 3) * 1.1, x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
      if (!personFits(x, z)) continue;
      const sq = { p: null, car: c, crew: makeIdentity(SOLDIER), door: { x, z }, mode: 'chase', retT: 0 };
      sq.p = makePerson(sq.crew, x, z, { state: 'cop', role: 'foot', fc: sq, nav: {}, dodgeT: 0 });
      sq.p.keep = true; sq.p.rot = c.h + Math.PI;
      footCops.push(sq);
    }
  }
  function copBoard(fc) {
    removePerson(fc.p);
    footCops.splice(footCops.indexOf(fc), 1);
    const c = fc.car;
    if (!c || !c.police || cars.indexOf(c) < 0 || c.dead) return;
    setOccupant(c, fc.crew);
    c.police.out = null; c.beacon = false; c.police.state = 'patrol';
    resyncBot(c);
    setChase(c, !!wanted && !policeStop);
  }
  function updateFootCops(dt) {
    for (const c of cars) {
      if (!c.police || c.police.state !== 'wait') continue;
      // a constable no longer out on foot (they caught you, or were taken off) leaves the car free to drive again
      if (c.police.out && footCops.indexOf(c.police.out) < 0) c.police.out = null;
      if (c.police.out) continue;
      if (c.dead || driving || !wanted || policeStop) { c.police.state = 'patrol'; c.beacon = false; if (!c.occupant) setOccupant(c, makeIdentity(OFFICER)); setChase(c, !!wanted && !policeStop); continue; }
      if (Math.hypot(c.vx, c.vz) < 1.5) deployCop(c);
    }
    for (const fc of footCops.slice()) {
      if (fc.mode === 'chase' && (driving || !wanted || policeStop)) fc.mode = 'return';
      if (fc.mode === 'return') {
        fc.retT += dt;
        const gone = !fc.car || cars.indexOf(fc.car) < 0 || fc.car.dead || !fc.car.police;
        if (gone && (Math.hypot(fc.p.x - camTarget.x, fc.p.z - camTarget.z) > 70 || fc.retT > 30)) { removePerson(fc.p); footCops.splice(footCops.indexOf(fc), 1); continue; }
        if (!gone && (Math.hypot(fc.door.x - fc.p.x, fc.door.z - fc.p.z) < 1.4 || fc.retT > 45)) copBoard(fc);
      }
    }
  }
  function footCopIntent(fc, p, dt) {
    if (fc.mode === 'chase') {
      const seen = wanted && !wanted.inSight ? wanted.seen : player, d = Math.hypot(seen.x - p.x, seen.z - p.z);
      return seek(p, walkWaypoint(p.ai.nav, p.x, p.z, seen.x, seen.z, dt), d > 3 ? COP_RUN : 5, 0.05);
    }
    if (!fc.car || !fc.car.police || cars.indexOf(fc.car) < 0 || fc.car.dead) return IDLE();
    fc.door = doorNear(fc.car, p.x, p.z, false);
    return seek(p, walkWaypoint(p.ai.nav, p.x, p.z, fc.door.x, fc.door.z, dt), 6, 0.1);
  }
  // everyone in uniform on foot: the constable of a stop, constables running, the desk officer, the guards' cousin
  function copThink(p, dt) {
    const ai = p.ai;
    if (ai.role === 'foot') return footCopIntent(ai.fc, p, dt);
    if (ai.role === 'stop' && policeStop && policeStop.officer === p) return stopOfficerIntent(policeStop, p, dt);
    return IDLE();
  }

  /* ---------- initial traffic ---------- */
  const BOT_TARGET = 18, PARKED_TARGET = 14, NPC_COUNT = 30;
  // a parked car at the kerb of a random street near you
  function spawnParkedNear(minD, maxD) {
    const pool = edges.filter((e) => e.park && e.len > 50 && edgeDist(e, player.x, player.z) < maxD);
    for (let tries = 0; tries < 20 && pool.length; tries++) {
      const e = rpick(pool), fwd = Math.random() < 0.5, f = edgeFrame(fwd ? e.a : e.b, fwd ? e.b : e.a);
      const s = f.A.r + 8 + Math.random() * (f.len - f.A.r - f.B.r - 16), M = Math.random() < 0.3 ? rpick(SPORTS) : rpick(REGULARS);
      const x = f.A.x + f.ux * s + f.rx * f.park, z = f.A.z + f.uz * s + f.rz * f.park, h = Math.atan2(f.ux, f.uz), d = Math.hypot(x - player.x, z - player.z);
      if (d < minD || d > maxD || !spotFree(M, x, z, h)) continue;
      return spawnParked(M, rpick(M.colors), x, z, h, false);
    }
    return null;
  }
  {
    // the car park where you start: one of every model in the bays nearest you, backed in so they face the aisle,
    // the bus in its bay at the north end, and here and there another car in the other bays
    const { f, wx, wz, at, rows, bus } = LOT;
    const inBay = (M, color, b, faceAisle) => {
      const r = rows[b.row], d = b.row === 0 ? r.d0 + 0.3 + M.L / 2 : r.d1 - 0.3 - M.L / 2, out = (b.row === 0) === faceAisle ? 1 : -1;
      spawnParked(M, color, ...at(b.s, d), Math.atan2(wx * out, wz * out), true);
    };
    const bays = LOT.bays.slice().sort((a, b) => Math.abs(a.s - SPAWN.s + 8) - Math.abs(b.s - SPAWN.s + 8));
    const first = ['f40', 'chiron', 'x5', 'laferrari', 'mg5', 'stalker', 'countach', 'jesko', 'cobra', 'superbil', 'gt3rs', 'sport', 'muskel', 'halvkombi', 'sedan', 'polestar', 'kombi', 'v240', 'saab', 'taxi', 'suv', 'skapbil'];
    const show = first.concat(PICKABLE.filter((M) => !M.bus && !M.boat && !first.includes(M.id)).map((M) => M.id));
    show.forEach((id, i) => inBay(MODEL[id], MODEL[id].colors[0], bays[i], true));
    for (const b of bays.slice(show.length)) {
      if (Math.random() > 0.27) continue;
      const M = Math.random() < 0.2 ? rpick(SPORTS) : rpick(REGULARS);
      inBay(M, rpick(M.colors), b, Math.random() < 0.4);
    }
    spawnParked(MODEL.buss, MODEL.buss.colors[0], ...at((bus.s0 + bus.s1) / 2, (bus.d0 + bus.d1) / 2), Math.atan2(-f.ux, -f.uz), true);
    for (let i = 0; i < PARKED_TARGET; i++) spawnParkedNear(30, 260);
    for (let i = 0; i < BOT_TARGET; i++) spawnBot(25, null, 260);
    for (let i = 0; i < POLICE_TARGET; i++) { const c = spawnBot(80, MODEL.polis, 600); if (c) makePolice(c); }
    for (let i = 0; i < NPC_COUNT; i++) spawnWalker(4, 130, SPAWN.x, SPAWN.z);
    // boats moored round town, each by a quay where you can step down into it: by the car park at Skeppsbron, along
    // Strandvägen, at Gröna Lund, on Hammarby sjö, along Norr Mälarstrand, at Långholmen, out by Marieberg, Nacka and
    // Lilla Värtan
    const moor = (id, x, z) => { const M = MODEL[id], b = findBerth(M, x, z, 40); if (b) spawnParked(M, M.colors[0], b.x, b.z, b.h, true); };
    moor('jetski', ...LOT.at(66, 34)); moor('anytec', ...LOT.at(78, 34)); moor('riva', ...LOT.at(92, 34));
    moor('jetski', 735, -606); moor('anytec', 820, -598);
    moor('riva', 1480, 650); moor('jetski', 1600, 645);
    moor('anytec', 600, 1965); moor('jetski', 400, 1972);
    moor('jetski', -1250, -45); moor('riva', -1150, -40);
    moor('anytec', -1560, 695); moor('jetski', -2300, -95);
    moor('anytec', 2600, 1120); moor('jetski', 3000, -1300);
  }

  /* ================= Högvakten and the Dalahäst hunt ================= */
  // The royal guard marches up and down Yttre borggården in two files, turning at either end of the courtyard.
  const GUARD_ID = makeIdentity({ skin: 0xf0c08a, shirt: 0x1d2c5a, pants: 0x1d2c5a, hat: 'helmet', belts: true });
  function guardTarget(post, t) {
    const T = 64, ph = (t % T) / T, hold = 0.09;
    // a triangle wave with a halt at each end: march north, halt, about turn, march south, halt
    const s = ph < 0.5 ? clamp((ph - hold) / (0.5 - hold), 0, 1) : 1 - clamp((ph - 0.5 - hold) / (0.5 - hold), 0, 1);
    const dir = ph < hold || (ph >= 0.5 && ph < 0.5 + hold) ? (ph < 0.5 ? 1 : -1) : ph < 0.5 ? 1 : -1;
    const lead = lerp(-24, 24, s);
    return { x: post.x, z: lead - dir * post.rank * 2.3, face: dir > 0 ? 0 : Math.PI };
  }
  for (let i = 0; i < 8; i++) {
    const post = { x: i % 2 ? -73 : -85, rank: Math.floor(i / 2) }, g = guardTarget(post, 0);
    const p = makePerson(GUARD_ID, g.x, g.z, { state: 'guard', post, dodgeT: 0 });
    p.keep = true;
  }
  mapLabels.push(['Högvakten', -79, 30, 'landmark']);
  // at the station: the officer behind the counter, and somebody already sitting in the first cell
  {
    const desk = makePerson(makeIdentity(OFFICER), STATION.desk[0], STATION.desk[1], { state: 'idle', face: 0, dodgeT: 0 });
    desk.keep = true;
    const [x0, z0, x1, z1] = STATION.doors[0].inside, inmate = makePerson(makeIdentity({ shirt: 0xe46f2a, pants: 0x3b3f45 }), (x0 + x1) / 2 + 0.6, z1 - 1.2, { state: 'idle', face: 0, dodgeT: 0 });
    inmate.keep = true;
  }

  // Twenty Dalahästar are hidden around town, nine of them in the lanes of Gamla stan. Walk or drive into one to
  // collect it and learn something about the place. Find them all for fireworks over Strömmen and golden cars.
  const HORSES = [
    ['Mårten Trotzigs gränd', -87.5, 371, 'Gamla stans smalaste gränd, bara 90 cm bred på det smalaste stället. Den är en enda lång trappa.'],
    ['Järnpojken', 59, 124, 'Järnpojken bakom Finska kyrkan är Stockholms minsta staty. På vintern får han stickade mössor och mynt.'],
    ['Brända tomten', 80, 279, 'Här brann ett hus för länge sedan och tomten fick stå tom. Nu är den ett litet torg med ett träd.'],
    ['Stortorget', -55, 226, 'Stockholms äldsta torg. Här skedde Stockholms blodbad 1520.'],
    ['Köpmantorget', 103, 237, 'Sankt Göran och draken på Köpmantorget är en kopia av skulpturen inne i Storkyrkan.'],
    ['Slottsbacken', 141, 2, 'Obelisken på Slottsbacken restes år 1800 som tack till Stockholms borgare.'],
    ['Mynttorget', -118, -78, 'Mynttorget har fått sitt namn efter Myntet, där Sveriges mynt präglades.'],
    ['Gåsgränd', -170, 165, 'Gränderna väster om Västerlånggatan går ner mot Stora Nygatan och vattnet vid Munkbron.'],
    ['Skeppar Karls gränd', 171, 156, 'Gränderna öster om Österlånggatan ledde förr ner till hamnen där skeppen lade till.'],
    ['Tyska brinken', 76, 351, 'Tyska kyrkans klockspel spelar flera gånger om dagen över Gamla stans tak.'],
    ['Evert Taubes terrass', -478, 236, 'Från Evert Taubes terrass på Riddarholmen har man en av Stockholms finaste utsikter över Riddarfjärden.'],
    ['Kungsträdgården', 29.5, -545, 'Kungsträdgården var från början kungens köksträdgård. På våren blommar körsbärsträden.'],
    ['Sergels torg', -225, -600, 'Glasobelisken på Sergels torg heter Kristallvertikalaccent och är 37 meter hög.'],
    ['Skeppsholmen', 780, 5, 'På Skeppsholmen hade flottan sin bas i flera hundra år.'],
    ['Djurgården', 1220, -90, 'Djurgården var kungens jaktpark. Här finns Skansen och Gröna Lund.'],
    ['Mariatorget', -520, 1082, 'Fontänen på Mariatorget föreställer Tor som fiskar upp Midgårdsormen.'],
    ['Humlegården', 150, -1100, 'Humlegården var kungens humleodling. Här ligger Kungliga biblioteket.'],
    ['Medborgarplatsen', 150, 1422, 'Medborgarplatsen är Södermalms stora torg, uppkallat efter Medborgarhuset.'],
    ['Stadshuset', -1000, -32, 'Stadshusets torn är 106 meter högt och har tre kronor i toppen.'],
    ['Slussen', 30, 725, 'Vid Slussen möts Mälaren och Saltsjön. Mälaren ligger lite högre, så båtarna slussas mellan dem.']
  ];
  const HORSE_KEY = 'gubbe-dalahastar';
  let horsesFound = new Set(), goldCars = false, fireworksT = 0, rocketT = 0;
  const bursts = [];
  try { horsesFound = new Set(JSON.parse(localStorage.getItem(HORSE_KEY) || '[]')); } catch (e) { /* private window: the hunt just starts over */ }
  goldCars = horsesFound.size >= HORSES.length;
  const horseGeo = (() => {
    const m = new Merger(), red = 0xc8102e, yel = 0xf2c200, blu = 0x1f5fa8, grn = 0x2e8b57, wht = 0xf4f1ea;
    m.box(0.34, 0.42, 1.0, red, 0, 0.95, 0);
    m.box(0.32, 0.62, 0.24, red, 0, 0.44, 0.34); m.box(0.32, 0.62, 0.24, red, 0, 0.44, -0.36);
    m.box(0.3, 0.6, 0.32, red, 0, 1.36, 0.4); m.box(0.28, 0.3, 0.52, red, 0, 1.62, 0.6); m.box(0.24, 0.14, 0.08, red, 0, 1.82, 0.44);
    m.box(0.36, 0.06, 0.44, blu, 0, 1.18, -0.08); m.box(0.37, 0.04, 0.46, yel, 0, 1.13, -0.08);
    m.box(0.36, 0.05, 0.5, yel, 0, 1.6, 0.66); m.box(0.32, 0.46, 0.06, 0x1d1d1f, 0, 1.42, 0.24);
    for (const sx of [1, -1]) {
      m.box(0.02, 0.16, 0.16, yel, sx * 0.172, 0.98, 0.18); m.box(0.02, 0.08, 0.08, wht, sx * 0.174, 0.98, 0.18);
      m.box(0.02, 0.06, 0.28, grn, sx * 0.172, 0.84, 0.12); m.box(0.02, 0.12, 0.12, blu, sx * 0.172, 0.98, -0.3);
      m.box(0.02, 0.05, 0.05, wht, sx * 0.142, 1.66, 0.74);
    }
    return m.build();
  })();
  const horseMat = std({ vertexColors: true, roughness: 0.32, emissive: 0x2a0606 });
  const horses = HORSES.map(([name, x, z, fact], i) => {
    const mesh = new THREE.Mesh(horseGeo, horseMat), glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf5a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.scale.setScalar(1.45); mesh.castShadow = true; glow.scale.set(3.2, 3.2, 1);
    const g = new THREE.Group(); g.add(mesh, glow); g.position.set(x, 0, z); glow.position.y = 1.2;
    const found = horsesFound.has(name);
    g.visible = !found; scene.add(g);
    return { name, x, z, fact, g, mesh, found, ph: i * 0.7 };
  });
  const fireFx = new Particles(1800, THREE.AdditiveBlending, false);
  // the white water behind a boat: spray thrown up from the stern, and foam left lying on the water
  const foamFx = new Particles(700, THREE.NormalBlending, true), FOAM_COL = new THREE.Color(0xf4f8fa);
  function boatWake(c, dt) {
    const v = Math.hypot(c.vx, c.vz);
    if (v < 1.5 || Math.hypot(c.x - camTarget.x, c.z - camTarget.z) > 160) return;
    const co = Math.cos(c.h), si = Math.sin(c.h), lz = -c.M.L / 2 + 0.2, n = Math.min(4, v * dt * 6);
    for (let i = 0; i < n; i++) {
      const lx = (Math.random() - 0.5) * c.M.W * 0.8, x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
      foamFx.spawn({ x, y: WATER_Y + 0.15, z, vx: -c.vx * 0.15 + (Math.random() - 0.5), vy: 0, vz: -c.vz * 0.15 + (Math.random() - 0.5), life: 2.6 + Math.random(), size: [0.7, 2.6 + v * 0.06], alpha: Math.min(0.65, 0.2 + v * 0.025), c: FOAM_COL, drag: 1.2, floor: WATER_Y + 0.15, fadeIn: 0.05 });
      if (v > 6 && Math.random() < 0.5) foamFx.spawn({ x, y: WATER_Y + 0.4, z, vx: -c.vx * 0.3 + (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2.5, vz: -c.vz * 0.3 + (Math.random() - 0.5) * 2, life: 0.9, size: [0.3, 1.4], alpha: 0.5, c: FOAM_COL, grav: 9, drag: 0.6, floor: WATER_Y + 0.08 });
    }
    // the bow wave, peeling off both sides of the front
    if (v > 3 && Math.random() < dt * 14) for (const sd of [1, -1]) {
      const lx = sd * c.M.W * 0.45, bz = c.M.L * 0.25, x = c.x + lx * co + bz * si, z = c.z - lx * si + bz * co;
      foamFx.spawn({ x, y: WATER_Y + 0.12, z, vx: sd * co * 1.6 + c.vx * 0.2, vy: 0.5, vz: -sd * si * 1.6 + c.vz * 0.2, life: 1.6, size: [0.4, 1.6], alpha: 0.4, c: FOAM_COL, grav: 3, drag: 0.8, floor: WATER_Y + 0.08 });
    }
  }
  const FIRE_COLS = [0x2f7bff, 0xf7c600, 0xe0203a, 0x3fd06a, 0xffffff, 0xff7ad9];
  function launchRocket() {
    const x = rr(-60, 320), z = rr(-220, -110), top = rr(55, 85), col = new THREE.Color(rpick(FIRE_COLS));
    fireFx.spawn({ x, y: 2, z, vx: rr(-1, 1), vy: top / 1.4, vz: rr(-1, 1), life: 1.4, size: [0.9, 0.5], alpha: 1, color: 0xffe0a0, drag: 0.7 });
    bursts.push({ t: 1.4, fn: () => {
      for (let i = 0; i < 90; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), s = rr(11, 15);
        fireFx.spawn({ x, y: top, z, vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s, life: rr(1.8, 2.6), size: [3.6, 1.0], alpha: 1, c: col, grav: 3.5, drag: 0.9 });
      }
      if (audio && !muted) { const ps = placeSound(x, z, 2500); noiseBurst(audio.ctx.currentTime + ps.d / 340, 1.1, 0.5 * Math.max(0.15, ps.level), 'lowpass', 320, 0.7, ps.pan, 0.003); }
    } });
  }
  function collectHorse(h) {
    h.found = true; h.g.visible = false;
    horsesFound.add(h.name);
    try { localStorage.setItem(HORSE_KEY, JSON.stringify([...horsesFound])); } catch (e) { /* not saved, still counted */ }
    const n = horsesFound.size;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU, s = rr(2, 5);
      sparkFx.spawn({ x: h.x, y: 1.2, z: h.z, vx: Math.cos(a) * s, vy: rr(2, 6), vz: Math.sin(a) * s, life: rr(0.5, 0.9), size: [0.14, 0.04], alpha: 1, color: rpick([0xf2c200, 0xc8102e, 0xffffff]), grav: 9, drag: 1 });
    }
    beep([784, 988, 1319], 0.035, 0.32);
    if (n >= HORSES.length) {
      goldCars = true; fireworksT = 60;
      toast('Alla ' + HORSES.length + ' dalahästar hittade! Fyrverkeri över Strömmen, och nu finns alla bilar i guld (tryck B).');
    } else toast('Dalahäst ' + n + ' av ' + HORSES.length + ': ' + h.name + '. ' + h.fact + ' Hittelön 50 kr.');
    // a finder's fee for every one
    JOBS.reward(50);
  }
  function updateSurprises(dt) {
    const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z, reach = driving ? 3.4 : 1.7;
    for (const h of horses) {
      if (h.found) continue;
      const d = Math.hypot(h.x - px, h.z - pz);
      if (d > 220) continue;
      h.mesh.rotation.y = clock * 1.1 + h.ph;
      h.mesh.position.y = 0.25 + Math.sin(clock * 2.2 + h.ph) * 0.18;
      if (d < reach && (driving || player.y < 2.5) && !(policeStop && policeStop.riding)) collectHorse(h);
    }
    if (fireworksT > 0) {
      fireworksT = Math.max(0, fireworksT - dt);
      if ((rocketT -= dt) <= 0) { launchRocket(); rocketT = rr(0.25, 0.9); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) if ((bursts[i].t -= dt) <= 0) { bursts[i].fn(); bursts.splice(i, 1); }
  }

  /* ================= jobs and street races ================= */
  // J starts a job in the car you drive: fares in the taxi, parcels in the Sprinter, a route in the SL bus. At the
  // yellow pillars of light around town J starts a street race against the clock. A pillar of light marks where to go
  // and a GPS line on both maps shows the way along the streets. What you earn goes in the Kassa, kept between visits.
  const JOBS = (() => {
    // you start with some pocket money, enough for an ice cream and a balloon
    const CASH_KEY = 'gubbe-kassa', RACE_KEY = 'gubbe-gatlopp', POCKET_MONEY = 100;
    let earned = POCKET_MONEY, records = {};
    try { const kept = localStorage.getItem(CASH_KEY); earned = kept === null ? POCKET_MONEY : Math.max(0, +kept || 0); records = JSON.parse(localStorage.getItem(RACE_KEY) || '{}') || {}; } catch (e) { /* a private window: kept for this visit only */ }
    const save = () => { try { localStorage.setItem(CASH_KEY, String(earned)); localStorage.setItem(RACE_KEY, JSON.stringify(records)); } catch (e) { /* counted anyway */ } };
    const fmtTime = (t) => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0').replace('.', ',');
    const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km');
    // places a fare can ask for, in the real spots
    const PLACES = [
      ['Stadshuset', -1000, -100], ['Centralstationen', -610, -490], ['Kungliga Operan', -56, -320], ['Grand Hôtel', 200, -295], ['Nationalmuseum', 335, -305],
      ['Östermalmstorg', 387, -903], ['Stureplan', 130, -968], ['Hötorget', -455, -890], ['Sergels torg', -254, -606], ['Kungliga biblioteket', 155, -1110],
      ['Vasamuseet', 1029, -265], ['Moderna museet', 600, 135], ['Slussen', 40, 700], ['Medborgarplatsen', 152, 1422], ['Mariatorget', -500, 1080],
      ['Katarina kyrka', 240, 1262], ['Nytorget', 680, 1263], ['Rådhuset', -1067, -600], ['Polishuset', -1315, -604], ['Riddarholmskyrkan', -435, 125],
      ['Kungsträdgården', 29, -500], ['Strandvägen', 700, -620], ['Djurgården', 1200, -100], ['Fridhemsplan', -1500, -640],
      ['Mosebacke torg', 210, 822], ['Skeppsbron', 225, 160], ['Kungsholms strand', -930, -700], ['Hornstull', -950, 1250], ['Tegnérlunden', -816, -1192],
      ['Gröna Lund', 1330, 410], ['Skansen', 1560, 0], ['Kaknästornet', 2600, -1000], ['Globen', 420, 2520], ['Tele2 Arena', 640, 2525], ['Stadion', 420, -1690],
      ['Karlaplan', 1100, -1205], ['Sankt Eriksplan', -1560, -1440], ['Norrtull', -870, -2060], ['Roslagstull', -8, -1700], ['Rålambshovsparken', -1880, -100],
      ['Långholmen', -1440, 640], ['Hammarby sjöstad', 1000, 2195], ['Liljeholmen', -1300, 2200], ['Rosendals slott', 2200, -300], ['Danvikstull', 1900, 1250],
      ['Skanstull', 125, 1955], ['Odenplan', -795, -1425], ['KTH', 195, -1690], ['DN-skrapan', -2212, -440]
    ];
    const SAYS = ['Hej! Till {p}, tack.', 'Till {p}, och gärna lite fort, jag är sen!', 'Kan du köra mig till {p}?', '{p}, tack. Ta det lugnt i kurvorna.', 'Hej hej! {p} blir bra.'];
    // the moped's food runs: from a restaurant to someone's door
    const RESTAURANTS = ['Pizzeria Napoli', 'Sushibaren', 'Thaiköket', 'Burgerbaren', 'Falafelkungen', 'Pastabaren', 'Dumplinghuset', 'Kebabhuset', 'Tacobaren', 'Ramen-baren', 'Indiska köket', 'Pokébaren'];
    // the boat taxi's piers, the quays where the boats lie moored round town
    const PIER_SPOTS = [['Skeppsbron', ...LOT.at(66, 34)], ['Strandvägen', 735, -606], ['Gröna Lund', 1480, 650], ['Hammarby sjöstad', 600, 1965], ['Norr Mälarstrand', -1250, -45],
      ['Långholmen', -1560, 695], ['Marieberg', -2300, -95], ['Nacka strand', 2600, 1120], ['Lilla Värtan', 3000, -1300], ['Hammarby kaj', 400, 1972]];
    // the scrapyard in Hammarby hamn, where cars taken off the street are bought (not the ones you choose with B)
    const SCRAP = (() => { const k = kerbNear(1000, 2195); return { x: k.x, z: k.z, k, name: 'Bilskroten i Hammarby hamn' }; })();
    // the street races: a route of named junctions; every junction after the start is a checkpoint
    const RACES = [
      { id: 'gamla', name: 'Gamla stan runt', route: 'SK1 SK2 SK3 SK4 SL0 KH MB3 MB2 MB1 RT gRHN MT LB SBs SK1' },
      { id: 'djurgarden', name: 'Strandvägen–Djurgården', route: 'NP SV1 SV2 SV3 SV4 DJ0 DJ1 DJ2 DJ3' },
      { id: 'soder', name: 'Söder runt', route: 'SMT GG1 GG2 GG3 GG4 MP GG5 OG3 RG3 RG2 RG1 RG0 KV2 KV1 SL1' },
      { id: 'city', name: 'Cityslingan', route: 'TB V2 V3 V4 V5 D5 S2 R4 SP BJs BJr NP NT KT2 KT1 KT0 OP GA D0 TB' }
    ].map((r) => ({ ...r, pts: r.route.split(' ').map((id) => { const n = nodes[nodeIndex.get(id)]; return { x: n.x, z: n.z }; }) }));

    /* pillars of light: where to go (gold), the checkpoint after it (orange), and the race starts (yellow) */
    const beamTex = canvasTex(4, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    function beam(color, r, h) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      b.position.y = h / 2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.5, r * 1.85, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
      g.add(b, ring); g.visible = false; scene.add(g);
      return g;
    }
    const goalBeam = beam(0xffc21a, 1.7, 70), nextBeam = beam(0xff7a1a, 1.3, 45);
    const startBeams = RACES.map((r) => { const b = beam(0xffe14a, 2.3, 90); b.position.set(r.pts[0].x, 0, r.pts[0].z); b.visible = true; return b; });
    // parcels waiting at the kerb, and bus stop poles with the SL sign
    const parcelGeo = (() => { const m = new Merger(); m.box(0.6, 0.45, 0.5, 0xa77c4f, 0, 0.225, 0); m.box(0.5, 0.4, 0.45, 0xb98d5c, 0.1, 0.65, 0.05); m.box(0.4, 0.3, 0.4, 0x9c7147, -0.05, 1.0, 0); m.box(0.62, 0.04, 0.06, 0xd8c9a0, 0, 0.46, 0); return m.build(); })();
    const parcels = new THREE.Mesh(parcelGeo, personMat); parcels.visible = false; parcels.castShadow = true; scene.add(parcels);
    // a paper bag of takeaway on a crate by the kerb
    const bagGeo = (() => { const m = new Merger(); m.box(0.5, 0.42, 0.4, 0x6b5a45, 0, 0.21, 0); m.box(0.32, 0.38, 0.2, 0xc9a36a, 0, 0.61, 0); m.box(0.33, 0.08, 0.21, 0xc8102e, 0, 0.66, 0); m.box(0.2, 0.06, 0.02, 0xc9a36a, 0, 0.84, 0); return m.build(); })();
    const bag = new THREE.Mesh(bagGeo, personMat); bag.visible = false; bag.castShadow = true; scene.add(bag);
    const scrapBeam = beam(0x4cc26a, 2.6, 60);
    scrapBeam.position.set(SCRAP.x, 0, SCRAP.z); scrapBeam.visible = true;
    const slTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#1f5fae'; roundRect(g, 8, 8, w - 16, w - 16, 14); g.fill();
      g.fillStyle = '#ffffff'; g.font = '900 64px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SL', w / 2, w / 2 + 4);
    });
    const stopGeo = (() => { const m = new Merger(); m.add(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 8), 0x5d646a, 0, 1.45, 0); m.box(0.5, 0.06, 0.06, 0x5d646a, 0, 2.6, 0); return m.build(); })();
    const stopSignMat = std({ map: slTex, roughness: 0.4, emissive: 0x222222, emissiveMap: slTex });
    const stopSignGeo = new THREE.PlaneGeometry(0.55, 0.55);
    const stopMeshes = [];
    function busStop(k) {
      const g = new THREE.Group(), pole = new THREE.Mesh(stopGeo, std({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
      const s1 = new THREE.Mesh(stopSignGeo, stopSignMat), s2 = new THREE.Mesh(stopSignGeo, stopSignMat);
      s1.position.set(0, 2.62, 0.04); s2.position.set(0, 2.62, -0.04); s2.rotation.y = Math.PI;
      g.add(pole, s1, s2); g.position.set(k.walkX, 0, k.walkZ); g.rotation.y = k.h + Math.PI / 2;
      scene.add(g); stopMeshes.push(g);
      return g;
    }

    /* where to stop: the kerb of a street, on one side or the other, and the pavement beside it */
    function kerbOn(e, t, side) {
      const A = nodes[e.a], B = nodes[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len;
      const s = clamp(t * e.len, Math.min(e.len / 2, A.r + 7), Math.max(e.len / 2, e.len - B.r - 7)), lat = side * Math.max(1.6, e.hw - 1.3), walk = side * (e.hw + Math.max(0.9, Math.min(2.2, e.walk * 0.55)));
      return { x: A.x + ux * s - uz * lat, z: A.z + uz * s + ux * lat, walkX: A.x + ux * s - uz * walk, walkZ: A.z + uz * s + ux * walk, h: Math.atan2(ux * side, uz * side), e };
    }
    function kerbNear(x, z) {
      const ne = nearestEdge(x, z, (e) => e.drive && !e.bridge && e.len > 25), e = ne.e, A = nodes[e.a], B = nodes[e.b];
      const t = ((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / (e.len * e.len), side = (x - A.x) * -(B.z - A.z) + (z - A.z) * (B.x - A.x) >= 0 ? 1 : -1;
      return kerbOn(e, t, side);
    }
    // only streets that run through the ring between dmin and dmax are tried (picking from the whole map, most tries
    // would land too far away); if none of them has a free kerb, the ring is widened
    function randomKerb(cx, cz, dmin, dmax) {
      for (let wide = 1; wide <= 2; wide++) {
        const lo = dmin / wide, hi = dmax * wide;
        const pool = edges.filter((e) => {
          if (!e.drive || e.bridge || e.len <= 35 || e.hw < 4.5) return false;
          const A = nodes[e.a], B = nodes[e.b], d = Math.hypot((A.x + B.x) / 2 - cx, (A.z + B.z) / 2 - cz);
          return d > lo - e.len / 2 && d < hi + e.len / 2;
        });
        if (!pool.length) continue;
        for (let i = 0; i < 80; i++) {
          const e = rpick(pool), k = kerbOn(e, 0.25 + Math.random() * 0.5, Math.random() < 0.5 ? 1 : -1), d = Math.hypot(k.x - cx, k.z - cz);
          if (d < lo || d > hi || !personFits(k.walkX, k.walkZ) || blockedAt(k.walkX, k.walkZ, 0.5)) continue;
          return k;
        }
      }
      return null;
    }

    /* the way there along the streets, for the maps */
    let route = null, routeT = 0;
    const driveNode = (x, z) => { let b = 0, bd = Infinity; nodes.forEach((n, i) => { if (!n.nb.length) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = i; } }); return b; };
    function routeTo(x0, z0, x1, z1) {
      const goal = driveNode(x1, z1), D = distTo(goal, false);
      let n = driveNode(x0, z0);
      const path = [[x0, z0], [nodes[n].x, nodes[n].z]];
      for (let k = 0; k < 500 && n !== goal; k++) {
        let best = -1, bv = D[n];
        for (const m of nodes[n].nb) if (D[m] < bv) { bv = D[m]; best = m; }
        if (best < 0) break;
        n = best; path.push([nodes[n].x, nodes[n].z]);
      }
      path.push([x1, z1]);
      return path;
    }
    const routeLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };

    /* the job */
    let job = null, nearRace = null, bigT = 0;
    const hinted = {};
    const el2 = { job: $('job'), icon: $('jobIcon'), title: $('jobTitle'), hint: $('jobHint'), clock: $('jobClock'), big: $('bigText'), cash: $('cash'), cashTag: $('cashTag') };
    function big(text, sub, t = 2.2) { el2.big.textContent = text; if (sub) { const s = document.createElement('small'); s.textContent = sub; el2.big.append(s); } el2.big.hidden = false; bigT = t; }
    function pay(kr, why) { earned += kr; save(); beep([660, 880, 1320], 0.03, 0.3); toast(why + ' +' + fmtKr(kr)); }
    const speed = () => (driving ? Math.hypot(driving.vx, driving.vz) : 0);
    const kindOf = (c) => (!c ? null : c.M.shape.taxi ? 'taxi' : c.M.id === 'skapbil' ? 'paket' : c.M.bus ? 'buss' : c.M.moped ? 'mat'
      : c.M.police && !c.M.boat ? 'polis' : c.M.boat === 'console' || c.M.boat === 'riva' ? 'battaxi' : null);
    function target() { return !job ? null : job.kind === 'race' ? job.race.pts[job.i] : job.goal; }
    function setGoal(k, name) { job.goal = { x: k.x, z: k.z, name, k }; route = routeTo(driving ? driving.x : player.x, driving ? driving.z : player.z, k.x, k.z); routeT = 1.5; }
    function cleanup() {
      goalBeam.visible = nextBeam.visible = false; parcels.visible = false; bag.visible = false; route = null;
      // a robber still out there drives on as ordinary traffic
      if (job && job.robber && cars.includes(job.robber)) { const r = job.robber; r.getaway = false; r.keep = false; if (r.bot) r.bot.cruise = 14; }
      if (job && job.npcs) for (const p of job.npcs) { if (persons.includes(p)) { p.keep = false; p.ai = { state: 'wander', wx: Math.random() - 0.5, wz: Math.random() - 0.5, t: 15, dodgeT: 0 }; } }
      if (job && job.rider && job.car && job.car.rearSeat) job.car.rearSeat.visible = false;
      while (stopMeshes.length) scene.remove(stopMeshes.pop());
    }
    function end(msg) { cleanup(); job = null; if (msg) toast(msg); }

    // a fare: someone waiting on the pavement of a street a little way off
    function newFare() {
      const k = randomKerb(driving.x, driving.z, 110, 450);
      if (!k) { end('Inga kunder här just nu.'); return; }
      const p = makePerson(makeIdentity(), k.walkX, k.walkZ, { state: 'idle', face: k.h - Math.PI / 2, dodgeT: 0 });
      p.keep = true; p.rot = k.h - Math.PI / 2;
      Object.assign(job, { phase: 'find', npcs: [p], who: p, t: 0 });
      setGoal(k, 'Kund på ' + k.e.name);
      toast('En kund väntar på ' + k.e.name + '. Kör dit och stanna vid trottoaren.');
    }
    function newParcel() {
      const k = randomKerb(driving.x, driving.z, 120, 500);
      if (!k) { end('Inga paket att hämta här just nu.'); return; }
      parcels.position.set(k.walkX, 0, k.walkZ); parcels.rotation.y = k.h; parcels.visible = true;
      Object.assign(job, { phase: 'find', t: 0 });
      setGoal(k, 'Paket på ' + k.e.name);
      toast('Hämta paketen på ' + k.e.name + '.');
    }
    function newRoute() {
      // a run of stops along the streets ahead, about 250 m apart
      const stops = [];
      let e0 = nearestEdge(driving.x, driving.z, (e) => e.drive).e, from = Math.hypot(nodes[e0.a].x - driving.x, nodes[e0.a].z - driving.z) < Math.hypot(nodes[e0.b].x - driving.x, nodes[e0.b].z - driving.z) ? e0.a : e0.b;
      let at = from === e0.a ? e0.b : e0.a, run = 0, prev = from;
      for (let k = 0; k < 120 && stops.length < 6; k++) {
        const opts = nodes[at].nb.filter((n) => n !== prev);
        if (!opts.length) break;
        const nx = rpick(opts), e = edgeBetween(at, nx) || edgeToward(at, nx);
        run += e ? e.len : 50;
        if (e && run > 230 && e.len > 40 && !e.bridge && e.hw >= 4.5) {
          const side = e.a === at ? 1 : -1, ks = kerbOn(e, e.a === at ? 0.6 : 0.4, side);
          if (personFits(ks.walkX, ks.walkZ) && !blockedAt(ks.walkX, ks.walkZ, 0.5)) { stops.push(ks); run = 0; }
        }
        prev = at; at = nx;
      }
      if (stops.length < 2) { end('Ingen busslinje gick att lägga härifrån. Kör ut på en större gata och försök igen.'); return; }
      job.stops = stops; job.si = 0; job.npcs = []; job.waiting = [];
      stops.forEach((k, i) => {
        busStop(k);
        const n = 1 + Math.floor(Math.random() * 4), list = [];
        for (let j = 0; j < n; j++) {
          const p = makePerson(makeIdentity(), k.walkX + (Math.random() - 0.5) * 2.4, k.walkZ + (Math.random() - 0.5) * 1.2, { state: 'idle', face: k.h - Math.PI / 2, dodgeT: 0 });
          p.keep = true; job.npcs.push(p); list.push(p);
        }
        job.waiting.push(list);
      });
      job.phase = 'drive';
      setGoal(stops[0], 'Hållplats 1 av ' + stops.length);
      toast('Busslinje med ' + stops.length + ' hållplatser. Stanna vid varje så kliver resenärerna på.');
    }
    // food on the moped: pick it up at a restaurant, take it to someone's door while it's hot
    function newFood() {
      const k = randomKerb(driving.x, driving.z, 80, 350);
      if (!k) { end('Ingen restaurang har något att köra ut just nu.'); return; }
      bag.position.set(k.walkX, 0, k.walkZ); bag.rotation.y = k.h; bag.visible = true;
      Object.assign(job, { phase: 'find', t: 0, place: rpick(RESTAURANTS) });
      setGoal(k, job.place + ', ' + k.e.name);
      toast('Maten är klar på ' + job.place + ' på ' + k.e.name + '. Hämta den!');
    }
    // the police car's job: a robber getting away in a fast car somewhere near. Catch them: stop their car, or wreck it
    function newRobber() {
      const c = spawnBot(170, rpick(SPORTS.filter((M) => !M.police)), 420);
      if (!c) { end('Inga larm just nu. Försök igen om en stund.'); return; }
      c.keep = true; c.getaway = true; c.bot.cruise = 24; c.bot.turnV = 9;
      Object.assign(job, { phase: 'chase', t: 0, robber: c, par: 150, heldT: 0, fleeT: 0 });
      job.goal = { x: c.x, z: c.z, name: c.M.name };
      toast('Larm! En rånare flyr i ' + c.M.def + '. Kör ikapp och stoppa bilen. L slår på blåljuset.');
    }
    // the boat taxi: someone waiting on a pier, wanting to go to another one
    let piers = null;
    function pierList() {
      if (piers) return piers;
      piers = PIER_SPOTS.map(([name, x, z]) => {
        const b = findBerth(MODEL.anytec, x, z, 60);
        if (!b) return null;
        // where the passenger waits: the nearest bit of quay to the berth
        let best = null, bd = Infinity;
        for (let r = 2; r <= 16 && !best; r += 2) for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU, px = b.x + Math.sin(a) * r, pz = b.z + Math.cos(a) * r;
          if (personFits(px, pz) && !blockedAt(px, pz, 0.4) && Math.hypot(px - b.x, pz - b.z) < bd) { bd = Math.hypot(px - b.x, pz - b.z); best = { x: px, z: pz }; }
        }
        return best ? { name, x: b.x, z: b.z, walk: best } : null;
      }).filter(Boolean);
      return piers;
    }
    function newBoatFare() {
      const c = driving, list = pierList().filter((p) => { const d = Math.hypot(p.x - c.x, p.z - c.z); return d > 200 && d < 2200; });
      if (!list.length) { end('Inga resenärer väntar just nu.'); return; }
      const pier = rpick(list), w = pier.walk;
      const p = makePerson(makeIdentity(), w.x, w.z, { state: 'idle', face: Math.atan2(pier.x - w.x, pier.z - w.z), dodgeT: 0 });
      p.keep = true; p.rot = Math.atan2(pier.x - w.x, pier.z - w.z);
      Object.assign(job, { phase: 'find', npcs: [p], who: p, t: 0, pier, bt: 0 });
      job.goal = { x: pier.x, z: pier.z, name: pier.name }; route = null;
      toast('En resenär väntar på bryggan vid ' + pier.name + '. Lägg till där.');
    }
    function start(kind) {
      job = { kind, car: driving, t: 0, done: 0, offT: 0 };
      if (kind === 'taxi') newFare(); else if (kind === 'paket') newParcel(); else if (kind === 'mat') newFood();
      else if (kind === 'polis') newRobber(); else if (kind === 'battaxi') newBoatFare(); else newRoute();
    }
    // the scrapyard's price: a sports car is worth a lot, a dented one less
    function priceOf(c) {
      const M = c.M, base = M.moped ? 150 : M.sport ? 900 + M.max * 14 : 250 + M.max * 5;
      return Math.round((base * (M.classic ? 1.4 : 1) * clamp(c.health / 100, 0.2, 1)) / 10) * 10;
    }
    let nearScrap = false;
    function sell() {
      const c = driving, M = c.M;
      if (c === spawnedCar) { toast('Bilen du valde med B kan du inte sälja. Ta en bil ute i trafiken och kom tillbaka med den.'); return; }
      if (M.police || M.mil) { toast('Bilskroten: Den köper vi inte! Ska vi åka fast allihop?'); return; }
      if (M.bus) { toast('Bilskroten: En SL-buss? Nej tack, den vill SL ha tillbaka.'); return; }
      if (Math.hypot(c.vx, c.vz) > 1.3) { toast('Stanna bilen först.'); return; }
      const kr = priceOf(c);
      if (!exitCar()) return;
      removeCar(c);
      pay(kr, 'Bilskroten köpte ' + M.def + '.');
    }
    function startRace(r) {
      job = { kind: 'race', race: r, car: driving, i: 1, t: -3.5, offT: 0 };
      goalBeam.visible = true;
      route = null;
      big('3', r.name);
    }
    // J
    function key() {
      if (policeStop && policeStop.locked) return;
      if (job) { end(job.kind === 'race' ? 'Gatloppet avbrutet.' : 'Du slutade jobba.'); return; }
      if (!driving) { toast('Jobben görs med fordon: taxin, Sprintern, bussen, mopeden, polisbilen och motorbåtarna. Gatloppen startar vid de gula ljuspelarna, och bilar säljer du på bilskroten i Hammarby hamn.'); return; }
      if (nearScrap) { sell(); return; }
      if (nearRace) { startRace(nearRace); return; }
      const kind = kindOf(driving);
      if (kind) start(kind);
      else toast('Med ' + driving.M.def + ' kan du köra gatlopp vid de gula ljuspelarna, eller sälja den på bilskroten i Hammarby hamn. Taxin, Sprintern, bussen, mopeden, polisbilen och motorbåtarna har egna jobb.');
    }

    function update(dt) {
      if (bigT > 0 && (bigT -= dt) <= 0) el2.big.hidden = true;
      // near a race start in a car, with nothing else on: say so once
      nearRace = null;
      if (driving && !job) for (const r of RACES) if (Math.hypot(r.pts[0].x - driving.x, r.pts[0].z - driving.z) < 11) nearRace = r;
      if (nearRace && nearRace !== update.lastNear) toast('Gatlopp: ' + nearRace.name + (records[nearRace.id] ? ', rekord ' + fmtTime(records[nearRace.id]) : '') + '. Tryck J för att starta.');
      update.lastNear = nearRace;
      for (const b of startBeams) b.visible = !job || job.kind !== 'race';
      // pulled in at the scrapyard: what they would give for this one
      nearScrap = !!driving && !job && !driving.M.boat && Math.hypot(SCRAP.x - driving.x, SCRAP.z - driving.z) < 12;
      if (nearScrap && !update.atScrap) toast(driving === spawnedCar || driving.M.police || driving.M.mil || driving.M.bus ? 'Bilskroten: Den här köper vi inte.' : 'Bilskroten: Vi ger ' + fmtKr(priceOf(driving)) + ' för ' + driving.M.def + '. Stanna och tryck J för att sälja.');
      update.atScrap = nearScrap;
      if (!job) return;
      job.t += dt;
      // the car is gone, wrecked or left behind, or you were arrested
      if (policeStop && policeStop.locked) { end('Uppdraget avbröts, du är gripen.'); return; }
      if (!cars.includes(job.car) || job.car.dead) { end('Bilen är förstörd. Uppdraget är slut.'); return; }
      job.offT = driving === job.car ? 0 : job.offT + dt;
      if (job.offT > (job.kind === 'race' ? 3 : 25)) { end(job.kind === 'race' ? 'Du klev ur bilen. Gatloppet är slut.' : 'Du lämnade bilen. Uppdraget är slut.'); return; }
      const T = target();
      if (T) {
        goalBeam.position.set(T.x, 0, T.z); goalBeam.visible = true;
        goalBeam.children[1].scale.setScalar(1 + 0.06 * Math.sin(clock * 5));
      }
      if (job.kind !== 'race' && job.kind !== 'battaxi' && (routeT -= dt) <= 0 && T && driving) { route = routeTo(driving.x, driving.z, T.x, T.z); routeT = 1.5; }
      const c = job.car, d = T ? Math.hypot(T.x - c.x, T.z - c.z) : Infinity, still = speed() < 1.3 && driving === c;
      if (job.kind === 'race') {
        const R = job.race;
        if (job.t < 0) {
          // countdown: the car is held on the line
          c.vx = c.vz = 0;
          const n = Math.ceil(-job.t);
          if (n !== job.shown) { job.shown = n; if (n <= 3) { big(String(n), R.name, 1.1); beep([440], 0.04, 0.25); } }
          return;
        }
        if (job.shown !== 0) { job.shown = 0; big('KÖR!', null, 1); beep([880], 0.05, 0.4); }
        const nx = R.pts[job.i + 1];
        nextBeam.visible = !!nx; if (nx) nextBeam.position.set(nx.x, 0, nx.z);
        if (d < 13) {
          job.i++;
          if (job.i >= R.pts.length) {
            const t = job.t, rec = records[R.id], best = !rec || t < rec;
            if (best) records[R.id] = t;
            save();
            big('MÅL! ' + fmtTime(t), best ? (rec ? 'Nytt rekord! Förra: ' + fmtTime(rec) : 'Första rekordet på ' + R.name) : 'Rekord: ' + fmtTime(rec), 4);
            pay(best ? 600 : 250, R.name + ' klart.');
            end();
            return;
          }
          beep([988, 1319], 0.03, 0.18);
        }
        return;
      }
      if (job.kind === 'taxi') {
        if (job.phase === 'find') {
          if (d < 10 && still) {
            const p = job.who;
            p.ai = { state: 'board', car: c, dodgeT: 0 };
            job.phase = 'board'; job.bt = 0;
          }
        } else if (job.phase === 'board') {
          const p = job.who;
          job.bt += dt;
          if (!persons.includes(p) || Math.hypot(p.x - c.x, p.z - c.z) < c.M.W / 2 + 1.1 || job.bt > 6) {
            if (persons.includes(p)) removePerson(p);
            job.npcs = []; job.rider = p.id;
            if (c.rearSeat) { c.rearSeat.geometry = p.id.driverGeo; c.rearSeat.visible = true; }
            // where to: somewhere a fair way off
            const here = PLACES.filter(([, x, z]) => { const dd = Math.hypot(x - c.x, z - c.z); return dd > 380 && dd < 1700; });
            const [name, px, pz] = rpick(here.length ? here : PLACES), k = kerbNear(px, pz);
            setGoal(k, name);
            const L = routeLen(route);
            Object.assign(job, { phase: 'ride', t: 0, par: L / 10.5 + 25, len: L, hp: c.health });
            toast('Kunden: ' + rpick(SAYS).replace('{p}', name));
          }
        } else if (job.phase === 'ride' && d < 13 && still) {
          const late = job.t > job.par, dmg = Math.max(0, job.hp - c.health);
          let kr = Math.round((75 + job.len * 0.3) * (job.t < job.par * 0.8 ? 1.3 : late ? 0.75 : 1) - dmg * 4);
          kr = Math.max(20, kr);
          const exit = exitSpot(c) || { x: c.x, z: c.z };
          if (c.rearSeat) c.rearSeat.visible = false;
          const p = makePerson(job.rider, exit.x, exit.z, { state: 'wander', wx: Math.random() - 0.5, wz: Math.random() - 0.5, t: 20, dodgeT: 0 });
          p.rot = c.h; job.rider = null;
          job.done++;
          pay(kr, dmg > 8 ? 'Kunden betalar, men klagar på bucklorna.' : job.t < job.par * 0.8 ? 'Snabbt! Kunden ger dricks.' : late ? 'Kunden betalar, men tyckte det tog för lång tid.' : 'Kunden betalar.');
          newFare();
        }
        return;
      }
      if (job.kind === 'paket') {
        if (job.phase === 'find' && d < 10 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1.2) {
            job.lt = 0; parcels.visible = false;
            const k = randomKerb(c.x, c.z, 300, 1300);
            if (!k) { end('Ingen adress att leverera till härifrån.'); return; }
            const no = 1 + Math.floor(Math.random() * 60);
            setGoal(k, k.e.name + ' ' + no);
            const L = routeLen(route);
            Object.assign(job, { phase: 'deliver', t: 0, par: L / 10 + 30, len: L, hp: c.health });
            toast('Paketen är lastade. Leverera till ' + job.goal.name + '.');
          }
        } else if (job.phase === 'deliver' && d < 13 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1.2) {
            job.lt = 0;
            const dmg = Math.max(0, job.hp - c.health), late = job.t > job.par;
            const kr = Math.max(30, Math.round((110 + job.len * 0.25) * (late ? 0.7 : job.t < job.par * 0.75 ? 1.3 : 1) - dmg * 3));
            job.done++;
            pay(kr, late ? 'Paketen kom fram, men sent.' : 'Paketen levererade.');
            newParcel();
          }
        } else job.lt = 0;
        return;
      }
      if (job.kind === 'mat') {
        if (job.phase === 'find' && d < 9 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1) {
            job.lt = 0; bag.visible = false;
            const k = randomKerb(c.x, c.z, 250, 900);
            if (!k) { end('Ingen adress att köra till härifrån.'); return; }
            setGoal(k, k.e.name + ' ' + (1 + Math.floor(Math.random() * 60)));
            const L = routeLen(route);
            Object.assign(job, { phase: 'deliver', t: 0, par: L / 9 + 25, len: L });
            toast('Maten är i boxen. Kör den till ' + job.goal.name + ' medan den är varm!');
          }
        } else if (job.phase === 'deliver' && d < 11 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1) {
            job.lt = 0;
            const late = job.t > job.par, quick = job.t < job.par * 0.75;
            const kr = Math.max(25, Math.round((60 + job.len * 0.22) * (late ? 0.7 : quick ? 1.35 : 1)));
            job.done++;
            pay(kr, late ? 'Maten kom fram, men den hann kallna.' : quick ? 'Varm och god! Kunden ger dricks.' : 'Maten är levererad.');
            newFood();
          }
        } else job.lt = 0;
        return;
      }
      if (job.kind === 'polis') {
        const r = job.robber;
        if (!r || !cars.includes(r)) { end('Rånaren kom undan.'); return; }
        job.goal = { x: r.x, z: r.z, name: r.M.name };
        // the robber runs from you: now and then a new place to get to, well away from you
        if (r.bot && (job.fleeT -= dt) <= 0) {
          job.fleeT = 3;
          const ax = r.x - c.x, az = r.z - c.z, al = Math.hypot(ax, az) || 1;
          let best = -1, bv = -Infinity;
          for (let i = 0; i < 40; i++) {
            const n = Math.floor(Math.random() * nodes.length), N = nodes[n];
            if (!N.nb.length) continue;
            const dd = Math.hypot(N.x - r.x, N.z - r.z), v = ((N.x - r.x) * ax + (N.z - r.z) * az) / al - Math.abs(dd - 450) * 0.3;
            if (dd > 200 && v > bv) { bv = v; best = n; }
          }
          if (best >= 0) { r.bot.goal = { node: best, x: nodes[best].x, z: nodes[best].z }; if (r.bot.phase === 'edge') r.bot.next = chooseNext(r.bot.from, r.bot.to, r.bot.goal, true); }
        }
        // caught: the getaway car wrecked, or stopped with you right on it
        const rs = Math.hypot(r.vx, r.vz), close = Math.hypot(r.x - c.x, r.z - c.z) < (r.M.L + c.M.L) / 2 + 3;
        job.heldT = rs < 1.5 && close ? job.heldT + dt : 0;
        if (r.dead || job.heldT > 2) {
          const kr = Math.round(300 + Math.max(0, job.par - job.t) * 4);
          const spot = exitSpot(r);
          if (spot && r.occupant) { const p = makePerson(r.occupant, spot.x, spot.z, { state: 'idle', face: r.h, dodgeT: 0 }); p.cuffed = true; p.rot = r.h; }
          setOccupant(r, null); r.bot = null; r.getaway = false; r.keep = false; job.robber = null;
          job.done++;
          pay(kr, 'Rånaren är gripen!');
          end();
          return;
        }
        if (job.t > job.par || Math.hypot(r.x - c.x, r.z - c.z) > 700) { end('Rånaren kom undan.'); return; }
        return;
      }
      if (job.kind === 'battaxi') {
        const P = job.pier;
        if (job.phase === 'find') {
          if (d < 16 && still) {
            job.bt += dt;
            const p = job.who;
            if (persons.includes(p)) { p.ai = { state: 'board', car: c, dodgeT: 0 }; }
            if (job.bt > 1.5 || !persons.includes(p) || Math.hypot(p.x - c.x, p.z - c.z) < c.M.W / 2 + 1.5) {
              if (persons.includes(p)) removePerson(p);
              job.npcs = []; job.rider = p.id;
              const list = pierList().filter((q) => q !== P && Math.hypot(q.x - c.x, q.z - c.z) > 450);
              if (!list.length) { end('Ingen brygga att åka till härifrån.'); return; }
              const to = rpick(list), L = Math.hypot(to.x - c.x, to.z - c.z) * 1.35;
              Object.assign(job, { phase: 'ride', t: 0, pier: to, par: L / 12 + 30, len: L, hp: c.health });
              job.goal = { x: to.x, z: to.z, name: to.name };
              toast('Resenären: Till ' + to.name + ', tack!');
            }
          } else job.bt = 0;
        } else if (job.phase === 'ride' && d < 16 && still) {
          const late = job.t > job.par, dmg = Math.max(0, job.hp - c.health);
          const kr = Math.max(40, Math.round((140 + job.len * 0.3) * (job.t < job.par * 0.8 ? 1.3 : late ? 0.75 : 1) - dmg * 4));
          const w = P.walk, p = makePerson(job.rider, w.x, w.z, { state: 'wander', wx: Math.random() - 0.5, wz: Math.random() - 0.5, t: 20, dodgeT: 0 });
          p.rot = c.h; job.rider = null;
          job.done++;
          pay(kr, late ? 'Resenären betalar, men tyckte det tog lång tid.' : job.t < job.par * 0.8 ? 'Snabbt! Resenären ger dricks.' : 'Resenären betalar.');
          newBoatFare();
        }
        return;
      }
      if (job.kind === 'buss') {
        if (d < 12 && still) {
          job.lt = (job.lt || 0) + dt;
          const list = job.waiting[job.si];
          // they walk up to the door and get on, one by one
          for (const p of list) if (persons.includes(p) && p.ai.state === 'idle') p.ai = { state: 'board', car: c, dodgeT: 0 };
          for (const p of list) if (persons.includes(p) && (Math.hypot(p.x - c.x, p.z - c.z) < c.M.W / 2 + 1.2 || job.lt > 5)) removePerson(p);
          if (job.lt > 2.5 && !list.some((p) => persons.includes(p))) {
            job.lt = 0;
            const n = list.length, last = job.si === job.stops.length - 1;
            if (stopMeshes[job.si]) stopMeshes[job.si].visible = false;
            pay(40 + n * 30 + (last ? 250 : 0), last ? 'Slutstation! ' + (job.done + n) + ' resenärer.' : n + (n === 1 ? ' resenär' : ' resenärer') + ' klev på.');
            job.done += n;
            if (last) { end(); return; }
            job.si++;
            setGoal(job.stops[job.si], 'Hållplats ' + (job.si + 1) + ' av ' + job.stops.length);
          }
        } else job.lt = 0;
      }
    }

    // the panel at the top: what to do, how far, the clock
    let lastHud = '';
    function hud() {
      el2.cashTag.hidden = !earned && !job;
      el2.cash.textContent = fmtKr(earned);
      document.body.classList.toggle('job', !!job);
      el2.job.hidden = !job;
      if (!job) { lastHud = ''; return; }
      const T = target(), c = job.car, d = T ? Math.hypot(T.x - c.x, T.z - c.z) : 0;
      let icon, title, hint, clockTxt = '';
      if (job.kind === 'race') {
        icon = '⚑'; title = 'Gatlopp: ' + job.race.name;
        hint = job.t < 0 ? 'Gör dig redo …' : 'Kontroll ' + Math.min(job.i, job.race.pts.length - 1) + ' av ' + (job.race.pts.length - 1) + ' · ' + fmtDist(d) + (records[job.race.id] ? ' · rekord ' + fmtTime(records[job.race.id]) : '');
        clockTxt = job.t < 0 ? '' : fmtTime(job.t);
      } else if (job.kind === 'taxi') {
        icon = 'T'; title = job.phase === 'ride' ? 'Taxi till ' + job.goal.name : 'Taxi: hämta kunden';
        hint = (job.phase === 'board' ? 'Kunden kliver in …' : fmtDist(d) + (job.phase === 'ride' ? ' · stanna vid trottoaren' : ' · ' + job.goal.name)) + ' · ' + job.done + ' körda';
        if (job.phase === 'ride') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'paket') {
        icon = '▣'; title = job.phase === 'deliver' ? 'Leverera till ' + job.goal.name : 'Hämta paketen';
        hint = fmtDist(d) + ' · ' + (job.phase === 'deliver' ? 'stanna vid adressen' : job.goal.name) + ' · ' + job.done + ' levererade';
        if (job.phase === 'deliver') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'mat') {
        icon = 'M'; title = job.phase === 'deliver' ? 'Leverera maten till ' + job.goal.name : 'Hämta maten på ' + job.place;
        hint = fmtDist(d) + ' · ' + (job.phase === 'deliver' ? 'stanna vid adressen' : 'stanna vid restaurangen') + ' · ' + job.done + ' levererade';
        if (job.phase === 'deliver') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'polis') {
        icon = '★'; title = 'Polisuppdrag: stoppa rånaren';
        hint = fmtDist(d) + ' · ' + job.goal.name + ' · kör ikapp och stoppa bilen';
        clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'battaxi') {
        icon = '⚓'; title = job.phase === 'ride' ? 'Båttaxi till ' + job.goal.name : 'Båttaxi: hämta vid ' + job.goal.name;
        hint = fmtDist(d) + ' · lägg till vid bryggan · ' + job.done + ' körda';
        if (job.phase === 'ride') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else {
        icon = 'SL'; title = 'Busslinje: ' + job.goal.name;
        hint = fmtDist(d) + ' · stanna vid hållplatsen · ' + job.done + ' resenärer';
      }
      const key = icon + title + hint + clockTxt;
      if (key === lastHud) return;
      lastHud = key;
      el2.icon.textContent = icon; el2.title.textContent = title; el2.hint.textContent = hint; el2.clock.textContent = clockTxt;
    }

    // on the maps: the GPS line, where to go (an arrow at the edge of the minimap when it is further off) and the races
    function drawMini(g, px, pz, u) {
      const T = target();
      if (route && T) {
        g.strokeStyle = 'rgba(255,194,26,.9)'; g.lineWidth = 4.2 * u; g.lineJoin = g.lineCap = 'round';
        g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke();
      }
      const mark = (x, z, col, r) => {
        const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz), R = 100;
        if (d < R) { g.fillStyle = col; g.strokeStyle = '#ffffff'; g.lineWidth = 2 * u; g.beginPath(); g.arc(x, z, r * u, 0, TAU); g.fill(); g.stroke(); return; }
        const ux = dx / d, uz = dz / d, ex = px + ux * R, ez = pz + uz * R;
        g.fillStyle = col; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * u;
        g.beginPath(); g.moveTo(ex + ux * 9 * u, ez + uz * 9 * u); g.lineTo(ex - uz * 6 * u, ez + ux * 6 * u); g.lineTo(ex + uz * 6 * u, ez - ux * 6 * u); g.closePath(); g.fill(); g.stroke();
      };
      if (!job || job.kind !== 'race') for (const r of RACES) if (Math.hypot(r.pts[0].x - px, r.pts[0].z - pz) < 105) mark(r.pts[0].x, r.pts[0].z, '#ffe14a', 4.5);
      if (Math.hypot(SCRAP.x - px, SCRAP.z - pz) < 105) mark(SCRAP.x, SCRAP.z, '#4cc26a', 5);
      if (T) mark(T.x, T.z, job.kind === 'race' ? '#ff7a1a' : '#ffc21a', 6);
    }
    function drawBig(g, toX, toY, k) {
      if (route && target()) {
        g.strokeStyle = 'rgba(240,160,0,.9)'; g.lineWidth = Math.max(3, 5 * k); g.lineJoin = g.lineCap = 'round';
        g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(toX(x), toY(z)) : g.moveTo(toX(x), toY(z)))); g.stroke();
      }
      if (job && job.kind === 'race') {
        g.strokeStyle = 'rgba(255,122,26,.75)'; g.lineWidth = 3; g.setLineDash([6, 5]);
        g.beginPath(); job.race.pts.forEach((p, i) => (i ? g.lineTo(toX(p.x), toY(p.z)) : g.moveTo(toX(p.x), toY(p.z)))); g.stroke(); g.setLineDash([]);
      }
      for (const r of RACES) {
        const X = toX(r.pts[0].x), Y = toY(r.pts[0].z);
        g.fillStyle = '#ffe14a'; g.strokeStyle = '#1b1c1e'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(X, Y + 7); g.lineTo(X, Y - 11); g.lineTo(X + 11, Y - 7); g.lineTo(X, Y - 3); g.stroke(); g.fill();
        if (k > 0.3) { g.font = '800 11px Overpass, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(r.name, X + 13, Y - 6); g.fillStyle = '#7a5600'; g.fillText(r.name, X + 13, Y - 6); }
      }
      {
        // the scrapyard: a green square with a krona sign
        const X = toX(SCRAP.x), Y = toY(SCRAP.z);
        g.fillStyle = '#4cc26a'; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.fillRect(X - 7, Y - 7, 14, 14); g.strokeRect(X - 7, Y - 7, 14, 14);
        g.fillStyle = '#ffffff'; g.font = '900 10px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('kr', X, Y + 0.5);
        if (k > 0.3) { g.font = '800 11px Overpass, sans-serif'; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText('Bilskroten', X + 11, Y); g.fillStyle = '#1f6b2f'; g.fillText('Bilskroten', X + 11, Y); }
      }
      const T = target();
      if (T) { g.fillStyle = '#ffc21a'; g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.beginPath(); g.arc(toX(T.x), toY(T.z), 7, 0, TAU); g.fill(); g.stroke(); }
    }
    // say what J does the first time you sit in a car that has a job
    function entered(c) {
      const k = kindOf(c);
      if (k && !job && !(hinted[k])) {
        hinted[k] = true;
        setTimeout(() => toast({ taxi: 'Tryck J för att köra taxi.', paket: 'Tryck J för att köra ut paket.', buss: 'Tryck J för att köra en busslinje.', mat: 'Tryck J för att köra ut mat.',
          polis: 'Tryck J för ett polisuppdrag: stoppa en rånare.', battaxi: 'Tryck J för att köra båttaxi mellan bryggorna.' }[k]), 2600);
      }
    }
    return {
      key, update, hud, drawMini, drawBig, entered, RACES, PLACES,
      // paying out of the Kassa: false (and nothing taken) when there is not enough
      spend(kr) { if (earned < kr) return false; earned -= kr; save(); return true; },
      // money from elsewhere (the Dalahästar's finder's fee), without a word of its own
      reward(kr) { earned += kr; save(); },
      SCRAP, priceOf,
      get job() { return job; }, get earned() { return earned; }, get route() { return route; },
      // test hooks: hold the race countdown short, skip to a checkpoint
      _skipCountdown() { if (job && job.kind === 'race') job.t = 0; }
    };
  })();

  /* ================= ice cream kiosks and balloon sellers ================= */
  // A glasskiosk and a balloon seller at the car park where you start, in Kungsträdgården, on Medborgarplatsen and on
  // Djurgården. Walk up and press E to buy with what is in the Kassa. You eat the ice cream as you walk, lick by lick,
  // and the balloons follow you on their strings, out of the car window when you drive. V lets one go, and with
  // balloons in your hand you fall slowly when you jump.
  const VENDORS = (() => {
    const ICE_PRICE = 35, BALLOON_PRICE = 40, MAX_BALLOONS = 6, SELLER_STOCK = 10, BITES = 10;
    const FLAVORS = [['vanilj', 0xf6e7b8], ['choklad', 0x6b3e26], ['jordgubb', 0xf28bb0], ['päron', 0xdfe68f], ['pistage', 0xa9cf8c],
      ['lakrits', 0x2c2a2b], ['mango', 0xffb23f], ['blåbär', 0x6d5bc4], ['hallon', 0xd6336c], ['citron', 0xfff27a]];
    const BALLOONS = [[0xe0203a, 'röd'], [0x2f6fdb, 'blå'], [0xf7c600, 'gul'], [0x2fae5a, 'grön'], [0xff6fb0, 'rosa'], [0x8e44ad, 'lila'], [0xff8a1f, 'orange'], [0x4fc3f7, 'ljusblå']];
    const PINK = 0xe8457a, CREAM = 0xf6f1e8, STEEL = 0xc5c9ce;
    // where they stand: x, z and which way the hatch and the seller face
    const lotFace = Math.atan2(LOT.f.ux, LOT.f.uz);
    const SPOTS = [
      { name: 'Skeppsbron', kiosk: [...LOT.at(4, 27), lotFace], seller: [...LOT.at(9, 20.5), lotFace] },
      { name: 'Kungsträdgården', kiosk: [55, -512.5, 0], seller: [31, -489, 0] },
      { name: 'Medborgarplatsen', kiosk: [190, 1452, Math.PI], seller: [172, 1446, Math.PI] },
      { name: 'Djurgården', kiosk: [1252, -112, -Math.PI / 2], seller: [1247, -100, -Math.PI / 2] }
    ];
    // a point given in a kiosk's own frame (front towards +z) out in the world
    const toWorld = (k, lx, lz) => [k.x + lx * Math.cos(k.face) + lz * Math.sin(k.face), k.z - lx * Math.sin(k.face) + lz * Math.cos(k.face)];
    const toLocal = (k, x, z) => { const dx = x - k.x, dz = z - k.z; return [dx * Math.cos(k.face) - dz * Math.sin(k.face), dx * Math.sin(k.face) + dz * Math.cos(k.face)]; };

    /* textures: the GLASS sign, the waffle of the cones and the chalkboard with the flavours */
    const drawCone = (g, x, y, s) => {
      g.fillStyle = '#d9a35f'; g.beginPath(); g.moveTo(x - s * 0.5, y); g.lineTo(x + s * 0.5, y); g.lineTo(x, y + s * 1.25); g.closePath(); g.fill();
      g.fillStyle = '#f7c8d8'; g.beginPath(); g.arc(x, y - s * 0.12, s * 0.5, 0, TAU); g.fill();
      g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(x, y - s * 0.62, s * 0.4, 0, TAU); g.fill();
    };
    const signTex = canvasTex(512, 112, (g, w, h) => {
      g.fillStyle = '#e8457a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; roundRect(g, 8, 8, w - 16, h - 16, 14); g.stroke();
      g.fillStyle = '#ffffff'; g.font = '900 74px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('G L A S S', w / 2, h / 2 + 5);
      drawCone(g, 58, 44, 34); drawCone(g, w - 58, 44, 34);
    });
    const waffleTex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#d9a35f'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#a8712f'; g.lineWidth = 3;
      for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    }, true);
    waffleTex.repeat.set(5, 2);
    const menuTex = canvasTex(256, 384, (g, w, h) => {
      g.fillStyle = '#7a5230'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#24372c'; g.fillRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 44px Overpass, "Arial Black", Arial, sans-serif'; g.fillText('GLASS', w / 2, 46);
      drawCone(g, 40, 36, 22); drawCone(g, w - 40, 36, 22);
      g.font = '700 22px Overpass, Arial, sans-serif'; g.fillStyle = '#ffe7a3'; g.fillText('Strut, två kulor', w / 2, 96);
      g.font = '900 30px Overpass, Arial, sans-serif'; g.fillText(ICE_PRICE + ' kr', w / 2, 128);
      g.font = '600 20px Overpass, Arial, sans-serif'; g.fillStyle = '#ffffff';
      FLAVORS.forEach(([n, c], i) => {
        const x = i % 2 ? w * 0.7 : w * 0.3, y = 178 + Math.floor(i / 2) * 38;
        g.fillStyle = hex(c); g.beginPath(); g.arc(x - 52, y, 9, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.fillText(n[0].toUpperCase() + n.slice(1), x + 6, y);
      });
    });

    /* an ice cream: a waffle cone with two scoops, in your hand (and the kiosk seller's) */
    const iceCone = new THREE.ConeGeometry(0.06, 0.18, 12, 1, true).rotateX(Math.PI);
    const iceScoop = new THREE.SphereGeometry(0.066, 12, 9);
    function makeIce(cols) {
      const group = new THREE.Group(), cone = new THREE.Mesh(iceCone, waffleMat), s = [];
      cone.position.y = -0.03;
      group.add(cone);
      cols.forEach((c, i) => { const m = new THREE.Mesh(iceScoop, std({ color: c, roughness: 0.5 })); m.position.y = 0.08 + i * 0.085; m.castShadow = true; group.add(m); s.push(m); });
      cone.castShadow = true;
      return { group, cone, scoops: s };
    }
    /* the kiosk: a little white hut with a serving hatch, a striped awning, a big cone on the roof and a menu board */
    const kioskGeo = (() => {
      const B = new Builder();
      B.box(-1.4, 0, -1.2, 1.4, 0.06, 1.2, 0x8a8f94);
      B.box(-1.4, 0.06, -1.2, -1.32, 2.6, 1.2, CREAM); B.box(1.32, 0.06, -1.2, 1.4, 2.6, 1.2, CREAM);
      B.box(-1.32, 0.06, -1.2, 1.32, 2.6, -1.12, CREAM);
      B.box(-1.32, 0.06, 1.12, 1.32, 1.0, 1.2, CREAM);
      B.box(-1.32, 1.0, 1.12, -1.12, 2.0, 1.2, CREAM); B.box(1.12, 1.0, 1.12, 1.32, 2.0, 1.2, CREAM);
      B.box(-1.32, 2.0, 1.12, 1.32, 2.6, 1.2, PINK);
      // pink bands round the bottom, a steel counter in the hatch, a back door
      B.box(-1.44, 0.06, -1.24, 1.44, 0.2, 1.24, 0xb7385f);
      B.box(-1.42, 0.82, 1.2, 1.42, 0.9, 1.23, PINK); B.box(-1.43, 0.82, -1.2, -1.4, 0.9, 1.2, PINK); B.box(1.4, 0.82, -1.2, 1.43, 0.9, 1.2, PINK);
      B.box(-1.18, 1.0, 0.98, 1.18, 1.05, 1.42, STEEL);
      B.box(-0.42, 0.2, -1.24, 0.42, 2.02, -1.2, 0x5f7480); B.box(0.24, 1.0, -1.27, 0.32, 1.06, -1.24, STEEL);
      // the roof, with a pink edge and the ceiling inside
      B.box(-1.56, 2.6, -1.36, 1.56, 2.74, 1.36, 0xefe9df);
      B.box(-1.57, 2.6, 1.35, 1.57, 2.78, 1.39, PINK); B.box(-1.57, 2.6, -1.39, 1.57, 2.78, -1.35, PINK);
      B.quad([-1.32, 2.59, -1.12], [1.32, 2.59, -1.12], [1.32, 2.59, 1.12], [-1.32, 2.59, 1.12], 0xfdfcf8, null, [0, -1, 0]);
      // inside: the freezer with the tubs of ice cream under its glass lid
      B.box(-1.2, 0.06, 0.42, 1.2, 0.92, 1.08, 0xf2f4f6);
      FLAVORS.slice(0, 7).forEach(([, c], i) => B.box(-1.1 + i * 0.315, 0.92, 0.5, -0.83 + i * 0.315, 0.98, 0.98, c));
      // a litter bin by the hatch
      B.prism(1.9, 1.55, 0.24, 0, 0.82, 12, 0x2f6b43); B.prism(1.9, 1.55, 0.26, 0.82, 0.88, 12, 0x24372c);
      return B.build();
    })();
    const kioskMat = std({ vertexColors: true, roughness: 0.65 });
    // the awning: stripes sloping out over the hatch with a scalloped edge, seen from both sides
    const awningGeo = (() => {
      const B = new Builder(), n = 10, x0 = -1.5, x1 = 1.5;
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n, col = i % 2 ? 0xffffff : PINK;
        B.quad([a, 2.14, 1.22], [b, 2.14, 1.22], [b, 1.96, 1.86], [a, 1.96, 1.86], col, null, [0, 1, 0.3]);
        B.quad([a, 1.96, 1.86], [b, 1.96, 1.86], [b, 1.84, 1.86], [a, 1.84, 1.86], col, null, [0, 0, 1]);
        B.tri([a, 1.84, 1.86], [b, 1.84, 1.86], [(a + b) / 2, 1.76, 1.86], col, [0, 0, 1]);
      }
      for (const s of [-1, 1]) B.tri([s * 1.5, 2.14, 1.22], [s * 1.5, 1.96, 1.86], [s * 1.5, 1.84, 1.86], PINK, [s, 0, 0]);
      return B.build();
    })();
    const awningMat = std({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const signMat = std({ map: signTex, roughness: 0.5, emissive: 0x331018, emissiveMap: signTex });
    const menuMat = std({ map: menuTex, roughness: 0.85, side: THREE.DoubleSide });
    const waffleMat = std({ map: waffleTex, roughness: 0.8, side: THREE.DoubleSide });
    const scoopMat = std({ vertexColors: true, roughness: 0.45 });
    // the big cone on the roof
    const bigConeGeo = new THREE.ConeGeometry(0.44, 1.1, 20, 1, true).rotateX(Math.PI).translate(0, 3.32, 0);
    const bigScoopGeo = (() => {
      const m = new Merger();
      m.add(new THREE.SphereGeometry(0.47, 18, 12), 0xf28bb0, 0, 3.92, 0);
      m.add(new THREE.SphereGeometry(0.4, 18, 12), 0xfff6dc, 0, 4.48, 0);
      m.add(new THREE.SphereGeometry(0.1, 10, 8), 0xc8102e, 0, 4.92, 0);
      m.add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), 0x3f6b22, 0.03, 5.05, 0, 0, 0, -0.3);
      return m.build();
    })();
    const frontSignGeo = new THREE.PlaneGeometry(2.6, 0.57), sideSignGeo = new THREE.PlaneGeometry(2.3, 0.5), menuGeo = new THREE.PlaneGeometry(0.6, 0.9);
    const kiosks = SPOTS.map((sp) => {
      const [x, z, face] = sp.kiosk, k = { name: sp.name, x, z, face, serveT: 0 };
      const g = new THREE.Group();
      g.position.set(x, 0, z); g.rotation.y = face;
      const body = new THREE.Mesh(kioskGeo, kioskMat), awning = new THREE.Mesh(awningGeo, awningMat);
      const cone = new THREE.Mesh(bigConeGeo, waffleMat), scoops = new THREE.Mesh(bigScoopGeo, scoopMat);
      for (const m of [body, awning, cone, scoops]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
      // the GLASS sign on the front and both sides, the menu on both faces of the A-frame
      const sign = (geo, px, pz, ry) => { const m = new THREE.Mesh(geo, signMat); m.position.set(px, 2.3, pz); m.rotation.y = ry; g.add(m); };
      sign(frontSignGeo, 0, 1.205, 0); sign(sideSignGeo, 1.405, 0, Math.PI / 2); sign(sideSignGeo, -1.405, 0, -Math.PI / 2);
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(menuGeo, menuMat);
        m.position.set(-1.95, 0.55, 1.73 + s * 0.135); m.rotation.set(-s * 0.29, s > 0 ? 0 : Math.PI, 0); m.castShadow = true;
        g.add(m);
      }
      scene.add(g);
      // the seller behind the counter: in a white coat and a pink cap, turning to whoever comes up
      const id = makeIdentity({ shirt: 0xfbfbf8, hat: 'cap', hatColor: PINK, sleeves: true });
      k.seller = makePersonModel(id);
      const [sx, sz] = toWorld(k, 0, 0.1);
      k.seller.group.position.set(sx, 0, sz);
      k.seller.group.rotation.y = face; k.look = face;
      const hand = makeIce([FLAVORS[2][1], FLAVORS[0][1]]);
      hand.group.position.set(0, -0.6, 0.06); hand.group.rotation.x = 1.4; hand.group.visible = false;
      k.seller.armR.add(hand.group); k.handIce = hand.group;
      addOBox(x, z, Math.cos(face), -Math.sin(face), 1.46, 1.32, 3);
      addCircle(...toWorld(k, -1.95, 1.73), 0.42, 1.1);
      addCircle(...toWorld(k, 1.9, 1.55), 0.3, 0.9);
      return k;
    });

    // your ice cream: held up in the right hand, and every few seconds a lick
    const HOLD = -0.75;
    let ice = null;
    function dropIce() { if (ice) { player.model.armR.remove(ice.model.group); for (const s of ice.model.scoops) s.material.dispose(); } ice = null; }

    /* balloons on strings: lift, a little wind, drag through the air, kept apart from each other and held by the string */
    const balloonGeo = (() => {
      const m = new Merger();
      m.add(new THREE.SphereGeometry(0.27, 16, 12).scale(1, 1.17, 1), 0xffffff, 0, 0, 0);
      m.add(new THREE.ConeGeometry(0.045, 0.07, 8), 0xffffff, 0, -0.33, 0, Math.PI, 0, 0);
      return m.build();
    })();
    const balloonMats = new Map(BALLOONS.map(([c]) => [c, std({ color: c, vertexColors: true, roughness: 0.2, metalness: 0.05 })]));
    const stringMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.85 });
    const tailGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, -0.35, 0, 0.04, -0.9, 0.02, 0.04, -0.9, 0.02, -0.02, -1.45, 0], 3));
    const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _q = new THREE.Vector3();
    const wind = { x: 0, z: 0 };
    function makeBalloon(col, x, y, z, len) {
      const mesh = new THREE.Mesh(balloonGeo, balloonMats.get(col));
      mesh.castShadow = true; mesh.position.set(x, y, z);
      scene.add(mesh);
      return { col, mesh, x, y, z, ox: x, oy: y, oz: z, vx: 0, vy: 0, vz: 0, len, want: len, ph: Math.random() * TAU };
    }
    function makeBunch(cap) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cap * 12), 3));
      const lines = new THREE.LineSegments(geo, stringMat);
      lines.frustumCulled = false;
      scene.add(lines);
      return { list: [], lines, ax: null, ay: 0, az: 0 };
    }
    function stepBunch(B, ax, ay, az, dt) {
      const L = B.list;
      // a jump of the hand further than a balloon can follow (a teleport, a ride skipped ahead): they come along
      if (B.ax !== null && (ax - B.ax) ** 2 + (ay - B.ay) ** 2 + (az - B.az) ** 2 > 64) {
        for (const b of L) { b.x += ax - B.ax; b.y += ay - B.ay; b.z += az - B.az; b.vx = b.vy = b.vz = 0; }
      }
      B.ax = ax; B.ay = ay; B.az = az;
      const drag = 1 - Math.exp(-2.4 * dt);
      for (const b of L) {
        b.ox = b.x; b.oy = b.y; b.oz = b.z;
        const wx = wind.x + Math.sin(clock * 1.3 + b.ph) * 0.5, wz = wind.z + Math.cos(clock * 1.1 + b.ph * 1.7) * 0.5;
        b.vx += (wx - b.vx) * drag; b.vz += (wz - b.vz) * drag; b.vy += 5 * dt - b.vy * drag;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      }
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const p = L[i], q = L[j], dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0.3 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (0.55 - d) * 0.25 / d;
        p.x += dx * push; p.y += dy * push; p.z += dz * push; q.x -= dx * push; q.y -= dy * push; q.z -= dz * push;
      }
      const pos = B.lines.geometry.attributes.position.array;
      L.forEach((b, i) => {
        if (b.len > b.want) b.len = Math.max(b.want, b.len - 2.2 * dt);
        const dx = b.x - ax, dy = b.y - ay, dz = b.z - az, d = Math.hypot(dx, dy, dz) || 1e-4;
        if (d > b.len) { const k = b.len / d; b.x = ax + dx * k; b.y = ay + dy * k; b.z = az + dz * k; }
        b.y = Math.max(b.y, 0.4);
        b.vx = clamp((b.x - b.ox) / dt, -30, 30); b.vy = clamp((b.y - b.oy) / dt, -30, 30); b.vz = clamp((b.z - b.oz) / dt, -30, 30);
        // the knot points down the string
        _q.set(b.x - ax, b.y - ay, b.z - az).normalize();
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.quaternion.setFromUnitVectors(UP, _q);
        // the string: from the hand to the knot, with a slight curl halfway
        const kx = b.x - _q.x * 0.36, ky = b.y - _q.y * 0.36, kz = b.z - _q.z * 0.36, mx = (ax + kx) / 2 + Math.sin(clock * 2 + b.ph) * 0.03, my = (ay + ky) / 2, mz = (az + kz) / 2;
        pos.set([ax, ay, az, mx, my, mz, mx, my, mz, kx, ky, kz], i * 12);
      });
      B.lines.geometry.setDrawRange(0, L.length * 4);
      B.lines.geometry.attributes.position.needsUpdate = true;
    }
    function hideBunch(B, on) { B.lines.visible = on; for (const b of B.list) b.mesh.visible = on; }
    // balloons let go: up and away with the wind, a bit of string trailing
    const flying = [];
    function letFly(b) {
      const tail = new THREE.LineSegments(tailGeo, stringMat);
      b.mesh.add(tail); b.mesh.visible = true; b.t = 0;
      flying.push(b);
    }

    /* the balloon sellers: a bunch held up high, back to their spot after jumping out of the way of a car */
    const SELLER_ID = makeIdentity({ shirt: 0x6a3d9a, pants: 0x3b5b8c, hair: 0x2b1d14, hat: 'beanie', hatColor: 0xc8102e, sleeves: true });
    const sellers = SPOTS.map((sp) => {
      const [x, z, face] = sp.seller, p = makePerson(SELLER_ID, x, z, { state: 'vendor', post: { x, z, face }, dodgeT: 0 });
      p.keep = true; p.rot = face;
      const s = { name: sp.name, p, bunch: makeBunch(SELLER_STOCK), restock: [] };
      for (let i = 0; i < SELLER_STOCK; i++) addToBunch(s);
      return s;
    });
    function addToBunch(s) {
      const B = s.bunch, have = new Set(B.list.map((b) => b.col)), free = BALLOONS.filter(([c]) => !have.has(c)), [col] = rpick(free.length ? free : BALLOONS);
      B.list.push(makeBalloon(col, s.p.x + (Math.random() - 0.5), 3.4 + Math.random() * 0.6, s.p.z + (Math.random() - 0.5), 1.1 + Math.random() * 0.75));
    }
    const mine = makeBunch(MAX_BALLOONS);

    /* where your balloons are tied: your left hand, or out of the window of the car you sit in */
    function anchor() {
      const S = policeStop;
      const seat = driving ? driving.driver : S && S.riding && S.car && S.car.rearSeat && S.car.rearSeat.visible ? S.car.rearSeat : null;
      if (seat) {
        const c = driving || S.car, side = Math.sign(seat.position.x) || 1;
        c.group.updateMatrixWorld(true);
        return seat.parent.localToWorld(_v.set(side * (c.M.W / 2 + 0.06), seat.position.y + 0.42, seat.position.z + 0.1));
      }
      if (player.model.group.visible) { player.model.group.updateMatrixWorld(true); return player.model.armL.localToWorld(_v.set(0, -0.6, 0.02)); }
      return _v.set(player.x, player.y + 1, player.z);
    }

    /* buying */
    let near = null;
    const broke = (what, kr) => toast(what + ' kostar ' + fmtKr(kr) + ', men du har bara ' + fmtKr(JOBS.earned) + '. Tjäna pengar på ett jobb: ta taxin, Sprintern, SL-bussen, mopeden, en polisbil eller en motorbåt och tryck J, eller sälj en bil på bilskroten i Hammarby hamn.');
    function buyIce(k) {
      if (ice) { toast('Du har redan en glass. Ät upp den först!'); return; }
      if (!JOBS.spend(ICE_PRICE)) { broke('En strut', ICE_PRICE); return; }
      const a = rpick(FLAVORS), b = rpick(FLAVORS.filter((f) => f !== a));
      ice = { model: makeIce([a[1], b[1]]), eaten: 0, t: -0.8 };
      ice.model.group.position.set(0, -0.6, 0.07); ice.model.group.rotation.x = -HOLD; ice.model.group.visible = false;
      player.model.armR.add(ice.model.group);
      k.serveT = 1.1;
      beep([988, 1319], 0.03, 0.16);
      toast('En strut med ' + a[0] + ' och ' + b[0] + '. Mums! −' + fmtKr(ICE_PRICE));
    }
    const handsFull = () => mine.list.length >= MAX_BALLOONS;
    function buyBalloon(s) {
      if (handsFull()) { toast('Du har redan ' + MAX_BALLOONS + ' ballonger. Fler orkar du inte hålla i!'); return; }
      if (!s.bunch.list.length) { toast('Ballongförsäljaren har sålt slut. Vänta lite, snart finns det fler.'); return; }
      if (!JOBS.spend(BALLOON_PRICE)) { broke('En ballong', BALLOON_PRICE); return; }
      // one from the seller's bunch, in a colour you don't have yet if there is one
      const have = new Set(mine.list.map((b) => b.col)), L = s.bunch.list;
      const pickB = L.find((b) => !have.has(b.col)) || L[0], first = !mine.list.length;
      L.splice(L.indexOf(pickB), 1);
      pickB.want = 1.25 + Math.random() * 0.2;
      pickB.len = Math.max(pickB.want, Math.hypot(pickB.x - player.x, pickB.y - 1, pickB.z - player.z));
      mine.list.push(pickB);
      s.restock.push(7 + Math.random() * 5);
      beep([784, 1175], 0.03, 0.16);
      const name = BALLOONS.find(([c]) => c === pickB.col)[1];
      toast('En ' + name + ' ballong! −' + fmtKr(BALLOON_PRICE) + (first && !isTouch ? ' Tryck V om du vill släppa den.' : ''));
    }
    function use() {
      if (!near || driving || !started || paused()) return false;
      if (near.seller) buyIce(near); else buyBalloon(near);
      return true;
    }
    function letGo() {
      if (!mine.list.length || paused()) return;
      const b = mine.list.pop();
      b.vy = Math.max(b.vy, 1);
      letFly(b);
      if (audio && !muted) tone(audio.ctx.currentTime, 'sine', 520, 1250, 0.5, 0.05);
      toast(mine.list.length ? 'Ballongen flög iväg!' : 'Hej då, ballong!');
    }
    function prompt() {
      if (!near) return null;
      return near.seller ? (ice ? 'Du har redan en glass' : 'Köp glass · ' + fmtKr(ICE_PRICE)) : handsFull() ? 'Händerna är fulla av ballonger' : 'Köp en ballong · ' + fmtKr(BALLOON_PRICE);
    }

    /* every frame, after the people have been posed */
    function update(dt) {
      wind.x = 0.6 + Math.sin(clock * 0.07) * 0.5; wind.z = -0.3 + Math.cos(clock * 0.05) * 0.45;
      const walking = !driving && !(policeStop && (policeStop.locked || policeStop.riding)) && player.y < 1.5;
      near = null;
      // the kiosks: the seller turns to you, and reaches out with your cone when you buy one
      for (const k of kiosks) {
        const [lx, lz] = toLocal(k, player.x, player.z), d = Math.hypot(lx, lz - 1.2);
        if (walking && lz > 1.25 && lz < 3.6 && Math.abs(lx) < 1.9) near = k;
        const S = k.seller;
        if (d > 60) continue;
        const want = d < 9 ? k.face + clamp(wrapAngle(Math.atan2(player.x - S.group.position.x, player.z - S.group.position.z) - k.face), -0.7, 0.7) : k.face;
        k.look = lerpAngle(k.look, want, 1 - Math.exp(-4 * dt));
        S.group.rotation.y = k.look;
        S.inner.position.y = Math.sin(clock * 1.7 + k.x) * 0.012;
        k.serveT = Math.max(0, k.serveT - dt);
        const reach = k.serveT > 0 ? -1.35 : 0;
        S.armR.rotation.x = lerp(S.armR.rotation.x, reach, 1 - Math.exp(-10 * dt));
        k.handIce.visible = k.serveT > 0.35;
      }
      // the balloon sellers: one arm up holding the bunch
      for (const s of sellers) {
        const p = s.p, on = !p.asleep;
        hideBunch(s.bunch, on);
        for (let i = s.restock.length - 1; i >= 0; i--) if ((s.restock[i] -= dt) <= 0) { s.restock.splice(i, 1); addToBunch(s); }
        if (!on) continue;
        if (walking && Math.hypot(player.x - p.x, player.z - p.z) < 2.3 && !near) near = s;
        const G = p.model;
        if (p.grounded) { G.armR.rotation.x = -2.55; G.armR.rotation.z = -0.12; }
        G.group.updateMatrixWorld(true);
        const h = G.armR.localToWorld(_v.set(0, -0.62, 0));
        stepBunch(s.bunch, h.x, h.y, h.z, dt);
      }
      // your ice cream: hold it, lick it now and then until it is gone
      const shown = player.model.group.visible && !player.cuffed;
      if (ice) {
        const G = player.model;
        ice.t += dt;
        ice.model.group.visible = shown && ice.t > 0;
        if (shown && ice.t > 0) {
          const ph = ice.t % 3.2, licking = ph > 2.2;
          if (licking) ice.eaten += dt;
          const up = licking ? Math.sin((ph - 2.2) * Math.PI) : 0;
          G.armR.rotation.x = lerp(HOLD, -2.05, up);
          G.armR.rotation.z = lerp(0.12, 0.45, up);
          // tipped towards the mouth, not right over
          ice.model.group.rotation.set(lerp(-HOLD, 1.25, up), 0, lerp(-0.12, -0.35, up));
          // the top scoop goes first, then the bottom one, then the cone
          const [s1, s2] = ice.model.scoops, b = ice.eaten;
          s2.scale.setScalar(clamp(1 - b / 4, 0, 1)); s2.visible = b < 4;
          s1.scale.setScalar(clamp(1 - (b - 4) / 4, 0, 1)); s1.visible = b < 8;
          ice.model.cone.scale.setScalar(clamp(1 - (b - 8) / 2.5, 0.2, 1));
          if (b >= BITES && !licking) { dropIce(); toast('Mums! Glassen är uppäten.'); }
        }
      }
      // your balloons: they make you fall slowly
      const n = mine.list.length;
      player.floaty = n ? 0.6 / (1 + 0.2 * (n - 1)) : 0;
      if (n) { const a = anchor(); stepBunch(mine, a.x, a.y, a.z, dt); hideBunch(mine, true); }
      else mine.ax = null;
      // and the ones that got away
      for (let i = flying.length - 1; i >= 0; i--) {
        const b = flying[i];
        b.t += dt;
        b.vx += (wind.x * 2.5 - b.vx) * dt * 0.6; b.vz += (wind.z * 2.5 - b.vz) * dt * 0.6; b.vy = Math.min(3.2, b.vy + 2 * dt);
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.set(Math.sin(clock * 1.4 + b.ph) * 0.15, b.ph + b.t * 0.3, Math.cos(clock * 1.2 + b.ph) * 0.15);
        if (b.y > 170 || b.t > 60) { scene.remove(b.mesh); flying.splice(i, 1); }
      }
    }

    /* on the maps: a cone for the kiosks, a balloon for the sellers */
    function icon(g, kind, X, Y, s) {
      if (kind === 'ice') {
        g.fillStyle = '#d9a35f'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * s;
        g.beginPath(); g.moveTo(X - 3.6 * s, Y - 1 * s); g.lineTo(X + 3.6 * s, Y - 1 * s); g.lineTo(X, Y + 7 * s); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#e8457a'; g.beginPath(); g.arc(X, Y - 2.6 * s, 3.8 * s, 0, TAU); g.fill(); g.stroke();
      } else {
        g.strokeStyle = '#ffffff'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(X, Y + 1.5 * s); g.lineTo(X + 1.2 * s, Y + 8 * s); g.stroke();
        g.fillStyle = '#e0203a'; g.lineWidth = 1.5 * s; g.beginPath(); g.ellipse(X, Y - 2.5 * s, 3.6 * s, 4.4 * s, 0, 0, TAU); g.fill(); g.stroke();
      }
    }
    function drawMini(g, px, pz, u) {
      for (const k of kiosks) if (Math.abs(k.x - px) < 110 && Math.abs(k.z - pz) < 110) icon(g, 'ice', k.x, k.z, u);
      for (const s of sellers) if (Math.abs(s.p.x - px) < 110 && Math.abs(s.p.z - pz) < 110) icon(g, 'balloon', s.p.x, s.p.z, u);
    }
    function drawBig(g, toX, toY, k) {
      if (k < 0.2) return;
      const sc = clamp(k / 0.35, 1.3, 2);
      for (const q of kiosks) icon(g, 'ice', toX(q.x), toY(q.z), sc);
      for (const s of sellers) icon(g, 'balloon', toX(s.p.x), toY(s.p.z), sc);
    }

    return {
      update, use, letGo, prompt, drawMini, drawBig, kiosks, sellers,
      get near() { return near; }, get ice() { return ice; }, get balloons() { return mine.list.length; }, get flying() { return flying.length; }
    };
  })();

  /* ================= game state ================= */
  let started = false, pickerOpen = false, nearCar = null;
  // the car picker and the big map both pause the game
  const paused = () => pickerOpen || bigmap.open || MP.panelOpen;
  let camYaw = player.rot, camPitch = 0.3, camDist = 6, lastLook = -1e9, clipT = 1;
  const camTarget = new THREE.Vector3(player.x, 1.6, player.z);
  let jumpQueued = false;
  const keys = {}, joy = { x: 0, y: 0 };
  let touchBrake = false, isTouch = window.matchMedia('(pointer: coarse)').matches;

  function readInput() {
    if (!started || paused() || inCustody() || (JOBS.job && JOBS.job.kind === 'race' && JOBS.job.t < 0)) return { fwd: 0, right: 0, run: false, brake: !!driving };
    const k = keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - joy.y;
    const right = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.x;
    return { fwd: clamp(fwd, -1, 1), right: clamp(right, -1, 1), run: !!(k.ShiftLeft || k.ShiftRight) || Math.hypot(joy.x, joy.y) > 0.93, brake: !!k.Space || touchBrake };
  }
  function playerIntent(inp) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let mx = fx * inp.fwd + rx * inp.right, mz = fz * inp.fwd + rz * inp.right;
    const len = Math.hypot(mx, mz);
    let speed = 0;
    if (len > 0.05) { speed = (inp.run ? 9.5 : 4.6) * Math.min(1, len); mx /= len; mz /= len; } else { mx = 0; mz = 0; }
    return { mx, mz, speed, jump: jumpQueued };
  }

  function findNearCar() {
    if (driving || MP.ride || !started || (policeStop && policeStop.locked)) return null;
    let best = null, bd = Infinity;
    for (const c of cars) {
      // (a friend's car you can only ride along in, and the sjöpolis's and the navy's boats can't be taken)
      if (c.remote || c.water) continue;
      const dx = player.x - c.x, dz = player.z - c.z;
      if (dx * dx + dz * dz > 100) continue;
      const co = Math.cos(c.h), si = Math.sin(c.h), lx = dx * co - dz * si, lz = dx * si + dz * co;
      const sp = Math.hypot(c.vx, c.vz);
      // (a boat lies below the quay: you step down into it)
      if (Math.abs(lx) < c.M.W / 2 + 1.6 && Math.abs(lz) < c.M.L / 2 + 1.2 + sp * 0.08 && (c.M.boat ? player.y < 0.5 : player.y < c.parts[c.parts.length - 1].top + 0.8)) {
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  }
  // ashore from a boat: the nearest bit of quay a step or two from the hull, if there is one
  function boatExitSpot(c) {
    const co = Math.cos(c.h), si = Math.sin(c.h), hl = c.M.L / 2;
    let best = null, bd = Infinity;
    for (const d of [0.8, 1.6, 2.6, 3.6]) for (const s of [1, -1]) for (let lz = -hl; lz <= hl + 0.01; lz += Math.max(0.6, hl / 3)) {
      for (const [lx, lzz] of [[s * (c.M.W / 2 + d), lz], [0, s * (hl + d)]]) {
        const x = c.x + lx * co + lzz * si, z = c.z - lx * si + lzz * co, dd = Math.hypot(lx, lzz - (c.driver ? c.driver.position.z : 0));
        if (dd < bd && personFits(x, z) && !blockedAt(x, z, 0.36)) { best = { x, z }; bd = dd; }
      }
    }
    return best;
  }
  function exitSpot(c) {
    if (c.M.boat) return boatExitSpot(c);
    const co = Math.cos(c.h), si = Math.sin(c.h), hw = c.M.W / 2 + 0.8, hl = c.M.L / 2 + 0.9;
    for (const [lx, lz] of [[hw, c.driver.position.z], [-hw, 0], [0, hl], [0, -hl], [hw, 0]]) {
      const x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
      if (!personFits(x, z) || blockedAt(x, z, 0.36)) continue;
      let ok = true;
      for (const o of cars) if (o !== c && Math.hypot(o.x - x, o.z - z) < o.M.L / 2 + 0.4) { ok = false; break; }
      if (ok) return { x, z };
    }
    return null;
  }
  function enterCar(c) {
    if (c.police) policeCarTaken(c);
    else if (c.bot && c.occupant) {
      offense('stöld', 0, c.x, c.z);
      const spot = exitSpot(c);
      const npc = makePerson(c.occupant, spot ? spot.x : c.x, spot ? spot.z : c.z, { state: 'flee', t: 4.5, dodgeT: 0 });
      npc.rot = c.h + Math.PI / 2; npc.vy = 4; npc.grounded = false;
      if (!spot) npc.y = c.parts[c.parts.length - 1].top;
      toast('Du tog ' + c.M.def + '!');
    }
    c.bot = null;
    c.fallen = 0;
    driving = c;
    setOccupant(c, playerId);
    for (const m of c.calipers) m.visible = true;
    // keep whichever gearbox you used last; a car taken on the move starts in a gear that suits its speed
    c.auto = gearAuto;
    const vf = Math.max(0, c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h));
    c.gear = 0; c.inR = false; c.rT = 0; c.blink = 0;
    while (c.gear < c.M.gears - 1 && vf > c.M.gearTop[c.gear] * 0.85) c.gear++;
    player.model.group.visible = false;
    player.vx = player.vz = player.vy = 0;
    lastLook = -1e9;
    JOBS.entered(c);
  }
  let gearAuto = true;
  const evNote = () => toast(driving.M.boat ? 'En båt har ingen växellåda: W framåt, S back.' : driving.M.def[0].toUpperCase() + driving.M.def.slice(1) + (driving.M.cvt ? ' har variator och växlar steglöst själv.' : ' är en elbil och har bara en växel.'));
  function playerShift(dir) {
    if (!driving || paused()) return;
    if (driving.M.ev || driving.M.cvt || driving.M.boat) { evNote(); return; }
    if (driving.auto) { driving.auto = false; gearAuto = false; toast('Manuell växellåda: M växlar upp, N ner, och under ettan ligger R. G byter tillbaka till automat.'); }
    const c = driving, vf = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
    // below first gear is R, but only with the car (almost) standing still, like a real gearbox
    if (c.inR) { if (dir > 0) { c.inR = false; c.gear = 0; onShift(c, 1); } return; }
    if (dir < 0 && c.gear === 0) {
      if (Math.abs(vf) > 1.5) { toast('Stanna bilen först, sedan kan du lägga i R.'); return; }
      c.inR = true; onShift(c, -1); return;
    }
    shiftTo(c, c.gear + dir);
  }
  function toggleGearbox() {
    if (!driving || paused()) return;
    if (driving.M.ev || driving.M.cvt || driving.M.boat) { evNote(); return; }
    gearAuto = driving.auto = !driving.auto;
    toast(gearAuto ? 'Automatlåda. Håll in S så bromsar bilen och backar sedan.' : 'Manuell växellåda: M växlar upp, N ner. Under ettan ligger R, och håller du in S när bilen står still läggs R i.');
  }
  function exitCar() {
    const c = driving, out = exitSpot(c);
    if (c.M.boat && !out) { toast('Kör fram till en kaj eller brygga så att du kan kliva i land.'); return false; }
    c.auto = true;
    setOccupant(c, null);
    driving = null;
    player.model.group.visible = true;
    if (out) { player.x = out.x; player.z = out.z; player.y = 0; }
    else { player.x = c.x; player.z = c.z; player.y = c.parts[c.parts.length - 1].top; }
    player.rot = c.h; player.vx = player.vz = player.vy = 0;
    return true;
  }
  function toggleCar() {
    if (!started || paused()) return;
    if (driving) exitCar();
    else if (nearCar) enterCar(nearCar);
  }
  // a position partway along a stretch of street, kept clear of the junctions at its ends (the middle if it is short)
  const alongEdge = (f, s, margin) => (f.len > margin * 2 ? clamp(s, margin, f.len - margin) : f.len / 2);
  function resetToRoad() {
    if (!driving) return;
    // a boat is freed where it is: turned and nudged to the nearest open water with room to steer
    if (driving.M.boat) {
      const c = driving;
      for (let r = 0; r <= 30; r += 2) for (let a = 0; a < TAU; a += r ? 0.5 : TAU) for (const dh of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, h = c.h + dh;
        if (!boatFree(c.M, x, z, h, c) || !boatFree(c.M, x + Math.sin(h) * 4, z + Math.cos(h) * 4, h, c)) continue;
        c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.steer = 0;
        camYaw = h;
        return;
      }
      toast('Det finns inget öppet vatten här.');
      return;
    }
    // back onto the nearest street a car can use: a proper street if there is one nearby, otherwise a wide lane
    const c = driving, ne0 = nearestEdge(c.x, c.z, (e) => e.drive), ne = ne0.e && ne0.d < 60 ? ne0 : nearestEdge(c.x, c.z, (e) => e.emerg && e.hw >= 2.4);
    if (!ne.e) return;
    const f = edgeFrame(ne.e.a, ne.e.b), s0 = alongEdge(f, (c.x - f.A.x) * f.ux + (c.z - f.A.z) * f.uz, 12);
    const hf = Math.atan2(f.ux, f.uz), same = Math.abs(wrapAngle(hf - c.h)) < Math.PI / 2;
    for (const ds of [0, 6, -6, 12, -12]) for (const side of [1, -1, 0]) {
      const lat = (same ? 1 : -1) * side * f.lane, s = alongEdge(f, s0 + ds, 3);
      const x = f.A.x + f.ux * s + f.rx * lat, z = f.A.z + f.uz * s + f.rz * lat, h = (same ? hf : hf + Math.PI) + (side < 0 ? Math.PI : 0);
      if (!spotFree(c.M, x, z, h, c)) continue;
      c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.steer = 0;
      camYaw = h;
      return;
    }
    toast('Det finns ingen ledig plats på gatan här.');
  }

  /* ---------- car picker ---------- */
  function drawSilhouette(cv, M) {
    if (M.boat) {
      // a boat from the side, on a band of water: the hull from its stations, then what stands on it
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, s = Math.min((W - 24) / (M.L * 1.08), (H - 24) / 2.2), ox = W / 2, oy = H - 34, P = (z, y) => [ox + z * s, oy - y * s];
      const poly = (pts, fill) => { g.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fillStyle = fill; g.fill(); };
      g.clearRect(0, 0, W, H);
      const st = M.hull, col = hex(M.colors[0]);
      poly([...st.map(([z, , , t]) => [z, t]), ...st.slice().reverse().map(([z, , k]) => [z, k])], M.boat === 'jetski' ? '#eeeeea' : M.boat === 'riva' ? col : col);
      if (M.boat === 'jetski') {
        poly([[0.05, 0.45], [0.45, 0.8], [0.95, 0.74], [1.35, 0.47]], col);
        poly([[0.05, 0.5], [-0.3, 0.86], [-1.3, 0.8], [-1.3, 0.5]], '#16171a');
        poly([[0.2, 0.8], [0.32, 1.06], [0.4, 1.06], [0.3, 0.8]], '#2a2c30');
      } else if (M.boat === 'console') {
        poly([[0.1, 0.7], [0.8, 0.7], [0.8, 1.1], [0.1, 1.1]], '#eeeeea');
        poly([[0.68, 1.06], [0.52, 1.42], [0.58, 1.42], [0.74, 1.06]], '#8fa5b5');
        poly([[-3.1, 0.6], [-3.75, 0.66], [-3.75, 1.44], [-3.1, 1.44]], '#1c1d20');
        poly([[-3.35, -0.2], [-3.55, -0.2], [-3.55, 0.6], [-3.35, 0.6]], '#1c1d20');
      } else {
        poly([[0.97, 0.9], [0.82, 1.25], [0.87, 1.25], [1.02, 0.9]], '#8fa5b5');
        poly([[-1.6, 0.76], [-1.6, 1.2], [0.5, 1.2], [0.5, 0.76]], '#7fb8b0');
        g.fillStyle = '#e9dfc6'; const [ax, ay] = P(-4, 0.62), [bx] = P(4, 0.62); g.fillRect(ax, ay - 1, bx - ax, 1.5);
      }
      g.fillStyle = 'rgba(143,193,218,.85)'; g.fillRect(0, oy, W, H - oy);
      return;
    }
    if (M.mil) {
      // the army's vehicles from the side, plainly: the tank's tracks, hull, arrowhead turret and long gun; the armoured
      // car's sloped hull on eight wheels and its weapon station; the truck's cab and the tarpaulin over the soldiers
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, gun = M.mil === 'tank' ? 2.4 : 0, hl = M.L / 2;
      const s = Math.min((W - 20) / (M.L + gun), (H - 14) / 3.4), ox = W / 2 - (gun / 2) * s, oy = H - 8, P = (z, y) => [ox + z * s, oy - y * s];
      const poly = (pts, fill) => { g.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fillStyle = fill; g.fill(); };
      const col = hex(M.colors[0]), dark = hex(shade(M.colors[0], 0.7)), steel = '#2b2e2a', win = '#5a6a72';
      g.clearRect(0, 0, W, H);
      if (M.mil === 'tank') {
        poly([[-hl, 0.2], [-hl + 0.3, 0], [hl - 0.4, 0], [hl, 0.4], [hl - 0.1, 0.95], [-hl + 0.1, 0.95]], '#2a2c2e');
        poly([[-hl - 0.1, 0.85], [hl + 0.1, 0.85], [hl - 0.3, 1.55], [-hl, 1.6]], col);
        poly([[-2.6, 1.55], [1.1, 1.55], [2.3, 1.85], [1.3, 2.45], [-2.6, 2.4]], dark);
        poly([[1.9, 1.95], [hl + gun, 2.0], [hl + gun, 2.12], [1.9, 2.15]], steel);
      } else if (M.mil === 'patria') {
        poly([[-hl, 0.75], [hl - 0.9, 0.75], [hl, 1.35], [hl - 0.5, 2.05], [-hl + 0.1, 2.25], [-hl, 2.15]], col);
        poly([[hl - 1.05, 1.5], [hl - 0.62, 1.5], [hl - 0.85, 1.9], [hl - 1.05, 1.95]], win);
        poly([[-0.9, 2.2], [0.1, 2.2], [0.1, 2.75], [-0.9, 2.75]], dark);
        poly([[0.1, 2.48], [1.3, 2.48], [1.3, 2.58], [0.1, 2.58]], steel);
      } else {
        poly([[-hl, 0.9], [hl, 0.9], [hl, 1.15], [-hl, 1.15]], steel);
        poly([[hl - 2.0, 1.0], [hl, 1.0], [hl, 2.5], [hl - 0.4, 2.95], [hl - 2.0, 2.95]], col);
        poly([[hl - 0.55, 2.2], [hl - 0.05, 2.2], [hl - 0.05, 2.5], [hl - 0.42, 2.85], [hl - 0.55, 2.85]], win);
        poly([[-hl, 1.15], [hl - 2.2, 1.15], [hl - 2.2, 3.25], [-hl, 3.25]], dark);
      }
      for (const z of M.axles || [M.wb / 2, -M.wb / 2]) {
        const [px, py] = P(z, M.R);
        g.fillStyle = M.mil === 'tank' ? '#3a3d3a' : '#16181b'; g.beginPath(); g.arc(px, py, M.R * s, 0, TAU); g.fill();
        g.fillStyle = '#4f5a3c'; g.beginPath(); g.arc(px, py, M.R * s * 0.5, 0, TAU); g.fill();
      }
      return;
    }
    if (M.moped) {
      // the scooter from the side: wheels, the body under the seat, the frame tube, fork, bars and lamp mask
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, s = (H - 24) / 1.35, ox = W / 2, oy = H - 10, P = (z, y) => [ox + z * s, oy - y * s];
      const poly = (pts, fill) => { g.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fillStyle = fill; g.fill(); };
      const line = (pts, w, col) => { g.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.lineWidth = w * s; g.strokeStyle = col; g.lineCap = 'round'; g.stroke(); };
      g.clearRect(0, 0, W, H);
      line([[-0.18, 0.3], [-0.5, 0.33], [-0.84, 0.45]], 0.1, '#2a2c30');
      poly([[0.05, 0.34], [-0.15, 0.36], [-0.42, 0.42], [-0.68, 0.52], [-0.88, 0.66], [-0.88, 0.82], [-0.68, 0.79], [-0.42, 0.75], [-0.15, 0.71], [0.05, 0.6]], hex(M.colors[0]));
      poly([[0.06, 0.6], [-0.05, 0.68], [-0.36, 0.72], [-0.46, 0.74], [-0.74, 0.77], [-0.74, 0.87], [-0.46, 0.86], [-0.36, 0.81], [-0.05, 0.79], [0.06, 0.66]], '#16171a');
      poly([[0.12, 0.3], [-0.2, 0.3], [-0.2, 0.34], [0.12, 0.34]], '#1c1d20');
      line([[0.25, 0.8], [0.21, 0.62], [0.15, 0.45], [0.06, 0.34], [0, 0.3]], 0.05, '#aeb3b8');
      line([[0.3, 0.82], [0.61, 0.24]], 0.05, '#2a2c30');
      line([[0.2, 1.01], [0.1, 1.04]], 0.03, '#1c1d20');
      poly([[0.25, 0.83], [0.42, 0.86], [0.42, 0.98], [0.25, 1.0]], hex(M.colors[0]));
      poly([[0.27, 1.0], [0.4, 0.99], [0.33, 1.12], [0.25, 1.12]], '#8fa5b5');
      for (const z of [M.wb / 2, -M.wb / 2]) {
        const [px, py] = P(z, M.R);
        g.fillStyle = '#16181b'; g.beginPath(); g.arc(px, py, M.R * s, 0, TAU); g.fill();
        g.fillStyle = '#b9bec4'; g.beginPath(); g.arc(px, py, 0.155 * s, 0, TAU); g.fill();
      }
      return;
    }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, sh = carShape(M), S = M.shape, hl = M.L / 2;
    g.clearRect(0, 0, W, H);
    const pad = 10, s = M.bus ? (W - pad * 2) / 12.4 : Math.min((W - pad * 2) / 6.1, (H - pad * 2) / 2.5);
    const ox = W / 2, oy = H - pad;
    const P = (z, y) => [ox + z * s, oy - y * s];
    const poly = (pts, fill) => { g.beginPath(); pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    const n = 90, zs = [];
    for (let i = 0; i <= n; i++) zs.push(-hl + (M.L * i) / n);
    const rings = zs.map((z) => sh.ring(z));
    poly([...zs.map((z, i) => [z, rings[i].top + rings[i].crown]), ...zs.slice().reverse().map((z) => [z, sh.sillAt(z)])], hex(M.colors[0]));
    // side windows, with the pillars left in body colour
    const win = [];
    zs.forEach((z, i) => { const r = rings[i]; if (z > S.glass[0] && z < S.glass[1] && r.h > 0.08) win.push([z, r.yt + 0.03, r.yt + r.h - Math.min(0.07, r.h * 0.3)]); });
    if (win.length > 1) {
      poly([...win.map(([z, y0]) => [z, y0]), ...win.slice().reverse().map(([z, , y1]) => [z, y1])], '#23384b');
      for (const [pz, pw] of S.pillars || []) { const r = sh.ring(pz); poly([[pz - pw / 2, r.yt], [pz + pw / 2, r.yt], [pz + pw / 2, r.top], [pz - pw / 2, r.top]], '#1d2024'); }
    }
    if (S.wing) {
      const Wg = S.wing === true ? {} : S.wing, wz = -hl + (Wg.z ?? 0.32), wy = sh.belt(wz), h = Wg.h ?? 0.28;
      poly([[wz - 0.04, wy], [wz + 0.04, wy], [wz + 0.04, wy + h], [wz - 0.04, wy + h]], '#1f2226');
      poly([[wz - 0.22, wy + h - 0.01], [wz + 0.14, wy + h - 0.01], [wz + 0.14, wy + h + 0.03], [wz - 0.22, wy + h + 0.03]], '#1f2226');
    }
    if (S.open) { const zf = S.open.z[1], yb = sh.belt(zf), ws = S.open.screen ?? 0.3; poly([[zf, yb], [zf - ws * 0.55, yb + ws], [zf - ws * 0.55 - 0.05, yb + ws], [zf - 0.06, yb]], '#23384b'); }
    // the F40's wing on its swept-up rear wings
    if (S.f40) { const wy = S.f40.wingY, wa = -hl + 0.03, wb = -hl + 0.4; poly([[wa, sh.belt(wa) - 0.03], [-1.55, sh.belt(-1.55) - 0.03], [wb, wy - 0.02], [wb, wy + 0.01], [wa, wy + 0.03]], hex(shade(M.colors[0], 0.78))); }
    for (const z of [M.wb / 2, -M.wb / 2]) {
      const [px, py] = P(z, M.R);
      g.fillStyle = '#16181b'; g.beginPath(); g.arc(px, py, M.R * s, 0, TAU); g.fill();
      g.fillStyle = M.rim === 'black' ? '#3a3d42' : '#c6cbd1'; g.beginPath(); g.arc(px, py, M.R * s * 0.62, 0, TAU); g.fill();
    }
  }
  function pickerButton(M, i) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'model'; btn.id = 'model-' + M.id;
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 120;
    drawSilhouette(cv, M);
    const title = document.createElement('div'); title.className = 'model-title';
    const name = document.createElement('b'); name.textContent = M.name;
    title.append(name);
    // the first ten have a number key
    if (i < 10) { const num = document.createElement('span'); num.className = 'key'; num.textContent = String((i + 1) % 10); title.append(num); }
    const stats = document.createElement('div'); stats.className = 'stats';
    stats.textContent = M.kind + '\nToppfart ' + Math.round(M.max * 3.6) + ' km/h\n0–' + M.sprint.kmh + ' på ' + M.sprint.t.toFixed(1).replace('.', ',') + ' s\n' + (M.boat ? M.engine : M.ev ? 'Elmotor, en växel' : M.cvt ? 'Tvåtakt, variator' : M.gears + ' växlar');
    btn.append(cv, title, stats);
    btn.addEventListener('click', () => chooseModel(M));
    return btn;
  }
  function buildPicker() {
    PICKABLE.forEach((M, i) => {
      const btn = pickerButton(M, i);
      (M.boat ? $('gridBoat') : M.moped ? $('gridMoped') : M.group === 'super' ? $('gridSuper') : M.group === 'classic' ? $('gridClassic') : M.sport ? $('gridSport') : $('gridNormal')).appendChild(btn);
    });
    SECRET.forEach((M, i) => $(M.mil ? 'gridArmy' : 'gridPolice').appendChild(pickerButton(M, i)));
  }
  function openPicker() {
    if (!started) return;
    // no new car while you are under arrest or in the cell
    if (policeStop && policeStop.locked) { toast('Det går inte nu, du är gripen.'); return; }
    pickerOpen = true;
    setPickerSecret(false);
    $('picker').hidden = false;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    for (const k in keys) keys[k] = false;
    joy.x = joy.y = 0;
    const first = $('picker').querySelector('button.model');
    if (first) first.focus();
  }
  function closePicker() { pickerOpen = false; $('picker').hidden = true; }
  // The secret page: B twice in quick succession in the picker (or a double tap on its heading) turns to the police's
  // and the army's vehicles, and back. The first B closes the picker as always; the second, right after, opens it
  // again on the other page
  let pickerSecret = false, pickerBClose = -1e9, pickerTapT = 0;
  function setPickerSecret(on) {
    pickerSecret = on;
    $('picker').classList.toggle('secret', on);
    $('pickerTitle').textContent = on ? 'Hemliga fordon' : 'Välj bil';
    $('pickerLede').textContent = on ? 'Polisens och Försvarsmaktens fordon. Båtarna ställs vid närmaste kaj.' : 'Bilen ställs bredvid dig och du kliver in direkt.';
    const first = $('picker').querySelector(on ? '.picker-secret button.model' : 'button.model');
    if (first && pickerOpen) first.focus();
  }
  // (t: when the key went down, so a slow frame between the two presses does not pull them apart)
  function pickerB(t = performance.now()) {
    if (pickerOpen) { closePicker(); pickerBClose = t; return; }
    const again = t - pickerBClose < 350, secret = again && !pickerSecret;
    openPicker();
    if (again && pickerOpen) setPickerSecret(secret);
  }
  $('pickerTitle').addEventListener('pointerup', () => {
    const t = performance.now();
    if (t - pickerTapT < 400) { pickerTapT = 0; setPickerSecret(!pickerSecret); } else pickerTapT = t;
  });
  // a berth for a boat by the quay nearest to (x, z): walk out from there to where the land ends, and lay the hull
  // alongside the edge just off it (or, from out on the water, anywhere free near by)
  function boatFree(M, x, z, h, ignore) {
    if (!boatFits(M, x, z, h)) return false;
    const r = M.W / 2 + 0.1, span = M.L / 2 - r, fx = Math.sin(h), fz = Math.cos(h);
    for (const o of [-span, 0, span]) if (resolveWorld(x + fx * o, z + fz * o, r, WATER_Y).hit) return false;
    for (const o of cars) if (o !== ignore && Math.hypot(o.x - x, o.z - z) < (o.M.L + M.L) / 2 + 0.8) return false;
    return true;
  }
  function findBerth(M, x, z, maxD = 80, ignore) {
    let best = null;
    if (!(groundAt(x, z) & 1)) {
      for (let r = 0; r < 40 && !best; r += 3) for (let a = 0; a < TAU && !best; a += 0.4) {
        const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
        for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) if (boatFree(M, cx, cz, h, ignore)) { best = { x: cx, z: cz, h, d: r }; break; }
      }
      return best;
    }
    for (let a = 0; a < TAU; a += TAU / 36) {
      const dx = Math.sin(a), dz = Math.cos(a);
      let d = 0;
      while (d < maxD && groundAt(x + dx * d, z + dz * d) & 1) d += 0.5;
      if (d >= maxD || (best && d > best.d)) continue;
      for (const off of [M.W / 2 + 0.5, M.W / 2 + 1.2, M.W / 2 + 2.5]) {
        const cx = x + dx * (d + off), cz = z + dz * (d + off);
        let found = false;
        for (const h of [a + Math.PI / 2, a - Math.PI / 2]) if (boatFree(M, cx, cz, h, ignore)) { best = { x: cx, z: cz, h, d }; found = true; break; }
        if (found) break;
      }
    }
    return best;
  }
  function findSpawnSpot(M) {
    if (M.boat) return findBerth(M, player.x, player.z);
    const tries = [];
    const ne = nearestEdge(player.x, player.z);
    if (ne.e && ne.d < 25) {
      const f = edgeFrame(ne.e.a, ne.e.b), s0 = alongEdge(f, (player.x - f.A.x) * f.ux + (player.z - f.A.z) * f.uz, 14);
      const near = (player.x - f.A.x) * f.rx + (player.z - f.A.z) * f.rz >= 0 ? 1 : -1;
      const park = f.park || f.e.hw - 1.1;
      for (const ds of [0, 7, -7, 14, -14, 21, -21]) for (const lat of [park * near, f.lane * near, -f.lane * near, -park * near]) {
        const s = alongEdge(f, s0 + ds, 6);
        tries.push([f.A.x + f.ux * s + f.rx * lat, f.A.z + f.uz * s + f.rz * lat, Math.atan2(f.ux, f.uz) + (lat < 0 ? Math.PI : 0)]);
      }
      // (the army's wide vehicles, taken from the picker's secret page, often fit only down the middle of the street)
      if (M.W > 2.4) for (const ds of [0, 10, -10, 20, -20, 30, -30, 40, -40]) {
        const s = alongEdge(f, s0 + ds, 6);
        tries.push([f.A.x + f.ux * s, f.A.z + f.uz * s, Math.atan2(f.ux, f.uz)]);
      }
    }
    const dists = M.W > 2.4 ? [M.L / 2 + 2, M.L / 2 + 5, M.L / 2 + 9, M.L / 2 + 14] : [M.L / 2 + 2, M.L / 2 + 5];
    for (const dist of dists) for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      tries.push([player.x + Math.sin(player.rot + a) * dist, player.z + Math.cos(player.rot + a) * dist, player.rot]);
    }
    // (never inside the police station, where the lobby is just big enough for a car)
    for (const [x, z, h] of tries) if (spotFree(M, x, z, h) && !STATION.inside(x, z)) return { x, z, h };
    return null;
  }
  function chooseModel(M) {
    closePicker();
    if (policeStop && policeStop.locked) return;
    let spot = null;
    // riding in a friend's boat out on the water: a car has to wait for a quay, a boat is put beside theirs
    if (MP.ride) {
      const r = MP.ride;
      if (r.M.boat && !boatExitSpot(r)) {
        if (!M.boat) { toast('Vänta tills båten ligger vid en kaj, så kan du kliva i land.'); return; }
        spot = findBerth(M, r.x, r.z, 80);
      }
      MP.unride();
    }
    if (driving && driving.M.boat && !exitSpot(driving)) {
      // out on the water: another boat takes this one's place, but a car has to wait for dry land
      if (!M.boat) { toast('Kör fram till en kaj först, så att du kan kliva i land.'); return; }
      const old = driving;
      setOccupant(old, null); driving = null;
      if (old === spawnedCar) { spot = { x: old.x, z: old.z, h: old.h }; removeCar(old); spawnedCar = null; }
      else spot = findBerth(M, old.x, old.z, 80, old);
    } else if (driving) exitCar();
    if (spawnedCar) removeCar(spawnedCar);
    if (!spot) spot = findSpawnSpot(M);
    if (!spot) { toast(M.boat ? 'Det finns inget vatten här i närheten. Gå ner till en kaj och försök igen.' : 'Det finns ingen plats för ' + M.def + ' här. Gå ut på en gata och försök igen.'); return; }
    // found every Dalahäst: your cars come in gold
    const c = makeCar(M, goldCars && !M.police && !M.mil && !M.boat && M.id !== 'taxi' ? 0xc9a227 : M.colors[Math.floor(Math.random() * M.colors.length)]);
    c.x = spot.x; c.z = spot.z; c.h = spot.h;
    spawnedCar = c;
    enterCar(c);
    camYaw = c.h;
    requestLock();
  }

  /* ---------- traffic upkeep ---------- */
  let botSpawnT = 0, npcCheckT = 0;
  function manageTraffic(dt) {
    botSpawnT -= dt;
    let bots = 0, police = 0, army = 0;
    // (the boats on the water are counted on their own, see WATER)
    for (const c of cars) { if (c.water) continue; if (c.military) army++; else if (c.police) police++; else if (c.bot) bots++; }
    // five stars: the army is called in, tanks, armoured cars and trucks of soldiers, from further off than the police
    const at = armyTarget();
    if (army < at && (armySpawnT -= dt) <= 0) {
      const kinds = cars.filter((c) => c.military && !c.water).map((c) => c.M.mil), n = (k) => kinds.filter((m) => m === k).length;
      const M = n('tank') < 2 ? MODEL.strv122 : n('truck') < 2 ? MODEL.miltruck : MODEL.patgb360;
      const c = spawnBot(230, M, 520);
      if (c) makeArmy(c);
      armySpawnT = 2;
    }
    if (bots < BOT_TARGET && botSpawnT <= 0) { spawnBot(130); botSpawnT = 0.5; }
    policeSpawnT -= dt;
    // with stars more patrols come, sooner and from nearer by, and from four stars the piket too
    const pt = policeTarget();
    if (police < pt && policeSpawnT <= 0) {
      const c = spawnBot(160, stars() >= 4 && Math.random() < 0.45 ? MODEL.piket : MODEL.polis, wanted ? 420 : 650);
      if (c) makePolice(c);
      policeSpawnT = wanted ? 2.5 : 6;
    }
    let parked = 0;
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (c === driving || c.keep || c === spawnedCar) continue;
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (c.police && c.police.state !== 'patrol') continue;
      // the extra patrols of a chase go home again once it is over
      if (c.military && !at && d > 140) { removeCar(c); continue; }
      if (c.police && !c.military && police > pt && d > 220) { removeCar(c); police--; continue; }
      if (c.bot) {
        if ((c.bot.stuckTotal > 12 && d > 70) || d > (c.police ? 800 : TRAFFIC_RANGE + 120)) removeCar(c);
        continue;
      }
      if ((c.dead && d > 110) || d > 420) { removeCar(c); continue; }
      parked++;
    }
    if (parked < PARKED_TARGET && botSpawnT <= 0.25) spawnParkedNear(140, 300);
    npcCheckT -= dt;
    if (npcCheckT <= 0) {
      npcCheckT = 0.4;
      let walkers = 0;
      for (let i = persons.length - 1; i >= 0; i--) {
        const p = persons[i];
        if (p === player || p.remote) continue;
        const d = Math.hypot(p.x - camTarget.x, p.z - camTarget.z);
        p.asleep = d > 150;
        p.model.group.visible = !p.asleep;
        if (p.keep) continue;
        if (d > 170 || (p.ai.state === 'wander' && p.ai.t <= 0 && d > 40)) { removePerson(p); continue; }
        if (p.ai.state === 'walk') walkers++;
      }
      if (walkers < NPC_COUNT) spawnWalker(70, 150);
    }
  }

  /* ================= simulation step ================= */
  function physicsStep(dt, pIntent) {
    // (a friend's car is moved by their game, and only shown here)
    for (const c of cars) if (!c.remote) updateCar(c, dt, c.input);
    carPairs();
    for (const c of cars) if (!c.remote && (c === driving || c.vx !== 0 || c.vz !== 0)) carWorld(c);
    if (driving) { player.x = driving.x; player.z = driving.z; player.rot = driving.h; player.y = 0; }
    else if (policeStop && policeStop.riding) { player.x = policeStop.car.x; player.z = policeStop.car.z; player.vx = player.vz = 0; }
    else if (MP.ride) { const c = MP.ride; player.x = c.x; player.z = c.z; player.y = 0; player.vx = c.vx; player.vz = c.vz; player.vy = 0; player.rot = c.h; }
    else personMove(player, dt, pIntent);
    for (const p of persons) {
      // someone who climbed out of a wreck during this step gets their first plan next frame
      if (p === player || p.asleep || !p.intent) continue;
      personMove(p, dt, p.intent);
      if (!driving) {
        const dx = p.x - player.x, dz = p.z - player.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.49 && d2 > 1e-6 && Math.abs(p.y - player.y) < 1.5) {
          const d = Math.sqrt(d2), pen = (0.7 - d) / 2;
          p.x += (dx / d) * pen; p.z += (dz / d) * pen; player.x -= (dx / d) * pen; player.z -= (dz / d) * pen;
        }
      }
    }
  }

  /* ================= visuals ================= */
  let clock = 0;
  function animatePerson(p, dt) {
    const G = p.model;
    G.group.position.set(p.x, p.y, p.z);
    G.group.rotation.y = p.rot;
    const hs = Math.hypot(p.vx, p.vz), k = 1 - Math.exp(-14 * dt);
    let lL, lR, aL, aR, az = 0, bob = 0;
    if (p.grounded) {
      p.walkPhase += hs * dt * 2.1;
      const amp = Math.min(1, hs / 4.6) * (hs > 6 ? 0.95 : 0.7), s = Math.sin(p.walkPhase);
      lL = s * amp; lR = -s * amp; aL = -s * amp * 0.9; aR = s * amp * 0.9;
      bob = hs > 0.3 ? Math.abs(Math.cos(p.walkPhase)) * 0.07 * amp : Math.sin(clock * 2.2 + p.walkPhase) * 0.012;
    } else { lL = -0.55; lR = 0.35; aL = -2.6; aR = -2.6; az = 0.25; }
    // handcuffed: both hands held together behind the back
    if (p.cuffed && p.grounded) { aL = aR = 0.45; az = -0.32; }
    G.legL.rotation.x = lerp(G.legL.rotation.x, lL, k);
    G.legR.rotation.x = lerp(G.legR.rotation.x, lR, k);
    G.armL.rotation.x = lerp(G.armL.rotation.x, aL, k);
    G.armR.rotation.x = lerp(G.armR.rotation.x, aR, k);
    G.armL.rotation.z = lerp(G.armL.rotation.z, az, k);
    G.armR.rotation.z = lerp(G.armR.rotation.z, -az, k);
    G.inner.position.y = lerp(G.inner.position.y, bob, k);
    G.inner.rotation.x = lerp(G.inner.rotation.x, p.grounded ? hs * 0.012 : 0, k);
  }
  function animate(dt) {
    clock += dt;
    for (const c of cars) {
      const vf = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h), a = (vf - c.prevVf) / Math.max(dt, 1e-3);
      c.prevVf = vf;
      const yawRate = (vf / c.M.wb) * Math.tan(c.steer), k = 1 - Math.exp(-6 * dt);
      if (c.M.mil && c.steerGroup) aimTurret(c, dt);
      if (c.M.boat) {
        // afloat: it bobs on the swell, lifts its bow as it climbs up to plane, and leans into the turns (a jet ski a lot)
        const jet = c.M.boat === 'jetski', av = Math.abs(vf), seed = c.seed || (c.seed = Math.random() * 10), t = clock + seed;
        const turn = (c.steer / 0.55) * clamp(av / 3 + 0.2, 0, 1) * (jet ? 1.7 : 0.75);
        const hump = av > 2 ? Math.exp(-Math.pow((av - 8) / 5, 2)) : 0;
        c.roll += (clamp(-Math.atan2(vf * turn, 9.81) * (jet ? 0.9 : 0.35), -0.55, 0.55) + Math.sin(t * 1.3) * 0.025 - c.roll) * k;
        c.pitch += (-0.09 * hump * (c.throttle > 0.1 ? 1 : 0.5) - 0.025 * clamp(av / 15, 0, 1) + Math.sin(t * 1.7) * 0.02 - c.pitch) * k;
        c.body.position.y = WATER_Y + Math.sin(t * 1.1) * 0.05 + 0.1 * clamp(av / 14, 0, 1);
        // (the jet ski's handlebars turn with the steering; the combat boat's gun is aimed, see aimTurret)
        if (c.steerGroup && !c.M.mil) c.steerGroup.rotation.y = c.steer;
        boatWake(c, dt);
      } else if (c.M.moped) {
        // a moped leans into the turn as far as the turn needs; parked it leans on its stand, knocked over it lies flat
        const cap = (14 * c.M.grip) / Math.max(Math.abs(vf), 5), yaw = clamp(yawRate, -cap, cap);
        const want = c.fallen || (Math.abs(vf) < 0.3 && !c.occupant ? -0.1 : clamp(-Math.atan2(vf * yaw, 9.81), -0.8, 0.8));
        c.roll += (want - c.roll) * (1 - Math.exp(-(c.fallen ? 9 : 5) * dt));
        c.pitch += (clamp(-a * 0.006, -0.06, 0.06) - c.pitch) * k;
        c.steerGroup.rotation.y = c.steer;
      } else {
        c.roll += (clamp(yawRate * vf * 0.0045, -0.07, 0.07) - c.roll) * k;
        c.pitch += (clamp(-a * 0.004, -0.05, 0.05) - c.pitch) * k;
        for (const w of c.wheels) w.pivot.rotation.set(0, (w.steers ? c.steer : 0) + w.toe, w.camber);
      }
      c.body.rotation.set(c.pitch, 0, c.roll);
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.h;
      c.plates.visible = !c.M.boat && Math.abs(c.x - camera.position.x) + Math.abs(c.z - camera.position.z) < 90;
      for (const s of c.spins) s.rotation.x = c.wheelRot;
      const glow = c.mat.userData.glow;
      glow.y = c.braking ? BRAKE_GLOW : TAIL_GLOW;
      c.mat.userData.rev.value = c.reversing && !c.dead ? 1.8 : 0;
      updateBlink(c, dt);
      updateEngine(c, vf, dt);
      damageFx(c, dt);
      if (c.M.police) policeLights(c, dt);
    }
    for (const p of persons) {
      if (p.knockT > 0) p.knockT -= dt;
      if (!p.asleep) animatePerson(p, dt);
    }
    const pointScale = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const fx of [smokeFx, sparkFx, bitsFx, fireFx, foamFx]) { fx.mat.uniforms.scale.value = pointScale; fx.update(dt); }
    waterNormal.offset.x += dt * 0.006; waterNormal.offset.y += dt * 0.0035;
    sky.material.uniforms.time.value = clock;
    if (nkSign) nkSign.rotation.y = clock * 0.5;
    updateDraken(dt);
    TIVOLI.update(dt);
    updateTreeLods();
    cullFar();
    updateFar();
  }

  function camClip(tx, ty, tz, cx, cz) {
    let tmin = 1;
    const dx = cx - tx, dz = cz - tz;
    forNear(Math.min(tx, cx) - 1, Math.min(tz, cz) - 1, Math.max(tx, cx) + 1, Math.max(tz, cz) + 1, (o) => {
      // (the camera sees through the iron cage of the lift in the yellow house)
      if (o.t === 1 || o.see || o.h < ty + 0.5 || (o.y0 !== undefined && o.y0 > ty + 0.3)) return;
      tmin = Math.min(tmin, rayBox(o, tx, tz, dx, dz, 0.3));
    });
    return Math.max(0.1, tmin);
  }
  function updateCamera(dt) {
    // in the back of a police car, or riding along with a friend, the camera follows the car just as when you drive
    const car = driving || (policeStop && policeStop.riding ? policeStop.car : null) || MP.ride;
    const vf = car ? car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h) : 0;
    let tx, ty, tz, want;
    if (car) { tx = car.x; ty = car.M.boat ? WATER_Y + (car.M.boat === 'jetski' ? 1.6 : 2.0) : car.M.bus ? 3.2 : car.M.moped ? 1.45 : 1.7; tz = car.z; want = (car.M.bus ? 15 : car.M.moped ? 5.2 : car.M.boat === 'jetski' ? 6.5 : car.M.boat ? 11 : 9.5) + Math.abs(vf) * 0.05; }
    else { tx = player.x; ty = player.y + 1.55; tz = player.z; want = STATION.inside(player.x, player.z) ? 4.2 : 6; }
    const kh = 1 - Math.exp(-(car ? 10 : 14) * dt);
    // indoors the camera comes in close and stays between the floor and the ceiling
    const span = car ? null : indoorSpan(player.x, player.z, player.y);
    if (span) want = 3.2;
    camTarget.x += (tx - camTarget.x) * kh;
    camTarget.z += (tz - camTarget.z) * kh;
    camTarget.y += (ty - camTarget.y) * (1 - Math.exp(-8 * dt));
    camDist += (want - camDist) * (1 - Math.exp(-4 * dt));
    if (!started) camYaw += dt * 0.1;
    else if (car && performance.now() - lastLook > 1500 && Math.abs(vf) > 1) camYaw = lerpAngle(camYaw, car.h, 1 - Math.exp(-2.5 * dt));
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    const t = camClip(camTarget.x, camTarget.y, camTarget.z, camTarget.x - Math.sin(camYaw) * cp * camDist, camTarget.z - Math.cos(camYaw) * cp * camDist);
    clipT = t < clipT ? t : Math.min(t, clipT + dt * 1.5);
    const dist = camDist * clipT;
    let cx = camTarget.x - Math.sin(camYaw) * cp * dist, cz = camTarget.z - Math.cos(camYaw) * cp * dist;
    let cy = Math.max(car && car.M.boat ? WATER_Y + 0.6 : 0.5, camTarget.y + sp * dist);
    // indoors at the police station the camera stays under the ceiling
    if (!car && (STATION.inside(player.x, player.z) || STATION.inside(cx, cz))) cy = Math.min(cy, STATION.GH - 0.3);
    if (span) cy = clamp(cy, span.floor + 0.4, span.ceil - 0.15);
    // so close that the camera would be inside your head: hide the body
    if (!car) player.model.group.visible = dist > 1.15;
    if (shake > 0.001) {
      cx += (Math.random() - 0.5) * shake; cy += (Math.random() - 0.5) * shake; cz += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-7 * dt);
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(camTarget);
    const fov = 62 + (reduceMotion ? 0 : Math.min(18, Math.abs(vf) * 0.25));
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
    sun.position.copy(camTarget).add(SUN_OFF);
    sun.target.position.copy(camTarget);
  }

  /* ================= HUD ================= */
  const el = {
    prompt: $('prompt'), promptText: $('promptText'), dash: $('dash'), kmh: $('kmh'), gear: $('gear'), blinkL: $('blinkL'), blinkR: $('blinkR'), bar: $('revbar'), rpm: $('rpm'), mode: $('gearMode'),
    engineRow: $('engineRow'), hpbar: $('hpbar'), hpText: $('hpText'), limit: $('limit'), limitNum: $('limitNum'), wanted: $('wanted'), wantedHint: $('wantedHint'), wantedTitle: $('wantedTitle'),
    fineTag: $('fineTag'), fines: $('fines'), horses: $('horses'), btnUp: $('btnUp'), btnDown: $('btnDown'),
    carName: $('carName'), help: $('help'), sound: $('soundLabel'), btnUse: $('btnUse'), btnJump: $('btnJump'), touch: $('touch'),
    start: $('start'), locStreet: $('locStreet'), locDistrict: $('locDistrict'), toast: $('toast'), liftPanel: $('liftPanel'), shiftHint: document.querySelector('.dash-foot .hint')
  };
  for (const b of el.liftPanel.querySelectorAll('button')) b.addEventListener('click', (e) => { e.preventDefault(); LIFT.go(Number(b.dataset.floor)); requestLock(); });
  let lastPrompt = null, lastDriving, locT = 0, toastT = 0, lastUse = '', lastFines = -1, lastHint = '', lastHorses = -1, lastStars = '';
  // the five wanted stars
  const starEls = [];
  {
    const NS = 'http://www.w3.org/2000/svg', box = $('stars'), heliTag = box.querySelector('.heli');
    for (let i = 0; i < 5; i++) {
      const svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      path.setAttribute('d', 'M12 2.4l2.95 6.2 6.75.85-4.98 4.65 1.3 6.7L12 17.5l-6.02 3.3 1.3-6.7L2.3 9.45l6.75-.85z');
      svg.append(path); box.insertBefore(svg, heliTag); starEls.push(svg);
    }
  }
  function toast(msg) { el.toast.textContent = msg; el.toast.hidden = false; toastT = Math.min(6.5, 2.2 + msg.length * 0.035); }
  function gearOf(c, vf) {
    if (c.reversing || c.inR) return 'R';
    if (c.M.boat) return Math.abs(vf) < 0.3 && c.throttle < 0.05 ? 'N' : 'F';
    if (c.M.ev || c.M.cvt) return Math.abs(vf) < 0.3 && c.throttle < 0.05 ? (c.M.cvt ? 'N' : 'P') : 'D';
    if (c.auto && Math.abs(vf) < 0.3 && c.throttle < 0.05) return 'N';
    return String(c.gear + 1);
  }
  function updateHUD(dt) {
    // at a kiosk or a balloon seller E buys, otherwise it is for the car you stand by
    // riding along with a friend, or by a friend's car you can get in
    const mpP = started ? MP.prompt() : null;
    const liftP = started && !driving ? LIFT.prompt() : null, shop = !liftP && started && !driving ? VENDORS.prompt() : null;
    const prompt = mpP || liftP || shop || (started && !driving && nearCar ? (nearCar.bot ? 'Ta ' + nearCar.M.def : 'Kliv in i ' + nearCar.M.def) : null);
    if (prompt !== lastPrompt) {
      lastPrompt = prompt;
      el.prompt.hidden = !prompt || isTouch;
      if (prompt) { el.promptText.textContent = prompt; el.prompt.classList.toggle('steal', !mpP && !shop && !liftP && !!nearCar && !!nearCar.bot); el.prompt.classList.toggle('shop', !mpP && !!shop); }
    }
    // the stars: as many lit as the police want you, flashing while they search for you; the helicopter beside them
    const ns = stars(), searching = !!wanted && !wanted.inSight && !policeStop, hl = !!heli && heli.state !== 'leave', army = !!wanted && cars.some((c) => c.military && c.police && c.police.state === 'chase');
    const sk = ns + ':' + searching + ':' + hl + ':' + army;
    if (sk !== lastStars) {
      const was = lastStars ? Number(lastStars.split(':')[0]) : 0;
      lastStars = sk;
      starEls.forEach((sv, i) => {
        sv.classList.toggle('on', i < ns);
        if (i < ns && i >= was) { sv.classList.remove('new'); void sv.getBoundingClientRect(); sv.classList.add('new'); }
      });
      const box = $('stars');
      box.classList.toggle('search', searching); box.classList.toggle('heli-on', hl); box.classList.toggle('army-on', army);
      box.setAttribute('aria-label', ns ? 'Efterlyst: ' + ns + ' av 5 stjärnor' + (hl ? ', helikoptern är ute' : '') : 'Polisen letar inte efter dig');
    }
    if (driving !== lastDriving) {
      lastDriving = driving;
      document.body.classList.toggle('driving', !!driving);
      el.dash.hidden = !driving;
      // (no speed limit signs out on the water)
      el.limit.hidden = !driving || !!driving.M.boat;
      if (driving) el.carName.textContent = driving.M.name;
      // (an electric car and a scooter's variator have no gears to change)
      el.shiftHint.hidden = !!driving && !!(driving.M.ev || driving.M.cvt || driving.M.boat);
      el.btnJump.textContent = driving ? 'Broms' : 'Hoppa';
      $('btnJob').textContent = driving && driving.M.mil === 'tank' ? 'Skjut' : 'Jobb';
      el.btnUp.hidden = el.btnDown.hidden = !driving;
    }
    const ph = policeStop && policeStop.phase;
    const vendor = !driving && VENDORS.near;
    const use = ph === 'talk' ? 'Skriv under' : ph === 'transport' || ph === 'park' ? 'Hoppa fram' : ph === 'jail' ? 'Sov' : mpP ? (MP.ride ? 'Kliv ur' : 'Åk med') : driving ? 'Kliv ur' : liftP ? 'Hissen' : vendor ? (vendor.seller ? 'Köp glass' : 'Köp ballong') : nearCar && nearCar.bot ? 'Ta bilen' : 'Kliv in';
    if (use !== lastUse) { el.btnUse.textContent = use; lastUse = use; }
    el.btnUse.classList.toggle('off', !mpP && !driving && !nearCar && !vendor && !liftP && !['talk', 'transport', 'park', 'jail'].includes(ph));
    if (driving) {
      const c = driving, vf = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
      const kmh = Math.round(Math.abs(vf) * 3.6), rf = clamp(c.rpm / (c.M.red * 1.04), 0, 1);
      el.kmh.textContent = kmh;
      el.blinkL.classList.toggle('on', !!c.blinkLit && !!(c.blink & 1));
      el.blinkR.classList.toggle('on', !!c.blinkLit && !!(c.blink & 2));
      el.gear.textContent = gearOf(c, vf);
      el.mode.textContent = c.M.boat ? (c.M.boat === 'jetski' ? 'Jet' : 'Båt') : c.M.cvt ? 'Variator' : c.M.ev ? 'El' : c.auto ? 'Auto' : 'Manuell';
      el.mode.classList.toggle('man', !c.auto && !c.M.boat);
      el.bar.style.width = (rf * 100).toFixed(1) + '%';
      el.bar.classList.toggle('red', c.rpm > c.M.red * 0.9);
      el.rpm.textContent = (Math.round(c.rpm / 50) * 50).toLocaleString('sv-SE') + ' rpm';
      el.engineRow.hidden = c.health >= 100;
      if (c.health < 100) {
        el.hpbar.style.width = c.health.toFixed(0) + '%';
        el.hpbar.style.background = c.health > 55 ? '#4cc26a' : c.health > 25 ? '#f7c600' : '#c8102e';
        el.hpText.textContent = c.dead ? 'Död' : Math.round(c.health) + ' %';
      }
      if (!c.M.boat) {
        const lim = limitAt(c.x, c.z, c.h);
        el.limitNum.textContent = lim;
        el.limit.classList.toggle('over', kmh > lim + 3 && !c.siren);
      }
    }
    // in the cell: how long until you are let out
    const jail = policeStop && policeStop.phase === 'jail';
    el.wanted.hidden = !wanted && !jail;
    if (jail) {
      const s = Math.max(0, Math.ceil(policeStop.jailT)), hint = 'Du släpps om ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + (policeStop.wait ? ' (du sover)' : '. E: sov så går tiden fortare');
      if (hint !== lastHint) { el.wantedHint.textContent = hint; el.wantedTitle.textContent = 'Häktet'; lastHint = hint; }
      el.wanted.classList.add('calm');
    } else if (wanted) {
      const title = policeStop ? (policeStop.mode === 'arrest' && policeStop.locked ? 'Gripen' : 'Poliskontroll') : 'Polisen jagar dig';
      const ph = policeStop && policeStop.phase;
      const hint = policeStop ? (ph === 'approach' || ph === 'parked' ? 'Sitt kvar, polisen parkerar' : ph === 'walk' ? 'Konstapeln kommer fram till dig'
        : ph === 'talk' ? 'Tryck E för att skriva under boten' : ph === 'flee' ? 'Du smet! Konstapeln springer tillbaka'
        : ph === 'order' ? 'Kliv ur bilen, du är gripen' : ph === 'cuff' ? 'Du får handbojor på dig' : ph === 'escort' || ph === 'board' ? 'Konstapeln för dig till polisbilen'
        : ph === 'transport' || ph === 'park' ? 'På väg till polisstationen. E hoppar fram' : ph === 'walkin' || ph === 'incell' ? 'Du förs in på polisstationen'
        : ph === 'water' ? 'Sjöpolisen tar dig till polisstationen' : 'Polisen kör snart vidare')
        : wanted.stopT > 0.2 ? 'Stå still …' : driving ? 'Kör in till kanten och stanna' : footCops.some((f) => f.mode === 'chase') ? 'Polisen springer efter dig!' : 'Polisen letar efter dig';
      if (hint !== lastHint) { el.wantedHint.textContent = hint; el.wantedTitle.textContent = title; lastHint = hint; }
      el.wanted.classList.toggle('calm', !!policeStop);
    }
    if (fines !== lastFines) { lastFines = fines; el.fineTag.hidden = !fines; el.fines.textContent = fmtKr(fines); }
    JOBS.hud();
    if (horsesFound.size !== lastHorses) { lastHorses = horsesFound.size; el.horses.textContent = lastHorses + '/' + HORSES.length; }
    locT -= dt;
    if (locT <= 0) {
      locT = 0.3;
      const x = driving ? driving.x : player.x, z = driving ? driving.z : player.z, ne = nearestEdge(x, z);
      el.locStreet.textContent = ne.e && ne.d < 10 ? ne.e.name : '';
      el.locDistrict.textContent = districtAt(x, z);
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.hidden = true; }
  }

  /* ---------- minimap ---------- */
  const mapEl = $('map'), mctx = mapEl.getContext('2d');
  let mapSize = 200, mapDpr = 1;
  function sizeMap() {
    const r = mapEl.getBoundingClientRect();
    mapDpr = Math.min(2, window.devicePixelRatio || 1);
    mapSize = r.width || 200;
    mapEl.width = Math.round(mapSize * mapDpr);
    mapEl.height = Math.round(mapSize * mapDpr);
  }
  // the whole city drawn once at MAP_K pixels per metre; the minimap and the big map both draw from it
  const MAP = { x0: BOUNDS.x0, z0: BOUNDS.z0, w: BOUNDS.x1 - BOUNDS.x0, h: BOUNDS.z1 - BOUNDS.z0 }, MAP_K = 0.5;
  const MAP_COL = { water: '#8fc1da', land: '#ebe6dc', green: '#a9cf8c', square: '#f6f2ea', rail: '#cdc6b9', road: '#ffffff', main: '#fbe7a6', edge: '#b9b2a5', ped: '#f4e4d2', lane: '#efe1c6' };
  const mapStatic = document.createElement('canvas');
  mapStatic.width = Math.round(MAP.w * MAP_K); mapStatic.height = Math.round(MAP.h * MAP_K);
  {
    const g = mapStatic.getContext('2d');
    g.setTransform(MAP_K, 0, 0, MAP_K, -MAP.x0 * MAP_K, -MAP.z0 * MAP_K);
    const fillPoly = (P, col) => { g.fillStyle = col; g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.fill(); };
    g.fillStyle = MAP_COL.water; g.fillRect(MAP.x0, MAP.z0, MAP.w, MAP.h);
    for (const L of LANDS) fillPoly(L.poly, MAP_COL.land);
    for (const P of mapGreens) fillPoly(P, MAP_COL.green);
    for (const P of mapSquares) fillPoly(P, MAP_COL.square);
    fillPoly(RAIL_YARD, MAP_COL.rail);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const roadStyle = (e) => (e.kind === 'ped' ? MAP_COL.ped : e.kind === 'lane' ? MAP_COL.lane : e.hw >= 7 ? MAP_COL.main : MAP_COL.road);
    for (const pass of [0, 1]) for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b];
      g.strokeStyle = pass ? roadStyle(e) : MAP_COL.edge;
      g.lineWidth = e.hw * 2 + (pass ? 0 : 2.4);
      g.beginPath(); g.moveTo(A.x, A.z); g.lineTo(B.x, B.z); g.stroke();
    }
    for (const [P, c] of mapPolys) { fillPoly(P, hex(shade(c, 0.82))); g.strokeStyle = 'rgba(80,70,60,.35)'; g.lineWidth = 0.8; g.stroke(); }
  }
  function drawMap() {
    const g = mctx, S = mapSize;
    g.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, TAU); g.clip();
    const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z, s = S / 250;
    g.translate(S / 2, S / 2);
    g.rotate(-Math.PI / 2 - Math.atan2(Math.cos(camYaw), Math.sin(camYaw)));
    g.scale(s, s);
    g.translate(-px, -pz);
    g.drawImage(mapStatic, MAP.x0, MAP.z0, MAP.w, MAP.h);
    JOBS.drawMini(g, px, pz, 1 / s);
    VENDORS.drawMini(g, px, pz, 1 / s);
    for (const c of cars) {
      // (a friend at the wheel is their dot, drawn below)
      if (c === driving || (c.remote && c.occupant) || Math.abs(c.x - px) > 160 || Math.abs(c.z - pz) > 160) continue;
      g.save(); g.translate(c.x, c.z); g.rotate(-c.h);
      const flash = c.siren && Math.floor(clock * 4) % 2;
      g.fillStyle = c.M.police ? (flash ? '#e0102e' : '#2f6bff') : hex(c.color); g.strokeStyle = c.bot || c.M.police ? '#11161b' : '#ffffff'; g.lineWidth = 0.9;
      const w = Math.max(2.6, c.M.W * 1.3), l = Math.max(5.2, c.M.L * 1.15);
      g.fillRect(-w / 2, -l / 2, w, l); g.strokeRect(-w / 2, -l / 2, w, l);
      g.restore();
    }
    if (heli) drawHeliIcon(g, heli.x, heli.z, heli.h, 1 / s, true);
    MP.drawMini(g, px, pz, 1 / s);
    const rot = driving ? driving.h : player.rot, u = 1 / s;
    g.translate(px, pz); g.rotate(-rot);
    g.beginPath(); g.moveTo(0, 9 * u); g.lineTo(6.5 * u, -6 * u); g.lineTo(0, -2.5 * u); g.lineTo(-6.5 * u, -6 * u); g.closePath();
    g.fillStyle = driving ? hex(driving.color) : '#ffffff'; g.strokeStyle = '#0a5ba8'; g.lineWidth = 2 * u; g.lineJoin = 'round';
    g.fill(); g.stroke();
    g.restore();
  }

  // the helicopter on the maps: the light on the ground, then a blue body under a turning rotor (u: metres per pixel)
  function drawHeliIcon(g, x, z, h, u, spot) {
    if (spot && heliModel && heliModel.patch.visible) {
      g.fillStyle = 'rgba(255,214,90,.45)'; g.beginPath(); g.arc(heli.spot.x, heli.spot.z, Math.max(4.5, 5 * u), 0, TAU); g.fill();
    }
    g.save(); g.translate(x, z); g.rotate(-h);
    const k = Math.max(1, u * 1.15);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(0, 0.8 * k, 6 * k, 0, TAU); g.fill();
    g.fillStyle = '#163d8c'; g.strokeStyle = '#fff'; g.lineWidth = 1.2 * u;
    g.beginPath(); g.ellipse(0, 1.2 * k, 1.9 * k, 3 * k, 0, 0, TAU); g.fill(); g.stroke();
    g.fillRect(-0.45 * k, -6 * k, 0.9 * k, 5 * k);
    g.strokeStyle = '#11161b'; g.lineWidth = 1.4 * u;
    const a = clock * 9;
    for (const d of [0, Math.PI / 2]) { g.beginPath(); g.moveTo(Math.cos(a + d) * 6 * k, 0.8 * k + Math.sin(a + d) * 6 * k); g.lineTo(-Math.cos(a + d) * 6 * k, 0.8 * k - Math.sin(a + d) * 6 * k); g.stroke(); }
    g.restore();
  }

  /* ---------- the big map ---------- */
  // Opened by clicking the minimap or pressing K. It pauses the game, shows the whole city with names,
  // and can be zoomed (wheel, + and −) and dragged around.
  const DISTRICT_LABELS = [['NORRMALM', -330, -800], ['ÖSTERMALM', 620, -900], ['VASASTAN', -880, -1600], ['KUNGSHOLMEN', -1500, -480], ['GAMLA STAN', -40, 300],
    ['RIDDARHOLMEN', -470, 150], ['BLASIEHOLMEN', 330, -430], ['SKEPPSHOLMEN', 690, 130], ['DJURGÅRDEN', 2150, 60], ['SÖDERMALM', -150, 1300], ['HELGEANDSHOLMEN', -170, -175],
    ['GÄRDET', 2050, -1250], ['NORRA DJURGÅRDEN', 1250, -2150], ['HAGASTADEN', -1500, -2250], ['LÅNGHOLMEN', -1420, 600], ['JOHANNESHOV', 150, 2700],
    ['HAMMARBY SJÖSTAD', 1350, 2450], ['LILJEHOLMEN', -1850, 2450], ['NACKA', 2700, 1800]];
  const WATER_LABELS = [['Riddarfjärden', -700, 330], ['Strömmen', 170, -175], ['Saltsjön', 2300, 820], ['Nybroviken', 700, -470], ['Klara sjö', -878, -620, -Math.PI / 2], ['Söderström', -120, 590],
    ['Mälaren', -2250, 450], ['Karlbergssjön', -1900, -1218], ['Djurgårdsbrunnsviken', 2050, -585], ['Lilla Värtan', 3170, -1300, -Math.PI / 2], ['Hammarby sjö', 900, 2068],
    ['Årstaviken', -1100, 2040], ['Danvikskanalen', 2010, 1580, -Math.PI / 2], ['Pålsundet', -1500, 752]];
  // one label per street, on its longest straight run (the junctions along it don't break a run)
  const STREET_LABELS = [];
  {
    const byName = new Map(), dir = (e) => [(nodes[e.b].x - nodes[e.a].x) / e.len, (nodes[e.b].z - nodes[e.a].z) / e.len];
    for (const e of edges) { if (!byName.has(e.name)) byName.set(e.name, []); byName.get(e.name).push(e); }
    for (const [name, list] of byName) {
      const used = new Set();
      let best = null;
      for (const e0 of list) {
        if (used.has(e0)) continue;
        const d0 = dir(e0), run = [e0];
        used.add(e0);
        for (const start of [e0.a, e0.b]) {
          let n = start;
          for (;;) {
            const next = list.find((f) => !used.has(f) && (f.a === n || f.b === n) && Math.abs(dir(f)[0] * d0[0] + dir(f)[1] * d0[1]) > 0.97);
            if (!next) break;
            used.add(next); run.push(next); n = next.a === n ? next.b : next.a;
          }
        }
        let lo = Infinity, hi = -Infinity, P = null, Q = null;
        for (const e of run) for (const i of [e.a, e.b]) {
          const s = nodes[i].x * d0[0] + nodes[i].z * d0[1];
          if (s < lo) { lo = s; P = nodes[i]; }
          if (s > hi) { hi = s; Q = nodes[i]; }
        }
        if (!best || hi - lo > best.len) best = { P, Q, len: hi - lo, major: run.some((e) => e.hw >= 7) };
      }
      let ang = Math.atan2(best.Q.z - best.P.z, best.Q.x - best.P.x);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      STREET_LABELS.push({ name, x: (best.P.x + best.Q.x) / 2, z: (best.P.z + best.Q.z) / 2, ang, len: best.len, major: best.major });
    }
  }
  const bigmap = { open: false, cx: 0, cz: 150, zoom: 0, drag: null, drawn: 0 };
  const MAJOR_LANDMARKS = ['Kungliga slottet', 'Stadshuset', 'Centralstationen', 'Riksdagshuset', 'Katarina kyrka', 'Vasamuseet', 'Hötorgsskraporna', 'Globen', 'Kaknästornet', 'Gröna Lund', 'Stadion'];
  const bm = { el: $('bigmap'), cv: $('bigmapCanvas') };
  function bigmapFit() { const r = bm.cv.getBoundingClientRect(); return Math.min(r.width / 4400, r.height / 4200); }
  function openBigmap() {
    if (!started || pickerOpen) return;
    bigmap.open = true; bm.el.hidden = false;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    for (const k in keys) keys[k] = false;
    joy.x = joy.y = 0;
    const p = driving || player;
    bigmap.cx = p.x; bigmap.cz = p.z; bigmap.zoom = 0;
    bigmap.cx = clamp(bigmap.cx, BOUNDS.x0 + 1500, BOUNDS.x1 - 1500); bigmap.cz = clamp(bigmap.cz, BOUNDS.z0 + 1400, BOUNDS.z1 - 1400);
    drawBigmap();
  }
  function closeBigmap() { bigmap.open = false; bm.el.hidden = true; requestLock(); }
  function drawBigmap() {
    if (!bigmap.open) return;
    bigmap.drawn = performance.now();
    const cv = bm.cv, r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'), W = r.width, H = r.height, k = bigmapFit() * Math.pow(2, bigmap.zoom);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MAP_COL.water; g.fillRect(0, 0, W, H);
    const toX = (x) => W / 2 + (x - bigmap.cx) * k, toY = (z) => H / 2 + (z - bigmap.cz) * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(mapStatic, toX(MAP.x0), toY(MAP.z0), MAP.w * k, MAP.h * k);
    const text = (t, x, y, font, fill, ang = 0, halo = 'rgba(255,255,255,.85)') => {
      g.save(); g.translate(x, y); g.rotate(ang); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (halo) { g.lineWidth = 3; g.strokeStyle = halo; g.strokeText(t, 0, 0); }
      g.fillStyle = fill; g.fillText(t, 0, 0); g.restore();
    };
    for (const [t, x, z, a] of WATER_LABELS) text(t, toX(x), toY(z), 'italic 600 ' + clamp(13 * Math.sqrt(k / 0.25), 11, 22) + 'px Overpass, sans-serif', '#2f6f93', a || 0, null);
    if (k > 0.32) for (const L of STREET_LABELS) {
      if (!L.major && k < 0.55) continue;
      g.save(); g.font = '700 ' + clamp(9 * k / 0.45, 9, 14) + 'px Overpass, sans-serif';
      const fits = g.measureText(L.name).width < L.len * k * 0.95;
      g.restore();
      if (fits) text(L.name, toX(L.x), toY(L.z), '700 ' + clamp(9 * k / 0.45, 9, 14) + 'px Overpass, sans-serif', '#4a4640', L.ang);
    }
    // names that would cover one already written are left out (zoom in to see them): the big landmarks first, then the
    // other buildings, the stations, and the parks and squares
    const placed = [], room = (t, X, Y, font) => {
      g.font = font;
      const w = g.measureText(t).width + 4, h = parseFloat(/(\d+(\.\d+)?)px/.exec(font)[1]) + 2, x0 = X - w / 2, y0 = Y - h / 2;
      for (const [bx, by, bw, bh] of placed) if (x0 < bx + bw && bx < x0 + w && y0 < by + bh && by < y0 + h) return false;
      placed.push([x0, y0, w, h]);
      return true;
    };
    const rank = ([t, , , kind]) => (kind === 'landmark' ? (MAJOR_LANDMARKS.includes(t) ? 0 : 1) : kind === 'tbana' ? 2 : 3);
    for (const [t, x, z, kind] of mapLabels.slice().sort((a, b) => rank(a) - rank(b))) {
      if (kind === 'landmark' && (k > 0.42 || MAJOR_LANDMARKS.includes(t))) {
        g.fillStyle = '#7a2a1a'; g.beginPath(); g.arc(toX(x), toY(z), 3, 0, TAU); g.fill();
        const font = '700 ' + clamp(10 * Math.sqrt(k / 0.3), 10, 15) + 'px Overpass, sans-serif';
        if (room(t, toX(x), toY(z) - 11, font)) text(t, toX(x), toY(z) - 11, font, '#5a2414');
      } else if (kind === 'tbana' && k > 0.18) {
        const X = toX(x), Y = toY(z);
        g.fillStyle = '#1062b4'; g.beginPath(); g.arc(X, Y, 7, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.font = '900 10px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('T', X, Y + 0.5);
        if (k > 0.4 && room(t, X, Y + 14, '700 11px Overpass, sans-serif')) text(t, X, Y + 14, '700 11px Overpass, sans-serif', '#1062b4');
      } else if ((kind === 'park' || kind === 'square') && k > 0.45 && room(t, toX(x), toY(z), 'italic 600 11px Overpass, sans-serif')) text(t, toX(x), toY(z), 'italic 600 11px Overpass, sans-serif', kind === 'park' ? '#3b6e2a' : '#6b6255');
    }
    for (const [t, x, z] of DISTRICT_LABELS) text(t, toX(x), toY(z), '900 ' + clamp(14 * Math.sqrt(k / 0.25), 12, 26) + 'px Overpass, sans-serif', 'rgba(40,36,30,.62)', 0, 'rgba(255,255,255,.6)');
    // the Dalahästar you have found
    if (k > 0.25) for (const h of horses) if (h.found) {
      const X = toX(h.x), Y = toY(h.z);
      g.fillStyle = '#c8102e'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X, Y - 6); g.lineTo(X + 5, Y); g.lineTo(X, Y + 6); g.lineTo(X - 5, Y); g.closePath(); g.fill(); g.stroke();
    }
    VENDORS.drawBig(g, toX, toY, k);
    JOBS.drawBig(g, toX, toY, k);
    // the army: dark green squares
    for (const c of cars) {
      if (!c.military || c === driving) continue;
      g.fillStyle = '#3d4a30'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.fillRect(toX(c.x) - 5, toY(c.z) - 5, 10, 10); g.strokeRect(toX(c.x) - 5, toY(c.z) - 5, 10, 10);
    }
    // police and you
    for (const c of cars) {
      if (!c.M.police || c === driving) continue;
      g.fillStyle = c.siren && Math.floor(performance.now() / 250) % 2 ? '#e0102e' : '#2f6bff';
      g.beginPath(); g.arc(toX(c.x), toY(c.z), 4.5, 0, TAU); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    }
    if (heli) { g.save(); g.translate(toX(heli.x), toY(heli.z)); g.scale(2.2, 2.2); drawHeliIcon(g, 0, 0, heli.h, 0.5, false); g.restore(); }
    // boats lying at the quays, waiting for someone
    for (const c of cars) {
      if (!c.M.boat || c === driving || c.occupant) continue;
      const X = toX(c.x), Y = toY(c.z);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#0a5ba8'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X - 6, Y - 2); g.lineTo(X + 6, Y - 2); g.lineTo(X + 3.5, Y + 3); g.lineTo(X - 3.5, Y + 3); g.closePath(); g.fill(); g.stroke();
    }
    if (spawnedCar && spawnedCar !== driving) {
      g.fillStyle = hex(spawnedCar.color); g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.fillRect(toX(spawnedCar.x) - 4, toY(spawnedCar.z) - 4, 8, 8); g.strokeRect(toX(spawnedCar.x) - 4, toY(spawnedCar.z) - 4, 8, 8);
    }
    MP.drawBig(g, toX, toY, text);
    const p = driving || player, rot = driving ? driving.h : player.rot, X = toX(p.x), Y = toY(p.z);
    g.save(); g.translate(X, Y); g.rotate(-rot);
    g.beginPath(); g.moveTo(0, 13); g.lineTo(9, -8); g.lineTo(0, -3); g.lineTo(-9, -8); g.closePath();
    g.fillStyle = driving ? hex(driving.color) : '#ffffff'; g.strokeStyle = '#0a5ba8'; g.lineWidth = 3; g.lineJoin = 'round'; g.fill(); g.stroke();
    g.restore();
    text('Du är här', X, Y + 24, '800 13px Overpass, sans-serif', '#0a5ba8');
  }
  {
    const zoomBy = (dz, mx, my) => {
      const r = bm.cv.getBoundingClientRect(), k0 = bigmapFit() * Math.pow(2, bigmap.zoom);
      const nz = clamp(bigmap.zoom + dz, 0, 3.8), k1 = bigmapFit() * Math.pow(2, nz);
      if (mx !== undefined) {
        const wx = bigmap.cx + (mx - r.left - r.width / 2) / k0, wz = bigmap.cz + (my - r.top - r.height / 2) / k0;
        bigmap.cx = wx - (mx - r.left - r.width / 2) / k1; bigmap.cz = wz - (my - r.top - r.height / 2) / k1;
      }
      bigmap.zoom = nz;
      drawBigmap();
    };
    bm.cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(-e.deltaY * 0.0018, e.clientX, e.clientY); }, { passive: false });
    bm.cv.addEventListener('pointerdown', (e) => { bigmap.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; bm.cv.setPointerCapture(e.pointerId); });
    bm.cv.addEventListener('pointermove', (e) => {
      const d = bigmap.drag;
      if (!d || d.id !== e.pointerId) return;
      const k = bigmapFit() * Math.pow(2, bigmap.zoom);
      bigmap.cx -= (e.clientX - d.x) / k; bigmap.cz -= (e.clientY - d.y) / k;
      d.x = e.clientX; d.y = e.clientY;
      drawBigmap();
    });
    const endDrag = (e) => { if (bigmap.drag && bigmap.drag.id === e.pointerId) bigmap.drag = null; };
    bm.cv.addEventListener('pointerup', endDrag);
    bm.cv.addEventListener('pointercancel', endDrag);
    bm.cv.addEventListener('dblclick', () => { const p = driving || player; bigmap.cx = p.x; bigmap.cz = p.z; drawBigmap(); });
    $('bigmapIn').addEventListener('click', () => zoomBy(0.6));
    $('bigmapOut').addEventListener('click', () => zoomBy(-0.6));
    $('bigmapClose').addEventListener('click', closeBigmap);
    bm.el.addEventListener('click', (e) => { if (e.target === bm.el) closeBigmap(); });
    $('map').addEventListener('click', (e) => { e.stopPropagation(); openBigmap(); });
  }


  /* ================= sound ================= */
  // Engines are synthesised from the firing frequency (rpm / 60 × cylinders / 2). Each engine type mixes it differently:
  // saw/sub/harm are the oscillator levels, noise the intake hiss, clatter the diesel knock, lope the uneven beat of a
  // V8 at idle, drive how hard the sound is distorted, cut/open the muffler (low-pass) and how far it opens with revs,
  // turbo the whistle, pops the crackle when you lift off at high revs.
  const ENGINE_SOUNDS = {
    i4: { cyl: 4, saw: 0.55, sub: 0.25, harm: 0.12, noise: 0.05, clatter: 0, lope: 0.05, drive: 1.6, cut: 240, open: 2.4, q: 0.9, turbo: 0, pops: 0, vol: 0.85 },
    i5: { cyl: 5, saw: 0.5, sub: 0.35, harm: 0.16, noise: 0.05, clatter: 0, lope: 0.24, lopeRatio: 0.5, drive: 2.2, cut: 260, open: 2.8, q: 1.3, turbo: 0.12, pops: 0, vol: 0.9 },
    i4t: { cyl: 4, saw: 0.55, sub: 0.25, harm: 0.16, noise: 0.07, clatter: 0, lope: 0.04, drive: 2.2, cut: 300, open: 3, q: 1.1, turbo: 0.55, pops: 0.15, vol: 0.9 },
    diesel: { cyl: 4, saw: 0.42, sub: 0.45, harm: 0.08, noise: 0.14, clatter: 0.55, lope: 0.08, drive: 2.6, cut: 190, open: 2.1, q: 0.8, turbo: 0.3, pops: 0, vol: 0.95 },
    bus: { cyl: 6, saw: 0.36, sub: 0.75, harm: 0.05, noise: 0.16, clatter: 0.45, lope: 0.1, drive: 3, cut: 120, open: 1.5, q: 0.7, turbo: 0.45, pops: 0, vol: 1.2 },
    flat6: { cyl: 6, saw: 0.6, sub: 0.3, harm: 0.38, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.08, clatter: 0, lope: 0.12, drive: 4.2, cut: 420, open: 4.6, q: 2.2, turbo: 0.85, pops: 0.6, vol: 1.0 },
    v8: { cyl: 8, saw: 0.6, sub: 0.8, subRatio: 0.25, harm: 0.18, noise: 0.08, clatter: 0, lope: 0.6, lopeRatio: 0.5, drive: 5, cut: 300, open: 3.4, q: 2.6, turbo: 0, pops: 1, vol: 1.15 },
    // electric motor: a clean whine that climbs with speed, no firing pulses at all
    ev: { cyl: 18, saw: 0, sub: 0, harm: 0.5, harmWave: 'sine', harmRatio: 1, noise: 0.05, clatter: 0, lope: 0, drive: 1, cut: 900, open: 1.6, q: 0.6, turbo: 0, pops: 0, vol: 0.55 },
    v10: { cyl: 10, saw: 0.55, sub: 0.2, harm: 0.55, harmWave: 'sawtooth', harmRatio: 2, noise: 0.06, clatter: 0, lope: 0.05, drive: 3.4, cut: 650, open: 6, q: 3, turbo: 0, pops: 0.8, vol: 1.0 },
    // BMW's straight six: smooth and even, a silky rasp at the top with a little turbo whistle
    i6: { cyl: 6, saw: 0.55, sub: 0.3, harm: 0.32, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.06, clatter: 0, lope: 0.03, drive: 2.6, cut: 330, open: 3.8, q: 1.5, turbo: 0.35, pops: 0.25, vol: 0.95 },
    // Ferrari's flat-plane V8: fires evenly like two fours, so no V8 burble, just a hard scream that climbs to 8 000
    v8flat: { cyl: 8, saw: 0.6, sub: 0.28, harm: 0.5, harmWave: 'sawtooth', harmRatio: 2, noise: 0.07, clatter: 0, lope: 0.03, drive: 3.8, cut: 620, open: 5.5, q: 2.8, turbo: 0.45, pops: 0.7, vol: 1.0 },
    // the F40's twin-turbo V8: flat-plane and raw, a loud whistle as the turbos come in, and the wastegates chattering
    // when you lift off on boost
    f40: { cyl: 8, saw: 0.62, sub: 0.3, harm: 0.46, harmWave: 'sawtooth', harmRatio: 2, noise: 0.12, clatter: 0, lope: 0.05, drive: 4.6, cut: 480, open: 4.6, q: 2.4, turbo: 1.7, pops: 0.9, flutter: 1, vol: 1.05 },
    // a 50 cc two-stroke single: fires on every turn, a thin buzzy rasp through the expansion pipe that goes
    // ring-ding-ding at idle, and the variator keeps it screaming while you ride
    // the tank's MTU V12 diesel: a deep rumble, the turbines whining over it and the clatter of the tracks
    tank: { cyl: 12, saw: 0.38, sub: 0.85, harm: 0.1, noise: 0.22, clatter: 0.65, lope: 0.12, drive: 3.4, cut: 170, open: 1.6, q: 0.8, turbo: 0.9, pops: 0, vol: 1.35 },
    // the jet ski's supercharged Rotax triple: a hard, high rasp with the supercharger whining over it
    jetski: { cyl: 3, saw: 0.5, sub: 0.22, harm: 0.42, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.22, clatter: 0, lope: 0.04, drive: 2.8, cut: 520, open: 3.4, q: 1.4, turbo: 1.1, pops: 0, vol: 0.85 },
    // a big V8 outboard: a deep burble through the water at idle that turns into a growl
    outboard: { cyl: 8, saw: 0.5, sub: 0.6, subRatio: 0.25, harm: 0.15, noise: 0.16, clatter: 0, lope: 0.4, lopeRatio: 0.5, drive: 3.2, cut: 240, open: 2.6, q: 1.7, turbo: 0, pops: 0.25, vol: 1.0 },
    twostroke: { cyl: 2, saw: 0.7, sub: 0.12, harm: 0.5, harmWave: 'square', harmRatio: 2, noise: 0.2, clatter: 0, lope: 0.22, lopeRatio: 1, drive: 3.2, cut: 950, open: 2.8, q: 3.8, turbo: 0, pops: 0.35, vol: 0.62 },
    // a V12 without turbos (the Aventador's, the LaFerrari's, the Countach's): smooth, and a high scream at the top
    v12: { cyl: 12, saw: 0.55, sub: 0.2, harm: 0.6, harmWave: 'sawtooth', harmRatio: 2, noise: 0.05, clatter: 0, lope: 0.02, drive: 3.6, cut: 760, open: 6.5, q: 3.2, turbo: 0, pops: 0.6, vol: 1.0 },
    // a V12 with turbos (the Huayra's AMG, the DBS's): deeper, rounder, the turbos hissing over it
    v12t: { cyl: 12, saw: 0.55, sub: 0.35, harm: 0.45, harmWave: 'sawtooth', harmRatio: 2, noise: 0.07, clatter: 0, lope: 0.03, drive: 3.4, cut: 520, open: 5, q: 2.6, turbo: 0.75, pops: 0.6, flutter: 0.4, vol: 1.05 },
    // the Chiron's W16 with four turbos: a deep, heavy roar, and a rush of air and whistles from the turbos
    w16: { cyl: 16, saw: 0.5, sub: 0.55, subRatio: 0.5, harm: 0.3, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.12, clatter: 0, lope: 0.05, drive: 3.2, cut: 380, open: 3.8, q: 1.8, turbo: 1.4, pops: 0.3, flutter: 0.6, vol: 1.1 },
    // the GT-R's V6 with two turbos: a hard, hissing growl
    v6: { cyl: 6, saw: 0.58, sub: 0.3, harm: 0.3, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.08, clatter: 0, lope: 0.08, drive: 3, cut: 320, open: 3.6, q: 1.6, turbo: 0.9, pops: 0.5, vol: 0.95 }
  };
  const TRAFFIC_VOICES = 3;
  let audio = null, muted = false;
  function shaperCurve(k) {
    const n = 512, c = new Float32Array(n), d = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / d; }
    return c;
  }
  function makeEngineVoice(ctx, dest, noiseBuf) {
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(dest); } else out.connect(dest);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
    const mix = ctx.createGain();
    mix.connect(shaper); shaper.connect(filt); filt.connect(out);
    const osc = (type) => { const o = ctx.createOscillator(); o.type = type; o.start(); return o; };
    const gain = (to) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(to); return g; };
    const a = osc('sawtooth'), b = osc('square'), h = osc('triangle');
    const ga = gain(mix), gb = gain(mix), gh = gain(mix);
    a.connect(ga); b.connect(gb); h.connect(gh);
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true; noise.start(0, Math.random() * 1.5);
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 0.9;
    const gn = gain(mix); noise.connect(nf); nf.connect(gn);
    // diesel knock: noise switched on and off by a square wave at the firing frequency
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1900; cf.Q.value = 1.6;
    const gc = gain(mix); noise.connect(cf); cf.connect(gc);
    const knock = osc('square'), gk = ctx.createGain(); gk.gain.value = 0; knock.connect(gk); gk.connect(gc.gain);
    // uneven firing: the whole mix swells and dips at crank speed
    const lope = osc('sine'), gl = ctx.createGain(); gl.gain.value = 0; lope.connect(gl); gl.connect(mix.gain);
    const turbo = osc('sine'), gt = gain(out); turbo.connect(gt);
    return { ctx, out, pan, filt, shaper, mix, a, b, h, ga, gb, gh, nf, gn, gc, gk, knock, lope, gl, turbo, gt, profile: null, P: null, car: null, boost: 0, prevLoad: 0 };
  }
  function setProfile(v, key) {
    if (v.profile === key) return;
    const P = ENGINE_SOUNDS[key], t = v.ctx.currentTime;
    v.profile = key; v.P = P;
    v.h.type = P.harmWave || 'triangle';
    v.shaper.curve = shaperCurve(P.drive);
    v.filt.Q.value = P.q;
    v.ga.gain.setValueAtTime(P.saw, t); v.gb.gain.setValueAtTime(P.sub, t); v.gh.gain.setValueAtTime(P.harm, t); v.gn.gain.setValueAtTime(P.noise, t);
    v.gc.gain.setValueAtTime(P.clatter * 0.5, t); v.gk.gain.setValueAtTime(P.clatter * 0.5, t);
    v.mix.gain.setValueAtTime(1 - P.lope * 0.5, t); v.gl.gain.setValueAtTime(P.lope * 0.5, t);
  }
  function driveVoice(v, c, level, pan, t) {
    const P = v.P, M = c.M, rpm = Math.max(1, c.rpm), T = 0.025;
    const f = (rpm / 60) * (P.cyl / 2), rf = clamp(rpm / M.red, 0, 1.05), load = c.load || 0;
    v.a.frequency.setTargetAtTime(f, t, T);
    v.b.frequency.setTargetAtTime(f * (P.subRatio || 0.5), t, T);
    v.h.frequency.setTargetAtTime(f * (P.harmRatio || 2), t, T);
    v.knock.frequency.setTargetAtTime(f, t, T);
    v.lope.frequency.setTargetAtTime((rpm / 60) * (P.lopeRatio || 0.5), t, T);
    v.nf.frequency.setTargetAtTime(Math.min(8000, f * 4 + 200), t, T);
    v.filt.frequency.setTargetAtTime(Math.min(12000, P.cut + f * P.open * (0.55 + load * 0.6)), t, 0.05);
    v.boost += ((load > 0.5 && rf > 0.35 ? rf : 0) - v.boost) * 0.08;
    v.turbo.frequency.setTargetAtTime(1400 + rpm * 0.9, t, 0.08);
    v.gt.gain.setTargetAtTime(P.turbo * v.boost * 0.02 * level, t, 0.08);
    let g = c.dead ? 0 : P.vol * level * (0.42 + 0.38 * load + 0.25 * rf);
    if (c.limiter && Math.random() < 0.5) g *= 0.2; // stutter against the rev limiter
    v.out.gain.setTargetAtTime(g * 0.12, t, c.limiter ? 0.01 : 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(pan, t, 0.05);
    // crackle and pops from the exhaust when you lift off at high revs
    if (P.pops && v.prevLoad > 0.6 && load < 0.1 && rf > 0.45 && !c.dead) pops(P.pops * level, pan, rf);
    if (P.flutter && v.prevLoad > 0.6 && load < 0.1 && v.boost > 0.25 && !c.dead) flutter(P.flutter * level, pan);
    v.prevLoad = load;
  }
  function noiseBurst(t, dur, peak, type, freq, q, pan, attack = 0.005) {
    const ctx = audio.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = audio.noise; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(audio.fx); } else g.connect(audio.fx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    return f;
  }
  function tone(t, type, f0, f1, dur, peak, pan) {
    const ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(audio.fx); } else g.connect(audio.fx);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function pops(level, pan, rf) {
    if (!audio || muted) return;
    const t0 = audio.ctx.currentTime;
    let t = t0 + 0.04;
    const n = 3 + Math.floor(Math.random() * 5 * rf);
    for (let i = 0; i < n; i++) {
      t += 0.03 + Math.random() * 0.11;
      noiseBurst(t, 0.05 + Math.random() * 0.04, (0.12 + Math.random() * 0.2) * level, 'lowpass', 700 + Math.random() * 900, 1.5, pan, 0.002);
    }
  }
  // a cannon: a crack, a deep boom rolling away, and the thud you feel
  function cannonSound(x, z, size) {
    if (!audio || muted) return;
    const s = placeSound(x, z, 700);
    if (s.level < 0.003) return;
    const t = audio.ctx.currentTime, L = Math.min(1, s.level * size);
    noiseBurst(t, 0.18, 0.6 * L, 'highpass', 1500, 0.5, s.pan, 0.001);
    const f = noiseBurst(t, 1.8, 0.9 * L, 'lowpass', 1200, 0.7, s.pan, 0.004);
    f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(110, t + 1.4);
    tone(t, 'sine', 85, 26, 1.1, 0.9 * L, s.pan);
  }
  // the wastegates chattering as you lift off on boost: a hiss, then a quick flutter
  function flutter(level, pan) {
    if (!audio || muted) return;
    const t0 = audio.ctx.currentTime + 0.02;
    noiseBurst(t0, 0.35, 0.09 * level, 'highpass', 2200, 0.7, pan, 0.01);
    for (let i = 0; i < 6; i++) noiseBurst(t0 + 0.05 + i * 0.045, 0.035, (0.07 - i * 0.008) * level, 'bandpass', 1300 + Math.random() * 500, 1.2, pan, 0.003);
  }
  // where a sound is relative to the camera: left/right pan, and how loud it is with distance
  function placeSound(x, z, range) {
    const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1;
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    return { pan: clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85, level: Math.pow(clamp(1 - d / range, 0, 1), 2), d };
  }
  function initAudio() {
    if (audio) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      const fx = ctx.createGain(); fx.gain.value = 1; fx.connect(master);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      audio = { ctx, master, fx, noise, player: null, traffic: [], siren: null, tyre: null };
      audio.player = makeEngineVoice(ctx, master, noise);
      for (let i = 0; i < TRAFFIC_VOICES; i++) audio.traffic.push(makeEngineVoice(ctx, master, noise));
      // tyre screech: narrow band of noise
      {
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.start();
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 5;
        const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 2300; f2.gain.value = 8;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(f2); f2.connect(g); g.connect(master);
        audio.tyre = { g, f };
        // the water rushing past a boat's hull and the hiss of its spray
        const src2 = ctx.createBufferSource(); src2.buffer = noise; src2.loop = true; src2.start(0, 0.7);
        const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 900; wf.Q.value = 0.5;
        const wg = ctx.createGain(); wg.gain.value = 0;
        src2.connect(wf); wf.connect(wg); wg.connect(master);
        audio.water = { g: wg, f: wf };
      }
      // siren: a square wave whose pitch sweeps (wail) or warbles fast (yelp)
      {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 700; o.start();
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 702; o2.start();
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
        const g = ctx.createGain(); g.gain.value = 0;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        o.connect(f); o2.connect(f); f.connect(g);
        if (p) { g.connect(p); p.connect(master); } else g.connect(master);
        audio.siren = { o, o2, g, p, phase: 0 };
      }
      // the helicopter: the thud of the blades (low noise chopped at the blade rate) over the whine of the turbines
      {
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.start();
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.8;
        const chop = ctx.createGain(); chop.gain.value = 0.35;
        const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 21; lfo.start();
        const lg = ctx.createGain(); lg.gain.value = -0.35; lfo.connect(lg); lg.connect(chop.gain);
        const thump = ctx.createOscillator(); thump.type = 'sine'; thump.frequency.value = 42; thump.start();
        const tg = ctx.createGain(); tg.gain.value = 0.25; thump.connect(tg); tg.connect(chop);
        const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 3150; whine.start();
        const wg = ctx.createGain(); wg.gain.value = 0;
        const g = ctx.createGain(); g.gain.value = 0;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        src.connect(lp); lp.connect(chop); chop.connect(g); whine.connect(wg); wg.connect(g);
        if (p) { g.connect(p); p.connect(master); } else g.connect(master);
        audio.rotor = { g, wg, p };
      }
    } catch { audio = null; }
  }
  function updateAudio(dt) {
    if (!audio) return;
    const t = audio.ctx.currentTime, quiet = paused() || !started;
    // your own car
    const pv = audio.player;
    if (driving && !quiet) {
      setProfile(pv, driving.M.eng);
      driveVoice(pv, driving, 1, 0, t);
      const sp = Math.hypot(driving.vx, driving.vz);
      audio.tyre.g.gain.setTargetAtTime(sp > 2 ? clamp((driving.slip - 2.4) * 0.03, 0, 0.16) : 0, t, 0.05);
      audio.tyre.f.frequency.setTargetAtTime(1000 + Math.min(600, driving.slip * 40), t, 0.1);
      airBrake(driving, 0, 1);
      if (driving.M.boat) { audio.water.g.gain.setTargetAtTime(0.03 + clamp(sp / 22, 0, 1) * 0.22, t, 0.1); audio.water.f.frequency.setTargetAtTime(500 + sp * 90, t, 0.1); audio.tyre.g.gain.setTargetAtTime(0, t, 0.05); }
      else audio.water.g.gain.setTargetAtTime(0, t, 0.1);
    } else {
      pv.out.gain.setTargetAtTime(0, t, 0.08); pv.gt.gain.setTargetAtTime(0, t, 0.08); audio.water.g.gain.setTargetAtTime(0, t, 0.1);
      audio.tyre.g.gain.setTargetAtTime(0, t, 0.05);
    }
    // the nearest few cars in traffic, each with its own engine sound
    const near = [];
    if (!quiet) for (const c of cars) {
      if (c === driving || !c.occupant || c.dead) continue;
      const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
      if (d < 70) near.push({ c, d });
    }
    near.sort((a, b) => a.d - b.d);
    const want = near.slice(0, TRAFFIC_VOICES).map((n) => n.c);
    for (const v of audio.traffic) if (v.car && !want.includes(v.car)) v.car = null;
    for (const c of want) if (!audio.traffic.some((v) => v.car === c)) { const v = audio.traffic.find((x) => !x.car); if (v) v.car = c; }
    for (const v of audio.traffic) {
      if (!v.car) { v.out.gain.setTargetAtTime(0, t, 0.1); v.gt.gain.setTargetAtTime(0, t, 0.1); continue; }
      const s = placeSound(v.car.x, v.car.z, 70);
      setProfile(v, v.car.M.eng);
      driveVoice(v, v.car, s.level * 0.8, s.pan, t);
      airBrake(v.car, s.pan, s.level);
    }
    // the loudest police siren
    let siren = null, sl = 0, sp = 0, yelp = false;
    if (!quiet) for (const c of cars) {
      if (!c.siren) continue;
      const s = placeSound(c.x, c.z, 320);
      if (s.level > sl) { sl = s.level; sp = s.pan; siren = c; yelp = c.yelp; }
    }
    const S = audio.siren;
    if (siren) {
      S.phase += dt * (yelp ? 3.2 : 0.28);
      const k = yelp ? Math.abs(((S.phase % 1) * 2) - 1) : 0.5 - 0.5 * Math.cos(S.phase * TAU);
      const f = 640 + k * (yelp ? 700 : 760);
      S.o.frequency.setTargetAtTime(f, t, 0.01); S.o2.frequency.setTargetAtTime(f * 1.003, t, 0.01);
      S.g.gain.setTargetAtTime(0.045 * sl + (siren === driving ? 0.02 : 0), t, 0.05);
      if (S.p) S.p.pan.setTargetAtTime(sp, t, 0.05);
    } else S.g.gain.setTargetAtTime(0, t, 0.08);
    // the helicopter overhead, heard from far off
    const R = audio.rotor;
    if (heli && !quiet) {
      const s = placeSound(heli.x, heli.z, 700), d3 = Math.hypot(s.d, heli.y - camera.position.y), lv = Math.pow(clamp(1 - d3 / 700, 0, 1), 2);
      R.g.gain.setTargetAtTime(0.9 * lv, t, 0.1); R.wg.gain.setTargetAtTime(0.012 * lv, t, 0.1);
      if (R.p) R.p.pan.setTargetAtTime(s.pan * 0.7, t, 0.1);
    } else R.g.gain.setTargetAtTime(0, t, 0.2);
  }
  // buses hiss when the air brakes hold them at a stop
  function airBrake(c, pan, level) {
    const sp = Math.hypot(c.vx, c.vz);
    if (c.M.bus && c.hadBrake && sp < 0.3 && !muted && level > 0.02) noiseBurst(audio.ctx.currentTime, 0.9, 0.12 * level, 'bandpass', 3200, 0.6, pan, 0.02);
    c.hadBrake = c.M.bus && (sp >= 0.3 ? c.braking || c.hadBrake : false);
  }
  function onShift(c, dir) {
    if (!audio || muted) return;
    const t = audio.ctx.currentTime, P = ENGINE_SOUNDS[c.M.eng];
    noiseBurst(t, 0.06, 0.03, 'lowpass', 380, 1, 0); // gearbox clunk
    if (dir > 0 && P.turbo > 0.4 && audio.player.boost > 0.35) noiseBurst(t + 0.02, 0.4, 0.07, 'highpass', 1900, 0.7, 0, 0.02); // blow-off valve
  }
  function crashSound(x, z, speed, glass) {
    if (!audio || muted) return;
    const s = placeSound(x, z, 120);
    if (s.level < 0.01) return;
    const t = audio.ctx.currentTime, k = Math.min(1, speed / 18) * s.level;
    // crunch of metal and plastic, a low thump, and a few panels ringing
    const f = noiseBurst(t, 0.35 + k * 0.3, 0.5 * k, 'lowpass', 3200, 0.8, s.pan, 0.003);
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    tone(t, 'sine', 120, 38, 0.32, 0.5 * k, s.pan);
    for (let i = 0; i < 3 + Math.round(k * 3); i++) {
      const f0 = 180 + Math.random() * 900;
      tone(t + Math.random() * 0.08, 'triangle', f0, f0 * 0.93, 0.25 + Math.random() * 0.35, 0.05 * k, s.pan);
    }
    if (glass) {
      noiseBurst(t + 0.01, 0.5, 0.3 * s.level, 'highpass', 3600, 0.7, s.pan, 0.002);
      for (let i = 0; i < 10; i++) { const f0 = 2600 + Math.random() * 4000; tone(t + 0.02 + Math.random() * 0.45, 'sine', f0, f0, 0.06 + Math.random() * 0.08, 0.04 * s.level, s.pan); }
    }
  }
  function beep(freqs, vol, len, pan = 0) {
    if (!audio || muted) return;
    const t = audio.ctx.currentTime;
    for (const f of freqs) {
      const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + len - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      if (pan && audio.ctx.createStereoPanner) { const p = audio.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(audio.fx); } else g.connect(audio.fx);
      o.start(t); o.stop(t + len + 0.02);
    }
  }
  // The indicators: c.blink is 1 for left, 2 for right and 3 for the hazard lights. They are lit for 0.4 s of every
  // 0.75 s (80 flashes a minute, starting lit), and in your own car the relay ticks. Like a real stalk, a left or right
  // signal drops back by itself once the car has turned that way and the wheel comes back to the middle
  function updateBlink(c, dt) {
    const bl = c.blink || 0, ind = c.mat.userData.ind;
    let lit = false;
    if (bl) { c.blinkT = (c.blinkT || 0) + dt; lit = c.blinkT % 0.75 < 0.4; } else c.blinkT = 0;
    ind.x = lit && bl & 1 ? IND_GLOW : 0; ind.y = lit && bl & 2 ? IND_GLOW : 0;
    if (c === driving && lit !== !!c.blinkLit) blinkTick(lit);
    c.blinkLit = lit;
    if (c === driving && (bl === 1 || bl === 2)) {
      c.blinkTurn = (c.blinkTurn || 0) + wrapAngle(c.h - (c.blinkH ?? c.h)) * (bl === 1 ? 1 : -1);
      if (c.blinkTurn > 0.5 && Math.abs(c.steer) < 0.08) c.blink = 0;
    }
    c.blinkH = c.h;
  }
  function setBlink(k) {
    const c = driving;
    if (!c || c.M.boat || paused()) return;
    c.blink = c.blink === k ? 0 : k; c.blinkT = 0; c.blinkTurn = 0;
  }
  function blinkTick(on) {
    if (!audio || muted) return;
    const t = audio.ctx.currentTime;
    noiseBurst(t, 0.022, on ? 0.1 : 0.075, 'bandpass', on ? 2900 : 2100, 4, 0, 0.001);
    tone(t, 'square', on ? 1500 : 1150, on ? 900 : 700, 0.018, 0.02, 0);
  }
  function horn() {
    if (!driving) return;
    beep(driving.M.moped ? [740] : driving.M.bus ? [220, 277] : driving.M.sport ? [523, 659] : [392, 494], driving.M.moped ? 0.035 : 0.05, driving.M.moped ? 0.3 : 0.45);
    MP.event('horn');
  }
  function honkAt(x, z) {
    const s = placeSound(x, z, 70);
    if (s.level > 0) beep([415, 523], 0.04 * s.level + 0.003, 0.3, s.pan);
  }
  function toggleMute() {
    muted = !muted;
    el.sound.textContent = muted ? 'Ljud av' : 'Ljud på';
    if (audio) audio.master.gain.setTargetAtTime(muted ? 0 : 1, audio.ctx.currentTime, 0.05);
  }

  /* ================= input ================= */
  function requestLock() {
    if (isTouch || !canvas.requestPointerLock || paused()) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* drag-to-look still works */ }
  }
  function look(dx, dy) {
    camYaw -= dx * 0.0032;
    camPitch = clamp(camPitch + dy * 0.0028, -0.4, 1.2);
    lastLook = performance.now();
  }
  function setTouchMode(on) {
    isTouch = on;
    document.body.classList.toggle('touch', on);
    el.touch.hidden = !(on && started);
    lastPrompt = undefined;
    sizeMap();
  }
  function startGame() {
    if (started) return;
    started = true;
    el.start.hidden = true;
    document.body.classList.add('playing');
    camYaw = player.rot;
    initAudio();
    setTouchMode(isTouch);
    requestLock();
  }
  $('play').addEventListener('click', startGame);
  $('pickerClose').addEventListener('click', () => { closePicker(); requestLock(); });
  $('picker').addEventListener('click', (e) => { if (e.target === $('picker')) closePicker(); });

  const NO_SCROLL = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  function onKey(code, repeat, t) {
    if (bigmap.open) {
      if (code === 'Escape' || code === 'KeyK') closeBigmap();
      return;
    }
    if (pickerOpen) {
      if (code === 'Escape') closePicker();
      else if (code === 'KeyB' && !repeat) pickerB(t);
      const m = /^Digit(\d)$/.exec(code), list = pickerSecret ? SECRET : PICKABLE;
      if (m) { const i = (Number(m[1]) + 9) % 10; if (list[i]) chooseModel(list[i]); }
      return;
    }
    if (!started) { if (code === 'Enter' || code === 'Space') startGame(); return; }
    if (repeat) return;
    // under arrest most keys do nothing: you can still look at the map, the help and the sound, and E moves things on
    if (policeStop && policeStop.locked && !['KeyE', 'Enter', 'KeyH', 'KeyT', 'KeyK', 'KeyQ'].includes(code) && !(policeStop.phase === 'jail' && code === 'Space')) return;
    if (code === 'KeyE' || code === 'Enter') { if (!useKey() && !MP.use() && !LIFT.use() && !VENDORS.use()) toggleCar(); }
    else if (/^(Digit|Numpad)[0-5]$/.test(code)) LIFT.digit(Number(code.slice(-1)));
    else if (code === 'Space') jumpQueued = true;
    else if (code === 'KeyH') el.help.hidden = !el.help.hidden;
    else if (code === 'KeyT') toggleMute();
    else if (code === 'KeyF') { if (!tankFire()) horn(); }
    else if (code === 'KeyR') resetToRoad();
    else if (code === 'KeyB') pickerB(t);
    else if (code === 'KeyM') playerShift(1);
    else if (code === 'KeyN') playerShift(-1);
    else if (code === 'KeyG') toggleGearbox();
    else if (code === 'KeyL') toggleSiren();
    else if (code === 'KeyK') openBigmap();
    else if (code === 'KeyQ') POST.cycle();
    else if (code === 'KeyJ') JOBS.key();
    else if (code === 'KeyV') VENDORS.letGo();
    else if (code === 'KeyZ') setBlink(1);
    else if (code === 'KeyX') setBlink(2);
    else if (code === 'KeyC') setBlink(3);
    else if (code === 'KeyP') MP.openPanel();
  }
  window.addEventListener('keydown', (e) => {
    if (MP.keydown(e)) return;
    if (bigmap.open) { if (e.code === 'Escape' || e.code === 'KeyK') { e.preventDefault(); onKey(e.code, e.repeat); } return; }
    if (pickerOpen) { if (e.code === 'Escape' || e.code === 'KeyB' || /^Digit\d$/.test(e.code)) { e.preventDefault(); onKey(e.code, e.repeat, e.timeStamp); } return; }
    // (P opens the friends' sign and focuses a field in it: the key itself must not type a "p" there)
    if (NO_SCROLL.includes(e.code) || (started && e.code === 'KeyP')) e.preventDefault();
    if (started) keys[e.code] = true;
    onKey(e.code, e.repeat, e.timeStamp);
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  let dragging = false, lastTouchAt = 0;
  canvas.addEventListener('mousedown', () => {
    if (!started || paused() || performance.now() - lastTouchAt < 800) return;
    dragging = true;
    requestLock();
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!started || paused()) return;
    if (document.pointerLockElement === canvas || dragging) look(e.movementX || 0, e.movementY || 0);
  });
  document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('locked', document.pointerLockElement === canvas); });

  let lookId = null, lookX = 0, lookY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    lastTouchAt = performance.now();
    if (!isTouch) setTouchMode(true);
    if (lookId !== null) return;
    lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    look((e.clientX - lookX) * 1.6, (e.clientY - lookY) * 1.6);
    lookX = e.clientX; lookY = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  const stick = $('stick'), knob = $('knob');
  let stickId = null;
  function moveStick(e) {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 12, l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    joy.x = dx / max; joy.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  el.btnJump.addEventListener('pointerdown', (e) => { e.preventDefault(); touchBrake = true; jumpQueued = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.btnJump.addEventListener(ev, () => { touchBrake = false; });
  el.btnUse.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!useKey() && !MP.use() && !LIFT.use() && !VENDORS.use()) toggleCar(); });
  $('btnCars').addEventListener('pointerdown', (e) => { e.preventDefault(); openPicker(); });
  $('btnJob').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!tankFire()) JOBS.key(); });
  el.btnUp.addEventListener('pointerdown', (e) => { e.preventDefault(); playerShift(1); });
  el.blinkL.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setBlink(1); });
  el.blinkR.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setBlink(2); });
  el.btnDown.addEventListener('pointerdown', (e) => { e.preventDefault(); playerShift(-1); });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    sizeMap();
    drawBigmap();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { signTex.redraw(); tTex.redraw(); polisTex.redraw(); if (nkSign) nkSign.userData.tex.redraw(); sizeMap(); drawBigmap(); }).catch(() => {});
  }

  // start sign distances from where you stand
  $('dGamla').textContent = fmtKm(Math.hypot(SPAWN.x + 262, SPAWN.z + 606));
  $('dSoder').textContent = fmtKm(Math.hypot(SPAWN.x - 150, SPAWN.z - 1420));
  $('dGloben').textContent = fmtKm(Math.hypot(SPAWN.x - GLOBE.x, SPAWN.z - GLOBE.z));
  buildPicker();

  /* ================= post-processing ================= */
  // Quality 2: the city mirrored in the water, ambient occlusion (the soft shade where things meet), bloom, anti-aliasing
  // and a photographic grade (contrast, colour, vignette, film grain). Quality 1: bloom, grade and anti-aliasing only.
  // Quality 0: straight to the screen as before. Q steps through them; a slow computer steps down by itself.
  // Everything is drawn to an off-screen picture first, in the same screen colours as before (tone mapping and fog
  // happen in the materials), and the passes work on that picture.
  const POST = (() => {
    const gl2 = renderer.capabilities.isWebGL2, depthOk = gl2 || renderer.extensions.has('WEBGL_depth_texture');
    const half = gl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const rt = (w, h, o = {}) => {
      const t = new THREE.WebGLRenderTarget(w, h, Object.assign({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false }, o));
      t.texture.generateMipmaps = false;
      return t;
    };
    const VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false; fsScene.add(quad);
    const draw = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

    // the picture of the scene, with the depth the occlusion pass reads
    const main = rt(1, 1, { depthBuffer: true });
    main.texture.encoding = THREE.sRGBEncoding;
    // (32-bit float depth where there is WebGL2: finer than 24-bit integer depth far off, where the occlusion needs it)
    if (depthOk) { main.depthTexture = new THREE.DepthTexture(1, 1); main.depthTexture.type = gl2 ? THREE.FloatType : THREE.UnsignedIntType; }

    /* ambient occlusion, at half size: a dozen samples in the half sphere above each point, then a blur that keeps edges */
    const DEPTH_FN = [
      'uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec2 uTan;',
      'float viewZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return (uNear * uFar) / ((uFar - uNear) * d - uFar); }',
      'vec3 viewPos(vec2 uv) { float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * uTan * -z, z); }'
    ].join('\n');
    const aoU = { tDepth: { value: main.depthTexture }, uNear: { value: 0.1 }, uFar: { value: 2400 }, uTan: { value: new THREE.Vector2() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uSeed: { value: 0 } };
    const aoMat = pass([
      DEPTH_FN,
      'uniform mat4 uProj; uniform vec2 uRes; uniform float uSeed; varying vec2 vUv;',
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main() {',
      // read the depth at the middle of one full-size pixel, where its position is exactly known: a half-size pixel
      // falls on the corner between four of them, and flat ground seen at a low angle would come out jagged
      '  vec2 uv = (floor(vUv * uRes) + 0.5) / uRes;',
      '  if (texture2D(tDepth, uv).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
      '  vec3 P = viewPos(uv);',
      '  if (-P.z > 160.0) { gl_FragColor = vec4(1.0); return; }',
      '  vec2 px = 1.0 / uRes;',
      '  vec3 r = viewPos(uv + vec2(px.x, 0.0)), l = viewPos(uv - vec2(px.x, 0.0)), t = viewPos(uv + vec2(0.0, px.y)), b = viewPos(uv - vec2(0.0, px.y));',
      '  vec3 dx = abs(r.z - P.z) < abs(P.z - l.z) ? r - P : P - l, dy = abs(t.z - P.z) < abs(P.z - b.z) ? t - P : P - b;',
      '  vec3 N = normalize(cross(dx, dy));',
      '  float a = hash(gl_FragCoord.xy + uSeed) * 6.2831853;',
      '  vec3 rv = vec3(cos(a), sin(a), 0.3), T = normalize(rv - N * dot(rv, N)), B = cross(N, T);',
      // (the tolerance grows with distance: depth is stored more coarsely further off, and on some GPUs it is read
      // back with less precision, which would otherwise darken flat ground)
      '  float rad = 0.9 * clamp(-P.z / 14.0, 0.5, 3.0), bias = 0.03 * rad + 1.5e-4 * P.z * P.z, occ = 0.0;',
      '  for (int i = 0; i < 12; i++) {',
      '    float s = (float(i) + 0.5) / 12.0, ang = float(i) * 2.3999632, h = sqrt(1.0 - s);',
      '    vec3 k = vec3(cos(ang) * h, sin(ang) * h, sqrt(s)) * mix(0.15, 1.0, s * s);',
      '    vec3 S = P + (T * k.x + B * k.y + N * k.z) * rad;',
      '    vec4 c = uProj * vec4(S, 1.0);',
      '    vec2 suv = c.xy / c.w * 0.5 + 0.5;',
      '    float sz = viewZ((floor(suv * uRes) + 0.5) / uRes);',
      '    occ += (sz >= S.z + bias ? 1.0 : 0.0) * smoothstep(0.0, 1.0, rad / abs(P.z - sz));',
      '  }',
      '  float ao = 1.0 - occ / 12.0;',
      '  gl_FragColor = vec4(vec3(mix(ao, 1.0, smoothstep(100.0, 160.0, -P.z))), 1.0);',
      '}'
    ].join('\n'), aoU);
    const aoBlurU = { tAO: { value: null }, tDepth: { value: main.depthTexture }, uNear: aoU.uNear, uFar: aoU.uFar, uTan: aoU.uTan, uRes: { value: new THREE.Vector2() } };
    const aoBlur = pass([
      DEPTH_FN,
      'uniform sampler2D tAO; uniform vec2 uRes; varying vec2 vUv;',
      'void main() {',
      '  float z0 = -viewZ(vUv), sum = 0.0, wsum = 0.0;',
      '  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {',
      '    vec2 uv = vUv + vec2(float(x), float(y)) / uRes;',
      '    float w = exp(-abs(-viewZ(uv) - z0) / (0.03 * z0 + 0.15));',
      '    sum += texture2D(tAO, uv).r * w; wsum += w;',
      '  }',
      '  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);',
      '}'
    ].join('\n'), aoBlurU);
    const aoA = rt(1, 1), aoB = rt(1, 1);

    /* bloom: the brightest parts, blurred over a chain of ever smaller pictures and back up again (dual Kawase) */
    const bloomPre = pass([
      'uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;',
      'void main() {',
      '  vec3 c = (texture2D(tSrc, vUv + vec2(-uPx.x, -uPx.y)).rgb + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)).rgb + texture2D(tSrc, vUv + vec2(-uPx.x, uPx.y)).rgb + texture2D(tSrc, vUv + vec2(uPx.x, uPx.y)).rgb) * 0.25;',
      '  float br = max(c.r, max(c.g, c.b)), knee = 0.18, soft = clamp(br - 0.82 + knee, 0.0, 2.0 * knee);',
      '  soft = soft * soft / (4.0 * knee + 1e-4);',
      '  gl_FragColor = vec4(c * max(soft, br - 0.82) / max(br, 1e-4), 1.0);',
      '}'
    ].join('\n'), { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } });
    const down = pass([
      'uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;',
      'void main() {',
      '  vec4 s = texture2D(tSrc, vUv) * 4.0 + texture2D(tSrc, vUv - uPx) + texture2D(tSrc, vUv + uPx) + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)) + texture2D(tSrc, vUv - vec2(uPx.x, -uPx.y));',
      '  gl_FragColor = s / 8.0;',
      '}'
    ].join('\n'), { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } });
    const up = pass([
      'uniform sampler2D tSrc, tAdd; uniform vec2 uPx; varying vec2 vUv;',
      'void main() {',
      '  vec4 s = texture2D(tSrc, vUv + vec2(-uPx.x * 2.0, 0.0)) + texture2D(tSrc, vUv + vec2(0.0, uPx.y * 2.0)) + texture2D(tSrc, vUv + vec2(uPx.x * 2.0, 0.0)) + texture2D(tSrc, vUv + vec2(0.0, -uPx.y * 2.0));',
      '  s += (texture2D(tSrc, vUv + vec2(-uPx.x, uPx.y)) + texture2D(tSrc, vUv + vec2(uPx.x, uPx.y)) + texture2D(tSrc, vUv + vec2(uPx.x, -uPx.y)) + texture2D(tSrc, vUv + vec2(-uPx.x, -uPx.y))) * 2.0;',
      '  gl_FragColor = s / 12.0 + texture2D(tAdd, vUv);',
      '}'
    ].join('\n'), { tSrc: { value: null }, tAdd: { value: null }, uPx: { value: new THREE.Vector2() } });
    const lvDown = [0, 1, 2, 3].map(() => rt(1, 1, { type: half })), lvUp = [0, 1, 2].map(() => rt(1, 1, { type: half }));

    /* the final picture: anti-aliasing (FXAA), occlusion, bloom and the grade */
    const finU = {
      tColor: { value: main.texture }, tAO: { value: aoB.texture }, tBloom: { value: lvUp[0].texture }, uPx: { value: new THREE.Vector2() },
      uAO: { value: 1 }, uBloom: { value: 0.32 }, uTime: { value: 0 }, uAspect: { value: 1 }, uShowAO: { value: 0 }
    };
    const finMat = pass([
      'uniform sampler2D tColor, tAO, tBloom; uniform vec2 uPx; uniform float uAO, uBloom, uTime, uAspect, uShowAO; varying vec2 vUv;',
      'vec3 fxaa(vec2 uv) {',
      '  vec3 nw = texture2D(tColor, uv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(tColor, uv + vec2(1.0, -1.0) * uPx).rgb;',
      '  vec3 sw = texture2D(tColor, uv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(tColor, uv + vec2(1.0, 1.0) * uPx).rgb, m = texture2D(tColor, uv).rgb;',
      '  vec3 L = vec3(0.299, 0.587, 0.114);',
      '  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);',
      '  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));',
      '  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));',
      '  float red = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125), rmin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);',
      '  dir = clamp(dir * rmin, vec2(-8.0), vec2(8.0)) * uPx;',
      '  vec3 a = 0.5 * (texture2D(tColor, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, uv + dir * (2.0 / 3.0 - 0.5)).rgb);',
      '  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, uv - dir * 0.5).rgb + texture2D(tColor, uv + dir * 0.5).rgb);',
      '  float lb = dot(b, L);',
      '  return (lb < lmin || lb > lmax) ? a : b;',
      '}',
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main() {',
      '  vec3 c = fxaa(vUv);',
      // a touch of colour fringing towards the corners, as in a real lens
      '  vec2 off = (vUv - 0.5) * 0.0016;',
      '  c.r = mix(c.r, texture2D(tColor, vUv + off).r, 0.5); c.b = mix(c.b, texture2D(tColor, vUv - off).b, 0.5);',
      '  vec3 lin = pow(max(c, 0.0), vec3(2.2));',
      '  lin *= mix(1.0, texture2D(tAO, vUv).r, uAO);',
      '  lin += pow(max(texture2D(tBloom, vUv).rgb, 0.0), vec3(2.2)) * uBloom;',
      // the grade: a little less candy colour, cool shadows and warm highlights, a soft S-curve
      '  float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));',
      '  lin = mix(vec3(lum), lin, 0.9);',
      '  lin *= mix(vec3(0.96, 1.0, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.02, 0.6, lum));',
      '  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));',
      '  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);',
      '  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);',
      '  c *= 1.0 - 0.32 * smoothstep(0.35, 1.05, length(q));',
      '  c += (hash(vUv * 1013.0 + uTime) - 0.5) * 0.022;',
      '  gl_FragColor = vec4(uShowAO > 0.5 ? texture2D(tAO, vUv).rrr : c, 1.0);',
      '}'
    ].join('\n'), finU);

    /* the city mirrored in the water: drawn from below the water surface, upside down, at about a third of the size */
    const refl = rt(1, 1, { depthBuffer: true });
    refl.texture.encoding = THREE.sRGBEncoding;
    const mirror = new THREE.PerspectiveCamera(), reflU = { tReflect: { value: refl.texture }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } };
    const WATER_Y = water.position.y, _p = new THREE.Plane(), _v4 = new THREE.Vector4(), _q = new THREE.Vector4(), _tgt = new THREE.Vector3(), _dir = new THREE.Vector3();
    water.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, reflU);
      sh.vertexShader = 'uniform mat4 uReflMatrix;\nvarying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvRefl = uReflMatrix * modelMatrix * vec4( transformed, 1.0 );');
      sh.fragmentShader = 'uniform sampler2D tReflect;\nuniform float uReflOn;\nvarying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <encodings_fragment>', [
        '#include <encodings_fragment>',
        '\tif ( uReflOn > 0.5 ) {',
        // the ripples break the mirror image up, less so far off where they are small on screen
        '\t\tvec2 wob = ( normal - geometryNormal ).xy * 0.05 * clamp( 14.0 / length( vViewPosition ), 0.1, 1.0 );',
        '\t\tvec3 refl = texture2D( tReflect, vRefl.xy / vRefl.w + wob ).rgb;',
        '\t\tfloat fres = 0.03 + 0.97 * pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 5.0 );',
        '\t\tgl_FragColor.rgb = mix( gl_FragColor.rgb, refl * vec3( 0.84, 0.92, 0.95 ), clamp( 0.22 + fres * 0.75, 0.0, 0.9 ) );',
        '\t}'
      ].join('\n'));
    };
    water.material.needsUpdate = true;
    // is any water in sight: look out from the camera across its field of view, each way until a house is in the way
    // (seen from up high, nothing is in the way)
    function waterInView() {
      camera.getWorldDirection(_dir);
      if (_dir.y > 0.6) return false;
      const yaw = Math.atan2(_dir.x, _dir.z), spread = (camera.fov * camera.aspect * Math.PI) / 360 + 0.15, high = camera.position.y > 25;
      for (let k = -4; k <= 4; k++) {
        const a = yaw + (k / 4) * spread, sx = Math.sin(a), sz = Math.cos(a);
        for (const d of [6, 12, 20, 32, 50, 80, 125, 200, 320, 500, 750]) {
          const x = camera.position.x + sx * d, z = camera.position.z + sz * d;
          if (!walkable(x, z)) return true;
          if (!high && blockedAt(x, z, 1)) break;
        }
      }
      return false;
    }
    function renderMirror() {
      camera.updateMatrixWorld();
      mirror.copy(camera);
      // (not the names over your friends' heads)
      mirror.layers.disable(1);
      mirror.position.set(camera.position.x, 2 * WATER_Y - camera.position.y, camera.position.z);
      camera.getWorldDirection(_dir);
      _tgt.copy(camera.position).add(_dir); _tgt.y = 2 * WATER_Y - _tgt.y;
      mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion); mirror.up.y = -mirror.up.y;
      mirror.lookAt(_tgt);
      mirror.updateMatrixWorld();
      mirror.updateProjectionMatrix();
      reflU.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
      // an oblique near plane on the water surface, so nothing below the water shows up in the mirror
      _p.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, WATER_Y, 0)).applyMatrix4(mirror.matrixWorldInverse);
      _v4.set(_p.normal.x, _p.normal.y, _p.normal.z, _p.constant);
      const e = mirror.projectionMatrix.elements;
      _q.set((Math.sign(_v4.x) + e[8]) / e[0], (Math.sign(_v4.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
      _v4.multiplyScalar(2 / _v4.dot(_q));
      e[2] = _v4.x; e[6] = _v4.y; e[10] = _v4.z + 1; e[14] = _v4.w;
      const sp = sky.position.clone(), sh = renderer.shadowMap.autoUpdate;
      water.visible = false; sky.position.copy(mirror.position); renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(refl); renderer.render(scene, mirror);
      water.visible = true; sky.position.copy(sp); renderer.shadowMap.autoUpdate = sh;
    }

    /* the street round the camera, for the reflections in the cars (CAR_PROBE): a small cube map, one side of it drawn a
       frame (every other frame at the middle setting) into the copy the cars are not reading from, and swapped in when
       all six sides are done. It sees 200 m out (the haze takes over beyond), without your own car or yourself, and the
       shadows are not drawn again for it. The sky dome is shrunk inside that range while it looks */
    const PROBE_SIZE = 256, probeRT = [0, 1].map(() => {
      const t = new THREE.WebGLCubeRenderTarget(PROBE_SIZE, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      t.texture.encoding = THREE.sRGBEncoding;
      return t;
    });
    const probeCam = new THREE.CubeCamera(0.3, 200, probeRT[0]), probeLast = new THREE.Vector3(1e9, 0, 0);
    let probeFace = 0, probeRead = 0, probeSkip = 0;
    CAR_PROBE.uProbeMip.value = Math.log2(PROBE_SIZE);
    function renderProbe() {
      const write = probeRT[1 - probeRead], at = camTarget;
      // moved far since the last side (into a car across the map, a teleport): start again, and show none until done
      if (probeLast.distanceToSquared(at) > 40 * 40) { probeFace = 0; CAR_PROBE.uProbeOn.value = 0; }
      probeLast.copy(at);
      probeCam.position.copy(at);
      probeCam.updateMatrixWorld();
      const car = driving || (policeStop && policeStop.riding ? policeStop.car : null) || MP.ride, hide = [player.model.group, car && car.group].filter((o) => o && o.visible);
      for (const o of hide) o.visible = false;
      const sp = sky.position.clone(), sh = renderer.shadowMap.autoUpdate;
      sky.position.copy(at); sky.scale.setScalar(0.12); renderer.shadowMap.autoUpdate = false;
      write.texture.generateMipmaps = probeFace === 5;
      renderer.setRenderTarget(write, probeFace);
      renderer.render(scene, probeCam.children[probeFace]);
      sky.position.copy(sp); sky.scale.setScalar(1); renderer.shadowMap.autoUpdate = sh;
      for (const o of hide) o.visible = true;
      if (++probeFace === 6) {
        probeFace = 0; probeRead = 1 - probeRead;
        CAR_PROBE.tProbe.value = write.texture; CAR_PROBE.uProbePos.value.copy(at); CAR_PROBE.uProbeOn.value = 1;
      }
    }

    let level = isTouch ? 1 : 2, W = 0, H = 0;
    const stats = { calls: 0, triangles: 0, mirror: false };
    let aoOn = true;
    const size = new THREE.Vector2();
    function resize() {
      renderer.getDrawingBufferSize(size);
      if (size.x === W && size.y === H) return;
      W = size.x; H = size.y;
      main.setSize(W, H);
      const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
      aoA.setSize(hw, hh); aoB.setSize(hw, hh);
      lvDown.forEach((t, i) => t.setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1))));
      lvUp.forEach((t, i) => t.setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1))));
      refl.setSize(Math.max(1, Math.round(W * 0.38)), Math.max(1, Math.round(H * 0.38)));
    }
    function render() {
      if (level === 0) {
        reflU.uReflOn.value = 0; CAR_PROBE.uProbeOn.value = 0; probeLast.set(1e9, 0, 0);
        renderer.setRenderTarget(null); renderer.render(scene, camera); return;
      }
      resize();
      if (level >= 2 || (probeSkip ^= 1)) renderProbe();
      const mirrored = level >= 2 && waterInView();
      reflU.uReflOn.value = mirrored ? 1 : 0;
      if (mirrored) renderMirror();
      renderer.setRenderTarget(main); renderer.render(scene, camera);
      stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles; stats.mirror = mirrored;
      const ao = level >= 2 && depthOk && aoOn;
      if (ao) {
        aoU.uNear.value = camera.near; aoU.uFar.value = camera.far;
        const ty = Math.tan((camera.fov * Math.PI) / 360);
        aoU.uTan.value.set(ty * camera.aspect, ty);
        aoU.uProj.value.copy(camera.projectionMatrix);
        aoU.uRes.value.set(W, H); aoU.uSeed.value = (aoU.uSeed.value + 1.37) % 100;
        draw(aoMat, aoA);
        aoBlurU.tAO.value = aoA.texture; aoBlurU.uRes.value.set(aoA.width, aoA.height);
        draw(aoBlur, aoB);
      }
      bloomPre.uniforms.tSrc.value = main.texture; bloomPre.uniforms.uPx.value.set(0.5 / W, 0.5 / H);
      draw(bloomPre, lvDown[0]);
      for (let i = 1; i < lvDown.length; i++) {
        down.uniforms.tSrc.value = lvDown[i - 1].texture; down.uniforms.uPx.value.set(0.5 / lvDown[i - 1].width, 0.5 / lvDown[i - 1].height);
        draw(down, lvDown[i]);
      }
      for (let i = lvUp.length - 1; i >= 0; i--) {
        const src = i === lvUp.length - 1 ? lvDown[i + 1] : lvUp[i + 1];
        up.uniforms.tSrc.value = src.texture; up.uniforms.tAdd.value = lvDown[i].texture; up.uniforms.uPx.value.set(0.5 / src.width, 0.5 / src.height);
        draw(up, lvUp[i]);
      }
      finU.uPx.value.set(1 / W, 1 / H); finU.uAO.value = ao ? 0.85 : 0; finU.uTime.value = (finU.uTime.value + 0.618) % 50; finU.uAspect.value = W / H;
      draw(finMat, null);
    }
    const NAMES = ['Enkel grafik', 'Mellangrafik: bloom, färgkorrigering och speglingar i bilarna', 'Högsta grafik: speglingar i vattnet och bilarna, skuggning och bloom'];
    return {
      render,
      get level() { return level; },
      setLevel(l, quiet) {
        level = clamp(l, 0, 2);
        sun.shadow.mapSize.setScalar(level >= 2 && renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        if (!quiet) toast(NAMES[level] + ' (Q byter).');
      },
      cycle() { this.setLevel((level + 2) % 3); },
      waterInView, stats,
      set ao(v) { aoOn = !!v; }, set showAO(v) { finU.uShowAO.value = v ? 1 : 0; }
    };
  })();
  POST.setLevel(POST.level, true);

  /* ================= playing with friends ================= */
  // Up to eight players in the same Stockholm. One of you opens a room and gets a code of four letters; the others type
  // the code in (or open the link with it) and join. The browsers talk straight to each other over WebRTC, with PeerJS's
  // free server only there to introduce them, and the one who opened the room passes everything on to the rest. Each of
  // you keeps your own traffic, police and Dalahästar. What goes between you is where you are and what you drive, and how:
  // its lamps, blinkers, siren, dents and the tank's gun. The horn and the chat go too, and you can ride along in a
  // friend's car. The others are shown a moment (DELAY) behind, smoothly in between the updates that come 15 times a second.
  const MP = (() => {
    const PROTO = 1, MAX = 8, SEND_MS = 66, DELAY = 140, PREFIX = 'gubbe-pa-vagen-', ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const PEER_SRC = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
    const COLORS = [0x2f6fdb, 0xc8102e, 0x2e8b57, 0xf2b705, 0x6a3d9a, 0xe46f2a, 0x1f9aa8, 0xb03a74, 0xe8e8e8, 0x222428];
    const COLOR_NAMES = ['Blå', 'Röd', 'Grön', 'Gul', 'Lila', 'Orange', 'Turkos', 'Rosa', 'Vit', 'Svart'];
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { /* a private window: forgotten next time */ } }
    };
    const params = new URLSearchParams(location.search);
    const E = {
      panel: $('mp'), setup: $('mpSetup'), room: $('mpRoom'), name: $('mpName'), colors: $('mpColors'), code: $('mpCode'), host: $('mpHost'), join: $('mpJoin'),
      codeBig: $('mpCodeBig'), codeHint: $('mpCodeHint'), share: $('mpShare'), copy: $('mpCopy'), list: $('mpList'), play: $('mpPlay'), leave: $('mpLeave'),
      status: $('mpStatus'), chatLog: $('mpChatLog'), sayInput: $('mpSayInput'), tag: $('mpTagText'), friends: $('btnFriends'), hudLog: $('chatLog'), bar: $('chatBar'), barInput: $('chatInput')
    };
    const S = {
      peer: null, host: false, code: '', joining: '', myId: '', hostId: '', hostConn: null, conns: new Map(), players: new Map(), busy: false, timer: 0,
      name: (store.get('gubbe-namn') || '').slice(0, 14), ride: null, near: null, lastCar: null, panel: false, chat: false
    };
    // you, as one of the riders in a car (the others are the players themselves)
    const me = { id: '', ident: playerId, mesh: null, seat: null };
    const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
    const colour = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);
    const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14);
    const cleanText = (t) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
    const inRoom = () => !!S.code;

    /* ---------- how you look ---------- */
    const look = () => ({ skin: playerId.skin, shirt: playerId.shirt, pants: playerId.pants, hair: playerId.hair, hat: playerId.hat, hatColor: playerId.hatColor, sleeves: playerId.sleeves });
    function cleanLook(o) {
      o = o && typeof o === 'object' ? o : {};
      return {
        skin: colour(o.skin, SKINS[0]), shirt: colour(o.shirt, COLORS[0]), pants: colour(o.pants, PANTS[0]), hair: colour(o.hair, HAIRS[1]),
        hat: o.hat === 'cap' || o.hat === 'beanie' ? o.hat : null, hatColor: colour(o.hatColor, 0xf7c600), sleeves: !!o.sleeves
      };
    }
    // put a person model in other clothes
    function dress(model, id) {
      model.inner.children[0].geometry = id.bodyGeo;
      model.legL.children[0].geometry = model.legR.children[0].geometry = id.legGeo;
      model.armL.children[0].geometry = model.armR.children[0].geometry = id.armGeo;
    }
    function applyShirt(col) {
      if (col === playerId.shirt) return;
      const id = makeIdentity({ ...look(), shirt: col });
      for (const k of ['bodyGeo', 'legGeo', 'armGeo', 'driverGeo']) playerId[k] = id[k];
      playerId.shirt = col;
      delete playerId.riderGeo;
      dress(player.model, playerId);
      if (driving) setOccupant(driving, playerId);
      store.set('gubbe-trojfarg', String(col));
      if (inRoom()) { event('look', { look: look() }); renderList(); }
    }
    {
      const saved = Number(store.get('gubbe-trojfarg'));
      if (COLORS.includes(saved)) applyShirt(saved);
    }

    /* ---------- connecting ---------- */
    const ICE = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
    ];
    // the line to the server, kept up while you are in a room: it can drop when the phone sleeps or the tab is in the background,
    // and while it is down nobody new can find the room. Called up again until it is back
    function keepLine() {
      const peer = S.peer;
      if (!peer || peer.destroyed || !peer.disconnected || !inRoom()) return;
      try { peer.reconnect(); } catch { /* tried again in a moment */ }
    }
    setInterval(keepLine, 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) keepLine(); });
    window.addEventListener('online', keepLine);

    /* ---------- the second way through ---------- */
    // some networks won't let a direct connection through, and the free TURN servers often don't answer. Then the game's
    // messages go via a free, open MQTT broker instead: a little slower, but it gets through almost everywhere.
    // The room listens on several brokers at once; whoever joins uses the first one that answers. ?relay=wss://… picks another
    const RELAY_SRC = ['https://cdn.jsdelivr.net/npm/mqtt@5.10.4/dist/mqtt.min.js', 'https://unpkg.com/mqtt@5.10.4/dist/mqtt.min.js'];
    const BROKERS = params.get('relay') ? [params.get('relay')] : ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
    const TOPIC = 'gubbe-pa-vagen/' + PROTO + '/', RELAY_ID = /^[\w-]{1,64}$/;
    const R = { clients: [], conns: new Map(), out: null, me: '', room: '' };
    let mqttLib = null;
    function loadMqtt() {
      if (window.mqtt) return Promise.resolve(window.mqtt);
      if (mqttLib) return mqttLib;
      mqttLib = new Promise((resolve, reject) => {
        let i = 0;
        const next = () => {
          if (i >= RELAY_SRC.length) { mqttLib = null; reject(new Error('mqtt')); return; }
          const s = document.createElement('script');
          s.src = RELAY_SRC[i++]; s.async = true;
          s.onload = () => (window.mqtt ? resolve(window.mqtt) : next());
          s.onerror = () => { s.remove(); next(); };
          document.head.append(s);
        };
        next();
      });
      return mqttLib;
    }
    // a connection over the broker that looks like a PeerJS one to the rest of the code: peer, open, send, close, on
    function relayConn(cl, peer, topic) {
      const ls = {};
      const conn = {
        peer, open: true, relay: true, seen: performance.now(),
        on(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); return conn; },
        emit(ev, a) { for (const fn of ls[ev] || []) fn(a); },
        send(m) { if (conn.open && cl.connected) cl.publish(topic, JSON.stringify({ f: R.me, m })); },
        close() {
          if (!conn.open) return;
          conn.open = false;
          try { if (cl.connected) cl.publish(topic, JSON.stringify({ f: R.me, bye: 1 })); } catch { /* gone already */ }
          if (R.conns.get(peer) === conn) R.conns.delete(peer);
          conn.emit('close');
        }
      };
      return conn;
    }
    const readRelay = (buf) => { try { const o = JSON.parse(String(buf)); return o && typeof o === 'object' && typeof o.f === 'string' && RELAY_ID.test(o.f) ? o : null; } catch { return null; } };
    // the room: listen on every broker for those knocking
    async function relayListen(code, me) {
      relayDown();
      try { await loadMqtt(); } catch { return; }
      if (!inRoom() || !S.host || S.myId !== me) return;
      R.me = me; R.room = code;
      for (const url of BROKERS) {
        let cl;
        try { cl = window.mqtt.connect(url, { connectTimeout: 8000, reconnectPeriod: 4000, keepalive: 30 }); } catch { continue; }
        R.clients.push(cl);
        cl.on('error', () => { /* it tries again by itself */ });
        cl.on('connect', () => cl.subscribe(TOPIC + code + '/h'));
        cl.on('message', (topic, buf) => {
          const o = readRelay(buf);
          if (!o || !inRoom() || !S.host || o.f === R.me) return;
          let conn = R.conns.get(o.f);
          if (o.bye) { if (conn) conn.close(); return; }
          if (!o.m || typeof o.m !== 'object') return;
          if (!conn || conn.cl !== cl) {
            if (o.m.t !== 'hi') return;
            if (conn) conn.close();
            conn = relayConn(cl, o.f, TOPIC + code + '/c/' + o.f);
            conn.cl = cl;
            R.conns.set(o.f, conn);
            accept(conn);
          }
          conn.seen = performance.now();
          conn.emit('data', o.m);
        });
      }
    }
    // joining: the first broker that answers, a door to the room on it
    async function relayKnock(code, me) {
      try { await loadMqtt(); } catch { return null; }
      let cl = R.clients[0];
      if (!cl || !cl.connected) {
        relayDown();
        for (const url of BROKERS) {
          if (S.joining !== code || S.myId !== me) return null;
          const c = await new Promise((res) => {
            let c0;
            try { c0 = window.mqtt.connect(url, { connectTimeout: 6000, reconnectPeriod: 0, keepalive: 30 }); } catch { res(null); return; }
            const t = setTimeout(() => fin(false), 7000);
            function fin(ok) { clearTimeout(t); if (ok) { res(c0); return; } try { c0.end(true); } catch { /* never was */ } res(null); }
            c0.once('connect', () => fin(true));
            c0.once('error', () => fin(false));
          });
          if (c) { cl = c; break; }
        }
        if (!cl || !cl.connected) return null;
        R.clients.push(cl);
        cl.options.reconnectPeriod = 4000;
        cl.on('error', () => { /* it tries again by itself */ });
        cl.on('message', (topic, buf) => {
          const o = readRelay(buf), conn = R.out;
          if (!o || !conn || o.f !== conn.peer) return;
          if (o.bye) { conn.close(); return; }
          if (!o.m || typeof o.m !== 'object') return;
          conn.seen = performance.now();
          conn.emit('data', o.m);
        });
        cl.on('connect', () => cl.subscribe(TOPIC + code + '/c/' + me));
        await new Promise((res) => cl.subscribe(TOPIC + code + '/c/' + me, () => res()));
      }
      R.me = me; R.room = code;
      if (R.out) R.out.close();
      R.out = relayConn(cl, PREFIX + code.toLowerCase(), TOPIC + code + '/h');
      return R.out;
    }
    function relayDown() {
      const all = [...R.conns.values(), R.out].filter(Boolean);
      R.conns.clear(); R.out = null;
      for (const c of all) c.close();
      for (const cl of R.clients) try { cl.end(false); } catch { /* gone already */ }
      R.clients = [];
    }
    // a relay connection that has gone quiet (the game sends 15 times a second) has gone
    setInterval(() => {
      const now = performance.now();
      for (const c of [...R.conns.values(), R.out]) if (c && c.open && now - c.seen > 25000) c.close();
    }, 2000);
    let peerLib = null;
    function loadPeer() {
      if (window.Peer) return Promise.resolve(window.Peer);
      if (peerLib) return peerLib;
      peerLib = new Promise((resolve, reject) => {
        let i = 0;
        const next = () => {
          if (i >= PEER_SRC.length) { peerLib = null; reject(new Error('peerjs')); return; }
          const s = document.createElement('script');
          s.src = PEER_SRC[i++]; s.async = true;
          s.onload = () => (window.Peer ? resolve(window.Peer) : next());
          s.onerror = () => { s.remove(); next(); };
          document.head.append(s);
        };
        next();
      });
      return peerLib;
    }
    function newPeer(id) {
      // ?peerserver=host:port uses a PeerJS server of your own instead of the free one
      // several ways through: STUN servers to find each other's address, and TURN servers that pass the traffic on when two networks won't let it straight through
      const opts = { debug: 0, config: { iceServers: ICE } }, own = params.get('peerserver');
      if (own) { const [host, port] = own.split(':'), p = Number(port) || 443; Object.assign(opts, { host, port: p, path: '/', secure: p === 443 }); }
      const peer = id ? new window.Peer(id, opts) : new window.Peer(opts);
      // the server only introduces players; if the line to it drops, the room carries on and it is called up again
      peer.on('disconnected', () => setTimeout(() => {
        if (S.peer === peer && !peer.destroyed && peer.disconnected) try { peer.reconnect(); } catch { /* tried again at the next drop */ }
      }, 1500));
      return peer;
    }
    function status(msg, err) { E.status.textContent = msg || ''; E.status.classList.toggle('err', !!err); }
    function busy(on) { S.busy = on; E.host.disabled = E.join.disabled = on; }
    function fail(msg) {
      const peer = S.peer;
      S.peer = null; S.hostConn = null;
      relayDown();
      if (peer) try { peer.destroy(); } catch { /* already gone */ }
      busy(false);
      status(msg, true);
    }
    function trouble(err) {
      // once you are in a room it carries on between the players already in it: only meeting new ones needs the server
      if (inRoom()) return;
      const t = err && err.type;
      fail(t === 'peer-unavailable' ? 'Hittade inget rum med koden ' + S.joining + '. Kolla koden, och att din vän har rummet öppet.'
        : t === 'browser-incompatible' ? 'Den här webbläsaren kan inte spela med vänner. Prova Chrome, Safari, Firefox eller Edge.'
        : 'Kunde inte nå servern som kopplar ihop spelarna. Kolla att du är uppkopplad och försök igen om en stund.');
    }
    function readyName() {
      S.name = cleanName(E.name.value);
      E.name.value = S.name;
      if (!S.name) { status('Skriv ditt namn först, så att dina vänner ser vem du är.', true); E.name.focus(); return false; }
      store.set('gubbe-namn', S.name);
      return true;
    }
    const noLib = 'Kunde inte hämta det som behövs för att spela med vänner. Kolla att du är uppkopplad mot internet.';
    async function hostRoom(tries = 0) {
      if ((S.busy && !tries) || inRoom() || !readyName()) return;
      busy(true); status('Skapar ett rum …');
      try { await loadPeer(); } catch { fail(noLib); return; }
      const code = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
      let peer;
      try { peer = newPeer(PREFIX + code.toLowerCase()); } catch { trouble({ type: 'browser-incompatible' }); return; }
      S.peer = peer;
      peer.on('open', (id) => { if (S.peer === peer && !inRoom()) { S.host = true; S.myId = S.hostId = id; enter(code); } });
      peer.on('connection', (conn) => { if (S.peer === peer) accept(conn); });
      peer.on('error', (err) => {
        if (S.peer !== peer) return;
        // someone already has that code: draw another
        if (err.type === 'unavailable-id' && !inRoom() && tries < 4) { S.peer = null; peer.destroy(); hostRoom(tries + 1); return; }
        trouble(err);
      });
    }
    async function joinRoom(raw) {
      const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      E.code.value = code;
      if (S.busy || inRoom()) return;
      if (code.length !== 4) { status('Rumskoden är fyra bokstäver. Fråga vännen som skapade rummet.', true); E.code.focus(); return; }
      if (!readyName()) return;
      busy(true); S.joining = code; status('Går med i rum ' + code + ' …');
      try { await loadPeer(); } catch { fail(noLib); return; }
      let peer;
      try { peer = newPeer(); } catch { trouble({ type: 'browser-incompatible' }); return; }
      S.peer = peer;
      let iceFailed = false, tries = 0, retry = null;
      const me0 = () => S.myId;
      const wait = setTimeout(() => {
        if (S.peer !== peer || inRoom()) return;
        clearTimeout(retry);
        fail(iceFailed ? 'Hittade rum ' + code + ', men era nätverk släpper inte igenom anslutningen. Prova ett annat nät, till exempel mobilens.'
          : 'Rum ' + code + ' svarar inte. Kolla koden, och att din vän har spelet öppet och framme på skärmen.');
      }, 32000);
      // knock on the room's door: first straight through, then (if nothing has come back) via the broker, and again
      const knock = async () => {
        if (S.peer !== peer || inRoom()) return;
        const n = tries++;
        if (n < 4) retry = setTimeout(knock, n === 0 ? 6000 : 8000);
        let conn;
        if (n === 0) {
          conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
          conn.on('iceStateChanged', (st) => { if (st === 'failed') iceFailed = true; });
        } else {
          if (n === 1) status('Går med i rum ' + code + ' en annan väg …');
          const me = me0();
          conn = await relayKnock(code, me);
          if (!conn || S.peer !== peer || inRoom() || S.myId !== me) return;
        }
        if (S.hostConn && S.hostConn !== conn) try { S.hostConn.close(); } catch { /* gone already */ }
        S.hostConn = conn;
        conn.on('data', (m) => clientData(conn, m, code, wait));
        conn.on('close', () => { if (S.hostConn === conn && inRoom()) hostGone(); });
        conn.on('error', () => { /* the close, or the wait running out, deals with it */ });
        const hi = () => conn.send({ t: 'hi', v: PROTO, name: S.name, look: look() });
        if (conn.relay) hi(); else conn.on('open', hi);
      };
      peer.on('open', (id) => {
        // (it fires again when the line to the server comes back: the connection to the room is still there)
        if (S.peer !== peer || S.hostConn) return;
        S.myId = id;
        knock();
        loadMqtt().catch(() => {});
      });
      peer.on('error', (err) => { if (S.peer === peer) { if (!inRoom()) clearTimeout(wait); trouble(err); } });
    }
    const info = (P) => ({ id: P.id, name: P.name, look: P.look });
    function broadcast(m, except) {
      for (const [id, c] of S.conns) if (id !== except && c.open) try { c.send(m); } catch { /* its close event drops it */ }
    }
    // you have the room: everyone else is connected to you, and you pass on what each of them sends
    function accept(conn) {
      conn.on('data', (m) => hostData(conn, m));
      conn.on('close', () => dropConn(conn));
      conn.on('error', () => dropConn(conn));
    }
    function hostData(conn, m) {
      if (!m || typeof m !== 'object' || !inRoom()) return;
      const id = conn.peer, P = S.players.get(id);
      if (m.t === 'hi') {
        // the same player again on a new connection: carry on over that one
        if (P) {
          const old = S.conns.get(id);
          if (old !== conn) { S.conns.set(id, conn); if (old) try { old.close(); } catch { /* gone already */ } }
          conn.send({ t: 'welcome', v: PROTO, host: S.myId, players: [{ id: S.myId, name: S.name, look: look() }, ...[...S.players.values()].filter((p) => p !== P).map(info)] });
          return;
        }
        const no = m.v !== PROTO ? 'old' : S.players.size + 1 >= MAX ? 'full' : '';
        if (no) { try { conn.send({ t: 'no', why: no }); } catch { /* gone already */ } setTimeout(() => conn.close(), 1000); return; }
        S.conns.set(id, conn);
        const np = addPlayer(id, m.name, m.look);
        conn.send({ t: 'welcome', v: PROTO, host: S.myId, players: [{ id: S.myId, name: S.name, look: look() }, ...[...S.players.values()].filter((p) => p !== np).map(info)] });
        broadcast({ t: 'join', ...info(np) }, id);
        toast(np.name + ' kom in i rummet.');
        return;
      }
      if (!P) return;
      if (m.t === 's') { if (take(P, m.d)) broadcast({ t: 's', id, d: m.d.slice(0, 11) }, id); }
      else if (m.t === 'e') { const e = cleanEvent(m, id); if (e) { heard(P, e); broadcast(e, id); } }
    }
    function dropConn(conn) {
      if (S.conns.get(conn.peer) !== conn) return;
      S.conns.delete(conn.peer);
      try { conn.close(); } catch { /* closed already */ }
      removePlayer(conn.peer, true);
      broadcast({ t: 'left', id: conn.peer });
    }
    function clientData(conn, m, code, wait) {
      if (!m || typeof m !== 'object' || S.hostConn !== conn) return;
      if (m.t === 'welcome') {
        if (inRoom()) return;
        clearTimeout(wait);
        S.host = false; S.hostId = String(m.host || conn.peer);
        for (const i of Array.isArray(m.players) ? m.players.slice(0, MAX) : []) if (i && typeof i.id === 'string' && i.id !== S.myId && !S.players.has(i.id)) addPlayer(i.id, i.name, i.look);
        enter(code);
        return;
      }
      if (m.t === 'no') { clearTimeout(wait); fail(m.why === 'full' ? 'Rummet är fullt. Det får plats åtta spelare.' : 'Ni har olika versioner av spelet. Ladda om sidan, alla som ska spela.'); return; }
      if (!inRoom()) return;
      const P = S.players.get(m.id);
      if (m.t === 's') { if (P) take(P, m.d); }
      else if (m.t === 'e') { if (P) heard(P, m); }
      else if (m.t === 'join') { if (!P && typeof m.id === 'string' && m.id !== S.myId && S.players.size + 1 < MAX) toast(addPlayer(m.id, m.name, m.look).name + ' kom in i rummet.'); }
      else if (m.t === 'left') { if (P) removePlayer(P.id, true); }
    }
    function hostGone() {
      const H = S.players.get(S.hostId), who = H ? H.name : 'Den som hade rummet';
      leave();
      toast(who + ' stängde rummet.');
      status(who + ' stängde rummet. Skapa ett eget rum, eller gå med i ett annat.', true);
    }
    function enter(code) {
      S.code = code; S.joining = '';
      busy(false); status('');
      clearInterval(S.timer);
      S.timer = setInterval(send, SEND_MS);
      showRoom(); hud();
      if (!S.host) toast('Du är med i rum ' + code + '.');
      else relayListen(code, S.myId);
    }
    function leave() {
      if (S.ride) unride(true);
      for (const id of [...S.players.keys()]) removePlayer(id, false);
      clearInterval(S.timer);
      const peer = S.peer;
      Object.assign(S, { peer: null, host: false, code: '', joining: '', myId: '', hostId: '', hostConn: null, lastCar: null, near: null });
      S.conns.clear();
      relayDown();
      if (peer) try { peer.destroy(); } catch { /* already gone */ }
      seats();
      busy(false); showSetup(); hud();
    }
    window.addEventListener('pagehide', () => { if (S.peer) try { S.peer.destroy(); } catch { /* closing anyway */ } });
    // (back to the page from the browser's history: that room is gone)
    window.addEventListener('pageshow', (e) => { if (e.persisted && inRoom()) { leave(); status('Du lämnade rummet.'); } });

    /* ---------- the other players ---------- */
    function addPlayer(id, name, lk) {
      const L = cleanLook(lk), ident = makeIdentity(L);
      const person = makePerson(ident, player.x, player.z, null);
      person.remote = true; person.keep = true; person.asleep = true; person.model.group.visible = false;
      const P = { id, name: cleanName(name) || 'Vän', look: L, ident, person, car: null, snaps: [], offset: null, st: null, stars: 0, tag: makeTag(), tagKey: '', mesh: null, seat: null };
      drawTag(P);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { P.tagKey = ''; drawTag(P); }).catch(() => {});
      S.players.set(id, P);
      renderList(); hud();
      return P;
    }
    function removePlayer(id, announce) {
      const P = S.players.get(id);
      if (!P) return;
      S.players.delete(id);
      dropCar(P);
      removePerson(P.person);
      if (P.mesh && P.mesh.parent) P.mesh.parent.remove(P.mesh);
      scene.remove(P.tag); P.tag.material.map.dispose(); P.tag.material.dispose();
      if (announce) toast(P.name + ' lämnade rummet.');
      renderList(); hud();
    }
    function dropCar(P) {
      const c = P.car;
      if (!c) return;
      if (S.ride === c) unride(true);
      removeCar(c);
      P.car = null;
    }
    // the name over a friend's head (or car), and their stars when the police are after them; seen through walls
    function makeTag() {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 96;
      const tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false }));
      s.center.set(0.5, 0); s.renderOrder = 20; s.visible = false;
      // (layer 1: drawn for the camera, but not in the mirror image in the water)
      s.layers.set(1);
      scene.add(s);
      return s;
    }
    function drawTag(P) {
      const key = P.name + ':' + P.look.shirt + ':' + P.stars;
      if (key === P.tagKey) return;
      P.tagKey = key;
      const cv = P.tag.material.map.image, g = cv.getContext('2d'), stars = '★'.repeat(P.stars);
      g.clearRect(0, 0, cv.width, cv.height);
      g.font = '900 46px Overpass, Arial, sans-serif';
      const tw = Math.min(330, g.measureText(P.name).width);
      g.font = '900 38px Arial, sans-serif';
      const sw = stars ? g.measureText(stars).width + 14 : 0, w = Math.min(cv.width - 8, 86 + tw + sw), x0 = (cv.width - w) / 2;
      roundRect(g, x0, 8, w, 78, 24); g.fillStyle = '#0a5ba8'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
      g.beginPath(); g.arc(x0 + 40, 47, 15, 0, TAU); g.fillStyle = hex(P.look.shirt); g.fill(); g.lineWidth = 4; g.stroke();
      g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.font = '900 46px Overpass, Arial, sans-serif';
      g.fillText(P.name, x0 + 66, 50, 330);
      if (stars) { g.fillStyle = '#f7c600'; g.font = '900 38px Arial, sans-serif'; g.fillText(stars, x0 + 66 + tw + 14, 49); }
      P.tag.material.map.needsUpdate = true;
    }
    // d: [time, x, y, z, heading, vx, vz, flags (1 on the ground, 2 in a vehicle, 4 handcuffed), stars, riding with (id or 0), car or 0]
    // car: [id, model, colour, x, z, heading, vx, vz, steering, gear, throttle, flags (1 brakes, 2 reversing, 4 blue lights,
    //       8 engine dead, 16 at the wheel), blinkers, engine health, turret, wheel slip]
    function take(P, d) {
      if (!Array.isArray(d) || d.length < 11) return false;
      const t = num(d[0], NaN), a = P.snaps;
      if (!isFinite(t) || (a.length && t <= a[a.length - 1].t)) return false;
      const pos = (v) => clamp(num(v), -9000, 9000), vel = (v) => clamp(num(v), -150, 150);
      const s = {
        t, x: pos(d[1]), y: clamp(num(d[2]), -10, 80), z: pos(d[3]), rot: num(d[4]), vx: vel(d[5]), vz: vel(d[6]), f: num(d[7]) | 0,
        stars: clamp(num(d[8]) | 0, 0, 5), ride: typeof d[9] === 'string' ? d[9] : '', c: null
      };
      const c = d[10];
      if (Array.isArray(c) && c.length >= 16 && typeof c[0] === 'string') {
        s.c = {
          id: c[0].slice(0, 12), m: typeof c[1] === 'string' && Object.prototype.hasOwnProperty.call(MODEL, c[1]) ? c[1] : 'halvkombi', col: num(c[2]), x: pos(c[3]), z: pos(c[4]), h: num(c[5]),
          vx: vel(c[6]), vz: vel(c[7]), st: clamp(num(c[8]), -1, 1), g: clamp(num(c[9]) | 0, 0, 9), th: clamp(num(c[10]), -1, 1), f: num(c[11]) | 0,
          b: clamp(num(c[12]) | 0, 0, 3), hp: clamp(num(c[13], 100), 0, 100), a: num(c[14]), slip: clamp(num(c[15]), 0, 30)
        };
      }
      // (each colour is a geometry of its own: only the ones the model comes in, and gold)
      if (s.c && !MODEL[s.c.m].colors.includes(s.c.col) && s.c.col !== 0xc9a227) s.c.col = MODEL[s.c.m].colors[0];
      a.push(s);
      if (a.length > 40) a.shift();
      // how far their clock is from ours, plus the quickest a message has come through
      const off = performance.now() - t;
      if (P.offset === null || off < P.offset) P.offset = off;
      return true;
    }
    function mix(A, B, k, ex) {
      const D = k < 0.5 ? A : B;
      const o = {
        x: lerp(A.x, B.x, k) + A.vx * ex, y: lerp(A.y, B.y, k), z: lerp(A.z, B.z, k) + A.vz * ex, rot: lerpAngle(A.rot, B.rot, k),
        vx: lerp(A.vx, B.vx, k), vz: lerp(A.vz, B.vz, k), f: D.f, stars: D.stars, ride: D.ride, c: D.c
      };
      const ca = A.c, cb = B.c;
      if (ca && cb && ca.id === cb.id) {
        o.c = Object.assign({}, D.c, {
          x: lerp(ca.x, cb.x, k) + ca.vx * ex, z: lerp(ca.z, cb.z, k) + ca.vz * ex, h: lerpAngle(ca.h, cb.h, k),
          vx: lerp(ca.vx, cb.vx, k), vz: lerp(ca.vz, cb.vz, k), st: lerp(ca.st, cb.st, k), a: lerpAngle(ca.a, cb.a, k)
        });
      }
      return o;
    }
    // where a player was at (their) time rt: in between two updates, or a little way on from the last one
    function sample(P, rt) {
      const a = P.snaps;
      if (!a.length) return null;
      while (a.length > 2 && a[1].t < rt - 400) a.shift();
      let i = a.length - 1;
      while (i > 0 && a[i].t > rt) i--;
      const A = a[i], B = a[i + 1];
      if (!B || rt <= A.t) return mix(A, A, 0, B ? 0 : clamp((rt - A.t) / 1000, 0, 0.25));
      return mix(A, B, (rt - A.t) / (B.t - A.t), 0);
    }
    function place(P, st, dt) {
      P.st = st;
      const cs = st.c;
      if (cs) {
        let c = P.car;
        if (!c || c.netId !== cs.id || c.M.id !== cs.m) {
          dropCar(P);
          c = makeCar(MODEL[cs.m], cs.col);
          Object.assign(c, { remote: true, keep: true, netId: cs.id, owner: P, x: cs.x, z: cs.z, h: cs.h });
          c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.h;
          P.car = c;
        }
        // at the wheel, or the car stands where they left it
        const on = !!(cs.f & 16);
        if (on !== (c.occupant === P.ident)) setOccupant(c, on ? P.ident : null);
        c.x = cs.x; c.z = cs.z; c.h = cs.h; c.steer = cs.st;
        c.vx = on ? cs.vx : 0; c.vz = on ? cs.vz : 0;
        c.wheelRot += ((c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h)) * dt) / c.M.R;
        c.gear = Math.min(cs.g, c.M.gears - 1); c.thr = on ? cs.th : 0; c.throttle = Math.abs(c.thr);
        c.braking = !!(cs.f & 1); c.reversing = !!(cs.f & 2); c.siren = !!(cs.f & 4); c.dead = !!(cs.f & 8);
        c.health = cs.hp; c.blink = cs.b; c.aimWant = cs.a; c.slip = on ? cs.slip : 0;
      } else if (P.car) dropCar(P);
      const p = P.person, hide = !!(st.f & 2) || !!st.ride;
      p.asleep = hide; p.model.group.visible = !hide;
      p.x = st.x; p.y = st.y; p.z = st.z; p.rot = st.rot; p.vx = st.vx; p.vz = st.vz;
      p.grounded = !!(st.f & 1); p.cuffed = !!(st.f & 4);
      if (st.stars !== P.stars) { P.stars = st.stars; drawTag(P); }
    }
    // what you send 15 times a second (see take)
    function state() {
      if (driving) S.lastCar = driving;
      const c = driving || (S.lastCar && S.lastCar.group.parent ? S.lastCar : null);
      if (!c) S.lastCar = null;
      if (c && !c.netId) c.netId = Math.random().toString(36).slice(2, 10);
      const hidden = !!driving || !!S.ride || !!(policeStop && policeStop.riding);
      const car = c ? [c.netId, c.M.id, c.color, r2(c.x), r2(c.z), r3(c.h), r2(c.vx), r2(c.vz), r3(c.steer), c.gear | 0, r2(c.thr || 0),
        (c.braking ? 1 : 0) | (c.reversing ? 2 : 0) | (c.siren ? 4 : 0) | (c.dead ? 8 : 0) | (c === driving ? 16 : 0), c.blink | 0, Math.round(c.health), r3(c.aim || 0), r1(c.slip || 0)] : 0;
      return [Math.round(performance.now()), r2(player.x), r2(player.y), r2(player.z), r3(player.rot), r2(player.vx), r2(player.vz),
        (player.grounded ? 1 : 0) | (hidden ? 2 : 0) | (player.cuffed ? 4 : 0), stars(), S.ride ? S.ride.owner.id : 0, car];
    }
    function send() {
      if (!inRoom()) return;
      const d = state();
      if (S.host) broadcast({ t: 's', id: S.myId, d });
      else if (S.hostConn && S.hostConn.open) try { S.hostConn.send({ t: 's', d }); } catch { /* its close event deals with it */ }
    }
    // the horn, the chat, a dent, the tank's gun and new clothes go to everyone at once
    function event(k, extra) {
      if (!inRoom()) return;
      const m = Object.assign({ t: 'e', k }, extra);
      if (S.host) broadcast(Object.assign(m, { id: S.myId }));
      else if (S.hostConn && S.hostConn.open) try { S.hostConn.send(m); } catch { /* its close event deals with it */ }
    }
    // an event as it may be passed on: only what it should hold, and not too often
    function cleanEvent(m, id) {
      const k = m.k, e = { t: 'e', k, id };
      if (k === 'horn') return e;
      if (k === 'chat') { const text = cleanText(m.m); return text ? Object.assign(e, { m: text }) : null; }
      if (k === 'dent') return typeof m.c === 'string' && Array.isArray(m.a) && m.a.length === 8 ? Object.assign(e, { c: m.c.slice(0, 12), a: m.a.map((v) => num(v)) }) : null;
      if (k === 'fire') return Object.assign(e, { a: num(m.a) });
      if (k === 'look') return Object.assign(e, { look: cleanLook(m.look) });
      return null;
    }
    function heard(P, m) {
      const atWheel = P.car && P.car.occupant === P.ident;
      if (m.k === 'horn') {
        const at = atWheel ? P.car : P.person, M = atWheel ? P.car.M : null, s = placeSound(at.x, at.z, 140);
        if (s.level > 0.01) beep(M && M.moped ? [740] : M && M.bus ? [220, 277] : M && M.sport ? [523, 659] : [392, 494], 0.05 * s.level + 0.004, M && M.moped ? 0.3 : 0.45, s.pan);
      } else if (m.k === 'chat') {
        const text = cleanText(m.m);
        if (text) { chat(P.name, P.look.shirt, text); if (audio && !muted) beep([988, 1319], 0.012, 0.09); }
      } else if (m.k === 'dent') {
        const a = m.a;
        if (P.car && P.car.netId === m.c && Array.isArray(a) && a.length === 8 && a.every((v) => typeof v === 'number' && isFinite(v))) {
          dentCar(P.car, clamp(a[0], -9, 9), clamp(a[1], -2, 6), clamp(a[2], -9, 9), clamp(a[3], -1, 1), clamp(a[4], -1, 1), clamp(a[5], 0, 0.7), clamp(a[6], 0, 1.5), clamp(a[7], 0, 80));
        }
      } else if (m.k === 'fire') {
        const now = performance.now();
        if (atWheel && P.car.M.mil === 'tank' && !(now - (P.firedAt || -1e9) < 2000)) { P.firedAt = now; P.car.aim = num(m.a); fireCannon(P.car, true); }
      } else if (m.k === 'look') {
        const now = performance.now();
        if (now - (P.lookAt || -1e9) < 800) return;
        P.lookAt = now;
        P.look = cleanLook(m.look); P.ident = makeIdentity(P.look);
        dress(P.person.model, P.ident);
        if (atWheel) setOccupant(P.car, P.ident);
        drawTag(P); renderList();
      }
    }

    /* ---------- riding along ---------- */
    // the seats a passenger can have, beside the driver first, in the car's own frame
    function seatsOf(c) {
      const d = c.geo.driver, r = c.geo.rear, M = c.M;
      if (rides(M)) return [{ x: 0, y: d.y + 0.04, z: d.z - 0.52 }];
      if (M.bus) return [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: i % 2 ? d.x : -d.x, y: d.y, z: d.z - 2.4 - Math.floor(i / 2) * 1.5 }));
      if (Math.abs(d.x) < 0.25) return [{ x: 0, y: d.y, z: d.z - 0.95 }];
      const s = [{ x: -d.x, y: d.y, z: d.z }];
      if (r) s.push({ x: -r.x, y: r.y, z: r.z }, { x: r.x, y: r.y, z: r.z });
      return s;
    }
    // the car someone drives (or last drove), as this game sees it
    function carOf(id) {
      if (id === S.myId) return driving || (S.lastCar && S.lastCar.group.parent ? S.lastCar : null);
      const P = S.players.get(id);
      return P ? P.car : null;
    }
    // everyone riding with someone sits in that car: in the order of their ids, so that every game seats them alike
    function seats() {
      me.id = S.myId; me.ident = playerId;
      const all = [me, ...S.players.values()], groups = new Map();
      for (const R of all) {
        R.seat = null;
        const car = R === me ? S.ride : R.st && R.st.ride ? carOf(R.st.ride) : null;
        if (!car) continue;
        if (!groups.has(car)) groups.set(car, []);
        groups.get(car).push(R);
      }
      for (const [car, list] of groups) {
        const spots = seatsOf(car);
        list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        list.forEach((R, i) => { if (spots[i]) R.seat = { car, spot: spots[i], n: i }; });
      }
      for (const R of all) {
        if (!R.seat) { if (R.mesh && R.mesh.parent) R.mesh.parent.remove(R.mesh); continue; }
        const { car, spot } = R.seat, geo = rides(car.M) ? riderGeometry(R.ident) : R.ident.driverGeo;
        if (!R.mesh) R.mesh = new THREE.Mesh(geo, personMat);
        R.mesh.geometry = geo;
        if (R.mesh.parent !== car.body) car.body.add(R.mesh);
        R.mesh.position.set(spot.x, spot.y, spot.z);
      }
    }
    // a friend's car with them at the wheel, near enough to get in, and not going too fast to
    function rideable() {
      if (driving || S.ride || !started || (policeStop && policeStop.locked) || player.y > 1.5) return null;
      let best = null, bd = Infinity;
      for (const P of S.players.values()) {
        const c = P.car;
        if (!c || c.occupant !== P.ident || Math.hypot(c.vx, c.vz) > 6) continue;
        const dx = player.x - c.x, dz = player.z - c.z, d = dx * dx + dz * dz;
        if (d > 100 || d >= bd) continue;
        const co = Math.cos(c.h), si = Math.sin(c.h), lx = dx * co - dz * si, lz = dx * si + dz * co;
        if (Math.abs(lx) < c.M.W / 2 + 1.6 && Math.abs(lz) < c.M.L / 2 + 1.2 && (!c.M.boat || player.y < 0.5)) { bd = d; best = c; }
      }
      return best;
    }
    function ride(c) {
      const taken = [...S.players.values()].filter((P) => P.st && P.st.ride === c.owner.id).length;
      if (taken >= seatsOf(c).length) { toast('Det finns ingen plats kvar i ' + c.M.def + '.'); return; }
      S.ride = c;
      player.model.group.visible = false;
      player.vx = player.vz = player.vy = 0;
      lastLook = -1e9;
      seats();
      toast('Du åker med ' + c.owner.name + '.' + (isTouch ? '' : ' E kliver ur.'));
    }
    // out on the passenger's side if there is room
    function rideExit(c) {
      if (c.M.boat) return boatExitSpot(c);
      const co = Math.cos(c.h), si = Math.sin(c.h), side = c.geo.driver.x > 0 ? -1 : 1, hw = c.M.W / 2 + 0.8;
      for (const [lx, lz] of [[side * hw, c.geo.driver.z], [side * hw, 0]]) {
        const x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
        if (personFits(x, z) && !blockedAt(x, z, 0.36) && !cars.some((o) => o !== c && byCar(o, x, z, 0.3))) return { x, z };
      }
      return exitSpot(c);
    }
    function unride(force) {
      const c = S.ride;
      if (!c) return true;
      let out = rideExit(c) || (force ? spotNear(c.x, c.z) : null);
      // far out on the water: put ashore at the nearest street corner instead of on the water
      if (!out && force) {
        let bd = Infinity;
        for (const n of nodes) { const d = Math.hypot(n.x - c.x, n.z - c.z); if (d < bd && personFits(n.x, n.z)) { bd = d; out = { x: n.x, z: n.z }; } }
      }
      if (!out && !force) { toast(c.M.boat ? 'Vänta tills båten ligger vid en kaj, så kan du kliva i land.' : 'Det finns ingen plats att kliva ur här.'); return false; }
      S.ride = null;
      seats();
      player.model.group.visible = true;
      if (out) { player.x = out.x; player.z = out.z; camTarget.set(out.x, 1.6, out.z); }
      const sp = Math.hypot(c.vx, c.vz);
      player.y = 0; player.rot = c.h; player.vx = c.vx * 0.5; player.vz = c.vz * 0.5; player.vy = 0;
      if (sp > 5 && !c.M.boat) { player.vy = 4.5; player.grounded = false; player.knockT = 1.2; toast('Du hoppade ur i farten!'); }
      return true;
    }
    function use() {
      if (S.ride) { unride(false); return true; }
      if (S.near) { ride(S.near); return true; }
      return false;
    }
    // somewhere to stand near (x, z)
    function spotNear(x, z) {
      for (const r of [2.5, 4, 6, 9, 13, 18, 25, 35, 50, 70, 100]) for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (personFits(px, pz) && !blockedAt(px, pz, 0.4) && !STATION.inside(px, pz) && !cars.some((c) => byCar(c, px, pz, 0.4))) return { x: px, z: pz };
      }
      return null;
    }
    // straight to a friend: out of your car and onto the pavement beside them
    function goTo(P) {
      if (policeStop && policeStop.locked) { status('Det går inte nu, du är gripen.', true); return; }
      // (the game stands still behind the sign: bring everyone up to date first)
      update(0);
      if (!P.st) { status(P.name + ' har inte kommit in i spelet än.', true); return; }
      const at = P.car && P.car.occupant === P.ident ? P.car : (P.st.ride && carOf(P.st.ride)) || P.person;
      const spot = spotNear(at.x, at.z);
      if (!spot) { status('Hittade ingen plats bredvid ' + P.name + ' just nu. Försök igen om en stund.', true); return; }
      if (S.ride) unride(true);
      if (driving && !exitCar()) { closePanel(); return; }
      player.x = spot.x; player.z = spot.z; player.y = 0; player.vx = player.vz = player.vy = 0;
      player.rot = camYaw = Math.atan2(at.x - spot.x, at.z - spot.z);
      camTarget.set(player.x, 1.6, player.z);
      closePanel();
      if (!started) startGame();
      toast('Du är hos ' + P.name + '.');
    }

    /* ---------- every frame ---------- */
    function update(dt) {
      if (!inRoom()) { S.near = null; return; }
      const now = performance.now();
      for (const P of S.players.values()) {
        if (P.offset === null) continue;
        // (the clocks drift a little, and the way between you can get slower: let the offset creep up, the next quick
        // message pulls it back. Running out of updates for a while means the lag has grown: catch up faster)
        P.offset += dt * 3;
        const behind = now - P.offset - DELAY - P.snaps[P.snaps.length - 1].t;
        if (behind > 60) P.offset += Math.min(behind, 400) * dt * 1.5;
        try {
          const st = sample(P, now - P.offset - DELAY);
          if (st) place(P, st, dt);
        } catch (err) {
          // (whatever it was, it is not worth the game: forget what came from them and wait for the next update)
          P.snaps.length = 0; P.offset = null;
        }
      }
      if (S.ride && (!S.ride.group.parent || driving || (policeStop && policeStop.locked))) unride(true);
      seats();
      S.near = rideable();
      // a friend standing in your way: you can't walk through them
      if (!driving && !S.ride) for (const P of S.players.values()) {
        const p = P.person;
        if (!p.model.group.visible) continue;
        const dx = player.x - p.x, dz = player.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.49 && d2 > 1e-6 && Math.abs(p.y - player.y) < 1.5) {
          const d = Math.sqrt(d2), x = player.x + (dx / d) * (0.7 - d), z = player.z + (dz / d) * (0.7 - d);
          if (personFits(x, z)) { player.x = x; player.z = z; }
        }
      }
      for (const P of S.players.values()) {
        const t = P.tag, st = P.st;
        if (!st) { t.visible = false; continue; }
        const rc = st.ride ? carOf(st.ride) : null, wheel = P.car && P.car.occupant === P.ident ? P.car : null, c = wheel || rc;
        let x = P.person.x, y = P.person.y + 2.12, z = P.person.z;
        if (c) { x = c.x; z = c.z; y = (c.M.boat ? WATER_Y + 2.4 : c.parts[c.parts.length - 1].top + 0.75) + (wheel ? 0 : 0.6 * (1 + (P.seat ? P.seat.n : 0))); }
        else if (st.f & 2) y = P.person.y + 2.6;
        // (a little bigger on a short screen, a phone on its side, so the name can be read)
        const d = Math.hypot(x - camera.position.x, z - camera.position.z), k = clamp(1.1 - d / 700, 0.62, 1) * clamp(600 / window.innerHeight, 1, 1.6);
        t.visible = d < 1200;
        t.position.set(x, y, z);
        t.scale.set(0.046 * k * (512 / 96), 0.046 * k, 1);
      }
    }

    /* ---------- the chat ---------- */
    function chat(name, col, text) {
      for (const box of [E.hudLog, E.chatLog]) {
        const line = document.createElement('div'), who = document.createElement('span'), dot = document.createElement('i');
        if (box === E.hudLog) line.className = 'chat-line';
        who.className = 'chat-name'; dot.style.background = hex(col);
        who.append(dot, name);
        line.append(who, text);
        box.append(line);
        while (box.children.length > (box === E.hudLog ? 5 : 40)) box.firstChild.remove();
        if (box === E.hudLog) setTimeout(() => line.remove(), 12000);
      }
      E.chatLog.scrollTop = E.chatLog.scrollHeight;
    }
    function say(raw) {
      const text = cleanText(raw);
      if (!text || !inRoom()) return;
      chat(S.name, playerId.shirt, text);
      event('chat', { m: text });
    }
    function openChat() {
      if (!inRoom() || S.chat || paused()) return;
      S.chat = true; E.bar.hidden = false; E.barInput.value = '';
      for (const k in keys) keys[k] = false;
      E.barInput.focus();
    }
    function closeChat() {
      if (!S.chat) return;
      S.chat = false; E.bar.hidden = true; E.barInput.blur();
    }
    E.bar.addEventListener('submit', (e) => { e.preventDefault(); say(E.barInput.value); closeChat(); });
    E.barInput.addEventListener('blur', () => setTimeout(closeChat, 0));
    // (pressing the button would take the focus from the input and close the bar before the click: keep it)
    E.bar.addEventListener('mousedown', (e) => { if (e.target !== E.barInput) e.preventDefault(); });
    $('mpSay').addEventListener('submit', (e) => { e.preventDefault(); say(E.sayInput.value); E.sayInput.value = ''; });

    /* ---------- the room sign ---------- */
    COLORS.forEach((col, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.background = hex(col); b.dataset.col = String(col);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', COLOR_NAMES[i]);
      b.addEventListener('click', () => { applyShirt(col); swatches(); });
      E.colors.append(b);
    });
    function swatches() { for (const b of E.colors.children) b.setAttribute('aria-checked', String(Number(b.dataset.col) === playerId.shirt)); }
    const web = /^https?:$/.test(location.protocol);
    const link = () => location.origin + location.pathname + '?rum=' + S.code + (params.get('peerserver') ? '&peerserver=' + encodeURIComponent(params.get('peerserver')) : '');
    function showSetup() { E.setup.hidden = false; E.room.hidden = true; E.name.value = S.name; swatches(); }
    function showRoom() {
      E.setup.hidden = true; E.room.hidden = false;
      E.codeBig.textContent = S.code;
      E.share.hidden = !web;
      E.codeHint.textContent = S.host ? 'Skicka koden' + (web ? ' eller länken' : '') + ' till dina vänner, så kan de gå med.' : 'Du är med i rummet, och dina vänner ser dig nu.';
      E.copy.textContent = navigator.share && isTouch ? 'Dela länken' : 'Kopiera länken';
      E.play.textContent = started ? 'Tillbaka till spelet' : 'Spela';
      renderList();
    }
    function renderList() {
      E.list.textContent = '';
      if (!inRoom()) return;
      const row = (name, col, note, P) => {
        const li = document.createElement('li'), dot = document.createElement('span'), nm = document.createElement('span');
        dot.className = 'mp-dot'; dot.style.background = hex(col); nm.textContent = name;
        li.append(dot, nm);
        if (note) { const sm = document.createElement('small'); sm.textContent = note; li.append(sm); }
        if (P) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'btn-sign small alt'; b.textContent = 'Gå till'; b.setAttribute('aria-label', 'Gå till ' + P.name);
          b.addEventListener('click', () => goTo(P));
          li.append(b);
        }
        E.list.append(li);
      };
      row(S.name, playerId.shirt, S.host ? 'du, har rummet' : 'du', null);
      for (const P of S.players.values()) row(P.name, P.look.shirt, P.id === S.hostId ? 'har rummet' : '', P);
    }
    function hud() {
      const n = S.players.size + 1;
      E.tag.textContent = inRoom() ? 'Vänner: rum ' + S.code + ', ' + n + ' spelare' : 'Spela med vänner';
      E.friends.textContent = inRoom() ? 'Vänner ' + n : 'Vänner';
    }
    function openPanel() {
      if (S.panel) return;
      if (pickerOpen) closePicker();
      if (bigmap.open) closeBigmap();
      closeChat();
      S.panel = true; E.panel.hidden = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0;
      if (inRoom()) showRoom(); else showSetup();
      if (!isTouch) (inRoom() ? E.sayInput : S.name ? E.host : E.name).focus();
    }
    function closePanel() {
      if (!S.panel) return;
      S.panel = false; E.panel.hidden = true;
      if (E.panel.contains(document.activeElement)) document.activeElement.blur();
      if (started) requestLock();
    }
    E.host.addEventListener('click', () => hostRoom());
    $('mpJoinForm').addEventListener('submit', (e) => { e.preventDefault(); joinRoom(E.code.value); });
    E.code.addEventListener('input', () => { const v = E.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); if (v !== E.code.value) E.code.value = v; });
    E.name.addEventListener('change', () => { S.name = cleanName(E.name.value); if (S.name) store.set('gubbe-namn', S.name); });
    E.copy.addEventListener('click', async () => {
      const url = link();
      if (navigator.share && isTouch) {
        try { await navigator.share({ title: 'Gubbe på Vägen', text: 'Spela med mig i Stockholm! Rumskod ' + S.code + '.', url }); return; } catch { /* closed, or not allowed: copy it instead */ }
      }
      try { await navigator.clipboard.writeText(url); status('Länken är kopierad. Klistra in den till dina vänner.'); } catch { status('Länken: ' + url); }
    });
    E.play.addEventListener('click', () => {
      closePanel();
      if (started) return;
      startGame();
      // just joined: start beside the one who has the room (placed first, as the game stood still behind the sign)
      update(0);
      const H = S.players.get(S.hostId);
      if (!S.host && H && H.st && Math.hypot(H.st.x - player.x, H.st.z - player.z) > 40) goTo(H);
    });
    E.leave.addEventListener('click', () => { leave(); status('Du lämnade rummet.'); });
    $('mpClose').addEventListener('click', closePanel);
    E.panel.addEventListener('click', (e) => { if (e.target === E.panel) closePanel(); });
    $('playFriends').addEventListener('click', openPanel);
    E.friends.addEventListener('pointerdown', (e) => { e.preventDefault(); openPanel(); });
    // a link with ?rum=ABCD opens the sign ready to join that room
    {
      const want = (params.get('rum') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (want.length === 4) {
        E.code.value = want;
        openPanel();
        status('Skriv ditt namn och tryck Gå med, så kommer du in i rum ' + want + '.');
        if (S.name && !isTouch) E.join.focus();
      }
    }
    // keys while the sign or the chat is open go to them, not to the game
    function keydown(e) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (S.panel) { if (e.code === 'Escape' || (!typing && e.code === 'KeyP')) { e.preventDefault(); closePanel(); } return true; }
      if (S.chat) { if (e.code === 'Escape') { e.preventDefault(); closeChat(); } return true; }
      if (typing) return true;
      if (e.code === 'KeyY' && started && !e.repeat && inRoom() && !paused()) { e.preventDefault(); openChat(); return true; }
      return false;
    }
    hud();

    return {
      update, use, keydown, openPanel, closePanel, event, unride: () => unride(true),
      get ride() { return S.ride; }, get panelOpen() { return S.panel; },
      prompt() { return S.ride ? 'Kliv ur' : S.near ? 'Åk med ' + S.near.owner.name : null; },
      // a dent in your car, for the others to see
      dent(c, a) { if (c.netId) event('dent', { c: c.netId, a: a.map(r3) }); },
      drawMini(g, px, pz, u) {
        for (const P of S.players.values()) {
          if (!P.st) continue;
          const c = P.car && P.car.occupant === P.ident ? P.car : null;
          let x = c ? c.x : P.person.x, z = c ? c.z : P.person.z;
          // (further off than the map reaches: on its edge, in their direction)
          const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz), R = 116;
          if (d > R) { x = px + (dx / d) * R; z = pz + (dz / d) * R; }
          g.beginPath(); g.arc(x, z, 6 * u, 0, TAU);
          g.fillStyle = hex(P.look.shirt); g.fill(); g.lineWidth = 2.2 * u; g.strokeStyle = '#ffffff'; g.stroke();
        }
      },
      drawBig(g, toX, toY, text) {
        for (const P of S.players.values()) {
          if (!P.st) continue;
          const c = P.car && P.car.occupant === P.ident ? P.car : null, X = toX(c ? c.x : P.person.x), Y = toY(c ? c.z : P.person.z);
          g.beginPath(); g.arc(X, Y, 7.5, 0, TAU);
          g.fillStyle = hex(P.look.shirt); g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke();
          text(P.name, X, Y - 16, '800 13px Overpass, sans-serif', '#0a5ba8');
        }
      },
      // for the tests
      debug: { S, get players() { return [...S.players.values()]; }, hostRoom, joinRoom, leave, say, goTo, seatsOf }
    };
  })();

  /* ================= loop ================= */
  function tick(dt) {
    const inp = readInput();
    if (!paused()) {
      for (const c of cars) c.input = c === driving ? inp : c.water ? WATER.think(c, dt) : c.bot ? (c.police ? policeThink(c, dt) : botThink(c, dt)) : null;
      for (const p of persons) if (p !== player && !p.asleep && !p.remote) p.intent = npcThink(p, dt);
      MP.update(dt);
      const pIntent = custodyIntent(dt) || playerIntent(inp);
      const steps = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < steps; i++) physicsStep(dt / steps, pIntent);
      jumpQueued = false;
      manageTraffic(dt);
      policeUpdate(dt);
      WATER.update(dt);
      updateHeli(dt);
      updateSurprises(dt);
      JOBS.update(dt);
      STATION.update(dt, player.x, player.z);
      nearCar = findNearCar();
      animate(dt);
      VENDORS.update(dt);
    }
    updateCamera(dt);
    updateHUD(dt);
    drawMap();
    if (bigmap.open && performance.now() - bigmap.drawn > 250) drawBigmap();
    updateAudio(dt);
  }
  // dynamic resolution: render fewer pixels when the frame rate drops, and creep back up when there is room
  let dpr = MAX_DPR, perfSum = 0, perfN = 0, holdUp = 0, qualityDropped = false;
  function adaptQuality(raw) {
    perfSum += Math.min(raw, 0.1); perfN++;
    if (perfSum < 2) return;
    const avg = perfSum / perfN;
    perfSum = 0; perfN = 0; holdUp -= 2;
    let next = dpr;
    // still too slow at the lowest resolution: one step down in graphics quality (Q brings it back)
    if (avg > 1 / 32 && dpr <= 0.7 && POST.level > 0 && !qualityDropped) { qualityDropped = true; POST.setLevel(POST.level - 1); holdUp = 20; }
    else if (avg > 1 / 40 && dpr > 0.7) { next = Math.max(0.7, dpr - 0.2); holdUp = 20; }
    else if (avg < 1 / 55 && dpr < MAX_DPR && holdUp <= 0) next = Math.min(MAX_DPR, dpr + 0.1);
    if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); renderer.setSize(window.innerWidth, window.innerHeight); }
  }
  let last = performance.now(), testHold = false;
  function frame(now) {
    if (testHold) { requestAnimationFrame(frame); return; }
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw);
    last = now;
    adaptQuality(raw);
    tick(dt);
    POST.render();
    requestAnimationFrame(frame);
  }

  // test hooks: step the simulation without relying on animation frames
  window.gubbeTest = {
    run(seconds, dt = 1 / 60, draw = true) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) tick(dt); if (draw) POST.render(); return this.state(); },
    key(code, down) { keys[code] = down; },
    press(code) { keys[code] = true; onKey(code, false); keys[code] = false; },
    start() { startGame(); },
    teleport(x, z, y = 0) { player.x = x; player.z = z; player.y = y; camTarget.set(x, y + 1.6, z); },
    draken: DRAKEN, indoorSpan, lift: LIFT,
    // park one car of each model in a row (facing +x) and photograph them with a fixed camera
    showroom(ids, x, z, gap) {
      return ids.map((id, i) => {
        const M = MODEL[id], c = makeCar(M, M.colors[0]);
        c.x = x; c.z = z + i * gap; c.h = Math.PI / 2;
        for (const m of c.calipers) m.visible = true;
        c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.h;
        return { id, z: c.z, tris: c.geo.body.attributes.position.count / 3 + c.geo.glass.attributes.position.count / 3, wheel: wheelGeometry(M.R, M.rim).attributes.position.count / 3 };
      });
    },
    // stop the frame loop and draw what the game camera sees now (for screenshots), or let it run again
    hold(on) { testHold = !!on; if (on) POST.render(); },
    shot(cx, cy, cz, tx, ty, tz) { testHold = true; camera.position.set(cx, cy, cz); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(); sky.position.copy(camera.position); POST.render(); },
    quality(l) { POST.setLevel(l, true); }, get post() { return POST; }, jobs: JOBS, vendors: VENDORS,
    look(yaw, pitch) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; lastLook = performance.now(); },
    choose(id) { chooseModel(MODEL[id]); },
    openPicker, closePicker, crash, limitAt, startChase, endChase, openBigmap, closeBigmap, drawBigmap, bigmap, carShape, MODELS,
    info() {
      const r = renderer.info;
      return { calls: POST.level ? POST.stats.calls : r.render.calls, triangles: POST.level ? POST.stats.triangles : r.render.triangles, mirror: POST.stats.mirror, geometries: r.memory.geometries, programs: r.programs ? r.programs.length : 0, chunks: chunks.size, buildings: mapPolys.length, lamps: lamps.length, trees: lindens.length + cherries.length, loadMs: Math.round(loadMs) };
    },
    // landmarks that stand on a street or its pavement
    mapProblems() {
      const out = [];
      for (const L of landmarkList) for (const e of edges) {
        const A = nodes[e.a], B = nodes[e.b], d = segPolyDist(A.x, A.z, B.x, B.z, L.poly);
        if (d < e.hw + Math.min(e.walk, 1.5)) out.push(`${L.name || 'landmark at ' + centroid(L.poly).map(Math.round)} vs ${e.name}: ${d.toFixed(1)} m`);
      }
      return out;
    },
    // renders one second of an engine sound offline and measures it: loudness, peak, brightness, fundamental
    engineSample(key, rpm, load) {
      const ctx = new window.OfflineAudioContext(1, 44100, 44100), sr = 44100;
      const noise = ctx.createBuffer(1, sr * 2, sr), nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const v = makeEngineVoice(ctx, ctx.destination, noise), M = MODELS.find((m) => m.eng === key);
      setProfile(v, key);
      v.prevLoad = load;
      v.boost = load;
      driveVoice(v, { M, rpm, load, dead: false, limiter: false }, 1, 0, 0);
      return ctx.startRendering().then((buf) => {
        const d = buf.getChannelData(0).subarray(22050 - 4096, 22050);
        let sum = 0, peak = 0;
        for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
        let num = 0, den = 0, best = 0, bestF = 0;
        for (let k = 1; k < 400; k++) {
          let re = 0, im = 0;
          for (let i = 0; i < d.length; i++) { const a = (2 * Math.PI * k * i) / d.length; re += d[i] * Math.cos(a); im -= d[i] * Math.sin(a); }
          const m = Math.hypot(re, im), f = (k * sr) / d.length;
          num += f * m; den += m;
          if (m > best) { best = m; bestF = f; }
        }
        return { rms: +Math.sqrt(sum / d.length).toFixed(4), peak: +peak.toFixed(3), centroid: Math.round(num / den), strongest: Math.round(bestF), firing: Math.round((rpm / 60) * (ENGINE_SOUNDS[key].cyl / 2)) };
      });
    },
    mp: MP, get cars() { return cars; }, boatFits, findBerth, blockedAt: (x, z, r) => blockedAt(x, z, r), obstaclesNear(x, z, r) { const out = []; forNear(x - r, z - r, x + r, z + r, (o) => out.push({ ...o })); return out; }, distTo, get persons() { return persons; }, get player() { return player; }, get driving() { return driving; },
    get wanted() { return wanted; }, get heli() { return heli; }, updateStars, get fines() { return fines; }, get audio() { return audio; }, get stop() { return policeStop; }, footCops, STATION, useKey, walkWaypoint, walkLine, landmarkList, mapSquares, mapGreens, signTicket, beginStop, setCall, resyncBot, get horses() { return horses; }, fireworks(s) { fireworksT = s; },
    nodes, edges, walkable, fitsM, MODEL, driveAccel, limitAt, bridgeTrims, nearestEdgeAt(x, z) { const ne = nearestEdge(x, z); return ne.e && ne.d < ne.e.hw + ne.e.walk + 2 ? ne.e : null; },
    state() {
      const bad = [];
      for (const c of cars) { if (!isFinite(c.x + c.z + c.h + c.vx + c.vz)) bad.push('nan-car'); else if (!c.remote && !(c.M.boat ? boatFits(c.M, c.x, c.z, c.h) : fitsM(c.M, c.x, c.z, c.h))) bad.push('car-off ' + c.M.id + ' ' + c.x.toFixed(1) + ',' + c.z.toFixed(1)); }
      for (const p of persons) { if (!isFinite(p.x + p.z + p.y)) bad.push('nan-person'); else if (!p.remote && !walkable(p.x, p.z) && !(p === player && (driving || MP.ride) && (driving || MP.ride).M.boat) && !(p === player && policeStop && policeStop.phase === 'water')) bad.push('person-off ' + p.x.toFixed(1) + ',' + p.z.toFixed(1)); }
      const bots = cars.filter((c) => c.bot);
      return {
        player: { x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2) },
        driving: driving ? driving.M.id : null, near: nearCar ? (nearCar.bot ? 'bot ' : '') + nearCar.M.id : null,
        kmh: driving ? Math.round(Math.hypot(driving.vx, driving.vz) * 3.6) : 0,
        cars: cars.length, bots: bots.length, movingBots: bots.filter((c) => Math.hypot(c.vx, c.vz) > 2).length,
        stuckBots: bots.filter((c) => c.bot.stuckTotal > 4).length, persons: persons.length, bad,
        street: el.locStreet.textContent, district: el.locDistrict.textContent, prompt: el.prompt.hidden ? '' : el.promptText.textContent,
        gear: driving ? el.gear.textContent : null, rpm: driving ? Math.round(driving.rpm) : 0, auto: driving ? driving.auto : null,
        health: driving ? Math.round(driving.health) : null, wanted: wanted ? [...wanted.kinds].join(',') : null, fines,
        police: cars.filter((c) => c.police).map((c) => c.police.state + (c.siren ? '+siren' : '')).join(' '),
        toast: el.toast.hidden ? '' : el.toast.textContent
      };
    }
  };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ p: { x: player.x, y: player.y, z: player.z, rot: player.rot }, started, muted }));
  function boot(data) {
    data = data || {};
    if (data.p && personFits(data.p.x, data.p.z)) { player.x = data.p.x; player.z = data.p.z; player.y = data.p.y || 0; player.rot = data.p.rot || 0; }
    if (data.muted) toggleMute();
    if (data.started) {
      started = true;
      el.start.hidden = true;
      document.body.classList.add('playing');
      setTouchMode(isTouch);
      camYaw = player.rot;
    }
    camTarget.set(player.x, player.y + 1.6, player.z);
    sizeMap();
    last = performance.now();
    requestAnimationFrame(frame);
  }
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});
