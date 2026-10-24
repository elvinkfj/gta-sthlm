'use strict';

  /* ---------- Drakens gränd: the yellow house in the middle, with a penthouse on its top three floors ---------- */
  // Modelled by hand in its own frame: local x along the lane, local z from the facade on the lane (z = 0) back into
  // the block, y up. Six storeys. The street door opens on a wide stairwell where the stairs climb in half flights on
  // either side of an open iron lift cage, with a landing on every floor at the front and a half landing at the back.
  // The stairs end on the third floor at the flat's front door; the lift goes on up into the flat. The flat is the whole
  // of the top three floors: the hall, the living room and the kitchen on the first, a library round the lift, a big
  // family room with a billiard table, an office and a sauna on the second, and under the roof beams on the third the
  // bedrooms and their bathroom, all joined by a stair of its own. Walls indoors only block the storey they are on.
  const DRAKEN = (() => {
    const f = streetFrame('gO3c', 'gS312'), W = 15, D = 12, FLOORS = 6, F = FLOOR_H, H = FLOORS * F + 0.6, TOP = (FLOORS - 1) * F, FL = 3;
    const fr = lotFrame(f, -1, f.len / 2 - W / 2, W, f.e.hw + f.e.walk + 0.2), [ox, oz, c, s] = fr;
    const poly = rectPoly(fr, 0, 0, W, D), col = 0xe9c25a;
    const toWorld = (lx, lz) => [ox + lx * c - lz * s, oz + lx * s + lz * c];
    const toLocal = (x, z) => { const dx = x - ox, dz = z - oz; return [dx * c + dz * s, -dx * s + dz * c]; };
    take(poly);
    mapPolys.push([poly, col]);
    // a wall in the local frame; y0 and y1 keep it to the storeys it stands on; see: the camera looks through it
    const wall = (x0, z0, x1, z1, y0, y1 = 99, see) => {
      const [cx, cz] = toWorld((x0 + x1) / 2, (z0 + z1) / 2), o = addOBox(cx, cz, c, s, (x1 - x0) / 2, (z1 - z0) / 2, y1, y0);
      if (see) o.see = true;
      return o;
    };
    // the stairwell: flights up the outer lane (x0-a1) and back down the inner one (b0-x1) on either side of the lift
    // cage (s0-s1); landings at z0-z1, flights to z2, half landings to z3. It serves floors 0 to 3
    const ST = { x0: 0.4, a1: 1.75, s0: 1.75, s1: 3.95, b0: 3.95, x1: 5.3, z0: 0.4, z1: 1.8, z2: 4.4, z3: 6.0 };
    // the lift: the cab inside the cage and the door in the front of it
    const CAB = { x0: 1.85, x1: 3.85, z0: 1.9, z1: 3.5, d0: 2.35, d1: 3.35 };
    // the flat's own stair, between its floors: landing at the front (z0-z1), flights to z2, half landing to z3
    const FS = { x0: 5.5, m: 6.6, x1: 7.7, z0: 2.2, z1: 3.4, z2: 6.0, z3: 7.2 };
    // outer walls, with the street door (x 0.75-2.25) at the bottom of the front
    wall(0, 0, 0.75, 0.4); wall(2.25, 0, W, 0.4); wall(0.75, 0, 2.25, 0.4, 2.85);
    wall(0, D - 0.4, W, D); wall(0, 0, 0.4, D); wall(W - 0.4, 0, W, D);
    // a wall with doorways: holes [a0, a1, y0] are 2.1 m high openings in a wall running along x (or z)
    const wallWith = (along, a0, a1, t0, t1, y0, y1, holes) => {
      const cuts = [a0, a1, ...holes.flatMap((h) => [h[0], h[1]])].sort((p, q) => p - q);
      for (let i = 0; i < cuts.length - 1; i++) {
        const p = cuts[i], q = cuts[i + 1], m = (p + q) / 2;
        if (q - p < 1e-3) continue;
        const ys = holes.filter((h) => h[0] < m && h[1] > m).map((h) => h[2]).sort((u, v) => u - v);
        let y = y0;
        const piece = (ya, yb) => { if (yb - ya > 0.15) along === 'x' ? wall(p, t0, q, t1, ya, yb) : wall(t0, p, t1, q, ya, yb); };
        // (a piece ending just above a floor, or starting a door's height above it, blocks only the storeys it stands on)
        for (const hy of ys) { piece(y, hy + 0.1); y = hy + 2.1; }
        piece(y, y1);
      }
    };
    // round the stairwell: the wall to the flat with the neighbours' doors (shut), the flat's door on the third floor and
    // doorways on the floors above; the back wall, with doorways on the fourth and fifth floors
    wallWith('z', 0.4, 6.2, ST.x1, ST.x1 + 0.2, 0, 99, [[0.6, 1.6, FL * F], [0.6, 1.6, 4 * F], [0.6, 1.6, 5 * F]]);
    wallWith('x', 0.4, ST.x1 + 0.2, ST.z3, ST.z3 + 0.2, 0, 99, [[0.8, 1.7, 4 * F], [0.8, 1.7, 5 * F]]);
    // the lift cage, all the way up (the camera sees through its bars); its doors are walls of their own on each floor
    wall(ST.s0, ST.z1, ST.s0 + 0.1, ST.z2, 0, 99, true); wall(ST.s1 - 0.1, ST.z1, ST.s1, ST.z2, 0, 99, true);
    wall(ST.s0, CAB.z1, ST.s1, ST.z2, 0, 99, true);
    wall(ST.s0, ST.z1, CAB.d0, ST.z1 + 0.1, 0, 99, true); wall(CAB.d1, ST.z1, ST.s1, ST.z1 + 0.1, 0, 99, true);
    const liftDoors = [];
    for (let k = 0; k < FLOORS; k++) liftDoors.push(wall(CAB.d0, ST.z1, CAB.d1, ST.z1 + 0.1, k * F, k * F + 2.2, true));
    // the space under the first flights is shut off, and a railing stops you stepping off the top landing
    wall(ST.b0, ST.z1, ST.x1, ST.z3, 0, F / 2); wall(ST.s0, ST.z2, ST.b0, ST.z3, 0, F / 2);
    wall(ST.x0, ST.z1 - 0.05, ST.a1, ST.z1 + 0.05, FL * F - 0.2, FL * F + 1.1);
    // the flat's stair: a wall down the middle and round the sides, shut off under its first flights, a railing at the top
    wall(FS.m - 0.05, FS.z1, FS.m + 0.05, FS.z2, FL * F); wall(FS.x1, FS.z1, FS.x1 + 0.15, FS.z3 + 0.15, FL * F); wall(FS.x0, FS.z3, FS.x1 + 0.15, FS.z3 + 0.15, FL * F);
    wall(FS.m + 0.05, FS.z1, FS.x1, FS.z2, FL * F, FL * F + F / 2);
    wall(FS.x0, FS.z1 - 0.05, FS.m, FS.z1 + 0.05, 5 * F - 0.2, 5 * F + 1.1);
    // the rooms behind the stairwell, on the floors of the flat: the laundry's door from the kitchen on the third floor
    wallWith('z', 6.2, D - 0.4, ST.x1, ST.x1 + 0.2, 0, 99, [[9.0, 9.9, FL * F]]);
    // the walls between the rooms, storey by storey (a wall built from y0 = k F to k F + 3 blocks that floor only)
    const room = (k, along, a0, a1, t0, t1, doors = []) => wallWith(along, a0, a1, t0, t1, k * F, k * F + 3.0, doors.map(([p, q]) => [p, q, k * F]));
    room(3, 'z', 0.4, FS.z1, 8.9, 9.05, [[1.2, 2.6]]);
    room(4, 'z', 0.4, 7.35, 8.9, 9.05, [[1.0, 2.6], [4.8, 6.6]]); room(4, 'z', 7.35, D - 0.4, 8.9, 9.05);
    room(5, 'z', 0.4, 7.35, 8.9, 9.05, [[4.3, 5.2]]); room(5, 'z', 7.35, D - 0.4, 8.9, 9.05);
    room(5, 'x', 9.05, W - 0.4, 7.35, 7.5, [[9.4, 10.3]]);
    // (the rooms behind the flat's stair, the sauna and the third bedroom, are reached past the end of its east wall)
    // the lift: where the cab is, which floor it is at, where it is going, how far its doors are open
    const lift = { y: 0, floor: 0, want: null, doors: 0, phase: 'idle', t: 0, v: 0 };
    return { f, W, D, FLOORS, F, H, TOP, FL, fr, col, poly, toWorld, toLocal, wall, ST, CAB, FS, lift, liftDoors, doors: [], home: false };
  })();
  // the floor under someone standing at height y in the yellow house and the ceiling over them, or null outside it
  function indoorSpan(x, z, y) {
    const { W, D, F, FL, ST, FS, CAB, lift } = DRAKEN, [lx, lz] = DRAKEN.toLocal(x, z);
    if (lx < 0 || lx > W || lz < 0 || lz > D) return null;
    // in the lift cage: the floor of the cab, wherever it is
    if (lx > ST.s0 && lx < ST.s1 && lz > ST.z1 && lz < ST.z2) return { floor: lift.y, ceil: lift.y + 2.2, lx, lz, cab: true };
    const S = [0], ramp = (first, t, k) => k * F + (first ? t : 2 - t) * F / 2;
    if (lx < ST.x1 + 0.1 && lz < ST.z3 + 0.1) {
      // the stairwell up to the third floor, and the flat's floors over it
      if (lz < ST.z1) for (let k = 1; k <= FL; k++) S.push(k * F);
      else if (lz < ST.z2) {
        // the flights are ramps: up the outer lane to the half landing, back up the inner lane to the next floor
        const t = (lz - ST.z1) / (ST.z2 - ST.z1);
        for (let k = 0; k < FL; k++) S.push(ramp(lx < ST.s0, t, k));
      } else for (let k = 0; k < FL; k++) S.push(k * F + F / 2);
      S.push(4 * F, 5 * F);
    } else if (lx > FS.x0 - 0.1 && lx < FS.x1 + 0.1 && lz > FS.z1 && lz < FS.z3 + 0.1) {
      // the flat's own stair: open from the third floor up to the roof
      S.push(FL * F);
      if (lz < FS.z2) { const t = (lz - FS.z1) / (FS.z2 - FS.z1); for (const k of [FL, FL + 1]) S.push(ramp(lx < FS.m, t, k)); }
      else for (const k of [FL, FL + 1]) S.push(k * F + F / 2);
    } else S.push(FL * F, 4 * F, 5 * F);
    let floor = 0, ceil = 6 * F - 0.3;
    for (const h of S) {
      if (h <= y + 0.5 && h > floor) floor = h;
      if (h > 0 && h - 0.35 >= y + 1.2 && h - 0.35 < ceil) ceil = h - 0.35;
    }
    return { floor, ceil, lx, lz };
  }

  /* ---------- the rest of the city: buildings along every street ---------- */
  // the workshop (src/workshop.js) takes the place of one house on the west side of Götgatan, between Åsögatan and
  // Skånegatan: that house is a ghost (see addBuilding), and where it would have stood is kept here (fr, w, d)
  const WORKSHOP_LOT = { e: nearestEdge(75, 1247, (x) => x.name === 'Götgatan').e, side: 1, s0: 95, s1: 113, fr: null, w: 0, d: 0, obstacle: null };
  for (const e of edges) {
    if (e.bridge) continue;
    const f = edgeFrame(e.a, e.b), set = e.hw + e.walk + 0.2;
    for (const side of [1, -1]) {
      let s = Math.max(1, nodes[e.a].r - 4);
      const end = e.len - Math.max(1, nodes[e.b].r - 4);
      while (s < end - 5) {
        const S = styleAt(f.A.x + f.ux * s + f.rx * side * (set + 6), f.A.z + f.uz * s + f.rz * side * (set + 6));
        let lot = rr(S.lot[0], S.lot[1]);
        if (end - (s + lot) < S.lot[0] * 0.6) lot = end - s;
        if (lot < 5) break;
        if (S.sparse && rand() > S.sparse) { s += lot + rr(10, 40); continue; }
        let built = false;
        for (const depth of [S.depth * rr(0.85, 1.15), S.depth * 0.6]) {
          const fr = lotFrame(f, side, s, lot, set), L = WORKSHOP_LOT;
          if (fits(rectPoly(fr, 0, 0, lot, depth))) {
            const ghost = e === L.e && side === L.side && s < L.s1 - 1 && s + lot > L.s0 + 1;
            if (ghost) Object.assign(L, { fr, w: lot, d: depth });
            addBuilding(fr, lot, depth, S, ghost ? { ghost: L } : undefined); built = true; break;
          }
        }
        s += built ? lot : 3;
      }
    }
  }
  // the old town is built solid: whatever is left inside the blocks behind the street fronts gets houses too, turned
  // to line up with the nearest lane, so from above Gamla stan is one sea of roofs cut by narrow lanes
  for (const L of LANDS) {
    if (L.name !== 'Gamla stan') continue;
    const [x0, z0, x1, z1] = polyBox(L.poly);
    for (let z = z0 + 3; z < z1; z += 4) for (let x = x0 + 3; x < x1; x += 4) {
      if (!solidLand(x, z)) continue;
      const ne = nearestEdge(x, z);
      if (!ne.e) continue;
      const A = nodes[ne.e.a], B = nodes[ne.e.b], c = (B.x - A.x) / ne.e.len, s = (B.z - A.z) / ne.e.len;
      for (const [w, d] of [[11, 10], [8, 8], [6, 6], [4.5, 4.5]]) {
        const fr = [x - (w / 2) * c + (d / 2) * s, z - (w / 2) * s - (d / 2) * c, c, s];
        if (fits(rectPoly(fr, 0, 0, w, d))) { addBuilding(fr, w, d, STYLE.gamla, { simple: true }); break; }
      }
    }
  }
  // further out, the city goes on in blocks without streets you can drive on
  const FILLER = [
    { poly: [[-845, -1165], [55, -1195], [80, -1450], [-845, -1450]], ang: -0.139, S: STYLE.norr },
    { poly: [[-845, -1160], [-778, -1150], [-748, -1010], [-712, -866], [-845, -872]], ang: -0.139, S: STYLE.norr },
    { poly: [[60, -1196], [1000, -1196], [1000, -1450], [80, -1450]], ang: 0, S: STYLE.oster },
    { poly: [[938, -588], [1150, -568], [1150, -1196], [938, -1196]], ang: 0, S: STYLE.oster },
    { poly: [[-1395, -900], [-913, -900], [-913, -1450], [-1395, -1450]], ang: 0, S: STYLE.kungs },
    { poly: [[-1250, 778], [-860, 778], [-955, 1212], [-1250, 1212]], ang: -0.38, S: STYLE.soder },
    { poly: [[-945, 1216], [-566, 1152], [-563, 1505], [-945, 1505]], ang: 0, S: STYLE.soder },
    { poly: [[-1250, 1526], [1250, 1526], [1250, 1700], [-1250, 1700]], ang: 0, S: STYLE.soder },
    { poly: [[612, 768], [1250, 805], [1250, 1522], [612, 1500]], ang: 0.03, S: STYLE.soder },
    // the new districts round the old city
    { poly: [[-1690, -1462], [-60, -1462], [-60, -2035], [-1690, -2060]], ang: -0.03, S: STYLE.norr },
    { poly: [[-2690, -1262], [-1590, -1262], [-1590, -2085], [-2690, -2090]], ang: 0, S: STYLE.norr },
    { poly: [[-2690, -2100], [-80, -2060], [-80, -2390], [-2690, -2390]], ang: 0, S: STYLE.city },
    { poly: [[60, -1460], [1250, -1460], [1250, -1630], [60, -1690]], ang: 0, S: STYLE.oster },
    { poly: [[0, -1720], [900, -1680], [900, -2390], [0, -2390]], ang: 0, S: STYLE.kungs },
    { poly: [[1800, -1960], [2900, -2050], [2880, -2390], [1800, -2390]], ang: 0, S: STYLE.oster },
    { poly: [[-2690, -100], [-1590, -80], [-1590, -1175], [-2690, -1180]], ang: 0, S: STYLE.kungs },
    { poly: [[1250, 815], [1940, 900], [1960, 1450], [1700, 1930], [1250, 1960]], ang: 0.03, S: STYLE.soder },
    { poly: [[-1250, 1700], [1250, 1700], [1250, 1975], [-1250, 1955]], ang: 0, S: STYLE.soder },
    { poly: [[-1690, 800], [-1260, 790], [-1260, 1700], [-1250, 1950], [-1600, 1800], [-1690, 1500]], ang: 0, S: STYLE.soder },
    { poly: [[700, 2165], [1990, 2160], [1990, 2700], [700, 2700]], ang: 0, S: STYLE.sjostad },
    { poly: [[-1000, 2170], [700, 2165], [700, 2990], [-1000, 2990]], ang: 0.2, S: STYLE.funkis, slabs: true },
    { poly: [[700, 2700], [2050, 2700], [2050, 2990], [700, 2990]], ang: 0.2, S: STYLE.funkis, slabs: true },
    { poly: [[-2690, 2060], [-1000, 2170], [-1000, 2990], [-2690, 2990]], ang: -0.3, S: STYLE.funkis, slabs: true }
  ];
  for (const F of FILLER) {
    const c = Math.cos(F.ang), s = Math.sin(F.ang), [x0, z0, x1, z1] = polyBox(F.poly), BW = 76, BD = 64, GAP = 14;
    // walk a rotated grid of blocks over the region; each block gets four wings round a courtyard (in the suburbs two
    // long lamellhus side by side)
    const R = Math.hypot(x1 - x0, z1 - z0) / 2 + BW, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (let u = -R; u < R; u += BW + GAP) for (let v = -R; v < R; v += BD + GAP) {
      const ox = mx + u * c - v * s, oz = mz + u * s + v * c, fr = [ox, oz, c, s];
      const [bx, bz] = centroid(rectPoly(fr, 0, 0, BW, BD));
      if (!pointInPoly(F.poly, bx, bz)) continue;
      const D = F.slabs ? 11 : 13;
      for (const [a, b, w, d] of F.slabs ? [[4, 2, BW - 8, D], [4, BD - D - 2, BW - 8, D]] : [[0, 0, BW, D], [0, BD - D, BW, D], [0, D, D, BD - 2 * D], [BW - D, D, D, BD - 2 * D]]) {
        const sub = [ox + a * c - b * s, oz + a * s + b * c, c, s];
        if (fits(rectPoly(sub, 0, 0, w, d), 1)) addBuilding(sub, w, d, F.S, { simple: true });
      }
    }
  }

  // woods all over Djurgården and Långholmen, wherever there is room between the houses and the roads
  for (const [name, n] of [['Djurgården', 650], ['Långholmen', 80]]) treesIn(LANDS.find((L) => L.name === name).poly, n, lindens, 0.9, 1.35);

  /* ---------- boats ---------- */
  // (everything afloat is modelled from a waterline 1.6 m below the quays and lowered to the water)
  const WL = WATER_Y + 1.6;
  function boat(bx, cz, L, ang = 0) {
    const B = cityAt(bx, cz), W = 5;
    B.setFrame(bx, cz, Math.cos(ang), Math.sin(ang));
    B.hexa([[-L / 2 + 1, WL - 2.4, -W / 2 + 0.8], [L / 2 - 3, WL - 2.4, -W / 2 + 0.8], [L / 2 - 3, WL - 2.4, W / 2 - 0.8], [-L / 2 + 1, WL - 2.4, W / 2 - 0.8],
      [-L / 2, WL - 0.3, -W / 2], [L / 2, WL - 0.3, -0.4], [L / 2, WL - 0.3, 0.4], [-L / 2, WL - 0.3, W / 2]], 0xf2f2ee);
    B.box(-6, WL - 0.3, -1.8, 4, WL + 1.9, 1.8, 0xf6f6f2);
    B.box(-6.05, WL + 0.7, -1.85, 4.05, WL + 1.4, 1.85, 0x2a3946);
    B.box(1, WL + 1.9, -1.4, 4, WL + 3.4, 1.4, 0xf6f6f2);
    B.box(1.0, WL + 2.5, -1.45, 4.05, WL + 3.0, 1.45, 0x2a3946);
    B.prism(-2, 0, 0.6, WL + 1.9, WL + 4.6, 10, 0x1c1d20);
    B.prism(-2, 0, 0.62, WL + 3.6, WL + 4.1, 10, 0xf2b705, 0.62, false);
    B.setFrame();
    const c = Math.cos(ang), sn = Math.sin(ang);
    addOBox(bx, cz, c, sn, L / 2, W / 2, WL + 4.6);
  }
  // moored along Strandvägen, just off the quay (which runs slightly south-east)
  for (const x of [450, 530, 610, 690, 780, 860, 940]) boat(x, -632 + (x - 420) * 0.0897 + 10, 20, 0.09);
  for (const z of [10, 250, 310]) boat(250, z, 20, Math.PI / 2);
  for (const s of [45, 110]) boat(...LOT.at(s, 39.5), 20, Math.atan2(LOT.f.uz, LOT.f.ux));
  // af Chapman, the white full-rigged ship moored at Skeppsholmen
  {
    const B = cityAt(426, 60), x = 426;
    B.hexa([[x - 3, WL - 3, 34], [x + 3, WL - 3, 34], [x + 3, WL - 3, 86], [x - 3, WL - 3, 86], [x - 4.6, WL + 1.4, 28], [x + 4.6, WL + 1.4, 28], [x + 4.6, WL + 1.4, 88], [x - 4.6, WL + 1.4, 88]], 0xf4f4f0);
    B.box(x - 4.7, WL + 1.0, 28, x + 4.7, WL + 1.6, 88, 0x2a2a2a);
    B.box(x - 0.2, WL + 1.2, 18, x + 0.2, WL + 1.6, 28, 0x8a6a46);
    for (const [z, h] of [[40, 38], [58, 40], [76, 32]]) {
      B.box(x - 0.25, WL + 1.4, z - 0.25, x + 0.25, WL + 1.4 + h, z + 0.25, 0x6b4f35);
      for (let k = 0; k < 4; k++) { const y = WL + 8 + k * (h - 10) / 3; B.box(x - 7 + k * 1.1, y, z - 0.12, x + 7 - k * 1.1, y + 0.25, z + 0.12, 0x6b4f35); }
    }
    addBox(x - 4.8, 28, x + 4.8, 88, 3);
    mapPolys.push([axisPoly(x - 4.6, 28, x + 4.6, 88), 0xf4f4f0]);
    mapLabels.push(['af Chapman', x, 58, 'landmark']);
  }
  // a Viking Line ferry at Stadsgården
  {
    const B = cityAt(430, 650), x0 = 340, x1 = 520, z0 = 637, z1 = 663;
    B.hexa([[x0 + 10, WL - 3, z0 + 4], [x1 - 22, WL - 3, z0 + 4], [x1 - 22, WL - 3, z1 - 4], [x0 + 10, WL - 3, z1 - 4], [x0, WL + 6, z0], [x1, WL + 6, (z0 + z1) / 2 - 2], [x1, WL + 6, (z0 + z1) / 2 + 2], [x0, WL + 6, z1]], 0xc8102e);
    B.box(x0 + 2, WL + 6, z0 + 0.5, x1 - 26, WL + 18, z1 - 0.5, 0xf4f4f2);
    for (let y = WL + 8; y < WL + 18; y += 3) B.box(x0 + 1.8, y, z0 + 0.3, x1 - 25.8, y + 1.1, z1 - 0.3, 0x2a3946);
    B.box(x0 + 20, WL + 18, z0 + 3, x1 - 50, WL + 22, z1 - 3, 0xf4f4f2);
    B.box(x0 + 40, WL + 22, (z0 + z1) / 2 - 3, x0 + 52, WL + 30, (z0 + z1) / 2 + 3, 0xc8102e);
    addBox(x0, z0, x1, z1, 30);
    mapPolys.push([axisPoly(x0, z0, x1, z1), 0xf4f4f2]);
  }

  /* ---------- street signs and T-bana signs ---------- */
  const SIGN_NAMES = [...new Set(edges.map((e) => e.name))];
  const SIGN_ROWS = Math.ceil(SIGN_NAMES.length / 2);
  const signTex = canvasTex(1024, 64 * SIGN_ROWS, (g) => {
    SIGN_NAMES.forEach((name, i) => {
      const x = (i % 2) * 512, y = Math.floor(i / 2) * 64;
      g.fillStyle = '#0a5ba8'; roundRect(g, x + 2, y + 3, 508, 58, 8); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; roundRect(g, x + 9, y + 10, 494, 44, 5); g.stroke();
      g.fillStyle = '#ffffff'; g.font = '700 31px Overpass, "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, x + 256, y + 34, 460);
    });
  });
  function signFace(name, cx, y, cz, ux, uz) {
    const i = SIGN_NAMES.indexOf(name);
    if (i < 0) return;
    const H = 64 * SIGN_ROWS, u0 = (i % 2) * 0.5, u1 = u0 + 0.5, row = Math.floor(i / 2);
    const v1 = 1 - (row * 64 + 3) / H, v0 = 1 - (row * 64 + 61) / H, hw = 1.3, y0 = y - 0.165, y1 = y + 0.165, nx = -uz * 0.012, nz = ux * 0.012;
    const P = (s, yy, sd) => [cx + ux * s + nx * sd, yy, cz + uz * s + nz * sd];
    const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    signB.quad(P(-hw, y0, 1), P(hw, y0, 1), P(hw, y1, 1), P(-hw, y1, 1), 0xffffff, uv, [nx, 0, nz]);
    signB.quad(P(hw, y0, -1), P(-hw, y0, -1), P(-hw, y1, -1), P(hw, y1, -1), 0xffffff, uv, [-nx, 0, -nz]);
  }
  nodes.forEach((n, ni) => {
    const inc = n.all.map((i) => edges[i]);
    if (new Set(inc.map((e) => e.name)).size < 2) return;
    const dir = (e) => { const o = nodes[e.a === ni ? e.b : e.a]; const l = Math.hypot(o.x - n.x, o.z - n.z); return [(o.x - n.x) / l, (o.z - n.z) / l]; };
    let done = false;
    for (let i = 0; i < inc.length && !done; i++) for (let j = 0; j < inc.length && !done; j++) {
      const e1 = inc[i], e2 = inc[j];
      if (e1.name === e2.name) continue;
      const u1 = dir(e1), u2 = dir(e2), bx = u1[0] + u2[0], bz = u1[1] + u2[1], bl = Math.hypot(bx, bz);
      if (bl < 0.3) continue;
      const half = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1)) / 2;
      const dist = Math.min(22, (Math.max(e1.hw, e2.hw) + 1.4) / Math.max(0.2, Math.sin(half)));
      const px = n.x + (bx / bl) * dist, pz = n.z + (bz / bl) * dist;
      if (!walkable(px, pz) || blockedAt(px, pz, 0.4)) continue;
      const B = cityAt(px, pz);
      B.box(px - 0.06, 0, pz - 0.06, px + 0.06, 3.5, pz + 0.06, 0x5d646a);
      addCircle(px, pz, 0.1);
      signFace(e1.name, px, 3.2, pz, u1[0], u1[1]);
      signFace(e2.name, px, 2.78, pz, u2[0], u2[1]);
      done = true;
    }
  });
  const STATIONS = [['T-Centralen', -335, -640], ['Hötorget', -470, -900], ['Östermalmstorg', 300, -880], ['Kungsträdgården', 100, -500], ['Gamla stan', -300, 330],
    ['Slussen', 70, 705], ['Mariatorget', -440, 1045], ['Medborgarplatsen', 95, 1392], ['Rådhuset', -990, -430]];
  for (const [name, sx, sz] of STATIONS) {
    let spot = null;
    for (let r = 0; r < 30 && !spot; r += 2) for (let a = 0; a < TAU && !spot; a += 0.5) {
      const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r, ne = nearestEdge(x, z);
      if (walkable(x, z) && !blockedAt(x, z, 0.6) && ne.e && ne.d > ne.e.hw + 0.6 && ne.d < ne.e.hw + ne.e.walk + 0.5) spot = [x, z];
    }
    if (!spot) continue;
    const [px, pz] = spot, B = cityAt(px, pz);
    B.box(px - 0.07, 0, pz - 0.07, px + 0.07, 3.0, pz + 0.07, 0x5d646a);
    addCircle(px, pz, 0.12);
    const s = 0.42, y = 3.3;
    tB.quad([px - s, y - s, pz + 0.02], [px + s, y - s, pz + 0.02], [px + s, y + s, pz + 0.02], [px - s, y + s, pz + 0.02], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, 1]);
    tB.quad([px + s, y - s, pz - 0.02], [px - s, y - s, pz - 0.02], [px - s, y + s, pz - 0.02], [px + s, y + s, pz - 0.02], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, -1]);
    mapLabels.push([name, px, pz, 'tbana']);
  }

  /* ---------- Globen and Kaknästornet, seen from anywhere ---------- */
  // They stand where they stand, but are seen from all over town: hazed by hand instead of by the fog, and when the
  // camera is too far off for them to fit inside the view distance, drawn smaller at the edge of it in their direction.
  const FAR = [];
  {
    const hazeLin = new THREE.Color().setRGB(HAZE[0], HAZE[1], HAZE[2]).convertSRGBToLinear();
    const far = (geo, col, x, z, vertexColors, map) => {
      const mat = std({ color: col, roughness: 0.35, metalness: 0.05, fog: false, vertexColors: !!vertexColors, map: map || null });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0, z); m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      FAR.push({ m, x, z, base: mat.color.clone(), haze: hazeLin });
    };
    const globe = new THREE.SphereGeometry(GLOBE.R, 56, 30, 0, TAU, 0, Math.acos(-GLOBE.y / GLOBE.R));
    globe.translate(0, GLOBE.y, 0);
    // the white panels of the ball, in a grid of seams
    const panels = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c4c7c9';
      for (let i = 0; i < 48; i++) g.fillRect((i / 48) * w, 0, 1.5, h);
      for (let j = 1; j < 24; j++) g.fillRect(0, (j / 24) * h, w, 1.5);
    });
    far(globe, 0xffffff, GLOBE.x, GLOBE.z, false, panels);
    const kak = new Builder();
    kak.prism(0, 0, 9, 0, 3, 8, 0xc9c6bf, 6.5);
    kak.prism(0, 0, 5.2, 3, 118, 8, 0xc9c6bf, 4.4);
    kak.prism(0, 0, 9.5, 118, 121, 12, 0xd9d6cf, 9.5);
    kak.prism(0, 0, 9.4, 121, 129, 12, 0x2a3946, 9.4);
    kak.prism(0, 0, 9.6, 129, 132, 12, 0xd9d6cf, 7);
    kak.prism(0, 0, 1.6, 132, 155, 8, 0xd8203a, 0.9);
    kak.prism(0, 0, 0.9, 155, 172, 6, 0xe8e8e8, 0.2);
    far(kak.build(), 0xffffff, KAKNAS.x, KAKNAS.z, true);
  }
  function updateFar() {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, MAXD = 2150;
    for (const f of FAR) {
      const dx = f.x - cx, dz = f.z - cz, d = Math.hypot(dx, dz), s = d > MAXD ? MAXD / d : 1;
      f.m.position.set(cx + dx * s, cy * (1 - s), cz + dz * s);
      f.m.scale.setScalar(s);
      const k = clamp((d - 250) / 2400, 0, 0.72);
      f.m.material.color.copy(f.base).multiplyScalar(1 - k);
      f.m.material.emissive.copy(f.haze).multiplyScalar(k);
    }
  }

  /* ---------- finer materials ---------- */
  // The ground gets sharper textures with relief: a normal map worked out from each texture's brightness, so stones
  // stand up out of their joints and the asphalt is rough. Drawn with a random sequence of their own, so the city
  // itself stays exactly as it was laid out above.
  let tseed = 77;
  const trand = () => { tseed = (tseed * 16807) % 2147483647; return (tseed - 1) / 2147483646; };
  const trr = (a, b) => a + trand() * (b - a);
  function tgrain(g, x, y, w, h, n, dark, light, size) {
    for (let i = 0; i < n; i++) { g.fillStyle = trand() < 0.5 ? dark : light; const s = size * (0.6 + trand()); g.fillRect(x + trand() * w, y + trand() * h, s, s); }
  }
  function tblotches(g, w, h, n, rgb, alpha, rmin, rmax) {
    for (let i = 0; i < n; i++) {
      const x = trand() * w, y = trand() * h, r = trr(rmin, rmax), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${alpha * (0.4 + trand() * 0.6)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      // wrapped round the edges, so the texture tiles without a seam
      for (const [ox, oy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) if (x + ox - r < w && x + ox + r > 0 && y + oy - r < h && y + oy + r > 0) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    }
  }
  // fine grain, pixel by pixel (much faster than drawing it speck by speck): a share p of the pixels darkened by up to
  // dark, as many lightened by up to light
  function pixelNoise(g, x0, y0, w, h, p, dark, light) {
    const img = g.getImageData(x0, y0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = trand();
      if (r < p) { const k = 1 - dark * trand(); d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
      else if (r > 1 - p) { const k = light * trand(); d[i] += (255 - d[i]) * k; d[i + 1] += (255 - d[i + 1]) * k; d[i + 2] += (255 - d[i + 2]) * k; }
    }
    g.putImageData(img, x0, y0);
  }
  // tangent-space normals from brightness (bright stands up), wrapping at the edges
  function normalFrom(tex, strength, invert) {
    const src = tex.image, w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) H[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255 * (invert ? -1 : 1);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const og = out.getContext('2d'), img = og.createImageData(w, h), o = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = (y + h - 1) % h, yd = (y + 1) % h;
      const gu = (H[y * w + xr] - H[y * w + xl]) * strength, gv = (H[yu * w + x] - H[yd * w + x]) * strength, l = Math.hypot(gu, gv, 1), i = (y * w + x) * 4;
      o[i] = (-gu / l * 0.5 + 0.5) * 255; o[i + 1] = (-gv / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(out);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; t.repeat.copy(tex.repeat);
    return t;
  }
  // asphalt: fine aggregate, patches of repair and wear, oil
  function asphalt2(g, w, h) {
    g.fillStyle = '#43464a'; g.fillRect(0, 0, w, h);
    tblotches(g, w, h, 70, '24,26,29', 0.14, w * 0.03, w * 0.14);
    tblotches(g, w, h, 45, '118,120,124', 0.06, w * 0.03, w * 0.1);
    pixelNoise(g, 0, 0, w, h, 0.14, 0.42, 0.16);
    tgrain(g, 0, 0, w, h, w * h * 0.004, 'rgba(12,13,15,.4)', 'rgba(175,176,180,.22)', 1.8);
  }
  const crack = (g, x, y, n, step, w) => {
    g.strokeStyle = 'rgba(16,17,19,.32)'; g.lineWidth = w * 0.6; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < n; k++) { x += trr(-step, step); y += trr(step * 0.4, step * 1.6); g.lineTo(x, y); }
    g.stroke();
  };
  const paint = (g, x, y, w, h) => { g.fillStyle = '#e7e8e3'; g.fillRect(x, y, w, h); tgrain(g, x, y, w, h, w * h * 0.08, 'rgba(70,70,70,.4)', 'rgba(255,255,255,.25)', 1.3); };
  const road2 = canvasTex(512, 1024, (g, w, h) => {
    asphalt2(g, w, h);
    // polished, darker wheel tracks in both lanes
    for (const u of [0.225, 0.358, 0.642, 0.775]) {
      const gr = g.createLinearGradient(u * w - 26, 0, u * w + 26, 0);
      gr.addColorStop(0, 'rgba(14,15,17,0)'); gr.addColorStop(0.5, 'rgba(14,15,17,.2)'); gr.addColorStop(1, 'rgba(14,15,17,0)');
      g.fillStyle = gr; g.fillRect(u * w - 26, 0, 52, h);
    }
    for (let i = 0; i < 7; i++) crack(g, trand() * w, trand() * h, 10, 18, 2.2);
    paint(g, w / 2 - 9, h * 0.05, 18, h * 0.25);
  }, true, false, true);
  const avenue2 = canvasTex(512, 1024, (g, w, h) => {
    asphalt2(g, w, h);
    for (let i = 0; i < 6; i++) crack(g, trand() * w, trand() * h, 10, 18, 2.2);
    paint(g, w / 2 - 13, 0, 7, h); paint(g, w / 2 + 6, 0, 7, h);
    for (const u of [0.25, 0.75]) paint(g, u * w - 5, h * 0.05, 10, h * 0.25);
  }, true, false, true);
  const median2 = canvasTex(512, 1024, (g, w, h) => {
    asphalt2(g, w, h);
    g.fillStyle = '#a7a39b'; g.fillRect(w * 0.41, 0, w * 0.18, h);
    g.fillStyle = '#4c7535'; g.fillRect(w * 0.425, 0, w * 0.15, h);
    tgrain(g, w * 0.425, 0, w * 0.15, h, 16000, 'rgba(28,48,18,.5)', 'rgba(140,180,90,.4)', 2.4);
    for (const u of [0.2, 0.8]) paint(g, u * w - 5, h * 0.05, 10, h * 0.25);
  }, true, false, true);
  const junction2 = canvasTex(512, 512, (g, w, h) => { asphalt2(g, w, h); for (let i = 0; i < 4; i++) crack(g, trand() * w, trand() * h, 9, 20, 2.2); }, true, false, true);
  // gatsten: rows of rounded granite setts, each shaded like a little dome, in sand-filled joints
  const cobble2 = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4640'; g.fillRect(0, 0, w, h);
    pixelNoise(g, 0, 0, w, h, 0.2, 0.5, 0.25);
    const s = 16;
    for (let y = 0; y < h; y += s) {
      const off = (y / s) % 2 ? s / 2 : 0;
      for (let x = -s; x < w + s; x += s) {
        const v = Math.round(trr(105, 165)), t = trr(-10, 10), sx = x + off + 1.2 + trr(-0.8, 0.8), sw = s - 2.4 + trr(-1, 1), sh = s - 2.6;
        const gr = g.createRadialGradient(sx + sw * 0.35, y + sh * 0.3, 1, sx + sw / 2, y + sh / 2, sw * 0.75);
        gr.addColorStop(0, `rgb(${v + 38 + t},${v + 34},${v + 28 - t})`); gr.addColorStop(0.6, `rgb(${v + t},${v - 3},${v - 9 - t})`); gr.addColorStop(1, `rgb(${v - 45},${v - 47},${v - 50})`);
        g.fillStyle = gr; roundRect(g, sx, y + 1.3, sw, sh, 4.5); g.fill();
      }
    }
    tblotches(g, w, h, 26, '35,32,28', 0.2, 14, 50);
    pixelNoise(g, 0, 0, w, h, 0.05, 0.25, 0.15);
  }, true, false, true);
  // granite slabs (gågator, torg, the bridges' pavements) and the 50 cm concrete pavement slabs
  const slab2 = canvasTex(512, 512, (g, w, h) => {
    const rows = 5, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -trr(0, 80);
      while (x < w) {
        const sw = trr(68, 128), v = Math.round(trr(166, 196));
        g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(x, r * rh, sw, rh);
        g.fillStyle = 'rgba(60,56,50,.7)'; g.fillRect(x, r * rh, 2.5, rh);
        x += sw;
      }
      g.fillStyle = 'rgba(60,56,50,.7)'; g.fillRect(0, r * rh, w, 2.5);
    }
    tblotches(g, w, h, 22, '80,76,70', 0.12, 12, 48);
    pixelNoise(g, 0, 0, w, h, 0.1, 0.3, 0.3);
  }, true, false, true);
  const pave2 = canvasTex(512, 512, (g, w, h) => {
    const n = 8, s = w / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = Math.round(176 + trr(-12, 12));
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(c * s, r * s, s, s);
      // the edges of each slab worn a little lighter, the joints dark
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(c * s + 3, r * s + 3, s - 6, 3); g.fillRect(c * s + 3, r * s + 3, 3, s - 6);
    }
    tblotches(g, w, h, 40, '90,85,78', 0.12, 10, 46);
    pixelNoise(g, 0, 0, w, h, 0.12, 0.25, 0.22);
    g.fillStyle = 'rgba(62,58,52,.75)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1.5, 0, 3, h); g.fillRect(0, i * s - 1.5, w, 3); }
  }, true, false, true);
  const NRM = {
    road: normalFrom(road2, 2.2), avenue: normalFrom(avenue2, 2.2), median: normalFrom(median2, 2.2), junction: normalFrom(junction2, 2.2),
    cobble: normalFrom(cobble2, 5), slab: normalFrom(slab2, 2.5), pave: normalFrom(pave2, 2.5),
    // windows sit in from the plaster, the frames and sills stand out
    facade: normalFrom(facadeTex, 2.4), modern: normalFrom(modernTex, 1.6)
  };
  // roofs and plain walls have no texture of their own: the shader draws standing-seam sheet metal on the grey and
  // copper roofs, rows of tiles on the red ones, and a little weathering on everything, from the world position
  function roofDetail(sh) {
    sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvWNrm = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = 'varying vec3 vWPos;\nvarying vec3 vWNrm;\nfloat rhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat rnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rhash(i), rhash(i + vec2(1.0, 0.0)), f.x), mix(rhash(i + vec2(0.0, 1.0)), rhash(i + vec2(1.0, 1.0)), f.x), f.y); }\n' +
      sh.fragmentShader.replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '\t{',
        '\t\tvec3 wn = normalize( vWNrm ); float slope = wn.y;',
        '\t\tfloat grime = rnoise( vWPos.xz * 0.35 + vWPos.y * 0.2 ) * 0.5 + rnoise( vWPos.xz * 2.3 + vWPos.yy ) * 0.25;',
        '\t\tif ( slope > 0.25 && slope < 0.97 ) {',
        '\t\t\tvec2 fall = normalize( wn.xz ); float across = dot( vWPos.xz, vec2( -fall.y, fall.x ) ), down = dot( vWPos.xz, fall );',
        '\t\t\tbool tiles = vColor.r > vColor.g * 1.5 && vColor.r > 0.12;',
        '\t\t\tfloat k;',
        '\t\t\tif ( tiles ) { float row = floor( down / 0.32 ); float u = fract( ( across + row * 0.15 ) / 0.3 ); float v = fract( down / 0.32 ); k = 0.82 + 0.18 * smoothstep( 0.0, 0.25, v ) * ( 1.0 - smoothstep( 0.88, 1.0, u ) ) + 0.06 * ( rhash( vec2( floor( ( across + row * 0.15 ) / 0.3 ), row ) ) - 0.5 ); }',
        '\t\t\telse { float u = fract( across / 0.55 ); k = 1.0 - 0.28 * ( 1.0 - smoothstep( 0.0, 0.05, u ) ) + 0.12 * smoothstep( 0.05, 0.15, u ) * ( 1.0 - smoothstep( 0.15, 0.3, u ) ); }',
        '\t\t\tdiffuseColor.rgb *= k * ( 0.92 + grime * 0.16 );',
        '\t\t} else if ( slope >= 0.97 ) diffuseColor.rgb *= 0.85 + grime * 0.25;',
        '\t\telse diffuseColor.rgb *= 0.93 + grime * 0.12 - 0.1 * ( 1.0 - smoothstep( 0.0, 1.5, vWPos.y ) );',
        '\t}'
      ].join('\n'));
  }

  /* ---------- assemble the meshes ---------- */
  const facadeMat = std({ map: facadeTex, roughnessMap: facadeRough, roughness: 1, vertexColors: true, normalMap: NRM.facade, normalScale: new THREE.Vector2(0.9, 0.9) });
  const modernMat = std({ map: modernTex, roughnessMap: modernRough, roughness: 1, metalness: 0.2, vertexColors: true, normalMap: NRM.modern, normalScale: new THREE.Vector2(0.6, 0.6) });
  const solidMat = std({ vertexColors: true, roughness: 0.82 });
  solidMat.onBeforeCompile = roofDetail;
  STATION.finish(facadeMat, solidMat, modernMat);
  // (each square of the city, and each group of trees and lamps, is left out of the picture beyond FAR_CULL metres,
  // well inside the fog: the town is too big to draw all of it)
  const FAR_CULL = 1650, culled = [];
  for (const [key, B] of chunks) {
    const [ix, iz] = key.split(',').map(Number);
    for (const [b, mat] of [[B, facadeMat], [B.altB, modernMat], [B.solidB, solidMat]]) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      culled.push({ m, x: (ix + 0.5) * CHUNK, z: (iz + 0.5) * CHUNK });
    }
  }
  function cullFar() {
    const px = camera.position.x, pz = camera.position.z;
    for (const c of culled) c.m.visible = Math.hypot(c.x - px, c.z - pz) < FAR_CULL;
  }
