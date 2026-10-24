'use strict';
  /* ---------- Drakens gränd: building the yellow house ---------- */
  {
    const { W, D, FLOORS, F, H, FL, fr, col, ST, CAB, FS } = DRAKEN, Y3 = FL * F, Y4 = 4 * F, Y5 = 5 * F, ROOF = 6 * F - 0.3;
    const root = new THREE.Group();
    root.position.set(fr[0], 0, fr[1]);
    root.rotation.y = Math.atan2(-fr[3], fr[2]);
    scene.add(root);
    DRAKEN.root = root;
    const ext = new Builder({ split: true, ao: AO }), inn = new Builder(), woodB = new Builder(), tileB = new Builder(), glassB = new Builder(), glowB = new Builder();
    const STAIR = 0xe4d9bf, STAIR_LOW = 0x7d8f6e, STONE = 0xbab3a6, STEP = 0xa8a195, FLAT = 0xf1ece2, BATH = 0xe9eeec, FRAME = 0xf4f1ea, OAK = 0xa8784c;
    const REVEAL = shade(col, 0.93), CEIL = 0xf6f3ec, BEAM = 0x5b4330, IRON = 0x23272b, BED_WALL = 0xa9bccb, KID = 0xe8d9a8, KID2 = 0xd7e2cf, SAUNA = 0xc89b62;
    const FACES = (x0, y0, z0, x1, y1, z1) => [
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]],
      [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]],
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]]
    ];
    // a block with all six faces; paint is a colour, or (normal, corners) => colour, [colour, uvs] or null to leave the face out
    function block(B, x0, y0, z0, x1, y1, z1, paint) {
      for (const [a, b, cc, d, n] of FACES(x0, y0, z0, x1, y1, z1)) {
        const p = typeof paint === 'function' ? paint(n, [a, b, cc, d]) : paint;
        if (p === null || p === undefined) continue;
        if (Array.isArray(p)) B.quad(a, b, cc, d, p[0], p[1], n); else B.quad(a, b, cc, d, p, null, n);
      }
    }
    const cube = (x0, y0, z0, x1, y1, z1, c) => block(inn, x0, y0, z0, x1, y1, z1, c);
    // a straight wall along x (or z) from a0 to a1, t0-t1 thick, y0-y1 high, with holes [a0, a1, y0, y1] cut through it
    function wallRun(B, along, a0, a1, t0, t1, y0, y1, holes, paint) {
      const xs = [...new Set([a0, a1, ...holes.flatMap((h) => [clamp(h[0], a0, a1), clamp(h[1], a0, a1)])])].sort((p, q) => p - q);
      for (let i = 0; i < xs.length - 1; i++) {
        const p = xs[i], q = xs[i + 1], m = (p + q) / 2;
        if (q - p < 1e-4) continue;
        const piece = (ya, yb) => {
          if (yb - ya < 1e-4) return;
          if (along === 'x') block(B, p, ya, t0, q, yb, t1, paint); else block(B, t0, ya, p, t1, yb, q, paint);
        };
        let y = y0;
        for (const [g0, g1] of holes.filter((h) => h[0] < m && h[1] > m).map((h) => [h[2], h[3]]).sort((u, v) => u[0] - v[0])) { piece(y, Math.min(g0, y1)); y = Math.max(y, g1); }
        piece(y, y1);
      }
    }
    const same = (n, m) => n[0] === m[0] && n[1] === m[1] && n[2] === m[2];
    // outer walls: the facade texture outside (lined up with the window cells, so a real window can replace a painted one),
    // plaster inside in the colour of the room behind
    const facadePaint = (out, inner) => (n, q) => {
      if (same(n, out)) return [col, q.map((v) => [(out[0] ? v[2] : v[0]) / CELL_W, v[1] / FLOOR_H])];
      if (same(n, [-out[0], 0, -out[2]])) return inner;
      return REVEAL;
    };
    const cell = (i, y) => [i * CELL_W + 0.8, i * CELL_W + 2.2, y + 0.7, y + 2.8];
    // real windows: the stairwell's on its floors, every window of the flat
    const frontWin = (k) => (k === 0 ? [] : k < FL ? [0, 1] : k < FLOORS ? [0, 1, 2, 3, 4] : []);
    const backWin = (k) => (k >= FL && k < FLOORS ? [0, 1, 2, 3, 4] : []);
    // the colour of the inside of the outer wall in front of each room
    const frontIn = (k, x) => (x < 5.4 ? (k <= FL ? STAIR : FLAT) : k === 5 && x > 9 ? BED_WALL : FLAT);
    const backIn = (k, x) => (k < FL ? STAIR : x < 5.4 ? [BATH, FLAT, KID][k - FL] : x < 9 ? [FLAT, BATH, KID2][k - FL] : k === 5 ? BATH : FLAT);
    for (let k = 0; k <= FLOORS; k++) {
      const y0 = k * F, y1 = k < FLOORS ? y0 + F : H;
      for (const [a, b] of [[0, 5.4], [5.4, 9], [9, W]]) {
        const inF = k < FLOORS ? [a + 0.1, b - 0.1].map((x) => frontIn(k, x)) : [FLAT], inB = k < FLOORS ? [a + 0.1, b - 0.1].map((x) => backIn(k, x)) : [FLAT];
        const fh = (k === 0 && a === 0 ? [[0.75, 2.25, 0, 2.85]] : []).concat(frontWin(k).map((i) => cell(i, y0)).filter((h) => h[0] >= a && h[1] <= b));
        const bh = backWin(k).map((i) => cell(i, y0)).filter((h) => h[0] >= a && h[1] <= b);
        wallRun(ext, 'x', a, b, 0, 0.4, y0, y1, fh, facadePaint([0, 0, -1], inF[0]));
        wallRun(ext, 'x', a, b, D - 0.4, D, y0, y1, bh, facadePaint([0, 0, 1], inB[0]));
      }
      wallRun(ext, 'z', 0.4, 6.2, 0, 0.4, y0, y1, [], facadePaint([-1, 0, 0], k <= FL ? STAIR : FLAT));
      wallRun(ext, 'z', 6.2, D - 0.4, 0, 0.4, y0, y1, [], facadePaint([-1, 0, 0], k < FL ? STAIR : backIn(k, 1)));
      wallRun(ext, 'z', 0.4, D - 0.4, W - 0.4, W, y0, y1, [], facadePaint([1, 0, 0], k === 5 ? BED_WALL : FLAT));
    }
    // plinth, cornice and a steep tiled roof
    const plinth = shade(col, 0.7);
    for (const [x0, z0, x1, z1] of [[-0.06, -0.06, 0.75, 0], [2.25, -0.06, W + 0.06, 0], [-0.06, D, W + 0.06, D + 0.06], [-0.06, 0, 0, D], [W, 0, W + 0.06, D]]) block(ext, x0, 0, z0, x1, 0.65, z1, plinth);
    ext.box(-0.22, H - 0.1, -0.22, W + 0.22, H + 0.22, D + 0.22, shade(col, 1.1));
    ext.hip(0, 0, W, D, H + 0.22, D * 0.5, D * 0.42, D / 2 - 0.02, 0x9e4a33);
    // a cornice band between the storeys of the flat and the ones below
    ext.box(-0.08, Y3 - 0.22, -0.08, W + 0.08, Y3 + 0.04, 0, shade(col, 1.08));

    // windows: frame and glazing bars like the painted ones, a pane of glass, a sill inside and a metal one outside
    function windowAt(x0, x1, y0, y1, t0, t1, inSign) {
      const tm = (t0 + t1) / 2, a = tm - 0.04, b = tm + 0.04, hy = y0 + (y1 - y0) * 0.66, mx = (x0 + x1) / 2;
      cube(x0, y0, a, x0 + 0.07, y1, b, FRAME); cube(x1 - 0.07, y0, a, x1, y1, b, FRAME);
      cube(x0, y0, a, x1, y0 + 0.08, b, FRAME); cube(x0, y1 - 0.07, a, x1, y1, b, FRAME);
      cube(mx - 0.03, y0, a, mx + 0.03, y1, b, FRAME); cube(x0, hy - 0.03, a, x1, hy + 0.03, b, FRAME);
      glassB.quad([x0, y0, tm], [x1, y0, tm], [x1, y1, tm], [x0, y1, tm], 0xffffff, null, [0, 0, 1]);
      const tin = inSign > 0 ? t1 : t0, tout = inSign > 0 ? t0 : t1;
      cube(x0 - 0.06, y0 - 0.04, Math.min(tm, tin + inSign * 0.06), x1 + 0.06, y0, Math.max(tm, tin + inSign * 0.06), FRAME);
      cube(x0 - 0.04, y0 - 0.06, Math.min(tm, tout - inSign * 0.08), x1 + 0.04, y0 - 0.02, Math.max(tm, tout - inSign * 0.08), 0x4a4f54);
    }
    for (let k = 0; k < FLOORS; k++) {
      for (const i of frontWin(k)) windowAt(...cell(i, k * F), 0, 0.4, 1);
      for (const i of backWin(k)) windowAt(...cell(i, k * F), D - 0.4, D, -1);
    }

    // the street door: a stone surround, a step, a lantern beside it; the two leaves swing in as you come up to them
    const SURROUND = 0xb8ad98;
    cube(0.5, 0, -0.1, 0.75, 3.1, 0, SURROUND); cube(2.25, 0, -0.1, 2.5, 3.1, 0, SURROUND); cube(0.5, 2.85, -0.12, 2.5, 3.1, 0, SURROUND);
    cube(0.6, 0, -0.4, 2.4, 0.06, 0.2, 0x9c968c);
    cube(2.78, 2.55, -0.32, 2.82, 2.6, 0, 0x22262a); cube(2.68, 2.3, -0.44, 2.92, 2.6, -0.2, 0x22262a);
    block(glowB, 2.71, 2.33, -0.41, 2.89, 2.55, -0.23, 0xffe2a6);
    function leaf(w, h, thick, c0, c1, handleAt) {
      const B = new Builder(), x0 = Math.min(0, w), x1 = Math.max(0, w);
      block(B, x0, 0, -thick / 2, x1, h, thick / 2, c0);
      // raised panels on both faces
      for (const [py0, py1] of [[0.25, h * 0.45], [h * 0.52, h - 0.25]]) for (const sd of [-1, 1]) {
        const zz = sd * (thick / 2), z0 = Math.min(zz, zz + sd * 0.02), z1 = Math.max(zz, zz + sd * 0.02);
        block(B, x0 + 0.12, py0, z0, x1 - 0.12, py1, z1, c1);
      }
      for (const sd of [-1, 1]) block(B, handleAt - 0.03, h * 0.45, sd * thick / 2 - 0.03, handleAt + 0.03, h * 0.45 + 0.16, sd * thick / 2 + 0.03, 0xc9a24a);
      return B.build();
    }
    const doorMat = std({ vertexColors: true, roughness: 0.6 });
    function addDoor(geo, x, y, z, rot0, swing, cx, cz) {
      const pivot = new THREE.Group(), m = new THREE.Mesh(geo, doorMat);
      m.castShadow = true; m.receiveShadow = true;
      pivot.add(m); pivot.position.set(x, y, z); pivot.rotation.y = rot0;
      root.add(pivot);
      DRAKEN.doors.push({ pivot, rot0, swing, cx, cz, y, open: 0 });
    }
    addDoor(leaf(0.75, 2.84, 0.07, 0x2f4a3a, 0x3a5a48, 0.64), 0.75, 0, 0.3, 0, -1.75, 1.5, 0.2);
    addDoor(leaf(-0.75, 2.84, 0.07, 0x2f4a3a, 0x3a5a48, -0.64), 2.25, 0, 0.3, 0, 1.75, 1.5, 0.2);

    /* the stairwell */
    const stairPaint = (top) => (n) => (n[1] > 0 ? top : n[1] < 0 ? shade(STAIR, 1.04) : STEP);
    inn.quad([ST.x0, 0.03, ST.z1], [ST.x1, 0.03, ST.z1], [ST.x1, 0.03, ST.z0], [ST.x0, 0.03, ST.z0], STONE, null, [0, 1, 0]);
    for (let k = 1; k <= FL; k++) block(inn, ST.x0, k * F - 0.3, ST.z0, ST.x1, k * F, ST.z1, stairPaint(STONE));
    for (let k = 0; k < FL; k++) block(inn, ST.x0, k ? k * F + F / 2 - 0.3 : 0, ST.z2, ST.x1, k * F + F / 2, ST.z3, stairPaint(STONE));
    const N = 10, tread = (ST.z2 - ST.z1) / N, rise = F / 2 / N;
    for (let k = 0; k < FL; k++) for (let i = 0; i < N; i++) {
      // steps sit on the walking ramp, half a step above and below it
      const ya = k * F + (i + 0.5) * rise, yb = k * F + F / 2 + (i + 0.5) * rise;
      block(inn, ST.x0, k ? ya - 0.4 : 0, ST.z1 + i * tread, ST.a1, ya, ST.z1 + (i + 1) * tread, stairPaint(STEP));
      block(inn, ST.b0, yb - 0.4, ST.z2 - (i + 1) * tread, ST.x1, yb, ST.z2 - i * tread, stairPaint(STEP));
    }
    // its walls, painted dark up to the dado and light above, and on its far sides the rooms of the flat
    for (let k = 0; k < FLOORS; k++) {
      const y0 = k * F, inFlat = k > FL, doorH = [[0.6, 1.6, y0, y0 + 2.1]];
      wallRun(inn, 'z', 0.4, 6.2, ST.x1, ST.x1 + 0.2, y0, y0 + F, k >= FL ? doorH : [], (n) => (n[0] < 0 ? (inFlat ? FLAT : STAIR) : k >= FL ? FLAT : null));
      wallRun(inn, 'x', 0.4, ST.x1 + 0.2, ST.z3, ST.z3 + 0.2, y0, y0 + F, inFlat ? [[0.8, 1.7, y0, y0 + 2.1]] : [], (n) => (n[2] < 0 ? (inFlat ? FLAT : STAIR) : k >= FL ? backIn(k, 1) : null));
      if (inFlat) continue;
      const dz = (z0, z1, x0, x1, ya, yb) => cube(x0, ya, z0, x1, yb, z1, STAIR_LOW);
      dz(ST.z0, ST.z3, ST.x0, ST.x0 + 0.015, y0, y0 + 1.05);
      dz(ST.z0, 0.66, ST.x1 - 0.015, ST.x1, y0, y0 + 1.05); dz(1.64, ST.z3, ST.x1 - 0.015, ST.x1, y0, y0 + 1.05);
      if (k < FL) dz(ST.z3 - 0.015, ST.z3, ST.x0, ST.x1, y0 + F / 2, y0 + F / 2 + 1.05);
      if (k > 0) { dz(ST.z0, ST.z0 + 0.015, ST.x0, 0.8, y0, y0 + 0.7); dz(ST.z0, ST.z0 + 0.015, 2.2, 3.8, y0, y0 + 0.7); dz(ST.z0, ST.z0 + 0.015, 5.2, ST.x1, y0, y0 + 0.7); }
      // a globe lamp over each landing, and one over each half landing
      block(glowB, 0.8, y0 + 2.62, 0.95, 1.1, y0 + 2.86, 1.25, 0xfff1d0);
      if (k < FL) block(glowB, 2.7, y0 + F / 2 + 2.5, 5.0, 3.0, y0 + F / 2 + 2.74, 5.3, 0xfff1d0);
      if (k > 0 && k < FL) {
        // a neighbour's door, shut, with a name plate, a letterbox and a doormat
        const dc = [0x6b3f2a, 0x2f4a5a][k - 1], X = ST.x1;
        cube(X - 0.01, y0, 0.58, X, y0 + 2.28, 1.62, 0xd8cfb8);
        cube(X - 0.06, y0, 0.65, X - 0.01, y0 + 2.2, 1.55, dc);
        cube(X - 0.08, y0 + 0.3, 0.75, X - 0.06, y0 + 0.95, 1.45, shade(dc, 1.2)); cube(X - 0.08, y0 + 1.15, 0.75, X - 0.06, y0 + 1.95, 1.45, shade(dc, 1.2));
        cube(X - 0.09, y0 + 1.0, 0.7, X - 0.06, y0 + 1.06, 0.85, 0xc9a24a);
        cube(X - 0.085, y0 + 1.45, 0.95, X - 0.06, y0 + 1.53, 1.25, 0xd9c9a0);
        cube(X - 0.085, y0 + 0.9, 1.0, X - 0.06, y0 + 0.97, 1.3, 0x23262a);
        cube(X - 0.8, y0, 0.75, X - 0.1, y0 + 0.02, 1.45, [0x7a3b2e, 0x3b4a5a][k - 1]);
      }
    }
    // handrails up the outer wall of the first flights and the inner wall of the second
    const rail = (x0, x1, za, ya, zb, yb) => inn.hexa([[x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], [x0, ya + 0.06, za], [x1, ya + 0.06, za], [x1, yb + 0.06, zb], [x0, yb + 0.06, zb]], OAK);
    for (let k = 0; k < FL; k++) {
      rail(ST.x0 + 0.02, ST.x0 + 0.08, ST.z1, k * F + 0.9, ST.z2, k * F + F / 2 + 0.9);
      rail(ST.x1 - 0.08, ST.x1 - 0.02, ST.z2, k * F + F / 2 + 0.9, ST.z1, (k + 1) * F + 0.9);
    }
    // under the first flights: a board wall with a low door to the cellar; the list of who lives here, and the post boxes
    cube(ST.b0, 0, ST.z1 - 0.06, ST.x1, F - 0.45, ST.z1, 0x6b4a30);
    cube(4.3, 0, ST.z1 - 0.08, 4.95, 1.75, ST.z1 - 0.06, 0x5a3c26);
    cube(4.8, 0.85, ST.z1 - 0.1, 4.85, 0.95, ST.z1 - 0.08, 0xc9a24a);
    cube(ST.x0, 1.15, 0.75, ST.x0 + 0.04, 1.85, 1.45, 0x23262a);
    for (let i = 0; i < 5; i++) cube(ST.x0 + 0.04, 1.65 - i * 0.1, 0.83, ST.x0 + 0.045, 1.69 - i * 0.1, 1.37, 0xe8e2d0);
    for (let i = 0; i < 6; i++) { const zz = 2.0 + (i % 3) * 0.42, yy = 1.0 + Math.floor(i / 3) * 0.36; cube(ST.x0, yy, zz, ST.x0 + 0.12, yy + 0.32, zz + 0.38, 0x2f4a3a); cube(ST.x0 + 0.12, yy + 0.22, zz + 0.06, ST.x0 + 0.125, yy + 0.25, zz + 0.32, 0x15171a); }
    // the railing at the top landing, over the drop down the stairwell
    for (let x = ST.x0 + 0.06; x < ST.a1; x += 0.12) cube(x - 0.015, Y3, ST.z1 - 0.015, x + 0.015, Y3 + 1.0, ST.z1 + 0.015, 0x2d3236);
    cube(ST.x0, Y3 + 1.0, ST.z1 - 0.04, ST.a1, Y3 + 1.06, ST.z1 + 0.04, OAK);
    // the flat's door: frames on both sides, a brass name plate and a doormat outside
    for (const x of [ST.x1 - 0.01, ST.x1 + 0.2]) { cube(x, Y3, 0.51, x + 0.01, Y3 + 2.2, 0.6, FRAME); cube(x, Y3, 1.6, x + 0.01, Y3 + 2.2, 1.69, FRAME); cube(x, Y3 + 2.1, 0.51, x + 0.01, Y3 + 2.2, 1.69, FRAME); }
    cube(ST.x1 - 0.03, Y3 + 1.45, 0.25, ST.x1, Y3 + 1.55, 0.45, 0xd9c9a0);
    cube(ST.x1 - 0.75, Y3, 0.7, ST.x1 - 0.05, Y3 + 0.02, 1.5, 0x3d5a46);
    addDoor(leaf(0.95, 2.08, 0.05, 0x2f5a3f, 0x3b6b4c, 0.85), ST.x1 + 0.17, Y3, 1.6, Math.PI / 2, -1.6, ST.x1 + 0.1, 1.1);
    // and the doorways from the lift landing into the flat on the floors above
    for (const y of [Y4, Y5]) for (const x of [ST.x1 - 0.01, ST.x1 + 0.2]) { cube(x, y, 0.51, x + 0.01, y + 2.2, 0.6, FRAME); cube(x, y, 1.6, x + 0.01, y + 2.2, 1.69, FRAME); cube(x, y + 2.1, 0.51, x + 0.01, y + 2.2, 1.69, FRAME); }

    /* the lift: an iron cage up the middle of the stairwell, a wooden cab, sliding doors on every floor */
    const liftB = new Builder(), CH = 2.25;
    {
      const bar = (x0, z0, x1, z1, y0, y1) => block(liftB, x0, y0, z0, x1, y1, z1, IRON);
      const posts = [[ST.s0, ST.z1], [ST.s1, ST.z1], [ST.s0, ST.z2], [ST.s1, ST.z2]];
      for (const [x, z] of posts) bar(x - 0.035, z - 0.035, x + 0.035, z + 0.035, 0, ROOF);
      for (let z = ST.z1 + 0.1; z < ST.z2 - 0.05; z += 0.1) for (const x of [ST.s0, ST.s1]) bar(x - 0.009, z - 0.009, x + 0.009, z + 0.009, 0, ROOF);
      for (let x = ST.s0 + 0.1; x < ST.s1 - 0.05; x += 0.1) {
        bar(x - 0.009, ST.z2 - 0.009, x + 0.009, ST.z2 + 0.009, 0, ROOF);
        // the front: full height beside the doors, above them only from the top of each door to the next floor
        if (x < CAB.d0 || x > CAB.d1) bar(x - 0.009, ST.z1 - 0.009, x + 0.009, ST.z1 + 0.009, 0, ROOF);
        else for (let k = 0; k < FLOORS; k++) bar(x - 0.009, ST.z1 - 0.009, x + 0.009, ST.z1 + 0.009, k * F + 2.25, Math.min(ROOF, (k + 1) * F));
      }
      // bands round the cage at every floor, half way up and at the top of the doors
      for (let k = 0; k < FLOORS; k++) for (const y of [k * F, k * F + 1.1, k * F + 2.25]) {
        bar(ST.s0 - 0.02, ST.z1 - 0.025, ST.s1 + 0.02, ST.z1 + 0.025, y, y + 0.05);
        bar(ST.s0 - 0.02, ST.z2 - 0.025, ST.s1 + 0.02, ST.z2 + 0.025, y, y + 0.05);
        for (const x of [ST.s0, ST.s1]) bar(x - 0.025, ST.z1, x + 0.025, ST.z2, y, y + 0.05);
      }
      // at every landing a frame round the doors, a call button and a lamp that says the lift is here
      for (let k = 0; k < FLOORS; k++) {
        const y = k * F;
        cube(CAB.d0 - 0.08, y, ST.z1 - 0.12, CAB.d0, y + 2.3, ST.z1 - 0.07, 0x3a2a1c); cube(CAB.d1, y, ST.z1 - 0.12, CAB.d1 + 0.08, y + 2.3, ST.z1 - 0.07, 0x3a2a1c);
        cube(CAB.d0 - 0.08, y + 2.22, ST.z1 - 0.12, CAB.d1 + 0.08, y + 2.32, ST.z1 - 0.07, 0x3a2a1c);
        cube(CAB.d1 + 0.14, y + 1.0, ST.z1 - 0.12, CAB.d1 + 0.26, y + 1.22, ST.z1 - 0.08, 0xc9a24a);
        cube(CAB.d1 + 0.18, y + 1.08, ST.z1 - 0.14, CAB.d1 + 0.22, y + 1.14, ST.z1 - 0.12, 0x7a1414);
        // the floor's number in brass over the door
        block(glowB, 2.8, y + 2.36, ST.z1 - 0.06, 2.9, y + 2.46, ST.z1 - 0.04, 0xffd27a);
      }
      // the bottom of the pit
      cube(ST.s0, 0, ST.z1, ST.s1, 0.02, ST.z2, 0x2b2a28);
    }
    // the cab: wood panels, a mirror at the back, glass at the sides, a lamp in the ceiling, the buttons on the right
    const cabB = new Builder(), cabGlow = new Builder(), cabGlass = new Builder();
    {
      const MAH = 0x6b3a22, x0 = CAB.x0, x1 = CAB.x1, z0 = CAB.z0, z1 = CAB.z1;
      block(cabB, x0, -0.12, z0, x1, 0.02, z1, (n) => (n[1] > 0 ? 0x7a5536 : MAH));
      block(cabB, x0, CH, z0, x1, CH + 0.1, z1, (n) => (n[1] < 0 ? 0xf3efe6 : MAH));
      block(cabB, x0, 0.02, z1 - 0.05, x1, CH, z1, MAH);
      block(cabB, x0 + 0.25, 1.0, z1 - 0.06, x1 - 0.25, 2.05, z1 - 0.05, 0xb9c6cd);
      block(cabB, x0 + 0.1, 0.9, z1 - 0.12, x1 - 0.1, 0.95, z1 - 0.06, 0xc9a24a);
      for (const [xa, xb] of [[x0, x0 + 0.04], [x1 - 0.04, x1]]) {
        block(cabB, xa, 0.02, z0, xb, 1.0, z1, MAH);
        block(cabB, xa, 1.0, z0, xb, 1.06, z1, 0xc9a24a);
        block(cabB, xa, 2.1, z0, xb, CH, z1, MAH);
        cabGlass.quad([(xa + xb) / 2, 1.06, z0], [(xa + xb) / 2, 1.06, z1], [(xa + xb) / 2, 2.1, z1], [(xa + xb) / 2, 2.1, z0], 0xffffff, null, [1, 0, 0]);
      }
      block(cabB, x0, 0.02, z0, CAB.d0, CH, z0 + 0.04, MAH); block(cabB, CAB.d1, 0.02, z0, x1, CH, z0 + 0.04, MAH);
      block(cabB, x1 - 0.3, 1.0, z0 + 0.05, x1 - 0.04, 1.6, z0 + 0.35, 0xc9a24a);
      for (let i = 0; i < FLOORS; i++) block(cabB, x1 - 0.06, 1.08 + i * 0.08, z0 + 0.14, x1 - 0.045, 1.13 + i * 0.08, z0 + 0.22, 0xf3efe6);
      block(cabGlow, (x0 + x1) / 2 - 0.3, CH - 0.03, (z0 + z1) / 2 - 0.3, (x0 + x1) / 2 + 0.3, CH, (z0 + z1) / 2 + 0.3, 0xfff3d8);
    }
    // the sliding doors: two leaves on every landing and two on the cab; each leaf a wooden frame round a glass pane
    const slideLeaf = (B, G, w, h) => {
      block(B, 0, 0, 0, w, 0.1, 0.04, 0x3a2a1c); block(B, 0, h - 0.1, 0, w, h, 0.04, 0x3a2a1c);
      block(B, 0, 0.1, 0, 0.06, h - 0.1, 0.04, 0x3a2a1c); block(B, w - 0.06, 0.1, 0, w, h - 0.1, 0.04, 0x3a2a1c);
      block(B, 0.06, 0.1, 0, w - 0.06, 1.0, 0.04, 0x5a3c26);
      G.quad([0.06, 1.0, 0.02], [w - 0.06, 1.0, 0.02], [w - 0.06, h - 0.1, 0.02], [0.06, h - 0.1, 0.02], 0xffffff, null, [0, 0, 1]);
    };
    const lw = (CAB.d1 - CAB.d0) / 2, leafSolid = new Builder(), leafGlass = new Builder();
    slideLeaf(leafSolid, leafGlass, lw, 2.2);
    const leafGeo = leafSolid.build(), leafGlassGeo = leafGlass.build();
    const inMat = std({ vertexColors: true, roughness: 0.82, envMapIntensity: 0.75 });
    const glassMatH = std({ color: 0xcfe3ec, transparent: true, opacity: 0.16, roughness: 0.03, side: THREE.DoubleSide, depthWrite: false });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const makeLeaf = (parent, x, y, z) => {
      const g = new THREE.Group(), m = new THREE.Mesh(leafGeo, doorMat), gm = new THREE.Mesh(leafGlassGeo, glassMatH);
      m.castShadow = true; g.add(m, gm); g.position.set(x, y, z); parent.add(g);
      return g;
    };
    const cab = new THREE.Group();
    for (const [B, mat] of [[cabB, inMat], [cabGlow, glowMat], [cabGlass, glassMatH]]) { const m = new THREE.Mesh(B.build(), mat); m.castShadow = B === cabB; m.receiveShadow = B === cabB; cab.add(m); }
    const cabLeaves = [makeLeaf(cab, CAB.d0, 0.02, CAB.z0 - 0.05), makeLeaf(cab, CAB.d0 + lw, 0.02, CAB.z0 - 0.05)];
    root.add(cab);
    const landLeaves = [];
    for (let k = 0; k < FLOORS; k++) landLeaves.push([makeLeaf(root, CAB.d0, k * F, ST.z1 - 0.065), makeLeaf(root, CAB.d0 + lw, k * F, ST.z1 - 0.065)]);
    // the counterweight goes down as the cab comes up, and the cables run from the cab up to the wheel at the top
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.5), std({ color: 0x3a3d41, roughness: 0.6, metalness: 0.5 }));
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.03), cw.material);
    root.add(cw, cable);
    {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16), cw.material);
      m.rotation.z = Math.PI / 2; m.position.set((ST.s0 + ST.s1) / 2, ROOF - 0.35, 3.5); root.add(m);
    }
    DRAKEN.liftParts = { cab, cabLeaves, landLeaves, cw, cable, lw };

    /* the flat */
    // floors: oak boards, tiles in the bathrooms and the sauna, everywhere but the holes for the lift and the stair
    const floorQuad = (B, x0, z0, x1, z1, y, k) => B.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0xffffff, [[x0 / k, -z1 / k], [x1 / k, -z1 / k], [x1 / k, -z0 / k], [x0 / k, -z0 / k]], [0, 1, 0]);
    // a rectangle cut up round the holes, as a list of rectangles
    const cutOut = (x0, z0, x1, z1, holes) => {
      const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]]).filter((v) => v > x0 && v < x1)])].sort((a, b) => a - b);
      const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h[1], h[3]]).filter((v) => v > z0 && v < z1)])].sort((a, b) => a - b), out = [];
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
        const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
        if (!holes.some((h) => mx > h[0] && mx < h[2] && mz > h[1] && mz < h[3])) out.push([xs[i], zs[j], xs[i + 1], zs[j + 1]]);
      }
      return out;
    };
    const SHAFT = [ST.s0, ST.z1, ST.s1, ST.z2], STAIRHOLE = [FS.x0, FS.z1, FS.x1, FS.z3];
    const tiled = { 3: [[0.4, 6.2, ST.x1, D - 0.4]], 4: [[FS.x0, FS.z3 + 0.15, 8.9, D - 0.4]], 5: [[9.05, 7.5, W - 0.4, D - 0.4]] };
    const floorAt = (k, x0, z0, x1, z1, holes) => { for (const r of cutOut(x0, z0, x1, z1, holes.concat(tiled[k] || []))) floorQuad(woodB, ...r, k * F + 0.005, 2.4); };
    for (const k in tiled) for (const t of tiled[k]) floorQuad(tileB, ...t, k * F + 0.008, 1.2);
    floorAt(FL, FS.x0, 0.4, W - 0.4, D - 0.4, []);
    floorAt(FL, 0.4, 6.2, ST.x1, D - 0.4, []);
    for (const k of [4, 5]) floorAt(k, 0.4, 0.4, W - 0.4, D - 0.4, [SHAFT, STAIRHOLE]);
    // ceilings, facing down, and the edges of the slabs round the stair
    const ceilAt = (y, holes) => { for (const [x0, z0, x1, z1] of cutOut(0.4, 0.4, W - 0.4, D - 0.4, holes)) inn.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], CEIL, null, [0, -1, 0]); };
    ceilAt(Y4 - 0.3, [SHAFT, STAIRHOLE]); ceilAt(Y5 - 0.3, [SHAFT, STAIRHOLE]); ceilAt(ROOF, []);
    for (const y of [Y4, Y5]) {
      cube(FS.x0, y - 0.3, FS.z1 - 0.02, FS.x1, y, FS.z1, CEIL);
      cube(FS.x0, y - 0.3, FS.z3, FS.x1, y, FS.z3 + 0.02, CEIL);
    }
    // the beams under the roof
    for (let z = 1.2; z < D - 0.5; z += 1.5) cube(0.4, ROOF - 0.2, z - 0.08, W - 0.4, ROOF, z + 0.08, BEAM);

    // the flat's stair: oak treads on white risers, a wall up the middle, half landings at the back
    const fsN = 9, fsT = (FS.z2 - FS.z1) / fsN, fsR = F / 2 / fsN;
    const ftPaint = (n) => (n[1] > 0 ? OAK : n[1] < 0 ? CEIL : FLAT);
    for (const k of [FL, FL + 1]) {
      const y0 = k * F;
      for (let i = 0; i < fsN; i++) {
        const ya = y0 + (i + 0.5) * fsR, yb = y0 + F / 2 + (i + 0.5) * fsR;
        block(inn, FS.x0, Math.max(y0, ya - 0.35), FS.z1 + i * fsT, FS.m - 0.05, ya, FS.z1 + (i + 1) * fsT, ftPaint);
        block(inn, FS.m + 0.05, yb - 0.35, FS.z2 - (i + 1) * fsT, FS.x1, yb, FS.z2 - i * fsT, ftPaint);
      }
      block(inn, FS.x0, y0 + F / 2 - 0.25, FS.z2, FS.x1, y0 + F / 2, FS.z3, ftPaint);
      // handrails on the walls either side
      rail(FS.x0 + 0.02, FS.x0 + 0.07, FS.z1, y0 + 0.9, FS.z2, y0 + F / 2 + 0.9);
      rail(FS.x1 - 0.07, FS.x1 - 0.02, FS.z2, y0 + F / 2 + 0.9, FS.z1, y0 + F + 0.9);
    }
    // the walls round it, from the third floor up under the roof
    block(inn, FS.m - 0.05, Y3, FS.z1, FS.m + 0.05, ROOF, FS.z2, FLAT);
    block(inn, FS.x1, Y3, FS.z1, FS.x1 + 0.15, ROOF, FS.z3 + 0.15, FLAT);
    block(inn, FS.x0, Y3, FS.z3, FS.x1, ROOF, FS.z3 + 0.15, FLAT);
    // under its first flight on the third floor a cupboard; at the top a glass railing with an oak rail
    cube(FS.m + 0.05, Y3, FS.z1 - 0.03, FS.x1, Y3 + F / 2 + 0.6, FS.z1, 0xe9e4da);
    cube(FS.m + 0.6, Y3 + 0.9, FS.z1 - 0.05, FS.m + 0.64, Y3 + 1.15, FS.z1 - 0.03, 0xc9a24a);
    glassB.quad([FS.x0, Y5, FS.z1], [FS.m, Y5, FS.z1], [FS.m, Y5 + 1.0, FS.z1], [FS.x0, Y5 + 1.0, FS.z1], 0xffffff, null, [0, 0, -1]);
    cube(FS.x0, Y5 + 1.0, FS.z1 - 0.04, FS.m, Y5 + 1.06, FS.z1 + 0.04, OAK);
    for (const x of [FS.x0 + 0.05, FS.m - 0.08]) cube(x, Y5, FS.z1 - 0.03, x + 0.03, Y5 + 1.0, FS.z1 + 0.03, 0x9a9ea2);

    // the walls between the rooms (the same as the walls you bump into)
    const part = (k, along, a0, a1, t0, t1, doors, paint) => wallRun(inn, along, a0, a1, t0, t1, k * F, (k + 1) * F - 0.3, doors.map(([p, q]) => [p, q, k * F, k * F + 2.1]), paint);
    const sides = (neg, pos) => (n) => (n[0] + n[2] < 0 ? neg : pos);
    part(3, 'z', 0.4, FS.z1, 8.9, 9.05, [[1.2, 2.6]], sides(FLAT, FLAT));
    part(4, 'z', 0.4, 7.35, 8.9, 9.05, [[1.0, 2.6], [4.8, 6.6]], sides(FLAT, FLAT)); part(4, 'z', 7.35, D - 0.4, 8.9, 9.05, [], sides(BATH, FLAT));
    part(5, 'z', 0.4, 7.35, 8.9, 9.05, [[4.3, 5.2]], sides(FLAT, BED_WALL)); part(5, 'z', 7.35, D - 0.4, 8.9, 9.05, [], sides(KID2, BATH));
    part(5, 'x', 9.05, W - 0.4, 7.35, 7.5, [[9.4, 10.3]], sides(BED_WALL, BATH));
    for (let k = FL; k < FLOORS; k++) part(k, 'z', 6.2, D - 0.4, ST.x1, ST.x1 + 0.2, k === FL ? [[9.0, 9.9]] : [], sides(backIn(k, 1), k === 4 ? BATH : k === 5 ? KID2 : FLAT));
    // skirting boards round the main rooms
    for (const k of [FL, 4, 5]) {
      const y = k * F;
      for (const [x0, z0, x1, z1] of [[9.05, 0.4, W - 0.4, 0.42], [W - 0.42, 0.4, W - 0.4, D - 0.4], [FS.x0, 0.4, 8.9, 0.42]]) cube(x0, y, z0, x1, y + 0.08, z1, 0xfbf9f4);
    }

    /* furniture: each piece in a frame of its own, u across it, v from its front (v = 0) to its back, centred on
       (cx, cz) at floor height y; rot turns it so its front faces 0: -z, 1: -x, 2: +z, 3: +x */
    const frame = (cx, cz, y, rot, w, d) => {
      const P = rot === 0 ? (u, v) => [cx - w / 2 + u, cz - d / 2 + v] : rot === 1 ? (u, v) => [cx - d / 2 + v, cz + w / 2 - u]
        : rot === 2 ? (u, v) => [cx + w / 2 - u, cz + d / 2 - v] : (u, v) => [cx + d / 2 - v, cz - w / 2 + u];
      const b = (u0, h0, v0, u1, h1, v1, c, B = inn) => {
        const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1);
        block(B, Math.min(ax, bx), y + h0, Math.min(az, bz), Math.max(ax, bx), y + h1, Math.max(az, bz), c);
      };
      b.solid = (h) => {
        const ex = rot % 2 ? d / 2 : w / 2, ez = rot % 2 ? w / 2 : d / 2;
        DRAKEN.wall(cx - ex, cz - ez, cx + ex, cz + ez, y, y + h);
      };
      return b;
    };
    const wood = (c) => shade(c, 0.8);
    function sofa(cx, cz, y, rot, w, c) {
      const d = 0.95, b = frame(cx, cz, y, rot, w, d);
      b(0, 0.06, 0, w, 0.42, d, shade(c, 0.85)); b(0.18, 0.42, 0.02, w - 0.18, 0.55, d - 0.22, c);
      b(0, 0.42, d - 0.25, w, 0.95, d, c); b(0, 0.42, 0, 0.18, 0.68, d - 0.25, c); b(w - 0.18, 0.42, 0, w, 0.68, d - 0.25, c);
      for (const u of [0.1, w - 0.1]) b(u - 0.03, 0, 0.1, u + 0.03, 0.06, 0.16, 0x2d3236);
      b(0.35, 0.55, d - 0.4, 0.8, 0.86, d - 0.26, 0xd9b44a); b(w - 0.8, 0.55, d - 0.4, w - 0.35, 0.86, d - 0.26, 0xc8643a);
      b.solid(0.95);
    }
    function armchair(cx, cz, y, rot, c) {
      const w = 0.85, d = 0.85, b = frame(cx, cz, y, rot, w, d);
      b(0, 0.06, 0, w, 0.42, d, shade(c, 0.85)); b(0.14, 0.42, 0.02, w - 0.14, 0.52, d - 0.2, c);
      b(0, 0.42, d - 0.2, w, 0.95, d, c); b(0, 0.42, 0, 0.14, 0.66, d - 0.2, c); b(w - 0.14, 0.42, 0, w, 0.66, d - 0.2, c);
      b.solid(0.95);
    }
    function table(cx, cz, y, rot, w, d, h, c) {
      const b = frame(cx, cz, y, rot, w, d);
      b(0, h - 0.04, 0, w, h, d, c);
      for (const [u, v] of [[0.05, 0.05], [w - 0.1, 0.05], [0.05, d - 0.1], [w - 0.1, d - 0.1]]) b(u, 0, v, u + 0.05, h - 0.04, v + 0.05, wood(c));
      b.solid(h);
    }
    function chair(cx, cz, y, rot, c) {
      const w = 0.44, d = 0.44, b = frame(cx, cz, y, rot, w, d);
      b(0.02, 0.44, 0.02, w - 0.02, 0.48, d - 0.02, c);
      for (const [u, v] of [[0.03, 0.03], [w - 0.06, 0.03], [0.03, d - 0.06], [w - 0.06, d - 0.06]]) b(u, 0, v, u + 0.03, 0.44, v + 0.03, c);
      b(0.02, 0.48, d - 0.05, w - 0.02, 0.92, d - 0.02, c);
    }
    function bookshelf(cx, cz, y, rot, w, h) {
      const d = 0.34, b = frame(cx, cz, y, rot, w, d), sh = shade(OAK, 0.85);
      b(0, 0, d - 0.03, w, h, d, shade(OAK, 0.7)); b(0, 0, 0, 0.04, h, d, OAK); b(w - 0.04, 0, 0, w, h, d, OAK); b(0, h - 0.04, 0, w, h, d, OAK);
      for (let yy = 0.05; yy < h - 0.3; yy += 0.42) {
        b(0, yy, 0, w, yy + 0.03, d, sh);
        let u = 0.06;
        while (u < w - 0.1) { const t = rr(0.03, 0.07), bh = rr(0.22, 0.34); if (yy + 0.03 + bh < h - 0.05) b(u, yy + 0.03, 0.04, u + t, yy + 0.03 + bh, d - 0.05, pick([0x8c2f2a, 0x2f4f6e, 0x3f6b45, 0xd9b44a, 0xe8e2d0, 0x5a3d6e, 0x222428, 0xc8643a])); u += t + 0.006; }
      }
      b.solid(h);
    }
    function tvUnit(cx, cz, y, rot, w) {
      const d = 0.45, b = frame(cx, cz, y, rot, w, d);
      b(0, 0.12, 0, w, 0.5, d, 0x2d3236); b(0.05, 0, 0.05, 0.1, 0.12, 0.1, 0x1c1d20); b(w - 0.1, 0, 0.05, w - 0.05, 0.12, 0.1, 0x1c1d20);
      b(w / 2 - 0.12, 0.5, 0.15, w / 2 + 0.12, 0.6, 0.3, 0x1c1d20);
      b(w / 2 - 0.72, 0.6, 0.22, w / 2 + 0.72, 1.45, 0.27, 0x111214);
      b(w / 2 - 0.69, 0.63, 0.21, w / 2 + 0.69, 1.42, 0.22, 0x1b2a3c, glowB);
      b.solid(0.6);
    }
    function plant(cx, cz, y, s) {
      cube(cx - 0.16 * s, y, cz - 0.16 * s, cx + 0.16 * s, y + 0.32 * s, cz + 0.16 * s, 0xb5603e);
      cube(cx - 0.32 * s, y + 0.32 * s, cz - 0.32 * s, cx + 0.32 * s, y + 0.95 * s, cz + 0.32 * s, 0x3f6e36);
      cube(cx - 0.2 * s, y + 0.95 * s, cz - 0.2 * s, cx + 0.2 * s, y + 1.3 * s, cz + 0.2 * s, 0x4f8040);
      DRAKEN.wall(cx - 0.3 * s, cz - 0.3 * s, cx + 0.3 * s, cz + 0.3 * s, y, y + 1.2 * s);
    }
    const rug = (x0, z0, x1, z1, y, c1, c2) => { cube(x0, y, z0, x1, y + 0.012, z1, c1); cube(x0 + 0.25, y, z0 + 0.25, x1 - 0.25, y + 0.016, z1 - 0.25, c2); };
    const floorLamp = (x, z, y) => { cube(x - 0.12, y, z - 0.12, x + 0.12, y + 0.03, z + 0.12, 0x2d3236); cube(x - 0.02, y, z - 0.02, x + 0.02, y + 1.5, z + 0.02, 0x2d3236); block(glowB, x - 0.2, y + 1.42, z - 0.2, x + 0.2, y + 1.72, z + 0.2, 0xfff0cc); };
    const pendant = (x, z, y, c) => { cube(x - 0.015, y - 0.75, z - 0.015, x + 0.015, y, z + 0.015, 0x222428); block(inn, x - 0.22, y - 0.95, z - 0.22, x + 0.22, y - 0.75, z + 0.22, c); block(glowB, x - 0.17, y - 0.99, z - 0.17, x + 0.17, y - 0.95, z + 0.17, 0xfff0cc); };
    const ceilingLamp = (x, z, y) => { cube(x - 0.02, y - 0.25, z - 0.02, x + 0.02, y, z + 0.02, 0x222428); block(glowB, x - 0.2, y - 0.42, z - 0.2, x + 0.2, y - 0.25, z + 0.2, 0xfff3d8); };
    function bed(cx, cz, y, rot, w, len, duvet, head) {
      const b = frame(cx, cz, y, rot, w, len + 0.08);
      b(0, 0.12, 0, w, 0.35, len, shade(head, 0.9)); for (const [u, v] of [[0.03, 0.03], [w - 0.09, 0.03]]) b(u, 0, v, u + 0.06, 0.12, v + 0.06, 0x2d3236);
      b(0.03, 0.35, 0.03, w - 0.03, 0.56, len - 0.03, 0xf6f4ef);
      b(-0.01, 0.5, -0.01, w + 0.01, 0.62, len * 0.7, duvet); b(-0.02, 0.32, -0.02, w + 0.02, 0.62, 0.01, duvet);
      const pw = w > 1.2 ? (w - 0.3) / 2 : w - 0.2;
      for (let i = 0; i < (w > 1.2 ? 2 : 1); i++) b(0.1 + i * (pw + 0.1), 0.56, len - 0.5, 0.1 + i * (pw + 0.1) + pw, 0.72, len - 0.1, 0xffffff);
      b(-0.05, 0, len, w + 0.05, 1.15, len + 0.08, head);
      b.solid(0.62);
    }
    const bedside = (x, z, y) => { cube(x - 0.22, y, z - 0.2, x + 0.22, y + 0.5, z + 0.2, OAK); cube(x - 0.04, y + 0.5, z - 0.04, x + 0.04, y + 0.72, z + 0.04, 0x2d3236); block(glowB, x - 0.13, y + 0.72, z - 0.13, x + 0.13, y + 0.92, z + 0.13, 0xfff0cc); };
    function wardrobe(cx, cz, y, rot, w, c) {
      const d = 0.6, b = frame(cx, cz, y, rot, w, d), n = Math.max(2, Math.round(w / 0.5));
      b(0, 0, 0, w, 2.15, d, c);
      for (let i = 1; i < n; i++) b(i * w / n - 0.005, 0.05, -0.005, i * w / n + 0.005, 2.1, 0, shade(c, 0.8));
      for (let i = 0; i < n; i++) b((i + 0.5) * w / n - 0.01, 0.95, -0.03, (i + 0.5) * w / n + 0.01, 1.25, 0, 0x9a9ea2);
      b.solid(2.15);
    }
    function desk(cx, cz, y, rot, w, c) {
      const d = 0.7, b = frame(cx, cz, y, rot, w, d);
      b(0, 0.72, 0, w, 0.76, d, c); b(0.03, 0, 0.05, 0.08, 0.72, d - 0.05, wood(c)); b(w - 0.08, 0, 0.05, w - 0.03, 0.72, d - 0.05, wood(c));
      b(w / 2 - 0.3, 0.76, d - 0.25, w / 2 + 0.3, 1.12, d - 0.22, 0x2d3236); b(w / 2 - 0.28, 0.79, d - 0.255, w / 2 + 0.28, 1.1, d - 0.25, 0x1b2a3c, glowB);
      b(w / 2 - 0.25, 0.76, 0.12, w / 2 + 0.2, 0.78, 0.28, 0x2d3236);
      b.solid(0.78);
    }
    function toilet(cx, cz, y, rot) {
      const b = frame(cx, cz, y, rot, 0.4, 0.65);
      b(0.05, 0, 0.05, 0.35, 0.42, 0.5, 0xfafafa); b(0, 0.42, 0.0, 0.4, 0.45, 0.48, 0xf0f0f0); b(0.02, 0.42, 0.45, 0.38, 0.85, 0.65, 0xfafafa);
      b.solid(0.85);
    }
    function basin(cx, cz, y, rot, w) {
      const b = frame(cx, cz, y, rot, w, 0.5);
      b(0, 0.2, 0, w, 0.82, 0.5, 0x6f5b49); b(0, 0.82, 0, w, 0.9, 0.5, 0xfafafa);
      b(w / 2 - 0.03, 0.9, 0.38, w / 2 + 0.03, 1.12, 0.44, 0xb8bcc0); b(0.1, 1.15, 0.47, w - 0.1, 1.95, 0.5, 0xb9c6cd);
      b.solid(0.9);
    }
    function bathtub(cx, cz, y, rot) {
      const w = 1.75, d = 0.8, b = frame(cx, cz, y, rot, w, d);
      b(0, 0.12, 0, w, 0.58, d, 0xfafafa); b(0.08, 0.45, 0.08, w - 0.08, 0.585, d - 0.08, 0x9fc4d4);
      for (const [u, v] of [[0.1, 0.1], [w - 0.18, 0.1], [0.1, d - 0.18], [w - 0.18, d - 0.18]]) b(u, 0, v, u + 0.08, 0.12, v + 0.08, 0xc9a24a);
      b(w - 0.14, 0.58, d / 2 - 0.03, w - 0.08, 0.95, d / 2 + 0.03, 0xc9a24a);
      b.solid(0.6);
    }
    // a walk-in shower in a corner: a raised tray, a glass screen along [ax, az]-[bx, bz] and a rain head
    function shower(x0, z0, x1, z1, y, [ax, az, bx, bz]) {
      cube(x0, y, z0, x1, y + 0.05, z1, 0xd9dcde);
      glassB.quad([ax, y, az], [bx, y, bz], [bx, y + 2.0, bz], [ax, y + 2.0, az], 0xffffff, null, ax === bx ? [-1, 0, 0] : [0, 0, -1]);
      cube(Math.min(ax, bx) - 0.02, y, Math.min(az, bz) - 0.02, Math.max(ax, bx) + 0.02, y + 0.06, Math.max(az, bz) + 0.02, 0xb8bcc0);
      cube((x0 + x1) / 2 - 0.12, y + 2.0, (z0 + z1) / 2 - 0.12, (x0 + x1) / 2 + 0.12, y + 2.03, (z0 + z1) / 2 + 0.12, 0xb8bcc0);
      DRAKEN.wall(Math.min(ax, bx) - 0.02, Math.min(az, bz) - 0.02, Math.max(ax, bx) + 0.02, Math.max(az, bz) + 0.02, y, y + 2.0);
    }
    function kakelugn(cx, cz, y) {
      // the tiled stove of the old Stockholm flats: round, white, a cornice and a crown, brass doors
      inn.prism(cx, cz, 0.42, y, y + 0.35, 14, 0xd8d3c8); inn.prism(cx, cz, 0.36, y + 0.35, y + 2.25, 14, 0xf2efe6, 0.36, false);
      inn.prism(cx, cz, 0.44, y + 2.25, y + 2.4, 14, 0xe8e2d4); inn.prism(cx, cz, 0.3, y + 2.4, y + 2.7, 14, 0xf2efe6, 0.12);
      cube(cx - 0.16, y + 0.6, cz - 0.37, cx + 0.16, y + 0.9, cz - 0.33, 0xc9a24a); cube(cx - 0.12, y + 1.25, cz - 0.37, cx + 0.12, y + 1.45, cz - 0.33, 0xc9a24a);
      DRAKEN.wall(cx - 0.42, cz - 0.42, cx + 0.42, cz + 0.42, y, y + 2.7);
    }
    function piano(cx, cz, y, rot) {
      const w = 1.5, d = 1.7, b = frame(cx, cz, y, rot, w, d), K = 0x111214;
      b(0, 0.62, 0, w, 0.98, d * 0.55, K); b(0.15, 0.62, d * 0.55, w - 0.1, 0.98, d * 0.8, K); b(0.4, 0.62, d * 0.8, w - 0.15, 0.98, d, K);
      b(0.05, 0.86, -0.12, w - 0.05, 0.9, 0.0, 0xf6f4ef); b(0.05, 0.9, -0.12, w - 0.05, 0.92, -0.08, K);
      for (const [u, v] of [[0.1, 0.1], [w - 0.18, 0.1], [w / 2, d - 0.3]]) b(u, 0, v, u + 0.08, 0.62, v + 0.08, K);
      b(0.1, 0.98, 0.3, 0.14, 1.75, 0.34, K);
      b(0.08, 1.5, 0.3, w - 0.1, 1.53, d * 0.75, K);
      b.solid(1.0);
      const s = frame(cx, cz, y, rot, w, d);
      s(w / 2 - 0.35, 0, -0.75, w / 2 + 0.35, 0.48, -0.42, K);
    }
    function poolTable(cx, cz, y, rot) {
      const w = 1.45, d = 2.6, b = frame(cx, cz, y, rot, w, d);
      b(0, 0.6, 0, w, 0.82, d, 0x4a2c1a); b(0.12, 0.82, 0.12, w - 0.12, 0.84, d - 0.12, 0x1f6b44);
      b(0, 0.82, 0, w, 0.88, 0.12, 0x4a2c1a); b(0, 0.82, d - 0.12, w, 0.88, d, 0x4a2c1a); b(0, 0.82, 0, 0.12, 0.88, d, 0x4a2c1a); b(w - 0.12, 0.82, 0, w, 0.88, d, 0x4a2c1a);
      for (const [u, v] of [[0.1, 0.1], [w - 0.1, 0.1], [0.1, d / 2], [w - 0.1, d / 2], [0.1, d - 0.1], [w - 0.1, d - 0.1]]) b(u - 0.05, 0.835, v - 0.05, u + 0.05, 0.845, v + 0.05, 0x111214);
      for (const [u, v] of [[0.15, 0.15], [w - 0.3, 0.15], [0.15, d - 0.3], [w - 0.3, d - 0.3]]) b(u, 0, v, u + 0.15, 0.6, v + 0.15, 0x3a2216);
      // the balls racked at one end and the white at the other
      const balls = [0xf2c200, 0x1f4fae, 0xc8102e, 0x5a2a7a, 0xe46f2a, 0x1f6b44, 0x7a1414, 0x111214, 0xf2c200, 0x1f4fae];
      let i = 0;
      for (let r = 0; r < 4; r++) for (let c2 = 0; c2 <= r; c2++) { const u = w / 2 + (c2 - r / 2) * 0.06, v = d * 0.28 - r * 0.052; b(u - 0.028, 0.84, v - 0.028, u + 0.028, 0.896, v + 0.028, balls[i++ % balls.length]); }
      b(w / 2 - 0.028, 0.84, d * 0.75 - 0.028, w / 2 + 0.028, 0.896, d * 0.75 + 0.028, 0xf6f4ef);
      b.solid(0.88);
    }

    // the third floor: hall, living room with a grand piano, open kitchen and dining room, laundry behind the stairwell
    {
      const y = Y3;
      rug(6.0, 0.7, 8.4, 1.9, y, 0x7a3b2e, 0xa8573f);
      table(7.5, 0.62, y, 2, 1.2, 0.38, 0.68, OAK);
      cube(8.86, y + 1.0, 2.75, 8.89, y + 2.0, 3.3, 0xb9c6cd);
      // coats on a row of hooks by the door
      cube(5.5, y + 1.62, 2.25, 5.53, y + 1.74, 3.2, OAK);
      for (const [zz, c2] of [[2.45, 0x2f4a5a], [2.75, 0x8c3b2e], [3.0, 0xc9b48f]]) cube(5.53, y + 0.85, zz - 0.11, 5.72, y + 1.62, zz + 0.11, c2);
      plant(8.55, 1.05, y, 1.0);
      ceilingLamp(7.1, 1.6, Y4 - 0.3);
      // living room
      rug(10.0, 1.8, 13.4, 5.4, y, 0x2f4a5a, 0x46708a);
      sofa(10.1, 3.6, y, 3, 2.6, 0x4a5d6e);
      tvUnit(14.3, 3.6, y, 1, 2.0);
      table(11.9, 3.6, y, 0, 0.9, 1.3, 0.42, OAK);
      cube(11.6, y + 0.42, 3.3, 11.9, y + 0.45, 3.6, 0xe8e2d0); cube(12.1, y + 0.42, 3.8, 12.2, y + 0.55, 3.9, 0x3d6e8c);
      armchair(11.9, 1.4, y, 2, 0xd4a23a); armchair(11.0, 5.75, y, 0, 0xd4a23a);
      bookshelf(12.0, 0.6, y, 2, 1.3, 2.2);
      piano(13.5, 6.5, y, 1);
      floorLamp(9.6, 1.0, y); floorLamp(14.1, 1.0, y);
      plant(9.5, 6.6, y, 1.2); plant(14.2, 5.0, y, 0.9);
      for (const [x, z] of [[11.9, 2.4], [11.9, 5.2]]) ceilingLamp(x, z, Y4 - 0.3);
      // kitchen along the back wall, an island with stools, the fridge at the end
      cube(9.3, y, D - 1.0, W - 0.42, y + 0.86, D - 0.4, 0xf4f2ee);
      for (let x = 9.3; x < W - 0.5; x += 0.6) cube(x + 0.02, y + 0.08, D - 1.015, Math.min(x + 0.58, W - 0.44), y + 0.84, D - 1.0, 0xe6e3dc);
      cube(9.25, y + 0.86, D - 1.05, W - 0.42, y + 0.9, D - 0.4, 0x3a3836);
      cube(10.2, y + 0.86, D - 0.8, 10.8, y + 0.88, D - 0.45, 0xb8bcc0); cube(10.45, y + 0.9, D - 0.5, 10.5, y + 1.2, D - 0.45, 0xb8bcc0);
      cube(12.1, y + 0.9, D - 0.95, 12.75, y + 0.91, D - 0.45, 0x151618);
      cube(11.3, y + 1.5, D - 0.75, 12.7, y + 2.25, D - 0.4, 0xf4f2ee);
      cube(12.15, y + 1.9, D - 0.95, 12.7, y + 2.25, D - 0.4, 0x9a9ea2);
      cube(W - 1.05, y, 9.6, W - 0.42, y + 2.1, D - 1.05, 0xdfe2e4); cube(W - 1.06, y + 1.15, 9.7, W - 1.05, y + 1.17, D - 1.15, 0x9a9ea2);
      DRAKEN.wall(9.3, D - 1.0, W - 0.4, D - 0.4, y, y + 0.9); DRAKEN.wall(W - 1.05, 9.6, W - 0.4, D - 1.0, y, y + 2.1);
      cube(10.2, y, 8.6, 13.2, y + 0.88, 9.5, 0xf4f2ee); cube(10.15, y + 0.88, 8.55, 13.25, y + 0.92, 9.55, 0x3a3836);
      DRAKEN.wall(10.2, 8.6, 13.2, 9.5, y, y + 0.92);
      for (const x of [10.7, 11.7, 12.7]) { cube(x - 0.18, y + 0.72, 8.1, x + 0.18, y + 0.76, 8.4, 0x2d3236); cube(x - 0.02, y, 8.23, x + 0.02, y + 0.72, 8.27, 0x2d3236); }
      for (const x of [10.9, 12.5]) pendant(x, 9.05, Y4 - 0.3, 0x2f5a3f);
      // dining room behind the stair
      table(7.2, 9.3, y, 0, 2.4, 1.0, 0.75, OAK);
      for (const x of [6.4, 7.2, 8.0]) { chair(x, 8.5, y, 2, 0x2d3236); chair(x, 10.1, y, 0, 0x2d3236); }
      pendant(7.2, 9.3, Y4 - 0.3, 0xd9b44a);
      cube(5.6, y, FS.z3 + 0.17, 7.5, y + 0.8, FS.z3 + 0.6, wood(OAK)); cube(5.6, y + 0.8, FS.z3 + 0.15, 7.5, y + 0.84, FS.z3 + 0.62, OAK);
      cube(6.2, y + 0.84, FS.z3 + 0.3, 6.4, y + 1.1, FS.z3 + 0.5, 0xe8e2d0);
      DRAKEN.wall(5.6, FS.z3 + 0.15, 7.5, FS.z3 + 0.62, y, y + 0.85);
      // laundry and guest toilet
      cube(0.45, y, 9.6, 1.1, y + 0.85, 10.2, 0xf4f4f2); block(inn, 0.44, y + 0.3, 9.75, 0.45, y + 0.62, 10.05, 0x7a8a96);
      cube(0.45, y + 0.85, 9.6, 1.1, y + 1.7, 10.2, 0xf4f4f2); block(inn, 0.44, y + 1.1, 9.75, 0.45, y + 1.45, 10.05, 0x7a8a96);
      DRAKEN.wall(0.4, 9.6, 1.1, 10.2, y, y + 1.7);
      toilet(3.0, D - 0.75, y, 0); basin(0.7, 7.2, y, 3, 0.8);
      cube(0.45, y + 1.4, 8.0, 0.75, y + 1.43, 9.4, 0xd8d3ca); cube(0.45, y + 1.9, 8.0, 0.75, y + 1.93, 9.4, 0xd8d3ca);
      for (let z = 8.1; z < 9.2; z += 0.35) cube(0.48, y + 1.43, z, 0.72, y + 1.43 + rr(0.15, 0.4), z + 0.25, pick([0xe8e2d0, 0x6f9fb4, 0xf2efe8, 0xd9b44a]));
      cube(2.3, y, 7.0, 2.9, y + 0.5, 7.5, 0xc9b48f);
      ceilingLamp(2.8, 9.0, Y4 - 0.3);
    }
    // the fourth floor: the library round the lift, a study by the hall window, the family room with the billiard table,
    // the office and the sauna
    {
      const y = Y4;
      rug(0.8, 0.6, 4.9, 1.75, y, 0x5a2a2a, 0x8c3b2e);
      bookshelf(0.58, 3.85, y, 3, 3.6, 2.7);
      bookshelf(3.6, 5.82, y, 0, 2.9, 2.7);
      armchair(4.65, 2.4, y, 1, 0x7a2a2a); armchair(4.65, 3.9, y, 1, 0x7a2a2a);
      cube(4.45, y, 3.0, 4.85, y + 0.55, 3.3, OAK); floorLamp(5.0, 4.7, y);
      ceilingLamp(1.0, 1.0, Y5 - 0.3); ceilingLamp(4.6, 3.2, Y5 - 0.3);
      desk(7.5, 0.8, y, 2, 1.3, OAK); chair(7.5, 1.45, y, 0, 0x2d3236);
      plant(5.9, 0.85, y, 1.0); ceilingLamp(7.1, 1.6, Y5 - 0.3);
      // family room: a big corner sofa facing the television, the billiard table at the back, a dartboard
      rug(9.6, 1.0, 13.8, 6.4, y, 0x3f4a3a, 0x5a6b4f);
      sofa(10.1, 3.4, y, 3, 3.0, 0x6b6f75); sofa(11.6, 6.1, y, 0, 2.4, 0x6b6f75);
      tvUnit(14.3, 3.4, y, 1, 2.2);
      table(12.0, 3.4, y, 0, 1.0, 1.4, 0.4, 0x2d3236);
      plant(14.2, 0.8, y, 1.1); floorLamp(9.5, 0.8, y);
      poolTable(11.8, 9.3, y, 1);
      for (const x of [11.2, 12.4]) pendant(x, 9.3, Y5 - 0.3, 0x1f6b44);
      cube(W - 0.45, y + 0.9, 9.2, W - 0.4, y + 1.7, 10.0, 0x4a2c1a);
      for (let i = 0; i < 4; i++) cube(W - 0.5, y + 0.2, 9.3 + i * 0.2, W - 0.46, y + 1.6, 9.33 + i * 0.2, 0xd9b48a);
      block(inn, 9.06, y + 1.5, 9.1, 9.09, y + 1.95, 9.55, 0x1c1d20); block(inn, 9.09, y + 1.6, 9.2, 9.1, y + 1.85, 9.45, 0xc8102e);
      for (const [x, z] of [[11.9, 2.4], [11.9, 5.0]]) ceilingLamp(x, z, Y5 - 0.3);
      // office behind the library
      desk(2.85, D - 1.0, y, 2, 1.6, 0xe8e2d0); chair(2.85, D - 1.75, y, 0, 0x2d3236);
      bookshelf(0.58, 8.9, y, 3, 2.0, 2.0);
      cube(4.4, y, 6.5, 5.2, y + 0.7, 7.0, 0x9a9ea2);
      plant(4.9, D - 0.8, y, 0.9); ceilingLamp(2.9, 9.0, Y5 - 0.3);
      // sauna: a cabin of spruce with benches, a glass door; a shower and a toilet beside it
      {
        const x0 = FS.x0 + 0.02, x1 = 7.6, z0 = 9.4, z1 = D - 0.42;
        block(inn, x0, y, z0, x1, y + 2.15, z0 + 0.06, (n) => (n[2] < 0 ? SAUNA : shade(SAUNA, 1.08)));
        block(inn, x1 - 0.06, y, z0, x1, y + 2.15, z1, SAUNA);
        cube(x0, y + 2.15, z0, x1, y + 2.2, z1, shade(SAUNA, 0.9));
        cube(x0, y, z0 + 1.0, x1 - 0.06, y + 0.45, z1, shade(SAUNA, 1.05)); cube(x0, y + 0.45, z1 - 0.7, x1 - 0.06, y + 0.95, z1, shade(SAUNA, 1.1));
        cube(x1 - 0.55, y, z0 + 0.12, x1 - 0.1, y + 0.6, z0 + 0.55, 0x3a3d41); cube(x1 - 0.5, y + 0.6, z0 + 0.15, x1 - 0.15, y + 0.75, z0 + 0.5, 0x6a6f75);
        block(glowB, x0 + 0.1, y + 2.0, z1 - 0.15, x0 + 0.6, y + 2.1, z1 - 0.05, 0xffc27a);
        glassB.quad([6.1, y, z0 - 0.01], [6.9, y, z0 - 0.01], [6.9, y + 2.0, z0 - 0.01], [6.1, y + 2.0, z0 - 0.01], 0xffffff, null, [0, 0, -1]);
        DRAKEN.wall(x0, z0, 6.1, z0 + 0.06, y, y + 2.2); DRAKEN.wall(6.9, z0, x1, z0 + 0.06, y, y + 2.2); DRAKEN.wall(x1 - 0.06, z0, x1, z1, y, y + 2.2);
        DRAKEN.wall(x0, z0 + 1.0, x1, z1, y, y + 0.45);
      }
      shower(7.75, D - 1.5, 8.88, D - 0.42, y, [7.75, D - 1.5, 8.3, D - 1.5]);
      toilet(8.55, 9.4, y, 1); basin(8.62, 10.1, y, 1, 0.6);
      cube(6.0, y + 1.4, FS.z3 + 0.15, 7.2, y + 1.45, FS.z3 + 0.2, 0xb8bcc0); cube(6.1, y + 0.6, FS.z3 + 0.17, 7.1, y + 1.4, FS.z3 + 0.22, 0xe8d8a8);
      ceilingLamp(8.3, 9.0, Y5 - 0.3);
    }
    // the top floor: the bedrooms under the beams. The big one at the front with a tiled stove, its bathroom at the back,
    // a guest room behind the stair, a child's room behind the lift; a dressing room round the lift
    {
      const y = Y5;
      wardrobe(0.72, 3.9, y, 3, 3.6, 0xf2efe8);
      cube(3.1, y, 5.4, 4.6, y + 0.45, 5.85, 0x8c6a4a); DRAKEN.wall(3.1, 5.4, 4.6, 5.85, y, y + 0.45);
      cube(5.25, y + 0.3, 2.2, 5.29, y + 2.0, 3.2, 0xb9c6cd);
      rug(0.8, 0.6, 4.9, 1.75, y, 0x8c7a5a, 0xb59e78);
      ceilingLamp(1.0, 1.0, ROOF - 0.2); ceilingLamp(4.6, 3.2, ROOF - 0.2);
      table(7.5, 0.62, y, 2, 1.2, 0.38, 0.85, OAK); plant(5.95, 0.85, y, 1.0); ceilingLamp(7.1, 1.6, ROOF - 0.2);
      // the master bedroom
      rug(11.3, 2.1, 14.5, 5.7, y, 0xd8cfb8, 0xe9e2cf);
      bed(13.45, 3.9, y, 1, 1.8, 2.1, 0x6f8fa8, 0x4a5d6e);
      bedside(14.3, 2.55, y); bedside(14.3, 5.25, y);
      kakelugn(9.6, 6.75, y);
      armchair(10.2, 1.2, y, 2, 0xc8643a); floorLamp(9.5, 0.75, y);
      wardrobe(11.9, 6.95, y, 0, 2.4, 0xf2efe8);
      cube(12.4, y, 0.45, 14.2, y + 0.68, 0.9, OAK); DRAKEN.wall(12.4, 0.45, 14.2, 0.9, y, y + 0.68);
      ceilingLamp(12.2, 3.9, ROOF - 0.2);
      // its bathroom: a free-standing bath under the window, two basins, a walk-in shower
      bathtub(13.5, D - 0.85, y, 2);
      basin(10.95, 7.85, y, 2, 0.8); basin(11.95, 7.85, y, 2, 0.8);
      shower(13.3, 7.55, W - 0.42, 9.0, y, [13.3, 7.55, 13.3, 9.0]);
      toilet(9.45, D - 0.75, y, 0);
      cube(9.1, y + 1.0, 9.0, 9.14, y + 1.04, 10.2, 0xb8bcc0); cube(9.12, y + 0.4, 9.1, 9.17, y + 1.0, 10.1, 0xf2efe8);
      ceilingLamp(11.8, 9.6, ROOF - 0.2);
      // the guest room
      bed(6.56, 9.9, y, 3, 1.4, 2.0, 0xc8a2a2, 0x8c6a4a);
      bedside(5.85, 8.75, y);
      wardrobe(8.55, 10.4, y, 1, 1.6, 0xe8e2d0);
      ceilingLamp(7.2, 9.5, ROOF - 0.2);
      // the child's room: a bed with a striped cover, a desk under the window, a toy chest and a rug with a road on it
      bed(0.9, 8.6, y, 0, 0.9, 2.0, 0x2f6fdb, 0xd9b44a);
      desk(4.4, D - 0.8, y, 2, 1.2, 0xe8e2d0); chair(4.4, D - 1.4, y, 0, 0xc8102e);
      cube(2.3, y, 6.45, 3.3, y + 0.5, 6.95, 0xc8102e); cube(2.3, y + 0.5, 6.45, 3.3, y + 0.55, 6.95, 0xf2c200);
      DRAKEN.wall(2.3, 6.45, 3.3, 6.95, y, y + 0.55);
      rug(2.0, 8.0, 4.2, 10.2, y, 0x3f6b45, 0x5a8a5a);
      cube(2.3, y, 9.0, 3.9, y + 0.018, 9.2, 0x4a4f54);
      for (const [x, z, c2] of [[2.6, 8.6, 0xc8102e], [3.4, 9.6, 0x1f4fae]]) cube(x, y, z, x + 0.2, y + 0.1, z + 0.12, c2);
      cube(0.42, y + 1.3, 6.8, 0.44, y + 2.0, 7.6, 0x2f6fdb);
      ceilingLamp(2.8, 9.0, ROOF - 0.2);
    }

    const woodTex = canvasTex(256, 256, (g, w, h) => {
      const n = 8, ph = h / n;
      for (let i = 0; i < n; i++) {
        const t = rr(-16, 16);
        g.fillStyle = `rgb(${Math.round(196 + t)},${Math.round(152 + t)},${Math.round(104 + t * 0.8)})`; g.fillRect(0, i * ph, w, ph);
        for (let k = 0; k < 16; k++) { g.fillStyle = `rgba(110,70,38,${rr(0.04, 0.15).toFixed(3)})`; g.fillRect(0, i * ph + rand() * ph, w, rr(0.6, 1.8)); }
        g.fillStyle = 'rgba(70,45,25,.5)'; g.fillRect(0, i * ph, w, 1.3); g.fillRect(rand() * w, i * ph, 1.3, ph);
      }
    }, true);
    const tileTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#a7a6a0'; g.fillRect(0, 0, w, w);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#ecebe6' : '#3d4146'; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); }
    }, true);
    const liftMat = std({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
    for (const [B, mat, cast] of [[ext, facadeMat, true], [ext.solidB, solidMat, true], [inn, inMat, true], [liftB, liftMat, true], [woodB, std({ map: woodTex, roughness: 0.5, envMapIntensity: 0.75 }), false],
      [tileB, std({ map: tileTex, roughness: 0.25, envMapIntensity: 0.75 }), false], [glowB, glowMat, false], [glassB, glassMatH, false]]) {
      if (B.empty) continue;
      const m = new THREE.Mesh(B.build(), mat);
      m.castShadow = cast; m.receiveShadow = B !== glowB && B !== glassB;
      root.add(m);
    }
  }
  // doors swing open as you come up to them and shut behind you; the lift comes when called, takes you where you want and
  // opens its doors; the first time you step into the flat, it says so
  const LIFT_NAMES = ['Gatan', '1 tr', '2 tr', 'Lägenheten', 'Biblioteket', 'Sovrummen'];
  function liftWhere() {
    const L = DRAKEN.lift, { ST, CAB, F } = DRAKEN, [lx, lz] = DRAKEN.toLocal(player.x, player.z), free = !driving && !(policeStop && policeStop.locked);
    const inCab = free && lx > CAB.x0 - 0.05 && lx < CAB.x1 + 0.05 && lz > CAB.z0 - 0.15 && lz < CAB.z1 + 0.05 && Math.abs(player.y - L.y) < 1;
    const k = Math.round(player.y / F), onFloor = Math.abs(player.y - k * F) < 0.35;
    const atDoor = free && !inCab && onFloor && k >= 0 && k < DRAKEN.FLOORS && lx > CAB.d0 - 0.8 && lx < CAB.d1 + 0.8 && lz > ST.z0 && lz < ST.z1 + 0.05;
    const inDoorway = free && lx > CAB.d0 - 0.05 && lx < CAB.d1 + 0.05 && lz > ST.z1 - 0.4 && lz < CAB.z0 + 0.35 && Math.abs(player.y - L.y) < 1;
    return { inCab, atDoor: atDoor ? k : -1, inDoorway };
  }
  const LIFT = {
    where: null,
    // send the lift to a floor (pressed in the cab or called from a landing)
    go(k) {
      const L = DRAKEN.lift;
      if (k < 0 || k >= DRAKEN.FLOORS) return false;
      if (L.phase === 'moving') { if (k !== L.want) toast('Hissen är på väg till ' + LIFT_NAMES[L.want].toLowerCase() + '.'); return true; }
      L.want = k;
      if (k === L.floor && (L.phase === 'idle' || L.phase === 'closing')) L.phase = 'opening';
      if (k !== L.floor && L.phase === 'open') L.phase = 'closing';
      return true;
    },
    // E: in the cab up to the flat (or down to the street from it); on a landing, call it
    use() {
      const w = LIFT.where;
      if (!w) return false;
      const L = DRAKEN.lift;
      if (w.inCab) { LIFT.go(L.floor < DRAKEN.FL ? DRAKEN.FL : 0); return true; }
      if (w.atDoor >= 0 && !(L.floor === w.atDoor && L.phase !== 'moving' && L.doors > 0.5)) { LIFT.go(w.atDoor); toast(L.floor === w.atDoor ? 'Hissen öppnar.' : 'Hissen är på väg.'); return true; }
      return false;
    },
    digit(n) { if (!LIFT.where || !LIFT.where.inCab) return false; return LIFT.go(n); },
    prompt() {
      const w = LIFT.where, L = DRAKEN.lift;
      if (!w) return null;
      if (w.inCab) return L.phase === 'moving' ? null : 'Hissen: ' + (L.floor < DRAKEN.FL ? 'upp till lägenheten' : 'ner till gatan') + ' (0–5 väljer våning)';
      if (w.atDoor >= 0 && !(L.floor === w.atDoor && L.phase !== 'moving' && L.doors > 0.5)) return L.phase === 'moving' || L.want === w.atDoor ? null : 'Ring på hissen';
      return null;
    }
  };
  function updateLift(dt) {
    const L = DRAKEN.lift, { F, FLOORS, liftParts: P, liftDoors } = DRAKEN, w = LIFT.where = liftWhere();
    switch (L.phase) {
      case 'idle':
        if (L.want !== null && L.want !== L.floor) { L.phase = 'moving'; liftSound('start'); }
        else if (L.want === L.floor || w.atDoor === L.floor || w.inCab) { L.want = null; L.phase = 'opening'; }
        break;
      case 'opening':
        L.doors = Math.min(1, L.doors + dt * 1.3);
        if (L.doors >= 1) { L.phase = 'open'; L.t = 0; }
        break;
      case 'open':
        L.t += dt;
        if (w.inDoorway) L.t = 0;
        if ((L.want !== null && L.want !== L.floor && !w.inDoorway) || (L.t > 5 && w.atDoor !== L.floor && !w.inCab)) L.phase = 'closing';
        break;
      case 'closing':
        if (w.inDoorway) { L.phase = 'opening'; break; }
        L.doors = Math.max(0, L.doors - dt * 1.1);
        if (L.doors <= 0) L.phase = 'idle';
        break;
      case 'moving': {
        const target = L.want * F, d = target - L.y;
        L.v = Math.sign(d) * Math.min(Math.abs(L.v) + dt * 1.2, 1.9, Math.sqrt(2 * 1.0 * Math.abs(d)) + 0.05);
        if (Math.abs(d) <= Math.abs(L.v) * dt + 1e-3) { L.y = target; L.v = 0; L.floor = L.want; L.want = null; L.phase = 'opening'; liftSound('ding'); }
        else L.y += L.v * dt;
        break;
      }
    }
    for (let k = 0; k < FLOORS; k++) liftDoors[k].off = L.phase !== 'moving' && k === L.floor && L.doors > 0.8;
    // the parts that move
    const o = L.doors * (P.lw - 0.04);
    P.cab.position.y = L.y;
    P.cabLeaves[0].position.x = DRAKEN.CAB.d0 - o; P.cabLeaves[1].position.x = DRAKEN.CAB.d0 + P.lw + o;
    P.landLeaves.forEach((pair, k) => { const ok = k === L.floor && L.phase !== 'moving' ? o : 0; pair[0].position.x = DRAKEN.CAB.d0 - ok; pair[1].position.x = DRAKEN.CAB.d0 + P.lw + ok; });
    const cx = (DRAKEN.ST.s0 + DRAKEN.ST.s1) / 2, top = 6 * F - 0.65, cwY = top - 1.2 - L.y * 0.92;
    P.cw.position.set(cx, cwY, 4.0);
    P.cable.position.set(cx, (L.y + 2.35 + top) / 2, 2.7); P.cable.scale.y = Math.max(0.1, top - L.y - 2.35);
  }
  function liftSound(kind) {
    if (!audio || muted) return;
    const s = placeSound(...DRAKEN.toWorld((DRAKEN.ST.s0 + DRAKEN.ST.s1) / 2, 2.7), 30), t = audio.ctx.currentTime;
    if (s.level < 0.02) return;
    if (kind === 'ding') { tone(t, 'sine', 1318, 1318, 0.9, 0.07 * s.level, s.pan); tone(t + 0.32, 'sine', 1047, 1047, 1.2, 0.07 * s.level, s.pan); }
    else noiseBurst(t, 0.25, 0.08 * s.level, 'lowpass', 260, 1, s.pan);
  }
  function updateDraken(dt) {
    const near = !driving, [lx, lz] = DRAKEN.toLocal(player.x, player.z);
    for (const d of DRAKEN.doors) {
      const want = near && Math.hypot(lx - d.cx, lz - d.cz) < 2.2 && Math.abs(player.y - d.y) < 1.6 ? 1 : 0;
      d.open += clamp(want - d.open, -dt * 1.6, dt * 2.2);
      d.pivot.rotation.y = d.rot0 + d.swing * (1 - (1 - d.open) * (1 - d.open));
    }
    updateLift(dt);
    const { F, FL, ST, W, D } = DRAKEN;
    const inFlat = near && !(LIFT.where && LIFT.where.inCab) && lx > 0 && lx < W && lz > 0 && lz < D && player.y > FL * F - 0.3 && (player.y > 4 * F - 0.3 || lx > ST.x1 + 0.1 || lz > ST.z3 + 0.1);
    if (inFlat && !DRAKEN.home) {
      DRAKEN.home = true;
      toast('Din takvåning i tre plan högst upp i det gula huset på Drakens gränd. Sovrummen ligger högst upp.');
    }
    // the lift's buttons on the screen while you ride it
    const show = !!(LIFT.where && LIFT.where.inCab);
    if (show !== !el.liftPanel.hidden) el.liftPanel.hidden = !show;
    if (show) {
      const L = DRAKEN.lift, at = Math.round(L.y / F), key = at + ':' + L.want;
      if (key !== el.liftPanel.dataset.k) {
        el.liftPanel.dataset.k = key;
        for (const b of el.liftPanel.querySelectorAll('button')) { const k = Number(b.dataset.floor); b.classList.toggle('at', k === at); b.classList.toggle('want', k === L.want); }
      }
    }
  }
  function groundMesh(B, mat, offset) {
    if (B.empty) return null;
    // a constant depth nudge (no slope term), so the ground layers never fight and the depth stays true enough for the
    // ambient occlusion, which a slope-scaled offset would bend at a distance
    if (offset) Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: offset * 6 });
    const m = new THREE.Mesh(B.build(), mat);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  const nscale = (k) => new THREE.Vector2(k, k);
  // (the ground's materials by kind, for the rain and the snow: WEATHER)
  const GROUND = {};
  groundMesh(paveB, GROUND.pave = std({ map: pave2, normalMap: NRM.pave, normalScale: nscale(0.8), color: 0xe6e2da, roughness: 0.92 }));
  groundMesh(grassB, GROUND.grass = std({ map: grassTex, roughness: 0.95 }), -1);
  groundMesh(railB, GROUND.rail = std({ map: railTex, roughness: 0.95 }), -1);
  groundMesh(roadB, GROUND.road = std({ map: road2, normalMap: NRM.road, normalScale: nscale(0.4), roughness: 0.86 }), -2);
  groundMesh(avenueB, GROUND.avenue = std({ map: avenue2, normalMap: NRM.avenue, normalScale: nscale(0.4), roughness: 0.86 }), -2);
  groundMesh(medianB, GROUND.median = std({ map: median2, normalMap: NRM.median, normalScale: nscale(0.4), roughness: 0.88 }), -2);
  groundMesh(junctionB, GROUND.junction = std({ map: junction2, normalMap: NRM.junction, normalScale: nscale(0.4), roughness: 0.86 }), -2);
  groundMesh(cobbleB, GROUND.cobble = std({ map: cobble2, normalMap: NRM.cobble, normalScale: nscale(1.1), roughness: 0.72 }), -2);
  groundMesh(slabB, GROUND.slab = std({ map: slab2, normalMap: NRM.slab, normalScale: nscale(0.8), roughness: 0.8 }), -2);
  groundMesh(plazaB, GROUND.plaza = std({ map: plazaTex, roughness: 0.5 }), -3);
  groundMesh(zebraB, GROUND.zebra = std({ color: 0xe8e8e4, roughness: 0.7 }), -4);
  scene.add(new THREE.Mesh(signB.build(), std({ map: signTex, roughness: 0.45, emissive: 0x2a2a2a, emissiveMap: signTex })));
  scene.add(new THREE.Mesh(tB.build(), std({ map: tTex, roughness: 0.45, transparent: true, alphaTest: 0.5, emissive: 0x2a2a2a, emissiveMap: tTex })));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), std({ color: 0x143644, roughness: 0.07, normalMap: waterNormal, normalScale: new THREE.Vector2(0.32, 0.32) }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true;
  waterNormal.repeat.set(700, 700);
  scene.add(water);
  if (obeliskPos) {
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 37, 8), new THREE.MeshStandardMaterial({ color: 0xc4e6f2, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.6, emissive: 0x3d7c96, emissiveIntensity: 0.35 }));
    ob.position.set(obeliskPos.x, 0.6 + 18.5, obeliskPos.z);
    scene.add(ob);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 37, 6), std({ color: 0x5d666d }));
    core.position.copy(ob.position);
    scene.add(core);
  }

  /* ---------- trees and street lamps, instanced per area so groups out of view are skipped ---------- */
  // trees far away: a trunk and a crown of lumpy leaf clusters, darker underneath where the sun doesn't reach
  const leafMat = std({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const lumpy = (p) => Math.sin(p.x * 3.1 + p.y * 1.7) * Math.cos(p.z * 2.3 - p.y * 2.9) * 0.5 + Math.sin(p.x * 7.3 - p.z * 5.1) * 0.25;
  function treeGeo(crown, crownR, trunkH, crownY, far) {
    const m = new Merger();
    m.add(new THREE.CylinderGeometry(0.12, 0.26, trunkH + 0.8, far ? 5 : 7), 0x4d3c2f, 0, (trunkH + 0.8) / 2, 0);
    if (!far) {
      m.add(new THREE.CylinderGeometry(0.05, 0.1, 1.6, 5), 0x4d3c2f, 0.35, trunkH + 0.4, 0, 0, 0, -0.7);
      m.add(new THREE.CylinderGeometry(0.05, 0.1, 1.5, 5), 0x4d3c2f, -0.3, trunkH + 0.5, 0.15, 0.3, 0, 0.7);
    }
    const start = m.p.length / 3, v = new THREE.Vector3();
    const blobs = far ? [[0, 0.05, 0, 0.95], [0.45, -0.2, 0.2, 0.62], [-0.4, -0.15, -0.3, 0.62]]
      : [[0, 0.1, 0, 0.82], [0.5, -0.2, 0.3, 0.66], [-0.52, -0.12, -0.3, 0.68], [0.12, 0.5, -0.25, 0.6], [-0.3, -0.32, 0.5, 0.58]];
    for (const [bx, by, bz, s] of blobs) {
      const ico = new THREE.IcosahedronGeometry(crownR * s, far ? 0 : 1), pos = ico.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        v.multiplyScalar(1 + lumpy(v.clone().multiplyScalar(1.3 / crownR)) * 0.22);
        pos.setXYZ(i, v.x, v.y * 1.1, v.z);
      }
      ico.computeVertexNormals();
      m.add(ico, crown, bx * crownR, crownY + by * crownR, bz * crownR);
    }
    for (let i = start; i < m.p.length / 3; i++) {
      const k = 0.55 + 0.45 * clamp((m.p[i * 3 + 1] - (crownY - crownR)) / (crownR * 2), 0, 1);
      m.c[i * 3] *= k; m.c[i * 3 + 1] *= k; m.c[i * 3 + 2] *= k;
    }
    return m.build();
  }
  function shareGeometry(src, items, lift) {
    const g = new THREE.BufferGeometry();
    for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
    if (src.index) g.setIndex(src.index);
    let cx = 0, cz = 0, r = 0;
    for (const it of items) { cx += it.x; cz += it.z; }
    cx /= items.length; cz /= items.length;
    for (const it of items) r = Math.max(r, Math.hypot(it.x - cx, it.z - cz));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, lift, cz), r + src.boundingSphere.radius + 2);
    return g;
  }
  function instancedByArea(geo, mat, list, place, shadow = true) {
    const groups = new Map(), out = [];
    for (const it of list) { const k = chunkKey(it.x, it.z); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    for (const items of groups.values()) {
      const m = instanced(shareGeometry(geo, items, 4), mat, items, place, shadow);
      m.frustumCulled = true;
      out.push(m);
    }
    return out;
  }
  const placeTree = (o, t) => { o.position.set(t.x, 0, t.z); o.rotation.y = t.r; o.scale.setScalar(t.s); return t.v < 0.33 ? 0xffffff : t.v < 0.66 ? 0xd6e3c8 : 0xeef2d0; };
  // Trees near by: a trunk with branches up into a crown of leaf cards, small squares that each carry a painted cluster
  // of leaves with gaps you see through, scattered through the crown at every angle. Their normals point out from the
  // middle of the crown so it is lit as one soft mass, and they are darker underneath and inside, where light is scarce.
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const leafTex = (pink) => canvasTex(256, 256, (g, w) => {
    const r = mulberry(pink ? 7 : 3);
    for (let i = 0; i < (pink ? 620 : 520); i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * w * 0.47, x = w / 2 + Math.cos(a) * d, y = w / 2 + Math.sin(a) * d, k = 0.62 + r() * 0.55;
      const leaf = !pink || r() < 0.18, L = leaf ? 7 + r() * 7 : 4 + r() * 3.5;
      g.fillStyle = leaf ? `rgb(${Math.round((48 + r() * 50) * k)},${Math.round((92 + r() * 58) * k)},${Math.round((28 + r() * 30) * k)})`
        : `rgb(${Math.round(240 * k + 15)},${Math.round((176 + r() * 40) * k + 10)},${Math.round((190 + r() * 40) * k + 10)})`;
      g.save(); g.translate(x, y); g.rotate(r() * TAU);
      g.beginPath(); g.ellipse(0, 0, L, L * (leaf ? 0.46 : 0.9), 0, 0, TAU); g.fill();
      if (leaf) { g.fillStyle = 'rgba(20,40,10,.35)'; g.fillRect(-L, -0.5, L * 2, 1); }
      g.restore();
    }
  });
  function crownCards(R, cy, n, size, seed) {
    const r = mulberry(seed), P = [], N = [], U = [], C = [], I = [], ax = new THREE.Vector3(), ay = new THREE.Vector3(), nr = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      let x, y, z;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
      const out = 0.45 + 0.55 * Math.cbrt(x * x + y * y + z * z) / Math.max(1e-3, Math.hypot(x, y, z));
      const cx = x * R * out, cyy = cy + y * R * 1.1 * out, cz = z * R * out;
      ax.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      ay.set(r() - 0.5, r() - 0.5, r() - 0.5); ay.addScaledVector(ax, -ay.dot(ax)).normalize();
      const s = size * (0.75 + r() * 0.5) / 2, base = P.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = cx + (ax.x * a + ay.x * b) * s, py = cyy + (ax.y * a + ay.y * b) * s, pz = cz + (ax.z * a + ay.z * b) * s;
        P.push(px, py, pz); U.push((a + 1) / 2, (b + 1) / 2);
        nr.set(px, (py - cy) * 0.8 + R * 0.25, pz).normalize(); N.push(nr.x, nr.y, nr.z);
        const k = (0.5 + 0.5 * clamp((py - (cy - R)) / (2 * R), 0, 1)) * (0.72 + 0.28 * Math.min(1, Math.hypot(px, py - cy, pz) / R));
        C.push(k, k, k);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I); g.computeBoundingSphere();
    return g;
  }
  function trunkGeo(trunkH, cy, R) {
    const m = new Merger();
    m.add(new THREE.CylinderGeometry(0.11, 0.25, trunkH + 0.9, 8), 0x4a3a2d, 0, (trunkH + 0.9) / 2, 0);
    for (const [a, tilt, len] of [[0, 0.75, 1.9], [2.2, 0.65, 1.8], [4.1, 0.8, 1.7], [1.1, 0.35, 1.6]]) {
      const ox = Math.cos(a) * Math.sin(tilt) * len / 2, oz = Math.sin(a) * Math.sin(tilt) * len / 2, oy = trunkH + 0.4 + Math.cos(tilt) * len / 2;
      m.add(new THREE.CylinderGeometry(0.035, 0.09, len, 5), 0x4a3a2d, ox, oy, oz, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    }
    return m.build();
  }
  // leaves are cut out of the cards, double-sided, and keep the crown's normals on both sides of a card
  function cardMaterial(tex) {
    const m = std({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.78 });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', '')); };
    return m;
  }
  // swapped for the cheap version beyond TREE_NEAR metres
  const TREE_NEAR = 230, treeLods = [], barkMat = std({ vertexColors: true, roughness: 0.95 });
  for (const [list, crown, R, trunk, cy, pink] of [[lindens, 0x4a7d33, 2.3, 3.0, 4.6, false], [cherries, 0xf3b9c8, 2.0, 2.4, 3.8, true]]) {
    const tex = leafTex(pink), mat = cardMaterial(tex);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42, side: THREE.DoubleSide });
    const trunks = instancedByArea(trunkGeo(trunk, cy, R), barkMat, list, placeTree);
    const crowns = instancedByArea(crownCards(R, cy, pink ? 52 : 58, R * 0.85, pink ? 11 : 5), mat, list, placeTree);
    for (const m of crowns) m.customDepthMaterial = depth;
    const far = instancedByArea(treeGeo(crown, R, trunk, cy, true), leafMat, list, placeTree, false);
    far.forEach((m, i) => { m.visible = false; treeLods.push({ near: [trunks[i], crowns[i]], far: m, c: m.geometry.boundingSphere.center }); });
  }
  function updateTreeLods() {
    for (const t of treeLods) {
      const d = Math.hypot(t.c.x - camera.position.x, t.c.z - camera.position.z), close = d < TREE_NEAR;
      t.near[0].visible = t.near[1].visible = close; t.far.visible = !close && d < FAR_CULL;
    }
  }
  // (the lamps' material: its diffuser, the bottom of the head, glows at night; see DAYNIGHT)
  let lampMat = null;
  {
    const m = new Merger();
    m.add(new THREE.CylinderGeometry(0.07, 0.11, 6.0, 8), 0x55595e, 0, 3.0, 0);
    m.add(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), 0x55595e, 0, 0.25, 0);
    m.box(0.07, 0.07, 1.5, 0x55595e, 0, 5.95, 0.7);
    m.box(0.34, 0.12, 0.55, 0x3a3d41, 0, 5.88, 1.4);
    m.box(0.28, 0.03, 0.46, 0xfff6e0, 0, 5.81, 1.4);
    const lampGeo = m.build();
    lampMat = std({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
    for (const lm of instancedByArea(lampGeo, lampMat, lamps, (o, l) => { o.position.set(l.x, 0, l.z); o.rotation.y = l.rot; })) {
      const c = lm.geometry.boundingSphere.center;
      culled.push({ m: lm, x: c.x, z: c.z });
    }
  }

  // whatever stands on a bridge deck out over the water (lamps, signs) stands on the deck, so a boat passes beneath it
  for (const cell of grid) if (cell) for (const o of cell) {
    if (o.y0 !== undefined) continue;
    const [cx, cz] = o.t === 1 ? [o.x, o.z] : o.t === 2 ? [o.cx, o.cz] : [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2];
    if (groundAt(cx, cz) === 2) o.y0 = 0;
  }
  const loadMs = performance.now() - loadStart;
