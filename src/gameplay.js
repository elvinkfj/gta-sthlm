'use strict';

  /* ================= game state ================= */
  let started = false, pickerOpen = false, nearCar = null;
  // the car picker and the big map both pause the game
  const paused = () => pickerOpen || bigmap.open || MP.panelOpen || METRO.boardOpen || WORKSHOP.open || GARAGE.open || PROGRESS.open || JOBS.boardOpen || ACCOUNT.isOpen || STORY.signOpen;
  let camYaw = player.rot, camPitch = 0.3, camDist = 6, lastLook = -1e9, clipT = 1;
  // C: first person, through your own eyes, on foot and at the wheel
  let firstPerson = false, fpLastH = 0;
  const fpEye = new THREE.Vector3();
  const camTarget = new THREE.Vector3(player.x, 1.6, player.z);
  let jumpQueued = false;
  const keys = {}, joy = { x: 0, y: 0 };
  let touchBrake = false, isTouch = window.matchMedia('(pointer: coarse)').matches;

  function readInput() {
    if (!started || paused() || inCustody() || (JOBS.job && JOBS.job.kind === 'race' && JOBS.job.t < 0) || PARTY.hold() || METRO.riding || RIDES.on) return { fwd: 0, right: 0, run: false, brake: !!driving };
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
    if (driving || MP.ride || FLY.on || CHUTE.on || METRO.riding || RIDES.on || !started || (policeStop && policeStop.locked)) return null;
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
  // (col: the paint, for a car of yours from the garage)
  function drawSilhouette(cv, M, col = M.colors[0]) {
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
      poly([[0.05, 0.34], [-0.15, 0.36], [-0.42, 0.42], [-0.68, 0.52], [-0.88, 0.66], [-0.88, 0.82], [-0.68, 0.79], [-0.42, 0.75], [-0.15, 0.71], [0.05, 0.6]], hex(col));
      poly([[0.06, 0.6], [-0.05, 0.68], [-0.36, 0.72], [-0.46, 0.74], [-0.74, 0.77], [-0.74, 0.87], [-0.46, 0.86], [-0.36, 0.81], [-0.05, 0.79], [0.06, 0.66]], '#16171a');
      poly([[0.12, 0.3], [-0.2, 0.3], [-0.2, 0.34], [0.12, 0.34]], '#1c1d20');
      line([[0.25, 0.8], [0.21, 0.62], [0.15, 0.45], [0.06, 0.34], [0, 0.3]], 0.05, '#aeb3b8');
      line([[0.3, 0.82], [0.61, 0.24]], 0.05, '#2a2c30');
      line([[0.2, 1.01], [0.1, 1.04]], 0.03, '#1c1d20');
      poly([[0.25, 0.83], [0.42, 0.86], [0.42, 0.98], [0.25, 1.0]], hex(col));
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
    poly([...zs.map((z, i) => [z, rings[i].top + rings[i].crown]), ...zs.slice().reverse().map((z) => [z, sh.sillAt(z)])], hex(col));
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
    if (S.f40) { const wy = S.f40.wingY, wa = -hl + 0.03, wb = -hl + 0.4; poly([[wa, sh.belt(wa) - 0.03], [-1.55, sh.belt(-1.55) - 0.03], [wb, wy - 0.02], [wb, wy + 0.01], [wa, wy + 0.03]], hex(shade(col, 0.78))); }
    for (const z of [M.wb / 2, -M.wb / 2]) {
      const [px, py] = P(z, M.R);
      g.fillStyle = '#16181b'; g.beginPath(); g.arc(px, py, M.R * s, 0, TAU); g.fill();
      g.fillStyle = M.rim === 'black' ? '#3a3d42' : '#c6cbd1'; g.beginPath(); g.arc(px, py, M.R * s * 0.62, 0, TAU); g.fill();
    }
  }
  // (mine: one of your cars in the garage, in its own paint, and yours when you take it)
  function pickerButton(M, i, mine) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'model'; btn.id = (mine ? 'mine-' : 'model-') + M.id;
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 120;
    drawSilhouette(cv, M, mine ? mine.color : M.colors[0]);
    const title = document.createElement('div'); title.className = 'model-title';
    const name = document.createElement('b'); name.textContent = M.name;
    title.append(name);
    // the first ten have a number key
    if (i < 10) { const num = document.createElement('span'); num.className = 'key'; num.textContent = String((i + 1) % 10); title.append(num); }
    const stats = document.createElement('div'); stats.className = 'stats';
    stats.textContent = M.kind + '\nToppfart ' + Math.round(M.max * 3.6) + ' km/h\n0–' + M.sprint.kmh + ' på ' + M.sprint.t.toFixed(1).replace('.', ',') + ' s\n' + (M.boat ? M.engine : M.ev ? 'Elmotor, en växel' : M.cvt ? 'Tvåtakt, variator' : M.gears + ' växlar');
    btn.append(cv, title, stats);
    btn.addEventListener('click', () => chooseModel(M, !!mine));
    return btn;
  }
  function buildPicker() {
    PICKABLE.forEach((M, i) => {
      const btn = pickerButton(M, i);
      (M.boat ? $('gridBoat') : M.moped ? $('gridMoped') : M.group === 'super' ? $('gridSuper') : M.group === 'classic' ? $('gridClassic') : M.sport ? $('gridSport') : $('gridNormal')).appendChild(btn);
    });
    SECRET.forEach((M, i) => $(M.mil ? 'gridArmy' : 'gridPolice').appendChild(pickerButton(M, i)));
  }
  // the cars you have in the garage are yours to take with B too, at the top, in their own paint (the workshop's, or
  // the colour you bought them in). The exclusive ones you haven't bought never show
  function pickerMine() {
    const mine = GARAGE.owned.map((id) => { const M = MODEL[id], o = M && GARAGE.mine(id), k = M && WORKSHOP.kept(M); return o && { M, color: k && k.paint !== null ? k.paint : o.color }; }).filter(Boolean);
    const grid = $('gridMine'), ids = mine.map((o) => o.M.id + ':' + o.color).join();
    $('pickMine').hidden = !mine.length;
    if (grid.dataset.ids !== ids) { grid.dataset.ids = ids; grid.replaceChildren(...mine.map((o) => pickerButton(o.M, 99, o))); }
  }
  function openPicker() {
    if (!started) return;
    // no new car while you are under arrest or in the cell
    if (policeStop && policeStop.locked) { toast('Det går inte nu, du är gripen.'); return; }
    pickerOpen = true;
    pickerMine();
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
  // (own: taken from your cars in the garage, at the top of the picker)
  function chooseModel(M, own) {
    closePicker();
    if (policeStop && policeStop.locked) return;
    if (FLY.on) { toast('Landa och kliv ur helikoptern först.'); return; }
    if (CHUTE.on) { toast('Vänta tills du har landat.'); return; }
    if (METRO.riding || RIDES.on) return;
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
    // found every Dalahäst: your cars come in gold; what you bought for this model at the workshop comes with it. A car
    // of yours from the garage (and an exclusive one always) comes in the colour you bought it in, and it is yours (the
    // garage takes it back in)
    const kept = WORKSHOP.kept(M), mine = M.buy || own ? GARAGE.mine(M.id) : null;
    const c = makeCar(M, kept && kept.paint !== null ? kept.paint : mine ? mine.color : goldCars && !M.police && !M.mil && !M.boat && M.id !== 'taxi' ? 0xc9a227 : M.colors[Math.floor(Math.random() * M.colors.length)]);
    WORKSHOP.fit(c, kept);
    if (mine) c.owned = true;
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
    else if (FLY.on) { const H = FLY.heli; player.x = H.x; player.z = H.z; player.y = H.y; player.vx = H.vx; player.vz = H.vz; player.vy = 0; player.rot = H.h; }
    else if (CHUTE.on) CHUTE.step(dt);
    // (on a ride at Gröna Lund RIDES puts you in your seat, or you stand in the queue)
    else if (RIDES.on) { player.vx = player.vz = player.vy = 0; }
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
      // (at night the headlights are on in every car with someone in it, and the tail lights shine brighter: DAYNIGHT)
      glow.x = !c.dead && (c === driving || c.occupant || c.bot) ? DAYNIGHT.head : DAYNIGHT.parked;
      glow.y = c.braking ? BRAKE_GLOW : TAIL_GLOW * DAYNIGHT.tail;
      c.mat.userData.rev.value = c.reversing && !c.dead ? 1.8 : 0;
      updateBlink(c, dt);
      updateEngine(c, vf / (c.speedK || 1), dt);
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
    // on a ride at Gröna Lund the camera sits in your seat; at the workshop it looks at your car, in the garage at yours
    const seatView = RIDES.view() || WORKSHOP.view() || GARAGE.view();
    if (seatView) {
      const p = seatView.pos, d = seatView.dir;
      camera.position.copy(p); camTarget.copy(p);
      camera.lookAt(p.x + d.x, p.y + d.y, p.z + d.z);
      sky.position.copy(camera.position);
      sun.position.copy(camTarget).add(SUN_OFF);
      sun.target.position.copy(camTarget);
      return;
    }
    // in the back of a police car, or riding along with a friend, the camera follows the car just as when you drive
    const car = driving || (policeStop && policeStop.riding ? policeStop.car : null) || MP.ride;
    // in the helicopter the camera hangs behind it and turns with it
    const fly = FLY.on ? FLY.heli : null;
    const vf = car ? car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h) : fly ? Math.hypot(fly.vx, fly.vz) * 0.5 : 0;
    let tx, ty, tz, want;
    if (fly) { tx = fly.x; ty = fly.y + 2.2; tz = fly.z; want = 17 + Math.hypot(fly.vx, fly.vz) * 0.08; }
    else if (car) { tx = car.x; ty = car.M.boat ? WATER_Y + (car.M.boat === 'jetski' ? 1.6 : 2.0) : car.M.bus ? 3.2 : car.M.moped ? 1.45 : 1.7; tz = car.z; want = (car.M.bus ? 15 : car.M.moped ? 5.2 : car.M.boat === 'jetski' ? 6.5 : car.M.boat ? 11 : 9.5) + Math.abs(vf) * 0.05; }
    else { tx = player.x; ty = player.y + 1.55; tz = player.z; want = CHUTE.on ? (CHUTE.open ? 13 : 9) : STATION.inside(player.x, player.z) ? 4.2 : 6; }
    // first person: the camera sits in your head, on foot or in the driver's seat (not in the air, the back seat or a friend's car)
    const fpCar = car === driving ? car : null;
    const fp = firstPerson && started && !fly && !CHUTE.on && !METRO.riding && (fpCar || !car);
    if (driving) driving.driver.visible = !(fp && fpCar);
    // the inside of the vehicle you drive, with its moving needles and wheel, only in first person
    INTERIOR.show(fp ? fpCar : null);
    if (fp && fpCar) INTERIOR.update(fpCar, dt, vf);
    if (fp) {
      if (fpCar) {
        // turn with the car, and look ahead again a while after the mouse let go
        camYaw += wrapAngle(fpCar.h - fpLastH);
        if (performance.now() - lastLook > 1500) camYaw = lerpAngle(camYaw, fpCar.h, 1 - Math.exp(-3 * dt));
        fpLastH = fpCar.h;
        const d = fpCar.driver.position, rider = fpCar.geo.driver.rider || fpCar.M.moped;
        fpEye.set(d.x, d.y + (rider ? 0.72 : 0.84), d.z + (rider ? 0.1 : -0.14));
        fpCar.group.updateMatrixWorld();
        fpCar.body.localToWorld(fpEye);
      } else {
        fpEye.set(player.x + Math.sin(player.rot) * 0.18, player.y + 1.62, player.z + Math.cos(player.rot) * 0.18);
        player.model.group.visible = false;
      }
      const pitch = camPitch - (fpCar ? 0.22 : 0.3), cp = Math.cos(pitch), sp = Math.sin(pitch);
      camTarget.copy(fpEye);
      camera.position.copy(fpEye);
      if (shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3;
        shake *= Math.exp(-7 * dt);
      }
      camera.lookAt(fpEye.x + Math.sin(camYaw) * cp, fpEye.y - sp, fpEye.z + Math.cos(camYaw) * cp);
      if (camera.near !== 0.08) { camera.near = 0.08; camera.updateProjectionMatrix(); }
      const fov = 70 + (reduceMotion ? 0 : Math.min(14, Math.abs(vf) * 0.2));
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }
      sky.position.copy(camera.position);
      sun.position.copy(camTarget).add(SUN_OFF);
      sun.target.position.copy(camTarget);
      return;
    }
    if (fpCar) fpLastH = fpCar.h;
    if (camera.near !== 0.2) { camera.near = 0.2; camera.updateProjectionMatrix(); }
    const kh = 1 - Math.exp(-(car || fly ? 10 : 14) * dt);
    // indoors the camera comes in close and stays between the floor and the ceiling
    const span = car || fly || CHUTE.on ? null : indoorSpan(player.x, player.z, player.y);
    if (span) want = 3.2;
    camTarget.x += (tx - camTarget.x) * kh;
    camTarget.z += (tz - camTarget.z) * kh;
    camTarget.y += (ty - camTarget.y) * (1 - Math.exp(-8 * dt));
    camDist += (want - camDist) * (1 - Math.exp(-4 * dt));
    if (!started) camYaw += dt * 0.1;
    else if (car && performance.now() - lastLook > 1500 && Math.abs(vf) > 1) camYaw = lerpAngle(camYaw, car.h, 1 - Math.exp(-2.5 * dt));
    else if (fly && performance.now() - lastLook > 1500) camYaw = lerpAngle(camYaw, fly.h, 1 - Math.exp(-2 * dt));
    else if (CHUTE.open && performance.now() - lastLook > 1500) camYaw = lerpAngle(camYaw, player.rot, 1 - Math.exp(-1.5 * dt));
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    const t = camClip(camTarget.x, camTarget.y, camTarget.z, camTarget.x - Math.sin(camYaw) * cp * camDist, camTarget.z - Math.cos(camYaw) * cp * camDist);
    clipT = t < clipT ? t : Math.min(t, clipT + dt * 1.5);
    const dist = camDist * clipT;
    let cx = camTarget.x - Math.sin(camYaw) * cp * dist, cz = camTarget.z - Math.cos(camYaw) * cp * dist;
    let cy = Math.max(car && car.M.boat ? WATER_Y + 0.6 : 0.5, camTarget.y + sp * dist);
    // indoors at the police station the camera stays under the ceiling
    if (!car && !fly && (STATION.inside(player.x, player.z) || STATION.inside(cx, cz))) cy = Math.min(cy, STATION.GH - 0.3);
    // and in the workshop's hall under its roof
    if (!fly) cy = Math.min(cy, WORKSHOP.ceiling(cx, cz, camTarget.x, camTarget.z));
    if (span) cy = clamp(cy, span.floor + 0.4, span.ceil - 0.15);
    // so close that the camera would be inside your head: hide the body
    if (!car && !fly && !CHUTE.on && !METRO.riding) player.model.group.visible = dist > 1.15;
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
