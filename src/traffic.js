'use strict';

  /* ================= traffic AI ================= */
  // shortest distance from every junction to one goal junction, along the streets (emerg: also lanes, squares and
  // pedestrian streets, the way police on blue lights drive). Worked out when first asked for, then remembered.
  const distCache = { nb: new Map(), nbE: new Map(), nbW: new Map() };
  // graph: 'nb' streets for cars, 'nbE' also lanes and squares (blue lights), 'nbW' everything a person can walk
  function distTo(goal, emerg) {
    const graph = emerg === true ? 'nbE' : emerg || 'nb', cache = distCache[graph];
    if (cache.has(goal)) return cache.get(goal);
    const d = nodes.map(() => Infinity), done = nodes.map(() => false);
    d[goal] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (const v of nodes[u][graph]) d[v] = Math.min(d[v], d[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z));
    }
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    cache.set(goal, d);
    return d;
  }
  // a junction only lanes lead to (where a police car can end up after a chase): the nearest one cars can leave from
  const driveExit = nodes.map((n) => {
    if (n.nb.length || !n.nbE.length) return null;
    let best = -1, bd = Infinity;
    nodes.forEach((m, i) => { const d = Math.hypot(m.x - n.x, m.z - n.z); if (m.nb.length && d < bd) { bd = d; best = i; } });
    return best < 0 ? null : { node: best, x: nodes[best].x, z: nodes[best].z };
  });
  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && n.nbE.length) { bd = d; best = i; } });
    return best;
  }
  // goal: { node, x, z } to head for, or nothing to wander at random. emerg: blue lights on, so lanes and squares
  // are fine and so is a U-turn if the way back is clearly shorter
  function chooseNext(from, to, goal, emerg) {
    if (!emerg && !nodes[to].nb.length && driveExit[to]) { emerg = true; goal = goal || driveExit[to]; }
    const all = emerg ? nodes[to].nbE : nodes[to].nb, nb = all.filter((n) => n !== from);
    if (!nb.length) return from;
    if (!goal) return nb[Math.floor(Math.random() * nb.length)];
    const D = distTo(goal.node, emerg);
    const cost = (n) => (to === goal.node ? Math.hypot(nodes[n].x - goal.x, nodes[n].z - goal.z) : D[n] + Math.hypot(nodes[n].x - nodes[to].x, nodes[n].z - nodes[to].z));
    let best = nb[0];
    for (const n of nb) if (cost(n) < cost(best)) best = n;
    // traffic never turns back: the way back goes round the block, which the AI handles far better
    if (emerg && all.includes(from) && cost(from) + 60 < cost(best)) return from;
    return best;
  }
  // (the army on a hunt goes everywhere the police can: lanes, squares, the wrong side)
  const onBlueLights = (c) => !!(c.police && (c.police.state === 'chase' || c.police.state === 'call'));
  function startTurn(b) {
    const e1 = edgeFrame(b.from, b.to), e2 = edgeFrame(b.to, b.next), B = e1.B, off = B.r + 4;
    b.P0 = [B.x - e1.ux * off + e1.rx * e1.lane, B.z - e1.uz * off + e1.rz * e1.lane];
    b.P2 = [B.x + e2.ux * off + e2.rx * e2.lane, B.z + e2.uz * off + e2.rz * e2.lane];
    const dot = e1.ux * e2.ux + e1.uz * e2.uz;
    if (dot > 0.9) b.P1 = [(b.P0[0] + b.P2[0]) / 2, (b.P0[1] + b.P2[1]) / 2];
    else if (dot < -0.9) b.P1 = [B.x + e1.ux * 6, B.z + e1.uz * 6];
    else { const t = (b.P2[0] - b.P0[0]) * e1.ux + (b.P2[1] - b.P0[1]) * e1.uz; b.P1 = [b.P0[0] + e1.ux * t, b.P0[1] + e1.uz * t]; }
    b.turnType = dot > 0.9 ? 0 : dot < -0.9 ? 2 : 1;
    // which way to signal: left or right off into a side street, left for a U-turn; nothing where the street just bends
    const side = e2.ux * e1.uz - e2.uz * e1.ux;
    b.turnDir = b.turnType && nodes[b.to].nb.length > 2 ? (b.turnType === 2 || side > 0 ? 1 : 2) : 0;
    b.curveLen = Math.hypot(b.P1[0] - b.P0[0], b.P1[1] - b.P0[1]) + Math.hypot(b.P2[0] - b.P1[0], b.P2[1] - b.P1[1]);
    b.t = 0; b.turnAge = 0; b.phase = 'turn';
  }
  function bez(b, t) {
    const u = 1 - t;
    return [u * u * b.P0[0] + 2 * u * t * b.P1[0] + t * t * b.P2[0], u * u * b.P0[1] + 2 * u * t * b.P1[1] + t * t * b.P2[1]];
  }
  function botThink(c, dt) {
    const b = c.bot, M = c.M;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), lxv = Math.cos(c.h), lzv = -Math.sin(c.h);
    const vf = c.vx * fx + c.vz * fz, look = 5 + Math.abs(vf) * 0.55;
    let vT = b.cruise, tx = c.x + fx * look, tz = c.z + fz * look;
    b.passT -= dt; b.ignoreT -= dt; b.honkT -= dt;
    // make way for blue lights coming up behind or towards you: pull in to the kerb and slow right down (a robber
    // getting away doesn't, of course)
    let yieldTo = false;
    if (!c.police && !c.getaway) for (const o of sirenCars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, ah = dx * fx + dz * fz, lat = dx * lxv + dz * lzv;
      if ((ah > -45 && ah < 10 && Math.abs(lat) < 7) || (ah >= 10 && ah < 55 && Math.abs(lat) < 9 && Math.cos(o.h - c.h) < -0.5)) { yieldTo = true; break; }
    }
    b.yielding = yieldTo;
    if (yieldTo) { vT = 3; b.passT = 0; }

    if (b.phase === 'edge') {
      const e = edgeFrame(b.from, b.to);
      if ((c.x - e.A.x) * e.ux + (c.z - e.A.z) * e.uz >= e.len - (e.B.r + 4) - 0.5) startTurn(b);
    }
    if (b.phase === 'turn') {
      b.turnAge += dt;
      let bt = b.t, bd = Infinity;
      for (let k = 0; k <= 10; k++) {
        const t = Math.min(1, b.t + k * 0.03), p = bez(b, t), d = (p[0] - c.x) ** 2 + (p[1] - c.z) ** 2;
        if (d < bd) { bd = d; bt = t; }
      }
      b.t = bt;
      if (b.t >= 0.96 || b.turnAge > 9) { b.from = b.to; b.to = b.next; b.next = chooseNext(b.from, b.to, b.goal, onBlueLights(c) || !!c.getaway); b.phase = 'edge'; }
    }
    if (b.phase === 'edge') {
      const e = edgeFrame(b.from, b.to);
      const s = (c.x - e.A.x) * e.ux + (c.z - e.A.z) * e.uz, remain = e.len - (e.B.r + 4) - s;
      if (remain < 20) b.passT = Math.min(b.passT, 0);
      // (blue lights, and a robber on the run, ignore the speed limits and drive on the crown of the road)
      const chasing = onBlueLights(c) || !!c.getaway;
      // traffic keeps to the speed limit; police on blue lights don't, but even they slow down in the narrow lanes
      if (!chasing && !(c.military && c.police.state === 'chase')) vT = Math.min(vT, (e.e.limit / 3.6) * 1.08);
      else if (!e.e.drive) vT = Math.min(vT, e.e.hw < 2.2 ? 11 : 17);
      // police on blue lights drive on the crown of the road, straddling the solid line, and swing right over into
      // the oncoming lane to get past; in a lane they keep to the middle
      const narrow = !e.e.drive || e.e.hw < 4.5;
      const lane = yieldTo ? e.e.hw - 0.8 : chasing ? (narrow ? 0 : b.passT > 0 ? -(e.e.hw >= 8 ? e.e.hw * 0.45 : e.lane) : e.e.hw >= 8 ? e.pass * 0.5 : 0.4)
        : b.passT > 0 ? e.pass : e.lane, st = s + look;
      tx = e.A.x + e.ux * st + e.rx * lane; tz = e.A.z + e.uz * st + e.rz * lane;
      const B = nodes[b.to], n = nodes[b.next];
      const dot = ((n.x - B.x) * e.ux + (n.z - B.z) * e.uz) / (Math.hypot(n.x - B.x, n.z - B.z) || 1);
      if (dot < 0.9 && remain < 24) vT = Math.min(vT, (b.turnV || 5.5) + Math.max(0, remain) * 0.3);
      // the indicator goes on some 35 m before a turn at a junction
      b.sig = remain < 35 && dot < 0.9 && B.nb.length > 2 ? (dot < -0.9 || (n.x - B.x) * e.uz - (n.z - B.z) * e.ux > 0 ? 1 : 2) : 0;
    } else {
      const tt = b.t + look / Math.max(6, b.curveLen);
      if (tt <= 1) { const p = bez(b, tt); tx = p[0]; tz = p[1]; }
      else { const e2 = edgeFrame(b.to, b.next), ex = (tt - 1) * b.curveLen; tx = b.P2[0] + e2.ux * ex; tz = b.P2[1] + e2.uz * ex; }
      if (b.turnType !== 0) vT = Math.min(vT, b.turnV || 5.5);
      b.sig = b.turnDir || 0;
    }
    // (blue lights and the army don't bother with indicators)
    c.blink = onBlueLights(c) || c.military || c.getaway ? 0 : b.sig || 0;

    // look for anything in the way: cars, the player, pedestrians
    let gap = Infinity, blocker = null;
    // cars parked at the kerb are not in the way of a car keeping to its lane, however it happens to be angled
    const ef = b.phase === 'edge' ? edgeFrame(b.from, b.to) : null, myLane = ef ? ef.lane : 0;
    const atKerb = (o) => {
      if (!ef || !ef.park || o.bot || o === driving || Math.hypot(o.vx, o.vz) > 0.5) return false;
      const lat = (o.x - ef.A.x) * ef.rx + (o.z - ef.A.z) * ef.rz;
      return Math.abs(Math.abs(lat) - ef.park) < 1.0 && Math.abs(lat - myLane) > 1.5;
    };
    if (b.ignoreT <= 0) {
      for (const o of cars) {
        if (o === c || (c.police && o.bot && o.bot.yielding)) continue;
        const dx = o.x - c.x, dz = o.z - c.z, ah = dx * fx + dz * fz;
        if (ah <= 0 || ah > 32 || atKerb(o)) continue;
        const lat = dx * lxv + dz * lzv;
        const dh = o.h - c.h, cs = Math.abs(Math.cos(dh)), sn = Math.abs(Math.sin(dh));
        if (Math.abs(lat) > M.W / 2 + cs * o.M.W / 2 + sn * o.M.L / 2 + 0.15) continue;
        if (b.passT > 0 && lat < -0.3 && Math.hypot(o.vx, o.vz) < 0.5) continue;
        const g = ah - M.L / 2 - (sn * o.M.W / 2 + cs * o.M.L / 2);
        if (g < gap) { gap = g; blocker = o; }
      }
      for (const p of persons) {
        if (p.asleep || (p === player && driving)) continue;
        const dx = p.x - c.x, dz = p.z - c.z, ah = dx * fx + dz * fz;
        if (ah <= 0 || ah > 26) continue;
        const lat = dx * lxv + dz * lzv;
        if (Math.abs(lat) > M.W / 2 + 0.7) continue;
        if (b.passT > 0 && lat < -0.2) continue;
        const g = ah - M.L / 2 - 0.4;
        if (g < gap) { gap = g; blocker = p; }
      }
      if (blocker) vT = Math.min(vT, Math.max(0, (gap - 2.2) * 0.9));
      b.blocker = blocker; // what it is waiting for (the tests read it)
    }
    // with blue lights on the police go round whatever is in the way at once, oncoming traffic pulls over for them
    const urgent = (c.police && c.police.state !== 'patrol' && c.siren) || !!c.getaway;
    if (b.passT > 0 && !urgent && blocker && blocker.M && Math.cos(blocker.h - c.h) < -0.3) b.passT = 0;
    const slow = Math.abs(vf) < 0.7;
    if (blocker && slow) b.waitT += dt; else b.waitT = Math.max(0, b.waitT - dt * 2);
    if (blocker === player && slow && b.waitT > 1.2 && b.honkT <= 0) { honkAt(c.x, c.z); b.honkT = 3.5; }
    // police closing in on you stay behind you instead of overtaking or pushing through
    // (from two stars they don't wait behind you any more)
    const holdBehind = c.police && c.police.state === 'chase' && stars() < 2 && (blocker === driving || blocker === player);
    const urgentPass = urgent && !holdBehind && blocker && b.phase === 'edge' && gap < 40 && b.passT <= 0 && (!blocker.M || Math.hypot(blocker.vx, blocker.vz) < vf - 2 || slow);
    if (urgentPass) { b.passT = 5; if (gap < 4.5 && slow) b.revT = 0.8; }
    else if (blocker && slow && b.waitT > 2.5 && b.passT <= 0 && b.phase === 'edge' && !holdBehind) {
      if (!blocker.M || Math.hypot(blocker.vx, blocker.vz) < 0.5) {
        b.passT = 7;
        if (gap < 4.5) b.revT = 1.1; // back up a little first so there is room to swing out
      }
    }
    if (b.passT > 0) vT = Math.min(vT, urgent ? 16 : 6);
    if (b.waitT > 9 && !holdBehind) { b.ignoreT = 2.5; b.waitT = 0; }

    const dx = tx - c.x, dz = tz - c.z, lz = dx * fx + dz * fz, lx = dx * lxv + dz * lzv;
    const maxSteer = 0.6 / (1 + Math.abs(vf) * 0.03);
    const delta = lz < 0.3 ? Math.sign(lx || 1) * maxSteer : Math.atan((2 * M.wb * lx) / (lx * lx + lz * lz));
    const right = -clamp(delta / maxSteer, -1, 1);
    const fwd = vT < 0.3 ? (vf > 0.3 ? -1 : 0) : clamp((vT - vf) * 0.45, -1, 1);
    if (b.revT > 0) { b.revT -= dt; return { fwd: -0.7, right: -right, brake: false }; }
    if (!blocker && fwd > 0.3 && Math.abs(vf) < 0.4) { b.stuckT += dt; b.stuckTotal += dt; }
    else { b.stuckT = 0; if (Math.abs(vf) > 2) b.stuckTotal = Math.max(0, b.stuckTotal - dt); }
    if (b.stuckT > 1.8) { b.revT = 1.4; b.stuckT = 0; }
    return { fwd, right, brake: false };
  }
  // traffic lives within a few hundred metres of you: new cars appear out of sight, distant ones are cleared away
  const TRAFFIC_RANGE = 340;
  function spawnBot(minDist, forceM, maxDist = TRAFFIC_RANGE) {
    const pool = edges.filter((e) => e.drive && e.len > 40 && edgeDist(e, player.x, player.z) < maxDist);
    for (let tries = 0; tries < 25 && pool.length; tries++) {
      const e = rpick(pool);
      const fwd = Math.random() < 0.5, from = fwd ? e.a : e.b, to = fwd ? e.b : e.a, f = edgeFrame(from, to);
      const s = nodes[from].r + 6 + Math.random() * (f.len - nodes[from].r - nodes[to].r - 12);
      const x = f.A.x + f.ux * s + f.rx * f.lane, z = f.A.z + f.uz * s + f.rz * f.lane;
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < minDist || d > maxDist) continue;
      const roll = Math.random();
      const M = forceM || (roll < 0.07 ? MODEL.buss : roll < 0.25 ? rpick(SPORTS) : rpick(REGULARS));
      const h = Math.atan2(f.ux, f.uz);
      if (!spotFree(M, x, z, h)) continue;
      const c = makeCar(M, rpick(M.colors));
      c.x = x; c.z = z; c.h = h; c.vx = f.ux * 6; c.vz = f.uz * 6;
      c.bot = { from, to, next: chooseNext(from, to), phase: 'edge', t: 0, passT: 0, waitT: 0, ignoreT: 0, revT: 0, stuckT: 0, stuckTotal: 0, honkT: 0, turnAge: 0, cruise: M.bus ? 11.5 : M.sport ? 18.5 : 14 + Math.random() * 3 };
      setOccupant(c, makeIdentity());
      return c;
    }
    return null;
  }
  function spawnParked(M, color, x, z, h, keep) {
    const c = makeCar(M, color);
    c.x = x; c.z = z; c.h = h; c.keep = !!keep;
    return c;
  }

  /* ---------- pedestrians ---------- */
  function npcThink(p, dt) {
    if (p.ai.state === 'cop') return copThink(p, dt);
    // a fare or a bus passenger walking up to the car to get in
    if (p.ai.state === 'board') { const c = p.ai.car, d = c.M.bus ? doorSpot(c, -1, false) : doorNear(c, p.x, p.z, true); return seek(p, walkWaypoint(p.ai.nav || (p.ai.nav = {}), p.x, p.z, d.x, d.z, dt), 2.6, 0.2); }
    if (p.ai.state === 'idle') { if (p.ai.face !== undefined) p.rot = lerpAngle(p.rot, p.ai.face, 0.1); return { mx: 0, mz: 0, speed: 0, jump: false }; }
    // someone of the story's own (STORY) walking to a place, the way the police on foot find theirs
    if (p.ai.state === 'goto') return seek(p, walkWaypoint(p.ai.nav || (p.ai.nav = {}), p.x, p.z, p.ai.x, p.ai.z, dt), p.ai.speed, 0.4);
    const ai = p.ai, out = { mx: 0, mz: 0, speed: 0, jump: false };
    if (ai.dodgeT > 0) { ai.dodgeT -= dt; out.mx = ai.dx; out.mz = ai.dz; out.speed = 6.5; return out; }
    if (p.grounded && p.knockT <= 0) {
      for (const c of cars) {
        const sp = Math.hypot(c.vx, c.vz);
        if (sp < 5) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        if (dx * dx + dz * dz > 400) continue;
        const ux = c.vx / sp, uz = c.vz / sp, ahead = dx * ux + dz * uz, lat = dx * -uz + dz * ux;
        if (ahead > 0 && ahead < 4 + sp * 0.6 && Math.abs(lat) < c.M.W / 2 + 1.2) {
          const s = lat >= 0 ? 1 : -1;
          ai.dx = -uz * s; ai.dz = ux * s; ai.dodgeT = 0.55;
          out.mx = ai.dx; out.mz = ai.dz; out.speed = 6.5; out.jump = true;
          return out;
        }
      }
    }
    if (ai.state === 'walk') {
      // along the pavement; at the corner, on along another street (crossing over at the junction)
      let e = edges[ai.e], f = ai.dir > 0 ? edgeFrame(e.a, e.b) : edgeFrame(e.b, e.a);
      const s = (p.x - f.A.x) * f.ux + (p.z - f.A.z) * f.uz;
      if (s > f.len - f.B.r - 1.5) {
        const q = ai.dir > 0 ? e.b : e.a, onward = nodes[q].all.filter((i) => i !== ai.e);
        ai.e = onward.length ? rpick(onward) : ai.e;
        e = edges[ai.e]; ai.dir = e.a === q ? 1 : -1;
        if (Math.random() < 0.3) ai.side = -ai.side;
        ai.off = walkOffset(e);
        f = ai.dir > 0 ? edgeFrame(e.a, e.b) : edgeFrame(e.b, e.a);
      }
      const st = Math.max((p.x - f.A.x) * f.ux + (p.z - f.A.z) * f.uz, f.A.r + 1) + 3, lat = ai.off * ai.side;
      const dx = f.A.x + f.ux * st + f.rx * lat - p.x, dz = f.A.z + f.uz * st + f.rz * lat - p.z, d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d; out.mz = dz / d; out.speed = ai.speed;
    } else if (ai.state === 'flee') {
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d; out.mz = dz / d; out.speed = 6.2;
      ai.t -= dt;
      if (ai.t <= 0) { if (ai.post) ai.state = 'guard'; else { ai.state = 'wander'; ai.wx = out.mx; ai.wz = out.mz; ai.t = 25; } }
    } else if (ai.state === 'guard') {
      const g = guardTarget(ai.post, clock), dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.15) { out.mx = dx / d; out.mz = dz / d; out.speed = Math.min(1.25, d * 2.5); }
      else p.rot = lerpAngle(p.rot, g.face, 0.2);
    } else if (ai.state === 'vendor') {
      // a balloon seller: back to the spot after stepping out of the way, turned towards you when you come up on foot
      const P = ai.post, dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { out.mx = dx / d; out.mz = dz / d; out.speed = Math.min(1.4, d * 2); }
      else p.rot = lerpAngle(p.rot, !driving && Math.hypot(player.x - p.x, player.z - p.z) < 7 ? Math.atan2(player.x - p.x, player.z - p.z) : P.face, 0.08);
    } else {
      if (p.blocked) { const a = Math.atan2(ai.wx, ai.wz) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2); ai.wx = Math.sin(a); ai.wz = Math.cos(a); }
      out.mx = ai.wx; out.mz = ai.wz; out.speed = 1.5;
      ai.t -= dt;
    }
    return out;
  }
  // how far from the middle of a street people walk: on the pavement, or anywhere on a pedestrian street or lane
  const walkOffset = (e) => (e.kind === 'ped' ? rr(-0.75, 0.75) * e.hw : e.kind === 'lane' ? e.hw * 0.55 : e.hw + Math.max(1, e.walk * 0.5));
  function spawnWalker(minD, maxD, cx = camTarget.x, cz = camTarget.z) {
    const pool = edges.filter((e) => { const d = edgeDist(e, cx, cz); return d < maxD && d + e.len / 2 > minD; });
    for (let tries = 0; tries < 12 && pool.length; tries++) {
      const e = rpick(pool), dir = Math.random() < 0.5 ? 1 : -1, side = Math.random() < 0.5 ? 1 : -1, off = walkOffset(e);
      const f = dir > 0 ? edgeFrame(e.a, e.b) : edgeFrame(e.b, e.a), s = rr(f.A.r + 2, Math.max(f.A.r + 3, f.len - f.B.r - 2));
      const x = f.A.x + f.ux * s + f.rx * off * side, z = f.A.z + f.uz * s + f.rz * off * side, d = Math.hypot(x - cx, z - cz);
      if (d < minD || d > maxD || !personFits(x, z) || blockedAt(x, z, 0.45)) continue;
      return makePerson(makeIdentity(), x, z, { state: 'walk', e: e.i, dir, side, off, speed: 1.15 + Math.random() * 0.55, dodgeT: 0 });
    }
    return null;
  }
