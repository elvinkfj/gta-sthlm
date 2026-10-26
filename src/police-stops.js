'use strict';

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
    // (the cars only the garage's dealer sells are not here: see buy in src/vehicles/models.js)
    const first = ['f40', 'chiron', 'x5', 'laferrari', 'mg5', 'stalker', 'countach', 'jesko', 'cobra', 'superbil', 'gt3rs', 'sport', 'muskel', 'halvkombi', 'sedan', 'polestar', 'kombi', 'v240', 'saab', 'taxi', 'suv', 'skapbil'].filter((id) => !MODEL[id].buy);
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
