'use strict';

  /* ---------- car physics ---------- */
  let shake = 0;
  function bump(strength) {
    if (!reduceMotion) shake = Math.max(shake, Math.min(0.5, strength * 0.035));
  }
  function shiftTo(c, g) {
    g = clamp(g, 0, c.M.gears - 1);
    if (g === c.gear) return false;
    const dir = g > c.gear ? 1 : -1;
    c.gear = g;
    c.shiftT = c.auto ? SHIFT_TIME : SHIFT_TIME * 0.7;
    if (c === driving) onShift(c, dir);
    return true;
  }
  function autoShift(c, vf, thr) {
    const M = c.M;
    if (c.shiftT > 0) return;
    if (vf < 0.6) { c.gear = 0; return; }
    const hard = thr > 0.6, r = vf / M.gearTop[c.gear];
    if (c.gear < M.gears - 1 && r > (hard ? UP_HARD : UP_SOFT)) shiftTo(c, c.gear + 1);
    else if (c.gear > 0 && vf < M.gearTop[c.gear - 1] * (hard ? 0.6 : 0.34)) shiftTo(c, c.gear - 1);
  }
  // where a boat may be: open water all round its hull (under a bridge counts), inside the map
  function boatFits(M, x, z, h) {
    if (x < BOUNDS.x0 + 20 || x > BOUNDS.x1 - 20 || z < BOUNDS.z0 + 20 || z > BOUNDS.z1 - 20) return false;
    const co = Math.cos(h), si = Math.sin(h), hw = M.W / 2 - 0.05, hl = M.L / 2 - 0.05;
    for (const [lx, lz] of [[0, hl], [-hw * 0.6, hl * 0.6], [hw * 0.6, hl * 0.6], [-hw, 0], [hw, 0], [-hw, -hl], [hw, -hl], [0, -hl]]) {
      if (groundAt(x + lx * co + lz * si, z - lx * si + lz * co) & 1) return false;
    }
    return true;
  }
  // a boat: the propeller or the jet pushes it along, the water drags it back, it slides sideways through a turn before
  // the hull bites, and it only steers while it moves (a jet ski hardly at all off the throttle, as its jet is the rudder)
  function updateBoat(c, dt, inp) {
    const M = c.M;
    if (!inp && Math.abs(c.vx) + Math.abs(c.vz) < 0.02) { c.vx = c.vz = 0; c.steer = 0; c.throttle = 0; c.thr = 0; c.braking = false; c.slip = 0; return; }
    const ox = c.x, oz = c.z, oh = c.h, jet = M.boat === 'jetski';
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
    let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
    const throttle = inp ? inp.fwd : 0, steerIn = inp ? -inp.right : 0, power = c.dead ? 0 : c.power;
    c.throttle = Math.abs(throttle); c.thr = throttle;
    if (throttle > 0.05) { if (vf < -0.3) vf += M.brake * throttle * dt; else vf += driveAccel(M, Math.max(0, vf), 0, power) * throttle * dt; }
    else if (throttle < -0.05) { if (vf > 0.3) vf += M.brake * throttle * dt; else if (vf > -M.rev) vf += M.accel * 0.3 * throttle * power * dt; }
    // the water holds the hull back, harder the faster it goes, and it slows fast off the throttle
    vf -= vf * Math.min(1, (throttle > 0.05 ? 0.05 : 0.3 + 0.02 * Math.abs(vf)) * dt);
    c.reversing = vf < -0.3 || (throttle < -0.05 && vf < 0.3);
    c.braking = false;
    const sp = Math.abs(vf), bite = jet ? 0.25 + 0.75 * Math.max(c.throttle, 0.3 * clamp(sp / 10, 0, 1)) : clamp(sp / 5, 0.25, 1);
    c.steer += (steerIn * 0.55 - c.steer) * Math.min(1, 5 * dt);
    c.h += (c.steer / 0.55) * (jet ? 1.7 : 0.75) * bite * clamp(sp / 3 + 0.2, 0, 1) * Math.sign(vf || 1) * dt;
    vl *= Math.exp(-(jet ? 2.4 : 1.5) * dt);
    c.slip = Math.abs(vl);
    c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.wheelRot += vf * dt;
    if (!boatFits(M, c.x, c.z, c.h)) {
      // ran into the quay: the end that leads takes the knock
      const v = Math.hypot(c.vx, c.vz), dir = vf >= 0 ? 1 : -1;
      if (v > 3) crash(c, c.x + fx * dir * M.L / 2, c.z + fz * dir * M.L / 2, -fx * dir, -fz * dir, Math.abs(vf), null);
      if (boatFits(M, c.x, oz, c.h)) { c.z = oz; c.vz *= -0.2; c.vx *= 0.8; }
      else if (boatFits(M, ox, c.z, c.h)) { c.x = ox; c.vx *= -0.2; c.vz *= 0.8; }
      else if (boatFits(M, ox, oz, c.h)) { c.x = ox; c.z = oz; c.vx *= -0.2; c.vz *= -0.2; }
      else { c.x = ox; c.z = oz; c.h = oh; c.vx *= -0.2; c.vz *= -0.2; }
      if (c === driving && v > 4) bump(v * 0.6);
    }
  }
  function updateCar(c, dt, inp) {
    const M = c.M;
    if (M.boat) return updateBoat(c, dt, inp);
    if (c.shiftT > 0) c.shiftT -= dt;
    if (!inp && Math.abs(c.vx) + Math.abs(c.vz) < 0.02 && Math.abs(c.steer) < 0.002) { c.vx = c.vz = 0; c.steer = 0; c.throttle = 0; c.thr = 0; c.braking = false; c.slip = 0; return; }
    const ox = c.x, oz = c.z, oh = c.h;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
    let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
    const throttle = inp ? inp.fwd : 0, steerIn = inp ? -inp.right : 0, hand = inp ? inp.brake : false;
    c.throttle = Math.abs(throttle); c.thr = throttle;
    const you = c === driving;
    if (you) {
      // hold S and the car brakes to a stop and then backs up, without letting go; hold W while backing and it stops
      // and drives forwards again (in first gear with the manual box)
      const want = throttle > 0.05 ? 1 : throttle < -0.05 ? -1 : 0, still = Math.abs(vf) < 0.6;
      if (!want || !still || (want < 0) === !!c.inR) c.rT = 0;
      else if ((c.rT += dt) > 0.12) { c.inR = want < 0; c.rT = 0; if (!c.inR) c.gear = 0; onShift(c, c.inR ? -1 : 1); }
    }
    c.reversing = you ? c.inR || vf < -0.3 : vf < -0.3 || (throttle < -0.05 && vf < 0.5);
    // a tuned engine (the workshop): more pull, and every gear reaches that much further (k), the top speed too
    const k = c.speedK || 1;
    if (c.auto && !c.inR) autoShift(c, vf / k, throttle);
    const power = c.dead ? 0 : c.power * (c.boost || 1);
    if (you) {
      // your car goes where the gear says: forwards in 1 and up, backwards only in R; the other pedal brakes to a stop
      const go = c.inR ? -throttle : throttle, back = c.inR ? -1 : 1;
      if (go > 0.05) {
        if (vf * back < -0.5) vf += M.brake * WEATHER.brake * go * back * dt;
        else if (c.inR) { if (vf > -M.rev) vf -= M.accel * 0.7 * go * power * dt; }
        else if (c.shiftT <= 0) vf += driveAccel(M, Math.max(0, vf) / k, c.gear, power) * go * dt;
      } else if (go < -0.05) {
        const dv = M.brake * WEATHER.brake * -go * dt;
        vf = Math.abs(vf) <= dv ? 0 : vf - Math.sign(vf) * dv;
      } else {
        const r = Math.max(0, vf) / (M.gearTop[c.gear] * k);
        const engine = c.shiftT > 0 || Math.abs(vf) < 1 || c.dead || c.inR ? 0 : 0.9 * Math.pow(M.max / M.gearTop[c.gear], 0.5) * Math.min(r, 1.2);
        const roll = (2.2 + engine) * dt;
        vf = Math.abs(vf) <= roll ? 0 : vf - Math.sign(vf) * roll;
      }
    } else if (throttle > 0.05) {
      if (vf < -0.5) vf += M.brake * throttle * dt;
      else if (c.shiftT <= 0) vf += driveAccel(M, Math.max(0, vf) / k, c.gear, power) * throttle * dt;
    } else if (throttle < -0.05) {
      if (vf > 0.5) vf += M.brake * throttle * dt;
      else if (vf > -M.rev) vf += M.accel * 0.7 * throttle * power * dt;
    } else {
      // rolling resistance, plus engine braking that is stronger in low gears and at high revs
      const r = vf / (M.gearTop[c.gear] * k);
      const engine = c.shiftT > 0 || vf < 1 || c.dead ? 0 : 0.9 * Math.pow(M.max / M.gearTop[c.gear], 0.5) * Math.min(r, 1.2);
      const roll = ((inp ? 2.2 : 7) + engine) * dt;
      vf = Math.abs(vf) <= roll ? 0 : vf - Math.sign(vf) * roll;
    }
    // a manual downshift at too high a speed: the engine over-revs and holds the car back hard
    if (vf > M.gearTop[c.gear] * k * 1.06 && c.shiftT <= 0) vf -= 4 * dt;
    if (vf > M.max * k) vf = M.max * k;
    if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
    c.braking = hand || (throttle < -0.05 && vf > 0.5) || (throttle > 0.05 && vf < -0.5);
    const maxSteer = 0.6 / (1 + Math.abs(vf) * 0.03);
    // bent suspension after a crash pulls the car to one side
    c.steer += (steerIn * maxSteer + c.align - c.steer) * Math.min(1, 6 * dt);
    // (lowered springs hold the road a little better; in the wet and on snow your car holds it less well: WEATHER)
    const grip = M.grip * (c.gripK || 1) * (you ? WEATHER.grip : 1);
    vl *= Math.exp(-(hand ? 1.4 : 9) * grip * dt);
    c.slip = Math.abs(vl) + (hand && Math.abs(vf) > 3 ? Math.abs(vf) * 0.35 : 0)
      + (throttle > 0.9 && c.gear === 0 && vf < 7 && M.zero[1] < 5 && !c.dead ? 4 : 0);
    let yaw = (vf / M.wb) * Math.tan(c.steer);
    const cap = ((hand ? 1.8 : 1) * 14 * grip) / Math.max(Math.abs(vf), 5);
    yaw = clamp(yaw, -cap, cap);
    c.h += yaw * dt;
    // velocity stays in the old frame; the new heading picks up a little slip next step
    c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.wheelRot += (vf * dt) / M.R;
    if (!fitsM(M, c.x, c.z, c.h)) {
      // ran into the quay edge or the end of a bridge: the end of the car that leads takes the hit
      const sp = Math.hypot(c.vx, c.vz), dir = vf >= 0 ? 1 : -1;
      if (sp > 3) crash(c, c.x + fx * dir * M.L / 2, c.z + fz * dir * M.L / 2, -fx * dir, -fz * dir, Math.abs(vf), null);
      if (fitsM(M, c.x, oz, c.h)) { c.z = oz; c.vz *= -0.2; c.vx *= 0.8; }
      else if (fitsM(M, ox, c.z, c.h)) { c.x = ox; c.vx *= -0.2; c.vz *= 0.8; }
      else if (fitsM(M, ox, oz, c.h)) { c.x = ox; c.z = oz; c.vx *= -0.2; c.vz *= -0.2; }
      else { c.x = ox; c.z = oz; c.h = oh; c.vx *= -0.2; c.vz *= -0.2; }
      if (c === driving && sp > 4) bump(sp * 0.6);
    }
  }
  // engine speed for the rev counter and the engine sound
  function updateEngine(c, vf, dt) {
    const M = c.M, v = Math.abs(vf), thr = Math.max(0, c.thr || 0);
    let target;
    if (c.dead) target = 0;
    else if (M.cvt || M.boat) {
      // the variator (and a boat's engine, its propeller slipping in the water): the clutch takes up at about half revs and the engine stays up near its best revs while the
      // ratio changes; let go of the throttle and it drops back towards idle
      const k = clamp(v / M.max, 0, 1);
      target = c.throttle > 0.05 && !c.reversing ? lerp(M.red * 0.72, M.red * 0.87, k) * (0.82 + 0.18 * c.throttle) : v > 0.8 ? lerp(M.idle * 1.4, M.red * 0.5, k) : M.idle;
    } else {
      target = c.reversing ? M.red * 0.75 * clamp(v / M.rev, 0, 1) : (M.red * v) / M.gearTop[c.gear];
      // clutch slipping off the line, or revving with the car standing still (an electric motor turns with the wheels)
      if (!M.ev && (c.reversing || c.gear === 0 || v < 0.5)) target = Math.max(target, lerp(M.idle, M.red * (v < 0.5 ? 0.6 : 0.4), c.throttle));
      target = clamp(target, M.idle, M.red * 1.04);
    }
    c.limiter = !c.dead && c.shiftT <= 0 && thr > 0.3 && target >= M.red * 0.99;
    c.rpm += (target - c.rpm) * (1 - Math.exp(-dt * (target > c.rpm ? 9 : 6)));
    if (c.limiter) c.rpm = M.red * (0.965 + 0.035 * Math.random());
    c.load = c.dead || c.shiftT > 0 ? 0 : c.throttle;
  }
  function carWorld(c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    let px = 0, pz = 0, nx = 0, nz = 0, hit = false, hx = 0, hz = 0, best = 0;
    for (const off of c.offs) {
      const cx = c.x + fx * off, cz = c.z + fz * off;
      const res = resolveWorld(cx, cz, c.r, c.M.boat ? WATER_Y : undefined);
      if (res.hit) {
        if (Math.abs(res.x - cx) > Math.abs(px)) px = res.x - cx;
        if (Math.abs(res.z - cz) > Math.abs(pz)) pz = res.z - cz;
        nx += res.nx; nz += res.nz; hit = true;
        const pen = Math.hypot(res.x - cx, res.z - cz);
        if (pen >= best) { best = pen; hx = cx; hz = cz; }
      }
    }
    if (!hit) return;
    if (c.M.boat ? boatFits(c.M, c.x + px, c.z + pz, c.h) : fitsM(c.M, c.x + px, c.z + pz, c.h)) { c.x += px; c.z += pz; }
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-6) return;
    nx /= nl; nz /= nl;
    const vn = c.vx * nx + c.vz * nz;
    if (vn < 0) {
      if (-vn > 2) crash(c, hx - nx * c.r, hz - nz * c.r, nx, nz, -vn, null);
      c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz;
      c.vx *= 0.8; c.vz *= 0.8;
      if (c === driving && -vn > 2) bump(-vn);
    }
  }
  function carPairs() {
    for (const c of cars) { c.px = c.x; c.pz = c.z; }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.remote && b.remote) continue;
      const lim = (a.M.L + b.M.L) / 2 + 0.5, ddx = a.x - b.x, ddz = a.z - b.z;
      if (ddx * ddx + ddz * ddz > lim * lim) continue;
      const afx = Math.sin(a.h), afz = Math.cos(a.h), bfx = Math.sin(b.h), bfz = Math.cos(b.h);
      // A friend's car is where their game says it is: it can't be shoved, only bounced off. (ia, ib push the cars apart,
      // ma, mb share out the knock by the real masses, so each game gives its own car what a local crash would)
      const ma = 1 / a.M.mass, mb = 1 / b.M.mass, ia = a.remote ? 0 : ma, ib = b.remote ? 0 : mb;
      for (const oa of a.offs) for (const ob of b.offs) {
        const ax = a.x + afx * oa, az = a.z + afz * oa, bx = b.x + bfx * ob, bz = b.z + bfz * ob;
        const dx = ax - bx, dz = az - bz, rr2 = a.r + b.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr2 * rr2 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr2 - d;
        const wa = ia / (ia + ib), wb = ib / (ia + ib);
        a.x += nx * pen * wa; a.z += nz * pen * wa; b.x -= nx * pen * wb; b.z -= nz * pen * wb;
        const vr = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vr < 0) {
          const ka = ma / (ma + mb), kb = mb / (ma + mb);
          if (-vr > 2) {
            // each car takes the share of the change in speed that the other's mass forces on it
            const cx = ax - nx * a.r, cz = az - nz * a.r;
            crash(a, cx, cz, nx, nz, -vr * ka, b);
            crash(b, cx, cz, -nx, -nz, -vr * kb, a);
          }
          const jimp = (-1.3 * vr) / (ma + mb);
          if (!a.remote) { a.vx += jimp * ma * nx; a.vz += jimp * ma * nz; }
          if (!b.remote) { b.vx -= jimp * mb * nx; b.vz -= jimp * mb * nz; }
          if ((a === driving || b === driving) && -vr > 2) bump(-vr);
        }
      }
    }
    for (const c of cars) if (!c.remote && (c.x !== c.px || c.z !== c.pz) && !(c.M.boat ? boatFits(c.M, c.x, c.z, c.h) : fitsM(c.M, c.x, c.z, c.h))) { c.x = c.px; c.z = c.pz; }
  }

  /* ---------- particles: smoke, sparks, glass and bits ---------- */
  const PARTICLE_VERT = [
    'attribute vec3 pcol; attribute float psize; attribute float palpha;',
    'uniform float scale;',
    'varying vec3 vCol; varying float vA;',
    'void main() {',
    '  vCol = pcol; vA = palpha;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = psize * scale / -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  const PARTICLE_FRAG = [
    'uniform float soft;',
    'varying vec3 vCol; varying float vA;',
    'void main() {',
    '  vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p);',
    '  if (d > 1.0) discard;',
    '  float a = vA * (soft > 0.5 ? (1.0 - d) * (1.0 - d) : 1.0 - smoothstep(0.55, 1.0, d));',
    '  gl_FragColor = vec4(vCol, a);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');
  class Particles {
    constructor(max, blending, soft) {
      this.max = max; this.list = [];
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      const g = new THREE.BufferGeometry();
      const attr = (name, arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
      this.aPos = attr('position', this.pos, 3); this.aCol = attr('pcol', this.col, 3); this.aSize = attr('psize', this.size, 1); this.aAlpha = attr('palpha', this.alpha, 1);
      g.setDrawRange(0, 0);
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, transparent: true, depthWrite: false, blending,
        uniforms: { scale: { value: 500 }, soft: { value: soft ? 1 : 0 } }
      });
      const pts = new THREE.Points(g, this.mat);
      pts.frustumCulled = false; pts.renderOrder = 2;
      scene.add(pts);
    }
    // o: x y z, vx vy vz, life, size [from, to], alpha, colour, gravity, drag, bounce, fadeIn
    spawn(o) {
      if (this.list.length >= this.max) this.list.shift();
      o.t = 0; o.c = o.c || new THREE.Color(o.color);
      this.list.push(o);
    }
    update(dt) {
      const L = this.list;
      let w = 0;
      for (let i = 0; i < L.length; i++) {
        const q = L[i];
        q.t += dt;
        if (q.t >= q.life) continue;
        const dr = Math.exp(-(q.drag || 0) * dt);
        q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr - (q.grav || 0) * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        const fl = q.floor ?? 0.04;
        if (q.y < fl && q.vy < 0) { q.y = fl; q.vy *= -(q.bounce || 0); q.vx *= 0.6; q.vz *= 0.6; }
        L[w++] = q;
      }
      L.length = w;
      for (let i = 0; i < w; i++) {
        const q = L[i], k = q.t / q.life;
        this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
        this.col[i * 3] = q.c.r; this.col[i * 3 + 1] = q.c.g; this.col[i * 3 + 2] = q.c.b;
        this.size[i] = lerp(q.size[0], q.size[1], k);
        this.alpha[i] = q.alpha * Math.min(1, q.t / (q.fadeIn || 0.0001)) * (1 - k) * (1 - k * 0.3);
      }
      this.geo.setDrawRange(0, w);
      if (w) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; }
    }
  }
  const smokeFx = new Particles(260, THREE.NormalBlending, true);
  const sparkFx = new Particles(160, THREE.AdditiveBlending, false);
  const bitsFx = new Particles(220, THREE.NormalBlending, false);
  const SMOKE_COL = { steam: new THREE.Color(0xe9ecef), grey: new THREE.Color(0x9a9da1), black: new THREE.Color(0x515357), tyre: new THREE.Color(0xd6d8da) };
  const SPARK_COL = new THREE.Color(0xffb347), GLASS_COL = new THREE.Color(0xcfe4ee);

  /* ---------- skid marks ---------- */
  const SKID_MAX = 900;
  const skidPos = new Float32Array(SKID_MAX * 18);
  const skidGeo = new THREE.BufferGeometry();
  const skidAttr = new THREE.BufferAttribute(skidPos, 3); skidAttr.setUsage(THREE.DynamicDrawUsage);
  skidGeo.setAttribute('position', skidAttr);
  skidGeo.setDrawRange(0, 0);
  const skids = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x0d0d0e, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
  skids.frustumCulled = false;
  scene.add(skids);
  let skidN = 0, skidCount = 0;
  function skidSegment(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, px = (-dz / l) * 0.12, pz = (dx / l) * 0.12, y = 0.03;
    const o = skidN * 18;
    const v = [x0 - px, y, z0 - pz, x1 - px, y, z1 - pz, x1 + px, y, z1 + pz, x0 - px, y, z0 - pz, x1 + px, y, z1 + pz, x0 + px, y, z0 + pz];
    for (let i = 0; i < 18; i++) skidPos[o + i] = v[i];
    skidN = (skidN + 1) % SKID_MAX;
    skidCount = Math.min(SKID_MAX, skidCount + 1);
    skidGeo.setDrawRange(0, skidCount * 6);
    skidAttr.needsUpdate = true;
  }
  function trackSkids(c) {
    if (!c.skid) c.skid = [null, null];
    const sliding = c.slip > 2.6 && Math.hypot(c.vx, c.vz) > 1.5 && Math.hypot(c.x - camTarget.x, c.z - camTarget.z) < 80;
    const co = Math.cos(c.h), si = Math.sin(c.h), wx = wheelX(c.M), wz = -c.M.wb / 2;
    for (let i = 0; i < (c.M.moped ? 1 : 2); i++) {
      const lx = i ? -wx : wx, x = c.x + lx * co + wz * si, z = c.z - lx * si + wz * co;
      if (!sliding) { c.skid[i] = null; continue; }
      const last = c.skid[i];
      if (!last) { c.skid[i] = [x, z]; continue; }
      if (Math.hypot(x - last[0], z - last[1]) > 0.35) { skidSegment(last[0], last[1], x, z); c.skid[i] = [x, z]; }
    }
  }

  /* ---------- damage ---------- */
  // A crash dents the body where it hits: the vertices near the contact point are pushed into the car (never more
  // than MAX_DENT from where they started), the paint there is scraped, lamps break, windows crack, and a hit
  // at the engine end costs engine health. Below about 50 % the engine steams and loses power, below 25 % it
  // smokes, and at 0 it stops.
  const MAX_DENT = 0.62;
  const posHash = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
  // a car's geometry is shared with others of the same model and colour until its first dent
  function ownGeometry(c) {
    if (!c.geoShared) return;
    const g = c.geo;
    c.geo = { ...g, body: g.body.clone(), glass: g.glass.clone(), decal: g.decal ? g.decal.clone() : null };
    c.bodyMesh.geometry = c.geo.body; c.glass.geometry = c.geo.glass;
    if (c.decal) c.decal.geometry = c.geo.decal;
    c.geoShared = false;
  }
  function dentGeometry(geo, lx, ly, lz, dx, dz, depth, radius, scrape, breakLamps) {
    if (!geo) return false;
    const P = geo.attributes.position.array;
    if (!geo.userData.orig) geo.userData.orig = P.slice();
    const O = geo.userData.orig, C = geo.attributes.color ? geo.attributes.color.array : null, S = geo.attributes.surf ? geo.attributes.surf.array : null;
    let touched = false;
    const moved = geo.index ? null : new Uint8Array(P.length / 3);
    for (let i = 0, n = P.length / 3; i < n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const ex = px - lx, ey = (py - ly) * 0.75, ez = pz - lz, d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d >= radius) continue;
      touched = true;
      if (moved) moved[i] = 1;
      const w = (1 - d / radius) * (1 - d / radius), push = depth * w;
      const ox = O[i * 3], oy = O[i * 3 + 1], oz = O[i * 3 + 2], hsh = posHash(ox, oy, oz) - 0.5, hsh2 = posHash(oz, ox, oy) - 0.5;
      // push along the impact, with some crumple sideways and up/down so panels buckle instead of sliding
      let nx = px + dx * push - dz * push * hsh * 0.5, ny = py + push * hsh2 * 0.45, nz = pz + dz * push + dx * push * hsh * 0.5;
      const mx = nx - ox, my = ny - oy, mz = nz - oz, m = Math.sqrt(mx * mx + my * my + mz * mz);
      if (m > MAX_DENT) { const k = MAX_DENT / m; nx = ox + mx * k; ny = oy + my * k; nz = oz + mz * k; }
      P[i * 3] = nx; P[i * 3 + 1] = Math.max(0.06, ny); P[i * 3 + 2] = nz;
      if (C && scrape > 0) {
        const k = Math.min(0.7, w * scrape);
        C[i * 3] = lerp(C[i * 3], 0.12, k); C[i * 3 + 1] = lerp(C[i * 3 + 1], 0.12, k); C[i * 3 + 2] = lerp(C[i * 3 + 2], 0.13, k);
      }
      if (S && breakLamps && w > 0.15) {
        const ch = S[i * 4 + 3];
        if (ch > 0.5 && ch < 5.5 && (ch < 2.5 || ch > 4.5)) { S[i * 4 + 3] = 0; if (C) { C[i * 3] = 0.05; C[i * 3 + 1] = 0.05; C[i * 3 + 2] = 0.06; } }
      }
    }
    if (!touched) return false;
    geo.attributes.position.needsUpdate = true;
    if (C) geo.attributes.color.needsUpdate = true;
    if (S) geo.attributes.surf.needsUpdate = true;
    if (moved) {
      // only the crumpled triangles get new (flat) normals; the rest of the body keeps its smooth shading
      const N = geo.attributes.normal.array;
      for (let t = 0; t < moved.length; t += 3) {
        if (!moved[t] && !moved[t + 1] && !moved[t + 2]) continue;
        const a = t * 3, b = a + 3, c = a + 6;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-12) continue;
        nx /= l; ny /= l; nz /= l;
        for (const o of [a, b, c]) { N[o] = nx; N[o + 1] = ny; N[o + 2] = nz; }
      }
      geo.attributes.normal.needsUpdate = true;
    } else geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return true;
  }
  const engineEnd = (M) => (M.rearEngine || M.bus ? -1 : 1);
  function engineSpot(c) {
    const M = c.M, e = engineEnd(M), lz = M.moped ? 0.05 : M.boat ? -(M.L / 2 - 0.5) : e * (M.L / 2 - (M.bus ? 1 : 0.7)), ly = M.moped ? 0.3 : M.boat ? WATER_Y + 1.1 : M.mil ? 1.9 : M.bus ? 2.9 : carShape(M).belt(lz) + 0.05;
    const co = Math.cos(c.h), si = Math.sin(c.h);
    return { x: c.x + lz * si, y: ly, z: c.z + lz * co };
  }
  function crash(c, wx, wz, dx, dz, speed, other) {
    if (speed < 2.5) return;
    if (c.hitT > 0 && speed < c.lastHit * 1.25) return;
    c.hitT = 0.2; c.lastHit = speed;
    const M = c.M, co = Math.cos(c.h), si = Math.sin(c.h);
    const ex = wx - c.x, ez = wz - c.z, lx = ex * co - ez * si, lz = ex * si + ez * co;
    const ldx = dx * co - dz * si, ldz = dx * si + dz * co;
    const ly = M.moped || M.boat ? 0.5 : M.mil ? 1.0 : M.bus ? 0.9 : carShape(M).sill(0) + 0.3;
    // a friend's car: their own game dents it and tells us how, so here it only gives off sparks and a bang
    if (c.remote) { sparkBurst(wx, ly + 0.1, wz, dx, dz, speed); crashSound(wx, wz, speed, false); return; }
    const hard = speed - 2.5;
    if (hard > 1.5) {
      const depth = Math.min(0.7, 0.032 * Math.pow(hard, 1.15)), radius = Math.min(1.5, 0.55 + speed * 0.045);
      dentCar(c, lx, ly, lz, ldx, ldz, depth, radius, speed);
      if (c === driving) MP.dent(c, [lx, ly, lz, ldx, ldz, depth, radius, speed]);
      // a hard knock near a wheel bends it, and a bent front wheel pulls the steering
      if (!M.moped) for (const wh of c.wheels) {
        if (speed < 7 || M.mil || Math.abs(lz - wh.z) > 0.9 || lx * wh.sx < M.W / 2 - 0.6) continue;
        const k = Math.min(1, speed / 25);
        wh.toe = clamp(wh.toe + (Math.random() - 0.5) * 0.25 * k, -0.18, 0.18);
        wh.camber = clamp(wh.camber + wh.sx * (0.04 + Math.random() * 0.08) * k, -0.25, 0.25);
        if (wh.steers) c.align = clamp(c.align + wh.sx * (0.01 + Math.random() * 0.03) * k, -0.08, 0.08);
      }
    }
    // engine health: the end with the engine is the soft spot
    const atEngine = lz * engineEnd(M) > M.L * 0.2;
    if (!c.dead) {
      c.health = Math.max(0, c.health - Math.pow(Math.max(0, hard), 1.25) * (atEngine ? 1.6 : 0.6));
      c.power = c.health > 50 ? 1 : 0.45 + (c.health / 50) * 0.55;
      if (c.health <= 0) engineDies(c);
    }
    sparkBurst(wx, ly + 0.1, wz, dx, dz, speed);
    crashSound(wx, wz, speed, c.glassBroken && speed > 8);
    if (c === driving && !c.dead && c.health < 50 && !c.warned) { c.warned = true; toast('Motorn är skadad. Bilen orkar mindre.'); }
    if (c.police && other && other === driving) policeRammed(c);
    // come off a moped in a hard knock: you fly, the moped falls over on its side
    if (M.moped && c === driving && speed > 6.5) {
      const vx = c.vx, vz = c.vz;
      exitCar();
      player.vx = vx * 0.55; player.vz = vz * 0.55; player.vy = 5.5; player.grounded = false; player.knockT = 1.4;
      c.fallen = Math.random() < 0.5 ? 1.4 : -1.4;
      toast('Du flög av mopeden!');
    }
  }
  // a dent at (lx, ly, lz) in the car's own frame, pushed in along (ldx, ldz); a hard enough one breaks the glass
  function dentCar(c, lx, ly, lz, ldx, ldz, depth, radius, speed) {
    ownGeometry(c);
    dentGeometry(c.geo.body, lx, ly, lz, ldx, ldz, depth, radius, Math.min(0.8, speed / 25), speed > 5);
    dentGeometry(c.geo.decal, lx, ly, lz, ldx, ldz, depth, radius, 0, false);
    const glassHit = dentGeometry(c.geo.glass, lx, ly + 0.4, lz, ldx, ldz, depth * 0.8, radius * 1.1, 0, false);
    c.dented = true;
    if (glassHit && speed > 8 && !c.glassBroken) {
      c.glassBroken = true; c.glass.material = crackedMat;
      const co = Math.cos(c.h), si = Math.sin(c.h);
      glassBurst(c.x + lx * co + lz * si, ly + 0.6, c.z - lx * si + lz * co, ldx * co + ldz * si, -ldx * si + ldz * co, speed);
    }
  }
  function engineDies(c) {
    c.dead = true; c.health = 0; c.power = 0;
    if (c === driving) toast('Motorn har lagt av. Kliv ur med E och ta en annan bil.');
    else if (c.bot) {
      // the driver gets out and walks away from the wreck
      const spot = exitSpot(c);
      if (spot && c.occupant) { const npc = makePerson(c.occupant, spot.x, spot.z, { state: 'flee', t: 3, dodgeT: 0 }); npc.rot = c.h; }
      setOccupant(c, null);
      c.bot = null;
      c.police = null;
    }
    c.siren = false;
  }
  function sparkBurst(x, y, z, dx, dz, speed) {
    const n = Math.min(26, Math.round(speed * 1.4));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 2 + Math.random() * speed * 0.35;
      sparkFx.spawn({ x, y, z, vx: Math.cos(a) * s - dx * 2, vy: 1 + Math.random() * 4, vz: Math.sin(a) * s - dz * 2, life: 0.25 + Math.random() * 0.4, size: [0.09, 0.03], alpha: 1, c: SPARK_COL, grav: 14, drag: 1, bounce: 0.3 });
    }
    if (speed > 6) for (let i = 0; i < Math.min(12, speed * 0.5); i++) {
      const a = Math.random() * TAU, s = 1 + Math.random() * 3;
      bitsFx.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 1.5 + Math.random() * 3, vz: Math.sin(a) * s, life: 1.6 + Math.random(), size: [0.07, 0.07], alpha: 1, color: rpick([0x1c1d20, 0x2a2b2e, 0x5a5d61]), grav: 12, drag: 0.6, bounce: 0.25 });
    }
    for (let i = 0; i < Math.min(6, speed * 0.3); i++) {
      smokeFx.spawn({ x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 1.5, life: 1.2 + Math.random(), size: [0.5, 2.2], alpha: 0.35, c: SMOKE_COL.grey, drag: 1.5, fadeIn: 0.1 });
    }
  }
  function glassBurst(x, y, z, dx, dz, speed) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, s = 1 + Math.random() * 3 + speed * 0.08;
      bitsFx.spawn({ x: x + (Math.random() - 0.5) * 0.8, y, z: z + (Math.random() - 0.5) * 0.8, vx: Math.cos(a) * s - dx, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s - dz, life: 1.4 + Math.random() * 1.4, size: [0.05, 0.05], alpha: 0.95, c: GLASS_COL, grav: 13, drag: 0.4, bounce: 0.35 });
    }
  }
  // steam, then smoke, from the engine of every damaged car close to the camera; burnouts and slides smoke the tyres
  // (a boat has no tyres: its slides throw up spray instead, see boatWake)
  function damageFx(c, dt) {
    if (c.hitT > 0) c.hitT -= dt;
    const near = Math.hypot(c.x - camTarget.x, c.z - camTarget.z) < 90;
    if (!near) return;
    if (c.health < 55) {
      c.smokeT -= dt;
      if (c.smokeT <= 0) {
        const e = engineSpot(c), heavy = c.health < 25, col = c.dead ? SMOKE_COL.black : heavy ? SMOKE_COL.grey : SMOKE_COL.steam;
        c.smokeT = c.dead ? 0.07 : heavy ? 0.1 : 0.16;
        smokeFx.spawn({ x: e.x + (Math.random() - 0.5) * 0.4, y: e.y, z: e.z + (Math.random() - 0.5) * 0.4, vx: c.vx * 0.3 + (Math.random() - 0.5) * 0.6 + 0.4, vy: 1.3 + Math.random() * 0.9, vz: c.vz * 0.3 + (Math.random() - 0.5) * 0.6 + 0.2, life: c.dead ? 3.6 : 2.4, size: [0.6, c.dead ? 5 : 3.4], alpha: c.dead ? 0.38 : heavy ? 0.3 : 0.22, c: col, drag: 0.7, fadeIn: 0.3 });
      }
    }
    if (c.M.boat) return;
    if (c.slip > 3.5 && Math.random() < dt * 30) {
      const co = Math.cos(c.h), si = Math.sin(c.h), lx = (Math.random() < 0.5 ? -1 : 1) * wheelX(c.M), lz = -c.M.wb / 2;
      smokeFx.spawn({ x: c.x + lx * co + lz * si, y: 0.3, z: c.z - lx * si + lz * co, vx: (Math.random() - 0.5) * 1.2, vy: 0.5 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 1.2, life: 1.8, size: [0.6, 3.2], alpha: Math.min(0.5, (c.slip - 3) * 0.08), c: SMOKE_COL.tyre, drag: 1.2, fadeIn: 0.15 });
    }
    trackSkids(c);
  }

  /* ---------- people physics ---------- */
  const personFits = (x, z) => walkable(x - 0.3, z - 0.3) && walkable(x + 0.3, z - 0.3) && walkable(x - 0.3, z + 0.3) && walkable(x + 0.3, z + 0.3);
  function personVsCars(p) {
    let gy = 0;
    const r = 0.35;
    for (const c of cars) {
      if (c === driving && p === player) continue;
      let dx = p.x - c.x, dz = p.z - c.z;
      const lim = c.M.L / 2 + 1;
      if (dx * dx + dz * dz > lim * lim) continue;
      const co = Math.cos(c.h), si = Math.sin(c.h);
      for (const part of c.parts) {
        const lx = dx * co - dz * si, lz = dx * si + dz * co - part.cz;
        if (p.y >= part.top - 0.3) {
          if (Math.abs(lx) < part.hw + 0.1 && Math.abs(lz) < part.hl + 0.1) gy = Math.max(gy, part.top);
          continue;
        }
        const ex = part.hw + r - Math.abs(lx), ez = part.hl + r - Math.abs(lz);
        if (ex <= 0 || ez <= 0) continue;
        let ux = 0, uz = 0, pen;
        if (ex < ez) { ux = Math.sign(lx) || 1; pen = ex; } else { uz = Math.sign(lz) || 1; pen = ez; }
        const wx = ux * co + uz * si, wz = -ux * si + uz * co;
        p.x += wx * pen; p.z += wz * pen;
        const cvn = c.vx * wx + c.vz * wz;
        if (cvn > 4.5 && p.knockT <= 0) {
          p.vx = c.vx * 0.7 + wx * 3; p.vz = c.vz * 0.7 + wz * 3; p.vy = 5; p.grounded = false; p.knockT = 1.2;
          if (c === driving && p !== player) offense('påkörning', 0, p.x, p.z);
          // knocked down: ordinary people run off afterwards, constables, the desk officer and the sellers get up and carry on
          if (p.ai && p.ai.state !== 'cop' && p.ai.state !== 'idle' && p.ai.state !== 'vendor') { p.ai.state = 'flee'; p.ai.t = 4; p.ai.from = null; }
        } else {
          const vn = p.vx * wx + p.vz * wz;
          if (vn < cvn) { p.vx += (cvn - vn) * wx; p.vz += (cvn - vn) * wz; }
        }
        dx = p.x - c.x; dz = p.z - c.z;
      }
    }
    return gy;
  }
  function personMove(p, dt, it) {
    const k = Math.min(1, (p.grounded ? 14 : 3.5) * dt);
    p.vx += (it.mx * it.speed - p.vx) * k;
    p.vz += (it.mz * it.speed - p.vz) * k;
    if (it.speed > 0.1 && (it.mx || it.mz)) p.rot = lerpAngle(p.rot, Math.atan2(it.mx, it.mz), 1 - Math.exp(-12 * dt));
    if (it.jump && p.grounded) { p.vy = 9.6; p.grounded = false; it.jump = false; if (p === player) jumpQueued = false; }
    const ox = p.x, oz = p.z;
    p.x += p.vx * dt; p.z += p.vz * dt;
    const res = resolveWorld(p.x, p.z, 0.35, p.y);
    p.x = res.x; p.z = res.z; p.blocked = res.hit;
    const span = indoorSpan(p.x, p.z, p.y), gy = Math.max(personVsCars(p), span ? span.floor : 0);
    if (!personFits(p.x, p.z)) {
      p.blocked = true;
      if (personFits(p.x, oz)) { p.z = oz; p.vz = 0; }
      else if (personFits(ox, p.z)) { p.x = ox; p.vx = 0; }
      else { p.x = ox; p.z = oz; p.vx = p.vz = 0; }
    }
    p.vy -= 24 * dt * (p.vy < 0 && p.floaty ? p.floaty : 1);
    p.y += p.vy * dt;
    // walking down stairs you stay on the steps instead of floating off them
    if (span && p.grounded && p.vy <= 0 && p.y - gy < 0.45) p.y = gy;
    if (p.y <= gy && p.vy <= 0) { p.y = gy; p.vy = 0; p.grounded = true; } else p.grounded = false;
    // indoors the ceiling stops a jump
    if (span && p.y + 2.05 > span.ceil) { p.y = Math.max(gy, span.ceil - 2.05); if (p.vy > 0) p.vy = 0; }
  }
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
