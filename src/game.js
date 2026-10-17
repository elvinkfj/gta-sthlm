'use strict';

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
