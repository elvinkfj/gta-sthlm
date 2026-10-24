'use strict';

  /* ================= the workshop ================= */
  // Verkstaden on Götgatan on Söder, between Åsögatan and Skånegatan: drive in through the big door and stop on the
  // yellow bay, and the mechanic's board opens (J opens it again). New paint, other rims, lowered springs and a tuned
  // engine, paid from the Kassa; the car shows each choice as you pick it, and only what you buy stays. Mending the dents
  // and the engine is there too, and new paint takes the dents out and, as in GTA, throws off the police if they are
  // after you. What you buy is kept for that model in the browser and comes with it the next time you pick it with B.
  // Friends see the paint, the rims and how low it sits (the 17th field of the car in MP's state).
  const WORKSHOP = (() => {
    const KEY = 'gubbe-verkstad', PAINT_KR = 300, RIM_KR = 400;
    const PAINTS = [['Svart', 0x15171a], ['Vit', 0xf2f2f0], ['Silver', 0xb9bdc2], ['Grafit', 0x50555b], ['Röd', 0xc8102e], ['Vinröd', 0x6e1424],
      ['Orange', 0xff7a1a], ['Gul', 0xf7c600], ['Limegrön', 0x8fd400], ['Grön', 0x1f7a3a], ['Turkos', 0x16a3a6], ['Ljusblå', 0x5fa8e8],
      ['Blå', 0x1f4fbf], ['Marinblå', 0x14234a], ['Lila', 0x6a2fa0], ['Rosa', 0xff6fb0], ['Brun', 0x6b4426], ['Guld', 0xc9a227]];
    // (null: the rims the model comes with)
    const RIMS = [[null, 'Original'], ['gloss', 'Femekrade'], ['alloy', 'Dubbelekrade'], ['sport', 'Sport'], ['black', 'Svarta'], ['aero', 'Aero'], ['f40', 'Stjärnan'], ['wire', 'Ekrar'], ['steel', 'Stål']];
    // drop: how far the body comes down (the arches leave only a few centimetres before the tyres tuck in); grip: a little
    // better road holding
    const LOWS = [{ name: 'Standard', drop: 0, grip: 1, kr: 0 }, { name: 'Sänkt', drop: 0.04, grip: 1.04, kr: 300 }, { name: 'Mycket sänkt', drop: 0.07, grip: 1.08, kr: 600 }];
    // boost: more pull; top: every gear goes that much further, and so does the top speed
    const ENGINES = [{ name: 'Standard', boost: 1, top: 1, kr: 0 }, { name: 'Steg 1', boost: 1.12, top: 1.05, kr: 600 }, { name: 'Steg 2', boost: 1.25, top: 1.1, kr: 1500 }, { name: 'Steg 3', boost: 1.4, top: 1.15, kr: 3000 }];
    const rimsOk = (M) => !M.moped, lowOk = (M) => !M.moped && !M.bus;

    /* ---------- what you have bought, per model ---------- */
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* a private window: kept for this visit only */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* kept for this visit */ } };
    // a model's parts as kept (checked, so an old or edited entry can't break a car)
    function kept(M) {
      const s = saved[M.id];
      if (!s || typeof s !== 'object') return null;
      return { paint: PAINTS.some(([, c]) => c === s.paint) ? s.paint : null, rim: RIMS.some(([r]) => r && r === s.rim) ? s.rim : null, low: clamp(s.low | 0, 0, LOWS.length - 1), engine: clamp(s.engine | 0, 0, ENGINES.length - 1) };
    }

    /* ---------- fitting the parts to a car ---------- */
    // other rims on every wheel, and the callipers that go with them (made anew: the old rims may have had none)
    function setRims(c, style) {
      if ((c.rimStyle || c.M.rim) === style) return;
      const wg = wheelGeometry(c.M.R, style), cg = caliperGeometry(c.M.R, style);
      for (const s of c.spins) s.children[0].geometry = wg;
      for (const cm of c.calipers) cm.parent.remove(cm);
      c.calipers.length = 0;
      if (cg) for (const w of c.wheels) { const cm = new THREE.Mesh(cg, wheelMat); cm.visible = c === driving; w.pivot.add(cm); c.calipers.push(cm); }
      c.rimStyle = style;
    }
    // the body of another colour (also a fresh one, without the dents)
    function setBody(c, geo, glass) {
      c.bodyMesh.geometry = geo.body; c.glass.geometry = geo.glass;
      if (c.decal && geo.decal) c.decal.geometry = geo.decal;
      if (c.steerGroup && geo.front) c.steerGroup.children[0].geometry = geo.front;
      c.glass.material = glass;
    }
    // the parts that stay with the car: the rims, the springs and the engine (the paint is its colour)
    function fit(c, t) {
      if (!t) return;
      const M = c.M;
      c.tune = t;
      if (rimsOk(M)) setRims(c, t.rim || M.rim);
      if (lowOk(M)) c.body.position.y = -LOWS[t.low].drop;
      c.boost = ENGINES[t.engine].boost; c.speedK = ENGINES[t.engine].top; c.gripK = LOWS[t.low].grip;
    }
    // what friends see of it: the rims and how low it sits, in one number
    const netCode = (c) => (c.tune ? Math.max(0, RIMS.findIndex(([r]) => r === c.tune.rim)) | (c.tune.low << 4) : 0);
    function look(c, code) {
      const r = RIMS[code & 15] || RIMS[0], low = clamp(code >> 4, 0, LOWS.length - 1);
      if (rimsOk(c.M)) setRims(c, r[0] || c.M.rim);
      if (lowOk(c.M)) c.body.position.y = -LOWS[low].drop;
    }

    /* ---------- the building: a sheet-metal hall with a big door to the street ---------- */
    // the lot: where one of the houses on the west side of Götgatan would have stood (WORKSHOP_LOT in src/city/blocks.js);
    // its own frame has x across the door and z in from the pavement. The house's obstacle goes; the hall has its own walls
    const lot = (() => {
      const L = WORKSHOP_LOT, fr = L.fr || lotFrame(edgeFrame(L.e.a, L.e.b), L.side, L.s0, L.s1 - L.s0, L.e.hw + L.e.walk + 0.2), w = L.fr ? L.w : L.s1 - L.s0;
      if (L.obstacle) L.obstacle.off = true;
      return { x: fr[0] + fr[2] * w / 2, z: fr[1] + fr[3] * w / 2, face: Math.atan2(-fr[3], fr[2]), w };
    })();
    const co = Math.cos(lot.face), si = Math.sin(lot.face);
    const toW = (lx, lz) => [lot.x + lx * co + lz * si, lot.z - lx * si + lz * co];
    const toL = (x, z) => { const dx = x - lot.x, dz = z - lot.z; return [dx * co - dz * si, dx * si + dz * co]; };
    // half its width, its front and back, its height, half the door's width and its height, the walls' thickness
    const HW = lot.w / 2, D0 = 0.4, D1 = 15.2, H = 6, DOOR = 3.75, DOOR_H = 4.6, T = 0.3;
    const inside = (x, z) => { const [lx, lz] = toL(x, z); return Math.abs(lx) < HW && lz > D0 && lz < D1; };
    const inBay = (x, z) => { const [lx, lz] = toL(x, z); return Math.abs(lx) < 2.8 && lz > 3 && lz < 14.2; };
    {
      const SHEET = 0xaab6bd, RIB = 0x95a2aa, DARK = 0x4a4f55, RED = 0xc8102e, YELLOW = 0xf2c200, CONCRETE = 0x8e9196, BLUE = 0x1f6bc4;
      const m = new Merger(), lights = new Merger();
      const bx = (x0, y0, z0, x1, y1, z1, col, into = m) => into.box(x1 - x0, y1 - y0, z1 - z0, col, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      // the walls, the front either side of the door and over it, and a dark plinth
      bx(-HW, 0, D0, -HW + T, H, D1, SHEET); bx(HW - T, 0, D0, HW, H, D1, SHEET); bx(-HW, 0, D1 - T, HW, H, D1, SHEET);
      bx(-HW, 0, D0, -DOOR, H, D0 + T, SHEET); bx(DOOR, 0, D0, HW, H, D0 + T, SHEET); bx(-DOOR, DOOR_H, D0, DOOR, H, D0 + T, SHEET);
      bx(-HW, 0, D0 - 0.03, -DOOR, 0.5, D0 + T, DARK); bx(DOOR, 0, D0 - 0.03, HW, 0.5, D0 + T, DARK);
      // corrugated sheet on the front: ribs, over the door only above it
      for (let x = -HW + 0.25; x < HW; x += 0.5) {
        if (Math.abs(x) < DOOR + 0.15) bx(x - 0.03, DOOR_H, D0 - 0.04, x + 0.03, H, D0, RIB);
        else bx(x - 0.03, 0.5, D0 - 0.04, x + 0.03, H, D0, RIB);
      }
      // the roof: a dark top over a light ceiling, with a red edge to the street
      bx(-HW, H, D0 - 0.15, HW, H + 0.25, D1, 0x5c6166);
      bx(-HW + T, H - 0.06, D0 + T, HW - T, H, D1 - T, 0xdfe2e4);
      bx(-HW, H - 0.1, D0 - 0.2, HW, H + 0.32, D0 - 0.14, RED);
      // yellow posts round the door, and the shutter rolled up under the lintel
      bx(-DOOR - 0.14, 0, D0 - 0.06, -DOOR, DOOR_H, D0 + T + 0.02, YELLOW); bx(DOOR, 0, D0 - 0.06, DOOR + 0.14, DOOR_H, D0 + T + 0.02, YELLOW);
      bx(-DOOR - 0.14, DOOR_H, D0 - 0.06, DOOR + 0.14, DOOR_H + 0.14, D0 + T + 0.02, YELLOW);
      bx(-DOOR, DOOR_H - 0.5, D0 + T, DOOR, DOOR_H, D0 + T + 0.5, 0x8b9399);
      // inside: a concrete floor with the yellow bay marked on it
      bx(-HW + T, 0, D0 + T, HW - T, 0.02, D1 - T, CONCRETE);
      bx(-2.4, 0.02, 2.6, -2.25, 0.03, 14, YELLOW); bx(2.25, 0.02, 2.6, 2.4, 0.03, 14, YELLOW); bx(-2.4, 0.02, 13.85, 2.4, 0.03, 14, YELLOW);
      for (let z = 3.2; z < 13.4; z += 1.4) bx(-0.6, 0.02, z, 0.6, 0.03, z + 0.12, 0xd9b000);
      // a car lift on the left: two blue posts each side and their yellow arms
      const l0 = -HW + T + 0.15, l1 = l0 + 3.8;
      for (const z of [6, 11]) {
        bx(l0, 0, z - 0.2, l0 + 0.4, 3.4, z + 0.2, BLUE); bx(l1 - 0.4, 0, z - 0.2, l1, 3.4, z + 0.2, BLUE);
        bx(l0 + 0.4, 0.3, z - 0.07, l0 + 1.65, 0.42, z + 0.07, YELLOW); bx(l1 - 1.65, 0.3, z - 0.07, l1 - 0.4, 0.42, z + 0.07, YELLOW);
      }
      bx(l0, 3.4, 5.8, l0 + 0.4, 3.6, 11.2, BLUE); bx(l1 - 0.4, 3.4, 5.8, l1, 3.6, 11.2, BLUE);
      // on the right: a red tool cabinet, a workbench with a vice, stacks of tyres and oil drums
      const r1 = HW - T - 0.1;
      bx(r1 - 1.1, 0, 2.6, r1, 1.1, 4.4, RED); bx(r1 - 1.12, 1.1, 2.58, r1, 1.16, 4.42, 0xb0b6bc);
      for (let y = 0.25; y < 1.05; y += 0.22) bx(r1 - 1.14, y, 2.8, r1 - 1.1, y + 0.03, 4.2, 0xd9dcdf);
      bx(r1 - 0.8, 0, 6, r1, 0.86, 9, 0x6b4a2b); bx(r1 - 0.85, 0.86, 5.95, r1, 0.92, 9.05, 0x8a8f94); bx(r1 - 0.8, 0.92, 6.4, r1 - 0.6, 1.1, 6.7, 0x2f3236);
      const tyre = (x, z, n) => { for (let i = 0; i < n; i++) { m.add(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), 0x1c1c1e, x, 0.12 + i * 0.25, z); m.add(new THREE.CylinderGeometry(0.2, 0.2, 0.245, 12), 0x9aa0a6, x, 0.12 + i * 0.25, z); } };
      const props = [[r1 - 0.4, 10.6, 0.36], [r1 - 1.2, 11.4, 0.36], [r1 - 0.4, 12.3, 0.36], [r1 - 0.35, 14.2, 0.3], [r1 - 1, 14.35, 0.3], [r1 - 0.35, 13.55, 0.3]];
      tyre(props[0][0], props[0][1], 4); tyre(props[1][0], props[1][1], 3); tyre(props[2][0], props[2][1], 5);
      for (const [[x, z], col] of [[props[3], BLUE], [props[4], BLUE], [props[5], RED]]) m.add(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), col, x, 0.44, z);
      // the back wall: a pegboard of tools
      bx(-3, 1.1, D1 - T - 0.04, 3, 2.7, D1 - T, 0xd9c9a3);
      for (let i = 0; i < 11; i++) bx(-2.7 + i * 0.52, 1.5 + (i % 3) * 0.3, D1 - T - 0.08, -2.62 + i * 0.52, 2.2 + (i % 3) * 0.2, D1 - T - 0.04, i % 4 ? 0x3a3e42 : RED);
      // strip lights in the ceiling
      for (const x of [-3.2, 3.2]) for (const z of [3.4, 7.9, 12.4]) bx(x - 0.1, H - 0.14, z - 1.3, x + 0.1, H - 0.06, z + 1.3, 0xffffff, lights);
      const g = new THREE.Group();
      const hall = new THREE.Mesh(m.build(), std({ vertexColors: true, roughness: 0.6, metalness: 0.15 }));
      hall.receiveShadow = true;
      const glow = new THREE.Mesh(lights.build(), std({ vertexColors: true, emissive: 0xfff3d6, emissiveIntensity: 1 }));
      g.add(hall, glow);
      // the sign over the door, and a smaller one beside it with what they do
      const big = canvasTex(1024, 160, (c, w, h) => {
        c.fillStyle = '#c8102e'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#ffffff'; c.lineWidth = 8; roundRect(c, 10, 10, w - 20, h - 20, 16); c.stroke();
        c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 104px Overpass, "Arial Black", Arial, sans-serif';
        c.fillText('VERKSTAD', w / 2, h / 2 + 6);
        // a spanner at each end
        for (const x of [90, w - 90]) { c.save(); c.translate(x, h / 2); c.rotate(-0.7); c.fillRect(-9, -8, 18, 70); c.beginPath(); c.arc(0, -22, 26, 0, TAU); c.fill(); c.fillStyle = '#c8102e'; c.fillRect(-9, -52, 18, 32); c.restore(); c.fillStyle = '#ffffff'; }
      });
      const small = canvasTex(512, 88, (c, w, h) => {
        c.fillStyle = '#f4f4f1'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#1b1c1e'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 34px Overpass, Arial, sans-serif';
        c.fillText('LACK · FÄLGAR · MOTOR', w / 2, h / 2 + 3);
      });
      const sign = (tex, w, h, x, y) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.6, emissive: 0x220406, emissiveMap: tex })); s.position.set(x, y, D0 - 0.05); s.rotation.y = Math.PI; g.add(s); };
      sign(big, 6.6, 1.03, 0, 5.25);
      sign(small, Math.min(3.4, HW - DOOR - 0.9), 0.58, -(HW + DOOR) / 2, 3.0);
      g.position.set(lot.x, 0, lot.z); g.rotation.y = lot.face;
      scene.add(g);
      // walls and things to bump into (the bay and the door stay free)
      const box = (x0, z0, x1, z1, h) => { const [cx, cz] = toW((x0 + x1) / 2, (z0 + z1) / 2); addOBox(cx, cz, co, -si, (x1 - x0) / 2, (z1 - z0) / 2, h); };
      box(-HW, D0, -HW + T, D1, H); box(HW - T, D0, HW, D1, H); box(-HW, D1 - T, HW, D1, H);
      box(-HW, D0, -DOOR, D0 + T, H); box(DOOR, D0, HW, D0 + T, H);
      for (const z of [6, 11]) { box(l0, z - 0.2, l0 + 0.4, z + 0.2, 3.6); box(l1 - 0.4, z - 0.2, l1, z + 0.2, 3.6); }
      box(r1 - 1.1, 2.6, r1, 4.4, 1.2); box(r1 - 0.8, 6, r1, 9, 1);
      for (const [x, z, r] of props) addCircle(...toW(x, z), r, 1.3);
      // on the maps it is a building of its own
      mapPolys.push([[toW(-HW, 0), toW(HW, 0), toW(HW, D1), toW(-HW, D1)], 0xd98a4a]);
    }

    /* ---------- the board ---------- */
    const E = {
      board: $('shop'), close: $('shopClose'), car: $('shopCar'), cash: $('shopCash'), paint: $('shopPaint'), rims: $('shopRims'), rimSec: $('shopRimSec'),
      low: $('shopLow'), lowSec: $('shopLowSec'), engine: $('shopEngine'), stats: $('shopStats'), fix: $('shopFix'), sum: $('shopSum'), buy: $('shopBuy')
    };
    // car: the one on the bay; have: what it has; want: what you have picked; orig: its body as it came in
    let open = false, car = null, have = null, want = null, orig = null, openT = 0, wasIn = false, onBay = false, greeted = false;
    const fixPrice = (c) => (c.health >= 100 && !c.dented && !c.glassBroken ? 0 : Math.round((80 + (100 - c.health) * 4 + (c.dented || c.glassBroken ? 120 : 0)) / 10) * 10);
    function total() {
      if (!car) return 0;
      return (want.paint !== have.paint ? PAINT_KR : 0) + (want.rim !== have.rim ? RIM_KR : 0) + (want.low !== have.low ? LOWS[want.low].kr : 0)
        + (want.engine !== have.engine ? ENGINES[want.engine].kr : 0) + (want.fix ? fixPrice(car) : 0);
    }
    const changed = () => !!car && (want.paint !== have.paint || want.rim !== have.rim || want.low !== have.low || want.engine !== have.engine || want.fix);
    // the car as you have picked it (or, with have, as it is)
    function show(w) {
      const c = car;
      if (w.paint !== c.color || w.fix) setBody(c, sharedCarGeometry(c.M, w.paint), glassMat);
      else setBody(c, orig.geo, orig.glass);
      if (rimsOk(c.M)) setRims(c, w.rim || c.M.rim);
      if (lowOk(c.M)) c.body.position.y = -LOWS[w.low].drop;
    }
    // how fast it goes with an engine: the top speed, and the sprint as the car picker measures it
    function sprintTime(M, e) {
      const P = ENGINES[e];
      let v = 0, t = 0, g = 0, sh = 0;
      while (v < M.sprint.kmh / 3.6 && t < 60) {
        if (sh > 0) sh -= 0.01;
        else if (g < M.gears - 1 && v / (M.gearTop[g] * P.top) > UP_HARD) { g++; sh = SHIFT_TIME; }
        else v += driveAccel(M, v / P.top, g, P.boost) * 0.01;
        t += 0.01;
      }
      return t;
    }
    const statsOf = (M, e) => 'Toppfart ' + Math.round(M.max * ENGINES[e].top * 3.6) + ' km/h · 0–' + M.sprint.kmh + ' på ' + sprintTime(M, e).toFixed(1).replace('.', ',') + ' s';
    // a rim as a little drawing for its button
    function drawRim(cv, style) {
      const g = cv.getContext('2d'), w = cv.width, r = w / 2 - 2, cx = w / 2, cy = w / 2;
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#16181b'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      const face = style === 'black' ? '#2b2e33' : style === 'aero' ? '#8d9399' : style === 'steel' ? '#6a6e73' : style === 'wire' || style === 'chrome' ? '#dfe3e8' : '#b9bec4';
      const R = r * (style === 'sport' || style === 'black' || style === 'f40' ? 0.78 : 0.7);
      g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      g.strokeStyle = '#16181b'; g.lineCap = 'round';
      const spokes = (n, wd, a0 = 0) => { g.lineWidth = wd; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); g.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); g.stroke(); } };
      // the gaps between the spokes are dark: draw the gaps as dark wedges, or the spokes as lines on a dark face
      if (style === 'aero') { g.fillStyle = '#5d6369'; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.32, cy + Math.sin(a) * R * 0.32, R * 0.08, 0, TAU); g.fill(); } }
      else if (style === 'steel') { g.fillStyle = '#3a3e42'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.1, 0, TAU); g.fill(); } }
      else {
        g.fillStyle = '#16181b'; g.beginPath(); g.arc(cx, cy, R * 0.92, 0, TAU); g.fill();
        g.strokeStyle = face;
        if (style === 'wire') spokes(20, 1.2);
        else if (style === 'sport') spokes(10, 2.4);
        else if (style === 'alloy') { spokes(5, 2.6, -0.12); spokes(5, 2.6, 0.12); }
        else if (style === 'f40') spokes(5, 3.4, -Math.PI / 2);
        else spokes(5, 6.5, -Math.PI / 2);
      }
      g.fillStyle = face; g.beginPath(); g.arc(cx, cy, R * 0.28, 0, TAU); g.fill();
      g.fillStyle = '#3a3e42'; g.beginPath(); g.arc(cx, cy, R * 0.1, 0, TAU); g.fill();
    }
    const kr = (n) => (n ? fmtKr(n) : 'Gratis');
    function option(list, name, sub, on, owned, pick, extra) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'shop-opt' + (on ? ' on' : '') + (owned ? ' owned' : '');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (extra) b.append(extra);
      const nm = document.createElement('b'); nm.textContent = name;
      const sm = document.createElement('small'); sm.textContent = owned ? 'Din nu' : sub;
      b.append(nm, sm);
      b.addEventListener('click', () => { pick(); show(want); render(); });
      list.append(b);
    }
    // fill the board from have and want
    function render() {
      const c = car, M = c.M;
      E.car.textContent = M.name;
      E.cash.textContent = 'Kassa ' + fmtKr(JOBS.earned);
      E.paint.textContent = '';
      for (const [name, col] of PAINTS) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'shop-swatch' + (want.paint === col ? ' on' : '') + (have.paint === col ? ' owned' : '');
        b.style.background = hex(col); b.title = name; b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', want.paint === col ? 'true' : 'false');
        b.addEventListener('click', () => { want.paint = col; show(want); render(); });
        E.paint.append(b);
      }
      // (the colour it came in, if it is not one of ours)
      if (!PAINTS.some(([, col]) => col === have.paint)) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'shop-swatch owned' + (want.paint === have.paint ? ' on' : '');
        b.style.background = hex(have.paint); b.title = 'Som den är'; b.setAttribute('aria-label', 'Färgen den har nu');
        b.addEventListener('click', () => { want.paint = have.paint; show(want); render(); });
        E.paint.prepend(b);
      }
      E.rimSec.hidden = !rimsOk(M);
      E.rims.textContent = '';
      if (rimsOk(M)) for (const [style, name] of RIMS) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 40;
        drawRim(cv, style || M.rim);
        option(E.rims, name, style ? kr(RIM_KR) : kr(have.rim ? RIM_KR : 0), want.rim === style, have.rim === style, () => { want.rim = style; }, cv);
      }
      E.lowSec.hidden = !lowOk(M);
      E.low.textContent = '';
      if (lowOk(M)) LOWS.forEach((L, i) => option(E.low, L.name, kr(L.kr), want.low === i, have.low === i, () => { want.low = i; }));
      E.engine.textContent = '';
      ENGINES.forEach((P, i) => option(E.engine, P.name, kr(P.kr), want.engine === i, have.engine === i, () => { want.engine = i; }));
      E.stats.textContent = statsOf(M, want.engine);
      E.fix.textContent = '';
      const fp = fixPrice(c);
      if (fp) option(E.fix, want.fix ? 'Lagas' : 'Laga bilen', 'Motorn och bucklorna · ' + fmtKr(fp), want.fix, false, () => { want.fix = !want.fix; });
      else { const p = document.createElement('p'); p.className = 'shop-note'; p.textContent = 'Bilen är hel. Ny lack tar också bort bucklor.'; E.fix.append(p); }
      const sum = total(), ok = changed(), afford = JOBS.earned >= sum;
      E.sum.textContent = !ok ? 'Välj något att köpa' : afford ? 'Att betala: ' + fmtKr(sum) : 'Det kostar ' + fmtKr(sum) + ', du har ' + fmtKr(JOBS.earned);
      E.sum.classList.toggle('short', ok && !afford);
      E.buy.disabled = !ok || !afford;
      E.buy.textContent = !ok || sum ? 'Köp' : 'Ändra';
    }
    function openBoard() {
      const c = driving, M = c.M;
      if (M.mil) { toast('Militärens fordon tar vi inte hand om här.'); return; }
      if (PARTY.busy()) { toast('Ingen verkstad mitt i en lek!'); return; }
      car = c;
      have = { paint: c.color, rim: c.tune ? c.tune.rim : null, low: c.tune ? c.tune.low : 0, engine: c.tune ? c.tune.engine : 0 };
      want = { ...have, fix: false };
      orig = { geo: c.geo, glass: c.glass.material };
      open = true; openT = performance.now() / 1000;
      E.board.hidden = false;
      document.body.classList.add('shop');
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0;
      render();
      if (!isTouch) E.close.focus();
      beep([523, 659], 0.03, 0.2);
    }
    function closeBoard() {
      if (!open) return;
      // what you didn't buy goes back as it was
      show({ ...have, fix: false });
      open = false; car = null;
      E.board.hidden = true;
      document.body.classList.remove('shop');
      if (E.board.contains(document.activeElement)) document.activeElement.blur();
      requestLock();
    }
    function buy() {
      if (!changed()) return;
      const c = car, M = c.M, sum = total();
      if (sum && !JOBS.spend(sum)) { render(); return; }
      const repaint = want.paint !== have.paint, fixed = want.fix;
      if (repaint || fixed) {
        // the new body for good: the dented one goes
        if (!c.geoShared) { c.geo.body.dispose(); c.geo.glass.dispose(); if (c.geo.decal) c.geo.decal.dispose(); }
        c.geo = sharedCarGeometry(M, want.paint); c.geoShared = true; c.dented = false; c.glassBroken = false;
        setBody(c, c.geo, glassMat);
        c.color = want.paint;
      }
      if (fixed) {
        c.health = 100; c.power = 1; c.dead = false; c.warned = false; c.align = 0;
        for (const w of c.wheels) w.toe = w.camber = 0;
      }
      const t = { paint: repaint ? want.paint : c.tune ? c.tune.paint : null, rim: want.rim, low: want.low, engine: want.engine };
      fit(c, t);
      saved[M.id] = t; save();
      have = { paint: c.color, rim: t.rim, low: t.low, engine: t.engine };
      want = { ...have, fix: false };
      orig = { geo: c.geo, glass: c.glass.material };
      beep([659, 880, 1175], 0.03, 0.3);
      // new paint while the police are after you: they don't know the car any more
      if (repaint && wanted && !policeStop) { endChase(false); toast('Ny färg! Polisen känner inte igen bilen längre.'); }
      else toast((sum ? 'Klart! −' + fmtKr(sum) + '. ' : 'Klart! ') + (fixed ? 'Bilen är som ny.' : 'Det sparas för ' + M.def + '.'));
      render();
    }
    E.close.addEventListener('click', closeBoard);
    E.buy.addEventListener('click', buy);

    /* ---------- every frame: driving in ---------- */
    function update() {
      const c = driving, inHall = !!c && !c.M.boat && inside(c.x, c.z);
      onBay = inHall && inBay(c.x, c.z);
      if (inHall && !wasIn) toast('Verkstaden! Kör in på den gula rutan och stanna.');
      wasIn = inHall;
      if (!onBay) { greeted = false; return; }
      // stopped on the bay: the board opens by itself, once
      if (!greeted && Math.hypot(c.vx, c.vz) < 0.4) { greeted = true; openBoard(); }
    }
    // the camera while the board is open: in the hall, going slowly round the front of the car, with the car off to the
    // side the board doesn't cover
    const _p = new THREE.Vector3(), _d = new THREE.Vector3();
    function view() {
      if (!open || !car) return null;
      // (on a narrow screen the board is at the bottom and the picture is tall: from in front of the car and higher up,
      // looking under it so it sits above the board)
      const c = car, t = performance.now() / 1000 - openT, phone = window.innerWidth < 760;
      const R = (phone ? 5 : 4.6) + c.M.L * (phone ? 0.5 : 0.45), a = c.h + (phone ? 0.3 * Math.sin(t * 0.3) : 0.75 * Math.sin(t * 0.3) + 0.35);
      let [lx, lz] = toL(c.x + Math.sin(a) * R, c.z + Math.cos(a) * R);
      lx = clamp(lx, -HW + 0.8, HW - 0.8); lz = clamp(lz, D0 + 0.8, D1 - 0.8);
      const [x, z] = toW(lx, lz);
      _p.set(x, phone ? 4.2 : 1.5 + c.M.L * 0.08, z);
      // (looking to the right of the car by as much as puts it in the middle of the part the board leaves free)
      const dx = c.x - x, dz = c.z - z, l = Math.hypot(dx, dz) || 1, side = phone ? 0 : (l * 0.6 * (E.board.firstElementChild.offsetWidth + 16)) / window.innerHeight;
      _d.set(dx - (dz / l) * side, 0.75 - _p.y - (phone ? 2.6 : 0), dz + (dx / l) * side);
      return { pos: _p, dir: _d };
    }

    /* ---------- on the maps: an orange square with a spanner ---------- */
    function icon(g, X, Y, s) {
      g.fillStyle = '#ff8a1f'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.6 * s;
      g.fillRect(X - 7 * s, Y - 7 * s, 14 * s, 14 * s); g.strokeRect(X - 7 * s, Y - 7 * s, 14 * s, 14 * s);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.2 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X - 3.5 * s, Y + 3.5 * s); g.lineTo(X + 1.5 * s, Y - 1.5 * s); g.stroke();
      g.beginPath(); g.arc(X + 2.6 * s, Y - 2.6 * s, 2.2 * s, 0, TAU); g.stroke();
    }
    function drawMini(g, px, pz, u) {
      const [x, z] = toW(0, D0);
      if (Math.abs(x - px) < 110 && Math.abs(z - pz) < 110) icon(g, x, z, u);
    }
    function drawBig(g, toX, toY, k) {
      const [x, z] = toW(0, 8), X = toX(x), Y = toY(z), s = clamp(k / 0.35, 1, 1.4);
      icon(g, X, Y, s);
      if (k > 0.3) { g.font = '800 11px Overpass, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText('Verkstaden', X + 12, Y); g.fillStyle = '#a3480a'; g.fillText('Verkstaden', X + 12, Y); }
    }

    return {
      update, view, fit, kept, look, netCode, drawMini, drawBig,
      paints: PAINTS.map(([, c]) => c),
      // how high the camera may go: under the roof in the hall, and under the lintel looking in through the door
      ceiling(cx, cz, tx, tz) { return inside(cx, cz) ? H - 0.4 : inside(tx, tz) ? DOOR_H - 0.5 : Infinity; },
      get open() { return open; },
      // J on the bay opens the board again
      key() {
        if (!onBay || open) return false;
        if (Math.hypot(driving.vx, driving.vz) > 1) { toast('Stanna bilen först.'); return true; }
        openBoard();
        return true;
      },
      // keys while the board is open: Esc and J close it, the rest wait
      keydown(e) {
        if (!open) return false;
        if (e.code === 'Escape' || e.code === 'KeyJ') { e.preventDefault(); closeBoard(); }
        return true;
      },
      // for the tests
      debug: { lot, toW, toL, inBay, LOWS, ENGINES, RIMS, get want() { return want; }, get have() { return have; }, buy, closeBoard, render, sprintTime }
    };
  })();
