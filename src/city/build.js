'use strict';

  /* ================= the city: ground, quays, streets ================= */
  const AO = (y) => (y >= 4.5 ? 1 : y <= 0 ? 0.6 : 0.6 + 0.4 * Math.sqrt(y / 4.5));
  // buildings are merged per 240 m square, so whole squares out of view are skipped when drawing
  const CHUNK = 240, chunks = new Map();
  const chunkKey = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  function cityAt(x, z) {
    const k = chunkKey(x, z);
    if (!chunks.has(k)) chunks.set(k, new Builder({ split: true, ao: AO }));
    return chunks.get(k);
  }
  const paveB = new Builder(), roadB = new Builder(), avenueB = new Builder(), medianB = new Builder(), junctionB = new Builder();
  const cobbleB = new Builder(), slabB = new Builder(), zebraB = new Builder(), signB = new Builder(), tB = new Builder();
  const plazaB = new Builder(), grassB = new Builder(), railB = new Builder();
  const mapPolys = [], mapGreens = [], mapSquares = [], mapLabels = [];
  const lindens = [], cherries = [], lamps = [];
  const GLASS_DARK = 0x26323c, GRANITE = 0x8f8b84, CURB = 0xa19d96, IRON = 0x2d3b35;
  const SHOP_SIGNS = [0x0a5ba8, 0xc8102e, 0x1f6b44, 0x222428, 0xf2b705, 0x7a2a5a, 0xe8e8e8, 0xd2691e];
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5b8a3c'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, '40,70,25', 0.25, 10, 40);
    blotches(g, w, h, 20, '130,160,70', 0.18, 10, 30);
    grain(g, 0, 0, w, h, 16000, 'rgba(30,60,20,.4)', 'rgba(150,190,90,.35)', 1.6);
  }, true);

  /* ---------- polygon helpers ---------- */
  function polyBox(P) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    return [x0, z0, x1, z1];
  }
  const centroid = (P) => [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];
  const axisPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  // a rectangle in a frame [ox, oz, cos, sin] (see Builder.setFrame), as world corners
  const rectPoly = (fr, x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [fr[0] + x * fr[2] - z * fr[3], fr[1] + x * fr[3] + z * fr[2]]);
  // separating-axis test for two convex polygons
  function overlaps(P, Q) {
    for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], nx = a[1] - b[1], nz = b[0] - a[0];
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const [x, z] of P) { const d = x * nx + z * nz; p0 = Math.min(p0, d); p1 = Math.max(p1, d); }
      for (const [x, z] of Q) { const d = x * nx + z * nz; q0 = Math.min(q0, d); q1 = Math.max(q1, d); }
      if (p1 <= q0 + 1e-6 || q1 <= p0 + 1e-6) return false;
    }
    return true;
  }
  const orient = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const segsCross = (ax, az, bx, bz, cx, cz, dx, dz) =>
    orient(ax, az, bx, bz, cx, cz) * orient(ax, az, bx, bz, dx, dz) < 0 && orient(cx, cz, dx, dz, ax, az) * orient(cx, cz, dx, dz, bx, bz) < 0;
  function segPolyDist(ax, az, bx, bz, P) {
    if (pointInPoly(P, ax, az) || pointInPoly(P, bx, bz)) return 0;
    let d = Infinity;
    for (let i = 0; i < P.length; i++) {
      const [px, pz] = P[i], [qx, qz] = P[(i + 1) % P.length];
      if (segsCross(ax, az, bx, bz, px, pz, qx, qz)) return 0;
      d = Math.min(d, segDist(px, pz, ax, az, bx, bz), segDist(ax, az, px, pz, qx, qz), segDist(bx, bz, px, pz, qx, qz));
    }
    return d;
  }
  // everything already built or set aside, by area
  const PH = 40, taken = new Map();
  function take(P) {
    const [x0, z0, x1, z1] = polyBox(P);
    for (let ix = Math.floor(x0 / PH); ix <= Math.floor(x1 / PH); ix++) for (let iz = Math.floor(z0 / PH); iz <= Math.floor(z1 / PH); iz++) {
      const k = ix * 10007 + iz;
      if (!taken.has(k)) taken.set(k, []);
      taken.get(k).push(P);
    }
  }
  function isTaken(P) {
    const [x0, z0, x1, z1] = polyBox(P), seen = new Set();
    for (let ix = Math.floor(x0 / PH); ix <= Math.floor(x1 / PH); ix++) for (let iz = Math.floor(z0 / PH); iz <= Math.floor(z1 / PH); iz++) {
      const c = taken.get(ix * 10007 + iz);
      if (c) for (const Q of c) { if (seen.has(Q)) continue; seen.add(Q); if (overlaps(P, Q)) return true; }
    }
    return false;
  }
  // can a building stand here: firm land all round, clear of every street and its pavements, nothing else in the way
  function fits(P, margin = 0) {
    const [x0, z0, x1, z1] = polyBox(P), [cx, cz] = centroid(P);
    if (!solidLand(cx, cz)) return false;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
      if (!solidLand(ax, az) || !solidLand((ax + bx) / 2, (az + bz) / 2)) return false;
    }
    for (const e of edgesNear(x0 - 30, z0 - 30, x1 + 30, z1 + 30)) {
      const A = nodes[e.a], B = nodes[e.b];
      if (segPolyDist(A.x, A.z, B.x, B.z, P) < e.hw + e.walk - 0.25 + margin) return false;
    }
    return !isTaken(P);
  }
  // fill a flat polygon at height y; uvScale maps world metres to texture repeats
  function triangulate(B, P, y, col, uvScale) {
    const contour = P.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const t = [contour[i], contour[j], contour[k]];
      B.tri([t[0].x, y, t[0].y], [t[1].x, y, t[1].y], [t[2].x, y, t[2].y], col, [0, 1, 0], uvScale ? t.map((v) => [v.x / uvScale, -v.y / uvScale]) : null);
    }
  }

  /* ---------- land, quays and water edges ---------- */
  for (const L of LANDS) {
    triangulate(paveB, L.poly, 0, 0xffffff, 4);
    // granite quay walls down to the water, with a coping stone along the top
    for (let i = 0; i < L.poly.length; i++) {
      const [ax, az] = L.poly[i], [bx, bz] = L.poly[(i + 1) % L.poly.length];
      const onEdge = (x, z) => x <= BOUNDS.x0 || x >= BOUNDS.x1 || z <= BOUNDS.z0 || z >= BOUNDS.z1;
      if (onEdge(ax, az) && onEdge(bx, bz)) continue;
      const B = cityAt((ax + bx) / 2, (az + bz) / 2);
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      // the wall faces the water: away from the inside of the land
      let ox = uz, oz = -ux;
      if (pointInPoly(L.poly, (ax + bx) / 2 + ox, (az + bz) / 2 + oz)) { ox = -ox; oz = -oz; }
      B.quad([ax, WATER_Y - 1.5, az], [bx, WATER_Y - 1.5, bz], [bx, 0.06, bz], [ax, 0.06, az], GRANITE, null, [ox, 0, oz]);
      const cx = ox * 0.3, cz = oz * 0.3;
      B.quad([ax + cx, 0.18, az + cz], [bx + cx, 0.18, bz + cz], [bx - cx, 0.18, bz - cz], [ax - cx, 0.18, az - cz], 0x9d998f, null, [0, 1, 0]);
      for (const sgn of [1, -1]) B.quad([ax + cx * sgn, 0, az + cz * sgn], [bx + cx * sgn, 0, bz + cz * sgn], [bx + cx * sgn, 0.18, bz + cz * sgn], [ax + cx * sgn, 0.18, az + cz * sgn], 0x9d998f, null, [cx * sgn, 0, cz * sgn]);
    }
  }

  /* ---------- parks, squares and the rail yard ---------- */
  const PARKS = [
    { name: 'Kungsträdgården', poly: [[-38, -372], [97, -372], [97, -634], [-38, -634]], kind: 'kungstradgarden' },
    { name: 'Berzelii park', poly: [[130, -640], [262, -640], [275, -565], [130, -565]], trees: 10 },
    { name: 'Humlegården', poly: [[140, -1012], [168, -1035], [220, -1160], [82, -1162]], trees: 26 },
    { name: 'Mariatorget', poly: [[-548, 1052], [-492, 1030], [-420, 1068], [-548, 1120]], trees: 12, fountain: true },
    { name: 'Katarina kyrkogård', poly: [[160, 1190], [320, 1190], [320, 1335], [160, 1335]], trees: 20 },
    { name: 'Observatorielunden', poly: [[-779, -1408], [-688, -1408], [-688, -1340], [-779, -1340]], trees: 14 },
    { name: 'Tegnérlunden', poly: [[-845, -1222], [-788, -1222], [-788, -1162], [-845, -1162]], trees: 10 },
    { name: 'Johannes kyrkogård', poly: [[-294, -1238], [-198, -1238], [-198, -1164], [-294, -1164]], trees: 10 },
    { name: 'Klara kyrkogård', poly: [[-466, -574], [-437, -574], [-412, -482], [-466, -482]], trees: 6 },
    { name: 'Nytorget', poly: [[640, 1238], [720, 1238], [720, 1288], [640, 1288]], trees: 10 },
    // further out: Vanadislunden, the woods of Lill-Jansskogen, the open field of Ladugårdsgärdet, Rålambshovsparken,
    // Skansen on Djurgården and the woods of Nacka
    { name: 'Vanadislunden', poly: [[-1280, -1785], [-960, -1770], [-945, -2030], [-1280, -2040]], trees: 40 },
    { name: 'Lill-Jansskogen', poly: [[920, -1700], [1420, -1580], [1690, -1790], [1760, -2370], [920, -2370]], trees: 170 },
    { name: 'Ladugårdsgärdet', poly: [[1560, -770], [2450, -840], [2500, -1560], [1950, -1720], [1560, -1380]], trees: 16 },
    { name: 'Rålambshovsparken', poly: [[-1730, -120], [-2030, -125], [-2035, -395], [-1730, -395]], trees: 30 },
    { name: 'Skansen', poly: [[1450, 30], [1900, 0], [1980, 300], [1700, 440], [1480, 330]], trees: 50, kind: 'skansen' },
    { name: 'Nackareservatet', poly: [[2180, 1420], [3270, 1420], [3270, 2970], [2100, 2970], [2140, 1950]], trees: 220 }
  ];
  const SQUARES = [
    { name: 'Karl XII:s torg', poly: [[-5, -352], [97, -352], [97, -280], [-5, -280]], statue: [45, -305] },
    { name: 'Gustav Adolfs torg', poly: [[-166, -345], [-112, -345], [-112, -292], [-166, -292]], statue: [-140, -320] },
    { name: 'Hötorget', poly: (() => { const f = edgeFrame(nodeIndex.get('S2'), nodeIndex.get('S3')); return rectPoly(lotFrame(f, -1, 33, 66, f.e.hw + f.e.walk + 0.5 + 33), 0, 0, 66, 22); })(), market: true },
    { name: 'Sergels torg', poly: [[-308, -622], [-200, -622], [-200, -590], [-308, -590]], plaza: true },
    { name: 'Stortorget', poly: [[-94, 193], [-39, 193], [-39, 211], [-53, 237], [-95, 234]], cobble: true, well: [-68, 214] },
    { name: 'Slottsbacken', poly: [[64, -58], [150, -66], [188, 10], [188, 30], [100, 58], [64, 58]], cobble: true, obelisk: [128, 18] },
    { name: 'Yttre borggården', poly: [[-95, -39], [-63, -39], [-63, 39], [-95, 39]], cobble: true },
    { name: 'Järntorget', poly: [[-36, 432], [4, 436], [10, 452], [-34, 452]], cobble: true },
    { name: 'Köpmantorget', poly: [[100, 224], [118, 224], [118, 240], [100, 240]], cobble: true, statue: [109, 232] },
    { name: 'Brända tomten', poly: [[70, 268], [84, 268], [84, 282], [70, 282]], cobble: true, tree: [76, 275] },
    { name: 'Riddarhustorget', poly: [[-213, -10], [-201, -10], [-201, 20], [-213, 20]], statue: [-207, 6] },
    { name: 'Medborgarplatsen', poly: [[100, 1385], [205, 1385], [205, 1460], [100, 1460]] },
    { name: 'Norrmalmstorg', poly: [[150, -700], [200, -700], [200, -668], [150, -668]] },
    { name: 'Brunkebergstorg', poly: [[-168, -632], [-132, -632], [-132, -594], [-168, -594]] },
    { name: 'Östermalmstorg', poly: [[362, -925], [412, -925], [412, -881], [362, -881]] },
    { name: 'Mosebacke torg', poly: [[185, 800], [235, 800], [235, 845], [185, 845]], cobble: true },
    { name: 'Gröna Lund', poly: [[1215, 450], [1335, 432], [1430, 500], [1440, 610], [1370, 622], [1290, 545]], tivoli: true }
  ];
  const RAIL_YARD = [[-845, -310], [-618, -310], [-660, -430], [-695, -545], [-730, -684], [-768, -835], [-845, -835]];
  // islands that are mostly lawn and trees
  const GREEN_ISLANDS = ['Skeppsholmen', 'Kastellholmen', 'Djurgården', 'Långholmen'];
  /* ---------- Gröna Lund: the amusement park on Djurgården's shore ---------- */
  // A Ferris wheel turning slowly on its A-frames, the free-fall tower whose ring of seats climbs to the top and drops,
  // a carousel and a roller coaster, behind the gate with the sign. The moving parts turn in TIVOLI.update.
  const TIVOLI = (() => {
    const T = { wheel: null, gondolas: [], ring: null, carousel: null, t: 0, ringY: 2 };
    const mat = std({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
    const mesh = (m, x, y, z) => { const o = new THREE.Mesh(m.build(), mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o; };
    const WHEEL = { x: 1330, z: 455, R: 16, y: 19 }, TOWER = { x: 1405, z: 575, h: 80 }, CAROUSEL = { x: 1370, z: 540 };
    T.build = () => {
      // the Ferris wheel: A-frames either side, and the wheel (rims, spokes, hub) in a group that turns
      {
        const { x, z, R, y } = WHEEL, st = new Merger(), wh = new Merger();
        for (const s of [-1, 1]) {
          tubeTo(st, [-9, 0, s * 2.6], [0, y, s * 1.7], 0.32, 0xe8e8e4); tubeTo(st, [9, 0, s * 2.6], [0, y, s * 1.7], 0.32, 0xe8e8e4);
          tubeTo(st, [-4.5, y / 2, s * 2.2], [4.5, y / 2, s * 2.2], 0.18, 0xe8e8e4);
          addCircle(x - 9, z + s * 2.6, 0.5, y); addCircle(x + 9, z + s * 2.6, 0.5, y);
        }
        tubeTo(st, [0, y, -1.9], [0, y, 1.9], 0.45, 0x8a8f94);
        mesh(st, x, 0, z);
        for (const s of [-1, 1]) {
          wh.add(new THREE.TorusGeometry(R, 0.22, 6, 56), 0xf2f2ee, 0, 0, s * 1.2);
          wh.add(new THREE.TorusGeometry(R * 0.55, 0.14, 6, 40), 0xd8203a, 0, 0, s * 1.2);
          for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; wh.add(new THREE.BoxGeometry(0.14, R, 0.14), 0xf2f2ee, Math.cos(a) * R / 2, Math.sin(a) * R / 2, s * 1.2, 0, 0, a - Math.PI / 2); }
        }
        wh.add(new THREE.CylinderGeometry(1.2, 1.2, 2.8, 16), 0xd8203a, 0, 0, 0, Math.PI / 2, 0, 0);
        T.wheel = mesh(wh, x, y, z);
        const cols = [0xd8203a, 0xf2c200, 0x1f6bd8, 0x2fa84f];
        for (let k = 0; k < 12; k++) {
          const g = new Merger(), c = cols[k % 4];
          g.box(1.8, 1.5, 1.6, c, 0, -1.25, 0); g.box(2.0, 0.12, 1.8, 0xf2f2ee, 0, -0.45, 0); g.box(1.82, 0.7, 1.62, 0x2a3946, 0, -1.0, 0);
          T.gondolas.push(mesh(g, x, y, z));
        }
        addBox(x - R - 1, z - 2, x + R + 1, z + 2, y + R);
      }
      // the free-fall tower: a mast of steel rings and a ring of seats round it
      {
        const { x, z, h } = TOWER, m = new Merger(), r = new Merger();
        m.add(new THREE.CylinderGeometry(1.3, 1.6, h, 10), 0x2a8fa0, 0, h / 2, 0);
        for (let y = 6; y < h; y += 6) m.add(new THREE.CylinderGeometry(1.75, 1.75, 0.5, 10), 0xf2f2ee, 0, y, 0);
        m.add(new THREE.CylinderGeometry(2.4, 2.0, 3, 10), 0xd8203a, 0, h + 1.5, 0);
        m.add(new THREE.CylinderGeometry(4.5, 4.8, 1.2, 16), 0x8a8f94, 0, 0.6, 0);
        mesh(m, x, 0, z);
        r.add(new THREE.CylinderGeometry(3.6, 3.6, 0.9, 16), 0xf2c200, 0, 0, 0);
        for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; r.box(0.7, 1.1, 0.6, k % 2 ? 0xd8203a : 0x1f6bd8, Math.cos(a) * 3.3, -0.9, Math.sin(a) * 3.3); }
        T.ring = mesh(r, x, 2, z);
        addCircle(x, z, 4.8, h + 3);
      }
      // the carousel: a striped roof on a pole over a turning platform of horses
      {
        const { x, z } = CAROUSEL, m = new Merger(), base = new Merger();
        base.add(new THREE.CylinderGeometry(7.4, 7.6, 0.5, 24), 0x8a6a46, 0, 0.25, 0);
        mesh(base, x, 0, z);
        m.add(new THREE.CylinderGeometry(0.5, 0.5, 5.6, 10), 0xd4a53a, 0, 2.8, 0);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU, c = k % 2 ? 0xf2f2ee : 0xd8203a;
          m.add(new THREE.CylinderGeometry(0.3, 7.3, 2.4, 3, 1, true, a, TAU / 12), c, 0, 6.6, 0);
          const hx = Math.cos(a) * 5.4, hz = Math.sin(a) * 5.4;
          m.add(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6), 0xd4a53a, hx, 3.0, hz);
          m.box(0.4, 0.7, 1.4, k % 3 ? 0xf2f2ee : 0x6b4f35, hx, 1.8 + (k % 2) * 0.4, hz);
        }
        T.carousel = mesh(m, x, 0.5, z);
        addCircle(x, z, 7.8, 8);
      }
      // the roller coaster: a red track looping up and down on white legs
      {
        const pts = [];
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; pts.push(new THREE.Vector3(1300 + Math.cos(a) * 30, 3 + 7 * (1 + Math.sin(a * 2 + 0.6)) + (i % 3 === 0 ? 4 : 0), 500 + Math.sin(a) * 17)); }
        const curve = new THREE.CatmullRomCurve3(pts, true), m = new Merger();
        const tube = new THREE.TubeGeometry(curve, 160, 0.35, 6, true), track = tube.toNonIndexed(); tube.dispose();
        m.add(track, 0xd8203a);
        for (let i = 0; i < 28; i++) {
          const q = curve.getPoint(i / 28);
          tubeTo(m, [q.x, 0, q.z], [q.x, q.y - 0.3, q.z], 0.16, 0xf2f2ee, 0.16, 6);
          addCircle(q.x, q.z, 0.3, q.y);
        }
        const o = new THREE.Mesh(m.build(), mat); o.castShadow = true; scene.add(o);
      }
      // the gate on the road, its sign lit
      {
        const signTex = canvasTex(512, 96, (g, w, h) => {
          g.fillStyle = '#1d7a3a'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#ffe14a'; g.font = '900 64px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GRÖNA LUND', w / 2, h / 2 + 4, w - 24);
        });
        const gx = 1352, gz = 446, c = 0.878, sn = 0.479, B = cityAt(gx, gz), sb = new Builder();
        for (const s of [-1, 1]) { B.box(gx + s * c * 6 - 0.5, 0, gz + s * sn * 6 - 0.5, gx + s * c * 6 + 0.5, 6.5, gz + s * sn * 6 + 0.5, 0x1d7a3a); addCircle(gx + s * c * 6, gz + s * sn * 6, 0.7, 6.5); }
        const P = (u, y, o) => [gx + c * u - sn * o, y, gz + sn * u + c * o];
        sb.quad(P(-6.5, 5, -0.6), P(6.5, 5, -0.6), P(6.5, 7.4, -0.6), P(-6.5, 7.4, -0.6), 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [sn, 0, -c]);
        sb.quad(P(6.5, 5, 0.6), P(-6.5, 5, 0.6), P(-6.5, 7.4, 0.6), P(6.5, 7.4, 0.6), 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [-sn, 0, c]);
        scene.add(new THREE.Mesh(sb.build(), std({ map: signTex, emissive: 0x555555, emissiveMap: signTex, roughness: 0.4 })));
      }
      mapLabels.push(['Gröna Lund', 1330, 530, 'landmark']);
    };
    T.update = (dt) => {
      T.t += dt;
      if (!T.wheel) return;
      const a = T.t * 0.07;
      T.wheel.rotation.z = a;
      T.gondolas.forEach((g, k) => { const b = a + (k / T.gondolas.length) * TAU; g.position.set(WHEEL.x + Math.cos(b) * WHEEL.R, WHEEL.y + Math.sin(b) * WHEEL.R, WHEEL.z); });
      T.carousel.rotation.y = T.t * 0.6;
      // the free fall: up slowly, a wait at the top, the drop, then the brakes
      const c = T.t % 22, top = TOWER.h - 6;
      let y;
      if (c < 9) y = lerp(2, top, c / 9);
      else if (c < 12) y = top;
      else if (c < 15) { const u = c - 12; y = Math.max(14, top - 0.5 * 9.81 * u * u); }
      else if (c < 17) y = lerp(14, 2, (c - 15) / 2);
      else y = 2;
      T.ring.position.y = y;
    };
    return T;
  })();
  for (const p of PARKS) { take(p.poly); mapGreens.push(p.poly); mapLabels.push([p.name, ...centroid(p.poly), 'park']); }
  for (const q of SQUARES) { take(q.poly); mapSquares.push(q.poly); mapLabels.push([q.name, ...centroid(q.poly), 'square']); }
  take(RAIL_YARD);
  for (const L of LANDS) if (GREEN_ISLANDS.includes(L.name)) { triangulate(grassB, L.poly, 0.012, 0xffffff, 6); mapGreens.push(L.poly); }
  function treesIn(P, n, list, s0 = 0.85, s1 = 1.2) {
    const [x0, z0, x1, z1] = polyBox(P);
    for (let tries = 0, made = 0; tries < n * 8 && made < n; tries++) {
      const x = rr(x0, x1), z = rr(z0, z1);
      if (!pointInPoly(P, x, z) || !solidLand(x, z)) continue;
      const ne = nearestEdge(x, z);
      if (ne.e && ne.d < ne.e.hw + 2) continue;
      if (blockedAt(x, z, 2.2)) continue;
      list.push({ x, z, s: rr(s0, s1), r: rand() * TAU, v: rand() });
      addCircle(x, z, 0.4);
      made++;
    }
  }
  function statue(x, z, h, col = 0x3b4a44) {
    const B = cityAt(x, z);
    B.box(x - 2.4, 0, z - 2.4, x + 2.4, 2.2, z + 2.4, 0x9a968e);
    B.box(x - 1.8, 2.2, z - 1.8, x + 1.8, 2.5, z + 1.8, 0x8a867f);
    B.box(x - 0.5, 2.5, z - 1.4, x + 0.5, 2.5 + h * 0.45, z + 1.4, col);
    B.box(x - 0.35, 2.5 + h * 0.45, z - 0.3, x + 0.35, 2.5 + h, z + 0.4, col);
    addCircle(x, z, 2.6, 2.5);
  }
  function fountain(cx, cz, r) {
    const B = cityAt(cx, cz);
    B.prism(cx, cz, r, 0, 0.6, 20, 0x9c9890);
    B.prism(cx, cz, r - 0.4, 0.6, 0.62, 20, 0x3d86a8);
    B.prism(cx, cz, 0.5, 0.6, 2.4, 10, 0x9c9890);
    B.prism(cx, cz, 1.4, 2.0, 2.2, 12, 0x9c9890);
    addCircle(cx, cz, r);
  }
  for (const p of PARKS) {
    if (p.kind === 'kungstradgarden') {
      // lawns on either side of the long gravel walk, cherry trees along it and Molins fontän in the middle
      const [x0, z0, x1, z1] = polyBox(p.poly), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, pw = 4;
      for (const [a, b, c, d] of [[x0 + 3, z0 + 3, mx - pw, mz - pw], [mx + pw, z0 + 3, x1 - 3, mz - pw], [x0 + 3, mz + pw, mx - pw, z1 - 3], [mx + pw, mz + pw, x1 - 3, z1 - 3]]) {
        grassB.quad([a, 0.04, d], [c, 0.04, d], [c, 0.04, b], [a, 0.04, b], 0xffffff, [[a / 6, -d / 6], [c / 6, -d / 6], [c / 6, -b / 6], [a / 6, -b / 6]]);
      }
      for (let z = z0 + 8; z <= z1 - 8; z += 8) for (const x of [mx - 10, mx + 10]) {
        if (Math.abs(z - mz) < 9) continue;
        cherries.push({ x, z, s: 0.9 + rand() * 0.2, r: rand() * TAU, v: rand() }); addCircle(x, z, 0.35);
      }
      fountain(mx, mz, 5);
      statue(mx, z1 - 30, 4.5);
      continue;
    }
    triangulate(grassB, p.poly, 0.04, 0xffffff, 6);
    if (p.fountain) { const [cx, cz] = centroid(p.poly); fountain(cx, cz, 4); }
    if (p.kind === 'skansen') {
      // Skansen, the open-air museum: red wooden cottages with white corners among the trees, and the brick tower
      // Bredablick with its green cap
      const tx = 1700, tz = 150, B = cityAt(tx, tz);
      B.prism(tx, tz, 4.2, 0, 24, 8, 0x9a4a32);
      B.prism(tx, tz, 4.7, 24, 25, 8, 0x8a4030);
      B.prism(tx, tz, 3.8, 25, 29, 8, 0x9a4a32);
      B.prism(tx, tz, 4.1, 29, 36, 8, 0x5f9c86, 0.3);
      addCircle(tx, tz, 4.5, 36);
      mapLabels.push(['Bredablick', tx, tz, 'landmark']);
      for (const [x, z, a, w, d] of [[1540, 120, 0.2, 9, 6], [1580, 230, 1.1, 8, 6], [1650, 300, -0.3, 10, 7], [1760, 260, 0.6, 8, 6], [1820, 120, 1.4, 9, 6],
        [1760, 60, 0.1, 8, 5], [1880, 220, -0.8, 9, 6], [1620, 60, 0.9, 7, 5]]) {
        const c = Math.cos(a), sn = Math.sin(a), C = cityAt(x, z);
        C.setFrame(x - (w / 2) * c + (d / 2) * sn, z - (w / 2) * sn - (d / 2) * c, c, sn);
        C.box(0, 0, 0, w, 3.4, d, 0x8f2b1f);
        for (const cx of [0, w]) C.box(cx - 0.12, 0, -0.06, cx + 0.12, 3.4, d + 0.06, 0xeeeae0, false, false);
        C.box(w / 2 - 0.6, 1.0, -0.08, w / 2 + 0.6, 2.2, 0, 0xeeeae0, false, false);
        C.hip(0, 0, w, d, 3.4, d * 0.45, 0.5, d / 2 - 0.05, 0x3d3a36);
        C.setFrame();
        addOBox(x, z, c, sn, w / 2 + 0.2, d / 2 + 0.2, 6);
        mapPolys.push([rectPoly([x - (w / 2) * c + (d / 2) * sn, z - (w / 2) * sn - (d / 2) * c, c, sn], 0, 0, w, d), 0x8f2b1f]);
      }
    }
  }
  for (const q of SQUARES) {
    if (q.tivoli) TIVOLI.build(q.poly);
    if (q.plaza) triangulate(plazaB, q.poly, 0.03, 0xffffff, 4);
    else triangulate(q.cobble ? cobbleB : slabB, q.poly, 0.03, 0xffffff, 4);
    if (q.statue) statue(q.statue[0], q.statue[1], 5.5);
    if (q.tree) { lindens.push({ x: q.tree[0], z: q.tree[1], s: 1.05, r: 0.3, v: 0.5 }); addCircle(q.tree[0], q.tree[1], 0.4); }
    // the obelisk on Slottsbacken: a granite needle on a stepped plinth
    if (q.obelisk) {
      const [x, z] = q.obelisk, B = cityAt(x, z);
      B.box(x - 3, 0, z - 3, x + 3, 0.5, z + 3, 0x9a968e);
      B.box(x - 2.2, 0.5, z - 2.2, x + 2.2, 4, z + 2.2, 0x8a867f);
      B.prism(x, z, 1.75, 4, 26, 4, 0x8f8a84, 1.0, false);
      B.prism(x, z, 1.0, 26, 28, 4, 0x8f8a84, 0.01);
      addBox(x - 3, z - 3, x + 3, z + 3, 28);
    }
    if (q.well) { const B = cityAt(...q.well); B.prism(q.well[0], q.well[1], 2.2, 0, 1.0, 12, 0x8f8a80); B.prism(q.well[0], q.well[1], 0.5, 1, 3.4, 8, 0x8f8a80); addCircle(q.well[0], q.well[1], 2.4); }
    if (q.market) {
      // Hötorget's market stalls with striped awnings, in two rows across the square
      const [a, b, c, d] = q.poly, at2 = (u, v) => [lerp(lerp(a[0], b[0], u), lerp(d[0], c[0], u), v), lerp(lerp(a[1], b[1], u), lerp(d[1], c[1], u), v)];
      for (let i = 0; i < 6; i++) {
        const [x, z] = at2(0.18 + Math.floor(i / 2) * 0.32, i % 2 ? 0.72 : 0.28), B = cityAt(x, z);
        B.box(x - 2, 0, z - 1.5, x + 2, 0.9, z + 1.5, 0x6b4f35);
        B.box(x - 2.3, 2.2, z - 1.9, x + 2.3, 2.35, z + 1.9, i % 2 ? 0xc8102e : 0x1f6b44);
        for (const [px, pz] of [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]]) B.box(x + px - 0.05, 0, z + pz - 0.05, x + px + 0.05, 2.2, z + pz + 0.05, 0xd8d8d8);
        addBox(x - 2.3, z - 1.9, x + 2.3, z + 1.9, 2.3);
      }
    }
  }
  // tracks north of the Central Station, fenced off
  {
    triangulate(railB, RAIL_YARD, 0.02, 0xffffff, 9);
    for (let i = 0; i < RAIL_YARD.length; i++) {
      const [ax, az] = RAIL_YARD[i], [bx, bz] = RAIL_YARD[(i + 1) % RAIL_YARD.length];
      const len = Math.hypot(bx - ax, bz - az), c = (bx - ax) / len, s = (bz - az) / len, B = cityAt((ax + bx) / 2, (az + bz) / 2);
      B.setFrame(ax, az, c, s);
      B.box(0, 1.6, -0.03, len, 1.75, 0.03, 0x2f3a33);
      for (let x = 0; x <= len; x += 3) B.box(x - 0.04, 0, -0.04, x + 0.04, 1.8, 0.04, 0x2f3a33);
      B.box(0, 0.3, -0.01, len, 1.6, 0.01, 0x3c4a40);
      B.setFrame();
      addOBox((ax + bx) / 2, (az + bz) / 2, c, s, len / 2, 0.15, 1.8);
    }
  }

  /* ---------- streets ---------- */
  const RY = 0.02;
  const roadKind = (e) => e.kind === 'street';
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, rx = -uz, rz = ux;
    const c0 = A.r, c1 = e.len - B.r;
    if (c1 - c0 < 0.3) continue;
    const P = (s, lat) => [A.x + ux * s + rx * lat, RY, A.z + uz * s + rz * lat];
    const corners = [P(c0, -e.hw), P(c1, -e.hw), P(c1, e.hw), P(c0, e.hw)];
    if (e.kind === 'lane' || e.kind === 'ped') {
      const uv = corners.map((p) => [p[0] / 4, -p[2] / 4]);
      (e.kind === 'lane' ? cobbleB : slabB).quad(corners[0], corners[1], corners[2], corners[3], 0xffffff, uv, [0, 1, 0]);
      if (e.stairs) for (let s = c0 + 0.4; s < c1 - 0.4; s += 0.9) {
        const Bs = cityAt(A.x + ux * s, A.z + uz * s);
        Bs.setFrame(A.x + ux * s - rx * e.hw, A.z + uz * s - rz * e.hw, rx, rz);
        Bs.box(0, 0, -0.18, e.hw * 2, 0.07, 0.18, 0x8d877d);
        Bs.setFrame();
      }
    } else {
      const B2 = e.median ? medianB : e.hw >= 8 ? avenueB : roadB;
      B2.quad(corners[0], corners[1], corners[2], corners[3], 0xffffff, [[0, c0 / 12], [0, c1 / 12], [1, c1 / 12], [1, c0 / 12]], [0, 1, 0]);
      // kerbs
      if (!e.bridge) for (const side of [1, -1]) {
        const lat = side * (e.hw + 0.12), mid = P((c0 + c1) / 2, lat), Bc = cityAt(mid[0], mid[2]);
        Bc.setFrame(A.x + ux * c0 + rx * lat, A.z + uz * c0 + rz * lat, ux, uz);
        Bc.box(0, 0, -0.13, c1 - c0, 0.12, 0.13, CURB);
        Bc.setFrame();
      }
      // zebra crossings near each end: stripes along the street, side by side across it
      if (e.hw >= 4.5 && !e.bridge && c1 - c0 > 14) for (const s0 of [c0 + 1.2, c1 - 4.2]) {
        for (let lat = -e.hw + 0.6; lat <= e.hw - 0.6; lat += 1.2) {
          const a = P(s0, lat - 0.3), b = P(s0 + 3, lat - 0.3), cc = P(s0 + 3, lat + 0.3), d = P(s0, lat + 0.3);
          a[1] = b[1] = cc[1] = d[1] = 0.035;
          zebraB.quad(a, b, cc, d, 0xffffff, null, [0, 1, 0]);
        }
      }
    }
    mapLabels.push([e.name, (A.x + B.x) / 2, (A.z + B.z) / 2, 'street', Math.atan2(uz, ux), e]);
  }
  // junctions: each street's surface carries on into the middle (plain, without lines), with a small disc
  // filling the wedges between streets that meet at an angle; the pavement corners stay sharp
  nodes.forEach((n, ni) => {
    const inc = n.all.map((i) => edges[i]);
    const kindB = inc.some(roadKind) ? junctionB : inc.some((e) => e.kind === 'ped') ? slabB : cobbleB, k = kindB === junctionB ? 12 : 4;
    const y = RY + 0.001, uv = (p) => [p[0] / k, -p[2] / k];
    for (const e of inc) {
      if (kindB === junctionB && !roadKind(e)) continue;
      const o = nodes[e.a === ni ? e.b : e.a], ux = (o.x - n.x) / e.len, uz = (o.z - n.z) / e.len, rx = -uz, rz = ux;
      const P = (s, lat) => [n.x + ux * s + rx * lat, y, n.z + uz * s + rz * lat];
      const q = [P(0, -e.hw), P(n.r, -e.hw), P(n.r, e.hw), P(0, e.hw)];
      kindB.quad(q[0], q[1], q[2], q[3], 0xffffff, q.map(uv), [0, 1, 0]);
    }
    const R = Math.min(...inc.filter((e) => kindB !== junctionB || roadKind(e)).map((e) => e.hw)), P = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; P.push([n.x + Math.cos(a) * R, y, n.z + Math.sin(a) * R]); }
    for (let i = 1; i < P.length - 1; i++) kindB.tri(P[0], P[i], P[i + 1], 0xffffff, [0, 1, 0], [uv(P[0]), uv(P[i]), uv(P[i + 1])]);
  });

  /* ---------- bridges ---------- */
  const bridgeTrims = [];
  for (const br of bridgeRects) {
    const e = br.e, A = br.A, len = e.len, ux = br.ux, uz = br.uz, rx = -uz, rz = ux;
    // the stretch actually over water
    let w0 = -1, w1 = -1;
    for (let s = 0; s <= len; s += 1) if (!(groundAt(A.x + ux * s, A.z + uz * s) & 1)) { if (w0 < 0) w0 = s; w1 = s; }
    if (w0 < 0) continue;
    // the deck stops where the junctions at its ends begin, so its railings never cross the street at the end
    let s0 = Math.max(br.A.r + 0.5, w0 - 3), s1 = Math.min(len - br.B.r - 0.5, w1 + 3);
    const half = e.hw + e.walk, s00 = s0, s10 = s1;
    // ... nor run out over another street that passes close to the bridgehead: walk each railing and pull the end of
    // the deck back to where it is clear of every other carriageway (cars would otherwise be caught on the railing)
    const near = [...edgesNear(Math.min(A.x, br.B.x) - 40, Math.min(A.z, br.B.z) - 40, Math.max(A.x, br.B.x) + 40, Math.max(A.z, br.B.z) + 40)].filter((o) => o !== e);
    const hits = (s) => {
      for (const side of [1, -1]) {
        const px = A.x + ux * s + rx * side * (half - 0.21), pz = A.z + uz * s + rz * side * (half - 0.21);
        for (const o of near) if (edgeDist(o, px, pz) < o.hw + (o.drive ? 0.9 : 0.4)) return true;
      }
      return false;
    };
    for (let s = s0; s <= s1; s += 0.5) if (hits(s)) { if (s < (s00 + s10) / 2) s0 = s + 0.75; else { s1 = s - 0.75; break; } }
    if (s0 !== s00 || s1 !== s10) bridgeTrims.push({ name: e.name, cut0: +(s0 - s00).toFixed(1), cut1: +(s10 - s1).toFixed(1) });
    if (s1 - s0 < 4) continue;
    const B = cityAt(A.x + ux * (s0 + s1) / 2, A.z + uz * (s0 + s1) / 2);
    B.setFrame(A.x + ux * s0 - rx * half, A.z + uz * s0 - rz * half, ux, uz);
    const L = s1 - s0, W = half * 2;
    const stone = e.name === 'Norrbro' || e.name === 'Riksbron' || e.name === 'Stallbron' ? 0x9a948a : 0x6e7378;
    // a slim deck, so a boat fits underneath, on granite piers standing in the water
    B.box(-0.3, -0.8, -0.3, L + 0.3, 0, W + 0.3, stone, false, false);
    for (let x = 6; x < L - 4; x += 32) {
      B.box(x, WATER_Y - 1.5, 1.2, x + 3.2, -0.8, W - 1.2, GRANITE, false, false);
      // (only a boat down on the water can run into a pier)
      addOBox(A.x + ux * (s0 + x + 1.6), A.z + uz * (s0 + x + 1.6), ux, uz, 1.75, half - 1.1, -0.8, WATER_Y - 1.5);
    }
    for (const [z0, z1] of [[0.1, 0.32], [W - 0.32, W - 0.1]]) {
      B.box(0, 0.95, z0, L, 1.07, z1, IRON);
      B.box(0, 0.48, z0 + 0.05, L, 0.54, z1 - 0.05, IRON);
      B.box(-0.1, 0, z0 - 0.1, L + 0.1, 0.16, z1 + 0.1, 0x8a867f);
      for (let x = 0.4; x < L; x += 2.4) B.box(x - 0.05, 0.16, z0 + 0.02, x + 0.05, 0.95, z1 - 0.02, IRON);
    }
    B.setFrame();
    // pavements on the deck
    for (const side of [1, -1]) {
      const p = (s, lat) => [A.x + ux * s + rx * lat, 0.03, A.z + uz * s + rz * lat];
      const q = [p(s0, side * e.hw), p(s1, side * e.hw), p(s1, side * half), p(s0, side * half)];
      slabB.quad(q[0], q[1], q[2], q[3], 0xffffff, q.map((v) => [v[0] / 4, -v[2] / 4]), [0, 1, 0]);
      const mx = A.x + ux * (s0 + s1) / 2 + rx * side * (half - 0.21), mz = A.z + uz * (s0 + s1) / 2 + rz * side * (half - 0.21);
      // (the railings stand on the deck, so a boat underneath passes below them)
      addOBox(mx, mz, ux, uz, L / 2, 0.2, 1.07, 0);
    }
  }

  /* ---------- street lamps and trees ---------- */
  for (const e of edges) {
    if (e.kind === 'lane') continue;
    const f = edgeFrame(e.a, e.b), r0 = nodes[e.a].r + 4, r1 = e.len - nodes[e.b].r - 4;
    let side = 1;
    const lat = e.kind === 'ped' ? e.hw - 1 : e.hw + 0.7;
    for (let s = r0 + 6; s < r1; s += e.kind === 'ped' ? 22 : 28) {
      const x = f.A.x + f.ux * s + f.rx * lat * side, z = f.A.z + f.uz * s + f.rz * lat * side;
      if (walkable(x, z) && !blockedAt(x, z, 0.5)) { lamps.push({ x, z, rot: Math.atan2(-f.rx * side, -f.rz * side) }); addCircle(x, z, 0.2); }
      side = -side;
    }
    if (!e.trees && !e.median) continue;
    for (let s = r0 + 3; s < r1; s += 11) {
      const spots = e.median ? [0] : e.trees === 'both' ? [1, -1] : e.trees === 'left' ? [-1] : [1];
      for (const sd of spots) {
        const tl = e.median ? 0 : sd * (e.hw + e.walk * 0.5);
        const x = f.A.x + f.ux * s + f.rx * tl, z = f.A.z + f.uz * s + f.rz * tl;
        if (!walkable(x, z) || blockedAt(x, z, 1.2)) continue;
        lindens.push({ x, z, s: rr(0.85, 1.1), r: rand() * TAU, v: rand() });
        addCircle(x, z, 0.35);
      }
    }
  }
  for (const p of PARKS) if (p.trees) treesIn(p.poly, p.trees, lindens);

  /* ---------- the car park on the quay at Skeppsbron ---------- */
  // Two rows of marked bays between the pavement and the water with an aisle down the middle, a bus bay at the north
  // end and a way in from the street at either end. s runs along Skeppsbron from Slottsbacken, d out towards the water.
  const LOT = (() => {
    const f = edgeFrame(nodeIndex.get('SK1'), nodeIndex.get('SK2')), wx = -f.rx, wz = -f.rz;
    const at = (s, d) => [f.A.x + f.ux * s + wx * d, f.A.z + f.uz * s + wz * d];
    const BAY = 2.6, rows = [{ s0: 26, s1: 128, d0: 15.5, d1: 21.5 }, { s0: 34, s1: 136, d0: 28.5, d1: 34.5 }], bays = [];
    rows.forEach((r, row) => {
      r.n = Math.floor((r.s1 - r.s0) / BAY);
      for (let k = 0; k < r.n; k++) bays.push({ row, s: r.s0 + (k + 0.5) * BAY });
    });
    return { f, wx, wz, at, BAY, rows, bays, s0: 16, s1: 138, d0: 15.2, d1: 35.2, aisle: 25, bus: { s0: 18, s1: 32, d0: 30.8, d1: 34.2 } };
  })();
  {
    const { f, at, BAY, rows, bus } = LOT;
    const corners = (s0, s1, d0, d1) => [at(s0, d0), at(s1, d0), at(s1, d1), at(s0, d1)];
    const flatQuad = (B, P, y, uvScale) => B.quad(...P.map(([x, z]) => [x, y, z]), 0xffffff, uvScale ? P.map(([x, z]) => [x / uvScale, -z / uvScale]) : null, [0, 1, 0]);
    const paint = (s0, s1, d0, d1) => flatQuad(zebraB, corners(s0, s1, d0, d1), 0.036);
    const lotPoly = corners(LOT.s0, LOT.s1, LOT.d0, LOT.d1);
    flatQuad(junctionB, lotPoly, 0.024, 12);
    const W = 0.06;
    for (const r of rows) {
      const back = r === rows[0] ? r.d0 : r.d1, end = r.s0 + r.n * BAY;
      for (let k = 0; k <= r.n; k++) paint(r.s0 + k * BAY - W, r.s0 + k * BAY + W, r.d0, r.d1);
      paint(r.s0 - W, end + W, back - W, back + W);
    }
    for (const [s0, s1, d0, d1] of [[bus.s0, bus.s1, bus.d0 - W, bus.d0 + W], [bus.s0, bus.s1, bus.d1 - W, bus.d1 + W], [bus.s0 - W, bus.s0 + W, bus.d0, bus.d1], [bus.s1 - W, bus.s1 + W, bus.d0, bus.d1]]) paint(s0, s1, d0, d1);
    // a blue P sign at each way in, facing the street
    const pTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d5fae'; roundRect(g, 6, 6, w - 12, h - 12, 10); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 96px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', w / 2, h / 2 + 5);
    });
    const pB = new Builder(), y0 = 2.2, y1 = 2.85, hs = 0.33;
    for (const s of [rows[0].s0 - 1, rows[0].s0 + rows[0].n * BAY + 1]) {
      const [x, z] = at(s, LOT.d0 + 0.3), B = cityAt(x, z);
      B.prism(x, z, 0.045, 0, y1, 6, 0x8a8f94);
      addCircle(x, z, 0.12);
      for (const side of [1, -1]) {
        const ox = x - LOT.wx * 0.06 * side, oz = z - LOT.wz * 0.06 * side, a = [ox + f.ux * hs * side, oz + f.uz * hs * side], b = [ox - f.ux * hs * side, oz - f.uz * hs * side];
        pB.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], 0xffffff, [[1, 0], [0, 0], [0, 1], [1, 1]], [-LOT.wx * side, 0, -LOT.wz * side]);
      }
    }
    scene.add(new THREE.Mesh(pB.build(), std({ map: pTex, roughness: 0.5 })));
    // ticket machines on the pavement edge, and lamps along the quay
    for (const s of [52, 102]) {
      const [x, z] = at(s, 14.6), B = cityAt(x, z);
      B.setFrame(x, z, f.ux, f.uz);
      B.box(-0.25, 0, -0.18, 0.25, 1.45, 0.18, 0x3a3d41);
      B.box(-0.2, 1.0, -0.19, 0.2, 1.3, -0.17, 0xc9d6c0);
      B.box(-0.3, 1.45, -0.24, 0.3, 1.55, 0.24, 0x1d5fae);
      B.setFrame();
      addOBox(x, z, f.ux, f.uz, 0.3, 0.24, 1.55);
    }
    for (let s = 30; s < 136; s += 26) { const [x, z] = at(s, 35.7); lamps.push({ x, z, rot: Math.atan2(-LOT.wx, -LOT.wz) }); addCircle(x, z, 0.2); }
    // no houses on the quay
    take(corners(-40, 175, LOT.d0, 60));
    mapSquares.push(lotPoly);
    mapLabels.push(['Parkering', ...centroid(lotPoly), 'square']);
  }

  /* ---------- buildings ---------- */
  const STYLE = {
    norr: {
      floors: [5, 7], tall: 0.12, lot: [12, 22], depth: 14, roof: 'mansard', shops: 0.85,
      colors: [0xd8c7a3, 0xcdb48a, 0xe3d6bd, 0xbba98d, 0xd6ab7c, 0xcbc5b8, 0xe3d2a7, 0xc2a98d, 0xd9b8a0, 0xa9b3ae], roofs: [0x3a3e42, 0x3a3e42, 0x3a3e42, 0x5f9c86]
    },
    // the 1960s city centre around Sergels torg, Hötorget and Klara: offices with ribbon windows and flat roofs
    city: {
      floors: [6, 9], tall: 0.2, lot: [22, 38], depth: 18, roof: 'flat', modern: true, shops: 0.95,
      colors: [0xbcbab4, 0x8d8a84, 0xa9a49a, 0x7d7a74, 0xc7c2b6, 0x9a8f80, 0xb4a48c], roofs: [0x4a4d50]
    },
    oster: {
      floors: [6, 7], tall: 0.15, lot: [15, 26], depth: 15, roof: 'mansard', turret: 0.22, shops: 0.55,
      colors: [0xd9c7a8, 0xc39a72, 0x9b5a40, 0xe0d2b6, 0xb88a64, 0xcbb595, 0x8e4f3a, 0xd6c0a0], roofs: [0x3a3e42, 0x5f9c86, 0x3a3e42, 0x4a3a32]
    },
    gamla: {
      floors: [4, 6], tall: 0.08, lot: [7, 12], depth: 11, roof: 'pitch', pitch: 0.55, shops: 0.75,
      colors: [0xd9a441, 0xc8643a, 0xe3a47f, 0xedd59a, 0xcf7f3c, 0xb54a32, 0xe8c26e, 0xd88e5a, 0xa9472f, 0xf0dfb4, 0xc9a074], roofs: [0x3a3e42, 0x9e4a33, 0x3a3e42, 0x9e4a33, 0x5f9c86]
    },
    soder: {
      floors: [4, 6], tall: 0.1, lot: [10, 18], depth: 12, roof: 'pitch', pitch: 0.38, shops: 0.55,
      colors: [0xe7d39c, 0xd99a6c, 0xc9b07a, 0xe6b98a, 0xbfcab9, 0xd7a24f, 0xe2cfb0, 0xb86c4a, 0xd6c3a0], roofs: [0x3a3e42, 0x9e4a33, 0x3a3e42, 0x4a4e52]
    },
    kungs: {
      floors: [5, 7], tall: 0.1, lot: [14, 24], depth: 14, roof: 'mansard', shops: 0.55,
      colors: [0xa45a3d, 0xd6c3a2, 0xc4a27e, 0x8f4c36, 0xe0d0b0, 0xb7a58a, 0xcfb48c], roofs: [0x3a3e42, 0x3a3e42, 0x5f9c86]
    },
    // (sparse: only that share of the lots along the roads gets a house, the rest is park and woods)
    skepps: { floors: [2, 3], tall: 0, lot: [18, 32], depth: 12, roof: 'pitch', pitch: 0.5, shops: 0, sparse: 0.3, colors: [0xe0b864, 0xd9a65a, 0xe8d6a8, 0xc9824e], roofs: [0x9e4a33, 0x3a3e42] },
    // Hammarby sjöstad: new blocks by the water in white render and glass, flat roofs
    sjostad: {
      floors: [5, 8], tall: 0.1, lot: [20, 34], depth: 15, roof: 'flat', modern: true, shops: 0.5,
      colors: [0xe9e7e1, 0xc9c2b3, 0xb3b9bd, 0xe0d2b4, 0x9aa6ad, 0xd9d3c8], roofs: [0x4a4d50]
    },
    // the suburbs of the 1930s to 50s (Johanneshov, Liljeholmen, Nacka): three- and four-storey lamellhus in light render
    funkis: {
      floors: [3, 4], tall: 0.05, lot: [24, 40], depth: 11, roof: 'pitch', pitch: 0.22, shops: 0.15,
      colors: [0xe6dfcf, 0xd9cfb8, 0xcfd6d2, 0xe2c9a0, 0xd6b89a, 0xbfc9c2], roofs: [0x3a3e42, 0x9e4a33, 0x4a4e52]
    }
  };
  function styleAt(x, z) {
    const d = landName(x, z);
    if (d === 'Gamla stan' || d === 'Riddarholmen' || d === 'Helgeandsholmen') return STYLE.gamla;
    if (d === 'Södermalm') return STYLE.soder;
    if (d === 'Kungsholmen') return STYLE.kungs;
    if (d === 'Östermalm' || d === 'Blasieholmen') return STYLE.oster;
    if (d === 'Skeppsholmen' || d === 'Kastellholmen' || d === 'Djurgården' || d === 'Långholmen') return STYLE.skepps;
    if (d === 'Johanneshov' || d === 'Liljeholmen' || d === 'Nacka') return STYLE.funkis;
    if (d === 'Hammarby sjöstad') return STYLE.sjostad;
    if (d === 'Hagastaden') return STYLE.city;
    if (d === 'Gärdet' || d === 'Norra Djurgården') return STYLE.oster;
    if (x > -720 && x < -60 && z < -540 && z > -960) return STYLE.city;
    return STYLE.norr;
  }
  // a lot along a street: frame origin on the facade line, local x along the street, local z away from it
  function lotFrame(f, side, s, w, set) {
    return side > 0
      ? [f.A.x + f.ux * s + f.rx * set, f.A.z + f.uz * s + f.rz * set, f.ux, f.uz]
      : [f.A.x + f.ux * (s + w) - f.rx * set, f.A.z + f.uz * (s + w) - f.rz * set, -f.ux, -f.uz];
  }
  // glass shop windows and a sign band on the street side (local z = 0)
  function shopfront(B, w, sc) {
    const m = 0.7, t = 0.12;
    B.box(m, 0.65, -t, w - m, 2.9, 0, GLASS_DARK);
    B.box(m, 2.95, -t - 0.05, w - m, 3.45, 0, sc);
  }
  function addBuilding(fr, w, d, S, o = {}) {
    const poly = rectPoly(fr, 0, 0, w, d), [cx, cz] = centroid(poly), B = cityAt(cx, cz);
    const floors = (o.floors || S.floors[0] + Math.floor(rand() * (S.floors[1] - S.floors[0] + 1))) + (rand() < S.tall ? 1 : 0);
    const h = floors * FLOOR_H + 0.6, col = o.col || pick(S.colors), rc = pick(S.roofs);
    B.setFrame(fr[0], fr[1], fr[2], fr[3]);
    B.modern = !!S.modern;
    B.box(0, 0, 0, w, h, d, col, true, false);
    B.modern = false;
    if (!o.simple) B.box(-0.06, 0, -0.06, w + 0.06, 0.65, d + 0.06, shade(col, 0.7), false, false);
    B.box(-0.22, h - 0.1, -0.22, w + 0.22, h + 0.22, d + 0.22, shade(col, 1.1));
    const sh = Math.min(w, d);
    if (S.roof === 'flat') {
      if (!o.simple && w > 8 && d > 8) B.box(w * 0.3, h + 0.22, d * 0.35, w * 0.6, h + 2.8, d * 0.7, 0x8a8d90);
    } else if (S.roof === 'mansard') {
      B.hip(0, 0, w, d, h + 0.22, 2.6, Math.min(1.7, w / 2 - 0.1), Math.min(1.7, d / 2 - 0.1), rc);
      // Östermalm's corner turrets
      if (S.turret && !o.simple && rand() < S.turret && w > 12) {
        const tx = rand() < 0.5 ? 0 : w - 5;
        B.box(tx - 0.2, h, -0.2, tx + 5.2, h + 3.4, 5.2, col, true, false);
        B.hip(tx - 0.3, -0.3, tx + 5.3, 5.3, h + 3.4, 4.5, 2.8, 2.8, 0x5f9c86);
      }
    } else {
      const rh = sh * S.pitch;
      if (w >= d) B.hip(0, 0, w, d, h + 0.22, rh, sh * 0.42, sh / 2 - 0.02, rc);
      else B.hip(0, 0, w, d, h + 0.22, rh, sh / 2 - 0.02, sh * 0.42, rc);
    }
    if (!o.simple && w > 2.2 && rand() < S.shops) shopfront(B, w, pick(SHOP_SIGNS));
    B.setFrame();
    addOBox(cx, cz, fr[2], fr[3], w / 2 + 0.15, d / 2 + 0.15, h);
    take(poly);
    mapPolys.push([poly, col]);
    return h;
  }
  // a landmark: one building, modelled in a frame (use [x0, z0, 1, 0] for one that lines up with the map)
  const landmarkList = [];
  function landmark(fr, w, d, col, h, o = {}) {
    const poly = rectPoly(fr, 0, 0, w, d), [cx, cz] = centroid(poly), B = cityAt(cx, cz);
    landmarkList.push({ name: o.name || '', poly });
    B.setFrame(fr[0], fr[1], fr[2], fr[3]);
    B.modern = !!o.modern;
    B.box(0, 0, 0, w, h, d, col, o.win !== false, o.roof === 'none');
    B.modern = false;
    if (o.plinth !== false) B.box(-0.1, 0, -0.1, w + 0.1, o.plinthH || 1.2, d + 0.1, shade(col, 0.78), false, false);
    if (o.roof !== 'none') {
      B.box(-0.3, h - 0.2, -0.3, w + 0.3, h + 0.3, d + 0.3, o.cornice || shade(col, 1.1));
      if (o.roof === 'flat') B.box(w * 0.25, h + 0.3, d * 0.3, w * 0.55, h + 2.4, d * 0.6, 0x8a8d90);
      else B.hip(0, 0, w, d, h + 0.3, o.rh || 3, Math.min(o.ri || 4, w / 2 - 0.1), Math.min(o.ri || 4, d / 2 - 0.1), o.roofCol || 0x4a4f52);
    }
    B.setFrame();
    addOBox(cx, cz, fr[2], fr[3], w / 2 + 0.15, d / 2 + 0.15, h);
    take(poly);
    mapPolys.push([poly, col]);
    if (o.name) mapLabels.push([o.name, cx, cz, 'landmark']);
    return B;
  }
  const at = (id) => nodeIndex.get(id);
  const streetFrame = (a, b) => edgeFrame(at(a), at(b));
  const f0len = (a, b) => streetFrame(a, b).len;

  /* ---------- landmarks ---------- */
  // Kungliga slottet: four wings round the inner courtyard, two short west wings round the outer one
  {
    const col = 0xcfb48c, H = 25;
    for (const [x0, z0, x1, z1] of [[-62, -58, 62, -36], [-62, 36, 62, 58], [-62, -36, -40, 36], [40, -36, 62, 36], [-96, -58, -62, -40], [-96, 40, -62, 58]]) {
      landmark([x0, z0, 1, 0], x1 - x0, z1 - z0, col, H, { rh: 2.2, ri: 3, roofCol: 0x55524c, plinthH: 5 });
    }
    const B = cityAt(0, 0);
    for (const z0 of [-61, 57]) B.box(-16, 0, z0, 16, H + 3, z0 + 4, shade(col, 1.04), true, true);
    for (const x0 of [-65, 61]) B.box(x0, 0, -14, x0 + 4, H + 3, 14, shade(col, 1.04), true, true);
    mapLabels.push(['Kungliga slottet', 0, 0, 'landmark']);
    take(axisPoly(-40, -36, 40, 36));
  }
  landmark([-176, -222, 1, 0], 64, 94, 0xb3aea3, 24, { rh: 4, roofCol: 0x5f9c86, name: 'Riksdagshuset' });
  landmark([-285, -218, 1, 0], 82, 90, 0xc4bcaa, 20, { rh: 3, roofCol: 0x5f9c86 });
  // Stadshuset: brick round Borgargården, the tower with the three crowns at the south-east corner
  {
    const brick = 0xa34a33, copper = 0x5f9c86, H = 24, D = 14, X0 = -1062, X1 = -938, Z0 = -170, Z1 = -46;
    for (const [a, b, c, d] of [[X0, Z0, X1, Z0 + D], [X0, Z1 - D, X1, Z1], [X0, Z0 + D, X0 + D, Z1 - D], [X1 - D, Z0 + D, X1, Z1 - D]]) {
      landmark([a, b, 1, 0], c - a, d - b, brick, H, { rh: 3.6, roofCol: copper, plinth: false });
    }
    const tx0 = -957, tx1 = -939, tz0 = -65, tz1 = -47, tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2, B = cityAt(tcx, tcz);
    B.box(tx0, 0, tz0, tx1, 76, tz1, brick, true, false);
    B.box(tx0 - 0.4, 75.6, tz0 - 0.4, tx1 + 0.4, 76.4, tz1 + 0.4, shade(brick, 1.15));
    B.box(tx0 + 2, 76.4, tz0 + 2, tx1 - 2, 84, tz1 - 2, brick, true, false);
    B.hip(tx0 + 2, tz0 + 2, tx1 - 2, tz1 - 2, 84, 9, 3.6, 3.6, copper);
    B.box(tcx - 1.8, 93, tcz - 1.8, tcx + 1.8, 96, tcz + 1.8, copper);
    B.box(tcx - 0.25, 96, tcz - 0.25, tcx + 0.25, 103, tcz + 0.25, copper);
    addBox(tx0 - 0.15, tz0 - 0.15, tx1 + 0.15, tz1 + 0.15, 104);
    const gold = new Merger(), topY = 103;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + Math.PI / 2, cx = tcx + Math.cos(a) * 1.5, cz = tcz + Math.sin(a) * 1.5, cy = topY + 1;
      gold.add(new THREE.CylinderGeometry(0.9, 0.7, 0.8, 12), 0xffffff, cx, cy, cz);
      for (let s = 0; s < 5; s++) { const b = (s / 5) * TAU; gold.add(new THREE.ConeGeometry(0.17, 0.6, 5), 0xffffff, cx + Math.cos(b) * 0.75, cy + 0.7, cz + Math.sin(b) * 0.75); }
      gold.add(new THREE.SphereGeometry(0.22, 8, 6), 0xffffff, cx, cy + 0.8, cz);
    }
    scene.add(new THREE.Mesh(gold.build(), new THREE.MeshStandardMaterial({ color: 0xe2b240, metalness: 0.9, roughness: 0.25, emissive: 0x3a2800 })));
    mapLabels.push(['Stadshuset', (X0 + X1) / 2, (Z0 + Z1) / 2, 'landmark']);
  }
  // Centralstationen along Vasagatan, with the taller main hall in the middle
  {
    const f = streetFrame('V2', 'V3'), fr = lotFrame(f, -1, 4, 112, f.e.hw + f.e.walk + 0.5);
    const B = landmark(fr, 112, 48, 0xc9a97f, 17, { rh: 5, roofCol: 0x3a3e42, name: 'Centralstationen' });
    B.setFrame(fr[0], fr[1], fr[2], fr[3]);
    B.box(40, 0, -0.6, 72, 23, 32, shade(0xc9a97f, 1.05), true, false);
    B.hip(40, -0.6, 72, 32, 23, 7, 6, 6, 0x3a3e42);
    B.box(52, 17, -1.2, 60, 21, -0.6, 0xf3efe2);
    B.setFrame();
    // two trains on the tracks behind
    for (const [x, z0, n, col, band] of [[-722, -380, 6, 0xc9ced3, 0x22272c], [-782, -440, 4, 0xe9e9e6, 0x1f4fae]]) {
      const T = cityAt(x, z0 - 60);
      for (let i = 0; i < n; i++) {
        const za = z0 - i * 26, zb = za - 25;
        T.box(x - 1.6, 0.4, zb, x + 1.6, 4.1, za, col);
        T.box(x - 1.62, 2.2, zb + 1, x + 1.62, 3.2, za - 1, band);
        T.box(x - 1.3, 0, zb + 2, x + 1.3, 0.6, za - 2, 0x2a2c2f);
      }
      addBox(x - 1.7, z0 - n * 26, x + 1.7, z0, 4.2);
    }
  }
  landmark([-102, -352, 1, 0], 92, 61, 0xdfc897, 22, { rh: 4, roofCol: 0x5f9c86, name: 'Kungliga Operan' });
  landmark([-192, -349, 1, 0], 22, 46, 0xd9a48c, 18, { rh: 3, roofCol: 0x3a3e42, name: 'Arvfurstens palats' });
  // NK on Hamngatan with its rotating clock sign on the roof
  let nkSign = null;
  {
    const w = f0len('R2', 'VT2') - 20, f = streetFrame('R2', 'VT2'), fr = lotFrame(f, -1, 13, w, f.e.hw + f.e.walk + 0.4);
    landmark(fr, w, 45, 0xb9ab92, 27, { roof: 'flat', name: 'NK' });
    const poly = rectPoly(fr, 0, 0, w, 45), [cx, cz] = centroid(poly);
    const nkTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8102e'; g.font = '900 104px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('NK', w / 2, h / 2 + 6);
    });
    nkSign = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 5), std({ map: nkTex, roughness: 0.4, emissive: 0x222222, emissiveMap: nkTex }));
    nkSign.position.set(cx, 27.3 + 3.2 + 1.3, cz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.2, 8), std({ color: 0x5d646a, metalness: 0.6, roughness: 0.4 }));
    post.position.set(cx, 27.3 + 1.6, cz);
    scene.add(nkSign, post);
    nkSign.userData.tex = nkTex;
  }
  // Kulturhuset's long glass front over Sergels torg, and the glass obelisk in its pool
  let obeliskPos = null;
  {
    const B = landmark([-305, -585, 1, 0], 105, 33, 0x9aa3a8, 26, { modern: true, roof: 'flat', plinth: false, name: 'Kulturhuset' });
    for (let y = 3.2; y < 26; y += 4.3) B.box(-305.6, y, -585.6, -199.4, y + 0.45, -551.4, 0xf2f2ee, false, false);
    const ox = -262, oz = -606, P = cityAt(ox, oz);
    P.prism(ox, oz, 9, 0, 0.6, 28, 0x2c3236);
    P.prism(ox, oz, 8.4, 0.6, 0.62, 28, 0x3d86a8);
    addCircle(ox, oz, 9.1);
    obeliskPos = { x: ox, z: oz };
  }
  // Hötorgsskraporna: five towers on a low block along Sveavägen
  {
    const f = streetFrame('S1', 'S2'), set = f.e.hw + f.e.walk + 0.5, fr = lotFrame(f, -1, 40, 130, set);
    landmark(fr, 130, 28, 0xc4c6c4, 8, { modern: true, roof: 'flat', plinth: false });
    for (let i = 0; i < 5; i++) landmark(lotFrame(f, -1, 44 + i * 25, 18, set + 3), 18, 24, 0xb7bdc2, 72, { modern: true, roof: 'flat', plinth: false });
    mapLabels.push(['Hötorgsskraporna', ...centroid(rectPoly(fr, 0, 0, 130, 28)), 'landmark']);
  }
  // Konserthuset, blue, with columns facing Hötorget
  {
    const f = streetFrame('S2', 'S3'), fr = lotFrame(f, -1, 33, 66, f.e.hw + f.e.walk + 0.5);
    const B = landmark(fr, 66, 30, 0x3e6aa8, 21, { roof: 'flat', name: 'Konserthuset' });
    B.setFrame(fr[0], fr[1], fr[2], fr[3]);
    for (let i = 0; i < 10; i++) B.prism(8 + i * 5.6, 31.2, 0.7, 0, 16, 10, 0xe9e4d6, 0.7, false);
    B.box(5, 16, 30, 61, 18, 32.2, 0xe9e4d6);
    B.setFrame();
  }
  // Grand Hôtel on the quay facing the palace, and Nationalmuseum on the tip of Blasieholmen
  {
    const f = streetFrame('KT0', 'GH'), fr = lotFrame(f, -1, 25, 110, f.e.hw + f.e.walk + 0.4);
    const B = landmark(fr, 110, 45, 0xe6dccb, 26, { rh: 5, ri: 3, roofCol: 0x5f9c86, name: 'Grand Hôtel' });
    B.setFrame(fr[0], fr[1], fr[2], fr[3]);
    for (const x of [0, 102]) { B.box(x - 0.5, 26, -0.5, x + 8.5, 31, 8.5, 0xe6dccb, true, false); B.hip(x - 0.6, -0.6, x + 8.6, 8.6, 31, 6, 4.6, 4.6, 0x5f9c86); }
    B.setFrame();
  }
  {
    const B = landmark([295, -345, 1, 0], 80, 83, 0xd9d1c1, 24, { rh: 5, roofCol: 0x5f9c86, name: 'Nationalmuseum' });
    B.prism(335, -303.5, 9, 29, 34, 16, 0x5f9c86, 3);
  }
  // Gamla stan's churches and halls
  function steeple(B, x0, z0, x1, z1, h, spireH, wall, spire, bulb) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0;
    B.box(x0, 0, z0, x1, h, z1, wall, true, false);
    B.box(x0 - 0.4, h - 0.4, z0 - 0.4, x1 + 0.4, h + 0.4, z1 + 0.4, shade(wall, 1.1));
    if (bulb) {
      B.prism(cx, cz, w * 0.42, h + 0.4, h + spireH * 0.25, 12, spire, w * 0.5);
      B.prism(cx, cz, w * 0.5, h + spireH * 0.25, h + spireH * 0.45, 12, spire, w * 0.18);
      B.prism(cx, cz, w * 0.16, h + spireH * 0.45, h + spireH * 0.7, 8, spire, w * 0.16);
      B.prism(cx, cz, w * 0.16, h + spireH * 0.7, h + spireH, 8, spire, 0.05);
    } else B.hip(x0, z0, x1, z1, h + 0.4, spireH, w / 2, (z1 - z0) / 2, spire);
    B.box(cx - 0.12, h + spireH, cz - 0.12, cx + 0.12, h + spireH + 3, cz + 0.12, 0xd4a53a);
    addBox(x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15, h + spireH);
    take(axisPoly(x0, z0, x1, z1));
    mapPolys.push([axisPoly(x0, z0, x1, z1), wall]);
  }
  {
    const B = landmark([-50, 95, 1, 0], 57, 45, 0xc58f5a, 18, { rh: 9, ri: 22, roofCol: 0x4b3b2c, name: 'Storkyrkan' });
    steeple(B, -64, 110, -50, 124, 44, 22, 0xc58f5a, 0x4a4038, true);
  }
  landmark([-84, 154, 1, 0], 46, 32, 0xebe2c8, 16, { rh: 3, roofCol: 0x5f9c86, name: 'Börshuset' }).prism(-61, 170, 4, 19.3, 25, 12, 0x5f9c86, 1);
  {
    const B = landmark([-30, 292, 1, 0], 50, 50, 0x9c5a3c, 17, { rh: 11, ri: 25, roofCol: 0x3a3e42, name: 'Tyska kyrkan' });
    steeple(B, -30, 320, -16, 334, 40, 56, 0x9c5a3c, 0x5f9c86, false);
  }
  {
    const B = landmark([-264, -6, 1, 0], 47, 48, 0x8f4a36, 15, { rh: 3, ri: 4, roofCol: 0x2b2b2d, name: 'Riddarhuset' });
    B.hip(-261, -3, -220, 39, 18.3, 5, 8, 8, 0x2b2b2d);
  }
  /* ---------- Polisstationen on Stora Nygatan ---------- */
  // A three-storey house with the blue POLIS sign and the police lamp over the door. The ground floor is open to walk
  // into: the lobby with the counter, a corridor with three cells behind bars (one of them yours if you are arrested)
  // and an interview room. While you are inside, the floors above are lifted off so the camera can see in.
  const STATION = (() => {
    const X0 = -227.0, X1 = -198.0, Z0 = 202.4, Z1 = 242.6, GH = 4.2, TOP = GH + 2 * FLOOR_H, T = 0.4, IT = 0.25;
    const low = new Builder({ split: true, ao: AO }), high = new Builder({ split: true, ao: AO }), floorB = new Builder(), glassB = new Builder(), signB2 = new Builder();
    const OUT = 0xd9c39a, PLINTH = 0xa8916a, IN = 0xe8e6e0, STEEL = 0x3a4047, WOOD = 0x7a5a3c, NAVY = 0x16305f;
    const foot = axisPoly(X0, Z0, X1, Z1);
    // walls: a box in the inside colour; outer walls get their outside face painted over in the facade colour
    const wallBox = (x0, z0, x1, z1, h, col = IN) => { low.box(x0, 0, z0, x1, h, z1, col, false, true); addBox(x0, z0, x1, z1, h); };
    const skin = (ax, az, bx, bz, y0, y1, nx, nz, col) => low.quad([ax + nx * 0.02, y0, az + nz * 0.02], [bx + nx * 0.02, y0, bz + nz * 0.02], [bx + nx * 0.02, y1, bz + nz * 0.02], [ax + nx * 0.02, y1, az + nz * 0.02], col, null, [nx, 0, nz]);
    // the outer walls of the ground floor, the door gap in the east facade
    const DZ0 = 220.2, DZ1 = 223.8;
    for (const [x0, z0, x1, z1, nx, nz] of [[X0, Z0, X1, Z0 + T, 0, -1], [X0, Z1 - T, X1, Z1, 0, 1], [X0, Z0, X0 + T, Z1, -1, 0], [X1 - T, Z0, X1, DZ0, 1, 0], [X1 - T, DZ1, X1, Z1, 1, 0]]) {
      low.box(x0, 0, z0, x1, GH, z1, IN, false, false);
      addBox(x0, z0, x1, z1, TOP + 3);
      if (nz) skin(x0, nz < 0 ? z0 : z1, x1, nz < 0 ? z0 : z1, 0, GH, 0, nz, OUT);
      else skin(nx < 0 ? x0 : x1, z0, nx < 0 ? x0 : x1, z1, 0, GH, nx, 0, OUT);
      if (nz) skin(x0, nz < 0 ? z0 : z1, x1, nz < 0 ? z0 : z1, 0, 0.7, 0, nz * 1.6, PLINTH);
      else skin(nx < 0 ? x0 : x1, z0, nx < 0 ? x0 : x1, z1, 0, 0.7, nx * 1.6, 0, PLINTH);
    }
    low.box(X1 - T, 3.0, DZ0, X1, GH, DZ1, IN, false, false);
    skin(X1, DZ0, X1, DZ1, 3.0, GH, 1, 0, OUT);
    // door frame in police blue, the glass doors slid open to either side
    low.box(X1 - 0.05, 0, DZ0 - 0.18, X1 + 0.12, 3.1, DZ0, NAVY); low.box(X1 - 0.05, 0, DZ1, X1 + 0.12, 3.1, DZ1 + 0.18, NAVY);
    low.box(X1 - 0.05, 2.95, DZ0 - 0.18, X1 + 0.12, 3.15, DZ1 + 0.18, NAVY);
    for (const [z0, z1] of [[DZ0 - 1.55, DZ0 - 0.1], [DZ1 + 0.1, DZ1 + 1.55]]) glassB.box(X1 - 0.22, 0.05, z0, X1 - 0.14, 2.9, z1, 0xffffff);
    // windows in the ground floor facade: dark glass in blue frames
    const winE = (z0, z1) => { low.box(X1, 0.9, z0 - 0.08, X1 + 0.06, 2.9, z1 + 0.08, NAVY); glassB.box(X1 + 0.06, 1.0, z0, X1 + 0.08, 2.8, z1, 0xffffff); };
    for (const [z0, z1] of [[204.6, 208.6], [211.0, 215.0], [227.6, 231.6], [234.0, 238.0]]) winE(z0, z1);
    // the floors above: plastered, with windows, a cornice and a pitched roof
    high.box(X0, GH, Z0, X1, GH + 0.3, Z1, 0xf1f0ec, false, true);
    high.setFrame(X0, Z0, 1, 0);
    high.box(0, GH, 0, X1 - X0, TOP, Z1 - Z0, OUT, true, false);
    high.box(-0.25, TOP - 0.1, -0.25, X1 - X0 + 0.25, TOP + 0.25, Z1 - Z0 + 0.25, shade(OUT, 1.1));
    high.hip(0, 0, X1 - X0, Z1 - Z0, TOP + 0.25, 7.5, 9, 9, 0x3a3e42);
    high.box(-0.08, GH - 0.25, -0.08, X1 - X0 + 0.08, GH + 0.05, Z1 - Z0 + 0.08, shade(OUT, 0.92));
    high.setFrame();
    // the big sign over the door and the blue police lamp beside it
    const signTex = canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#16305f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2c200'; g.fillRect(0, h - 10, w, 10);
      g.beginPath(); g.arc(52, h / 2 - 4, 30, 0, TAU); g.fill();
      g.fillStyle = '#16305f'; g.font = '900 34px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 52, h / 2 - 3);
      g.fillStyle = '#ffffff'; g.font = '900 58px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'left'; g.fillText('POLISEN', 104, h / 2 - 2);
    });
    const lampTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#1f5fd6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.font = '900 38px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLIS', w / 2, h / 2 + 2);
      g.strokeStyle = '#0d2a63'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    });
    const sq = (B, ax, az, bx, bz, y0, y1, nx, nz) => B.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [nx, 0, nz]);
    sq(signB2, X1 + 0.06, DZ1 + 1.4, X1 + 0.06, DZ0 - 1.4, 3.3, 4.05, 1, 0);
    const lampB = new Builder(), lx = X1 + 0.75, lz = DZ0 - 2.3, ly = 3.2, ls = 0.32;
    low.box(X1, ly + ls - 0.06, lz - 0.04, lx, ly + ls - 0.02, lz + 0.04, STEEL);
    // (each face's texture runs left to right as seen from outside it, so the word reads the right way round on all four)
    sq(lampB, lx + ls, lz - ls, lx - ls, lz - ls, ly - ls, ly + ls, 0, -1); sq(lampB, lx - ls, lz + ls, lx + ls, lz + ls, ly - ls, ly + ls, 0, 1);
    sq(lampB, lx + ls, lz + ls, lx + ls, lz - ls, ly - ls, ly + ls, 1, 0); sq(lampB, lx - ls, lz - ls, lx - ls, lz + ls, ly - ls, ly + ls, -1, 0);
    low.box(lx - ls - 0.03, ly + ls, lz - ls - 0.03, lx + ls + 0.03, ly + ls + 0.07, lz + ls + 0.03, STEEL);
    low.box(lx - ls - 0.03, ly - ls - 0.07, lz - ls - 0.03, lx + ls + 0.03, ly - ls, lz + ls + 0.03, STEEL);
    // inside: the floor, the walls between the rooms
    floorB.quad([X0 + T, 0.015, Z1 - T], [X1 - T, 0.015, Z1 - T], [X1 - T, 0.015, Z0 + T], [X0 + T, 0.015, Z0 + T], 0xffffff,
      [[0, 0], [(X1 - X0) / 0.8, 0], [(X1 - X0) / 0.8, (Z1 - Z0) / 0.8], [0, (Z1 - Z0) / 0.8]], [0, 1, 0]);
    const CZ = 219.6, CORR = 224.4, LW = -212.0, BACK = 211.0, SOUTH = 233.0;
    wallBox(X0 + T, BACK - IT / 2, X1 - T, BACK + IT / 2, GH);                 // behind the cells and the counter
    wallBox(X0 + T, SOUTH - IT / 2, X1 - T, SOUTH + IT / 2, GH);               // south of the lobby and the interview room
    wallBox(LW - IT / 2, BACK, LW + IT / 2, CZ, GH);                            // lobby | cells
    wallBox(LW - IT / 2, CORR, LW + IT / 2, SOUTH, GH);                         // lobby | store room
    wallBox(-216.0 - IT / 2, CORR, -216.0 + IT / 2, SOUTH, GH);                 // interview room | store room
    wallBox(X0 + T, CORR - IT / 2, -218.4, CORR + IT / 2, GH);                  // corridor south wall, the interview room door
    wallBox(-217.0, CORR - IT / 2, LW, CORR + IT / 2, GH);
    const CELLS = [[X0 + T, -222.2], [-222.2, -217.1], [-217.1, LW]];
    for (const x of [-222.2, -217.1]) wallBox(x - IT / 2, BACK, x + IT / 2, CZ, GH);
    // the bars along the corridor, with a sliding door into each cell
    const barsB = new Builder(), doors = [];
    const bars = (B, x0, x1) => {
      for (let x = x0 + 0.07; x < x1 - 0.03; x += 0.14) B.box(x - 0.022, 0.02, CZ - 0.022, x + 0.022, GH - 0.25, CZ + 0.022, STEEL);
      for (const y of [0.02, 1.15, GH - 0.35]) B.box(x0, y, CZ - 0.045, x1, y + 0.1, CZ + 0.045, STEEL);
    };
    CELLS.forEach(([cx0, cx1], i) => {
      const dx0 = (cx0 + cx1) / 2 - 0.6, dx1 = dx0 + 1.2;
      bars(barsB, cx0 + (i ? IT / 2 : 0), dx0); bars(barsB, dx1, cx1 - (i < 2 ? IT / 2 : 0));
      barsB.box(cx0, GH - 0.25, CZ - 0.06, cx1, GH, CZ + 0.06, STEEL);
      addBox(cx0, CZ - 0.06, dx0, CZ + 0.06, 2.4); addBox(dx1, CZ - 0.06, cx1, CZ + 0.06, 2.4);
      const dB = new Builder();
      bars(dB, 0, 1.2);
      dB.box(1.08, 1.0, CZ - 0.09, 1.16, 1.3, CZ + 0.09, 0x1d2126);
      // (the door runs on its own track a hand's width out in the corridor, so it slides past the fixed bars)
      const obst = { t: 0, x0: dx0, z0: CZ - 0.04, x1: dx1, z1: CZ + 0.17, h: 2.4 };
      addObstacle(obst, obst.x0, obst.z0, obst.x1, obst.z1);
      // a bunk along the side wall and a steel toilet in the corner
      low.box(cx0 + 0.15 + (i ? IT / 2 : 0), 0, BACK + 0.4, cx0 + 1.0 + (i ? IT / 2 : 0), 0.45, BACK + 4.6, 0x5c6168);
      low.box(cx0 + 0.18 + (i ? IT / 2 : 0), 0.45, BACK + 0.45, cx0 + 0.97 + (i ? IT / 2 : 0), 0.58, BACK + 4.55, 0x2f5f9e);
      addBox(cx0 + 0.15, BACK + 0.4, cx0 + 1.0 + IT, BACK + 4.6, 0.58);
      low.box(cx1 - 0.75, 0, BACK + 0.4, cx1 - 0.3, 0.48, BACK + 0.9, 0xc9ccd0);
      addBox(cx1 - 0.75, BACK + 0.4, cx1 - 0.3, BACK + 0.9, 0.48);
      doors.push({ x0: dx0, x1: dx1, geo: dB, obst, open: 0, want: i === 2 ? 1 : 0, inside: [cx0 + IT, BACK + 0.4, cx1 - IT, CZ - 0.25], door: { x: (dx0 + dx1) / 2, z: CZ } });
    });
    // the lobby: counter with a glass screen, a bench, the queue-ticket machine, the police plaque on the wall
    low.box(-209.6, 0, 213.3, -202.8, 1.05, 214.3, WOOD); low.box(-209.7, 1.05, 213.2, -202.7, 1.12, 214.4, 0xd9d6cf);
    glassB.box(-209.6, 1.12, 213.72, -202.8, 2.1, 213.8, 0xffffff);
    addBox(-209.7, 213.2, -202.7, 214.4, 1.12);
    low.box(-209.6, 0, 211.15, -209.4, 1.05, 213.3, WOOD); addBox(-209.6, 211.15, -209.4, 213.3, 1.05);
    for (const [x0, x1] of [[-208.8, -202.8]]) {
      low.box(x0, 0.42, 231.7, x1, 0.5, 232.7, WOOD); low.box(x0, 0.5, 232.55, x1, 1.0, 232.7, WOOD);
      for (const x of [x0 + 0.2, x1 - 0.3]) low.box(x, 0, 231.8, x + 0.1, 0.42, 232.6, STEEL);
      addBox(x0, 231.7, x1, 232.75, 0.5);
    }
    low.box(-200.2, 0, 216.2, -199.6, 1.4, 216.8, 0xd23b2b); low.box(-200.15, 1.0, 216.1, -199.65, 1.3, 216.2, 0x111111); addBox(-200.2, 216.2, -199.6, 216.8, 1.4);
    sq(signB2, -208.0, BACK + IT / 2 + 0.01, -203.6, BACK + IT / 2 + 0.01, 2.25, 3.0, 0, 1);
    // posters, a plant, and in the interview room a table with two chairs
    for (const [x0, x1, c] of [[-207.5, -206.3, 0xf2c200], [-205.4, -204.2, 0x2f6fdb]]) low.box(x0, 1.4, SOUTH - IT / 2 - 0.02, x1, 2.3, SOUTH - IT / 2, c);
    low.prism(-201.2, 231.6, 0.3, 0, 0.5, 8, 0x7a5a3c); low.prism(-201.2, 231.6, 0.55, 0.5, 1.4, 8, 0x2e7d4f, 0.2); addCircle(-201.2, 231.6, 0.4, 1.4);
    low.box(-223.5, 0, 227.4, -220.5, 0.75, 229.0, 0xd9d6cf); addBox(-223.5, 227.4, -220.5, 229.0, 0.75);
    for (const z of [226.6, 229.8]) { low.box(-222.4, 0, z - 0.25, -221.6, 0.45, z + 0.25, STEEL); low.box(-222.4, 0.45, z + (z < 228 ? -0.25 : 0.2), -221.6, 1.0, z + (z < 228 ? -0.2 : 0.25), STEEL); }
    // offices behind the walls (only seen from above while you are inside): desks and lockers
    for (let x = X0 + 2; x < X1 - 4; x += 5) { low.box(x, 0, Z0 + 2.5, x + 2.4, 0.75, Z0 + 3.7, 0xcfc9bd); low.box(x + 0.6, 0.75, Z0 + 2.6, x + 1.8, 1.2, Z0 + 2.7, 0x222428); }
    for (let x = -215.5; x < -212.6; x += 0.7) low.box(x, 0, SOUTH - 0.75, x + 0.6, 1.9, SOUTH - 0.2, 0x8a939b);
    // the ceiling of the ground floor: white acoustic tiles with light panels in every room. It faces down only, so
    // from above (while the floors over it are lifted off) you still look straight in
    const ceilB = new Builder(), panelB = new Builder(), CY = GH - 0.02;
    ceilB.quad([X0 + T, CY, Z0 + T], [X1 - T, CY, Z0 + T], [X1 - T, CY, Z1 - T], [X0 + T, CY, Z1 - T], 0xffffff,
      [[0, 0], [(X1 - X0) / 0.6, 0], [(X1 - X0) / 0.6, (Z1 - Z0) / 0.6], [0, (Z1 - Z0) / 0.6]], [0, -1, 0]);
    const panel = (cx, cz, w, d) => panelB.quad([cx - w / 2, CY - 0.015, cz - d / 2], [cx + w / 2, CY - 0.015, cz - d / 2], [cx + w / 2, CY - 0.015, cz + d / 2], [cx - w / 2, CY - 0.015, cz + d / 2], 0xffffff, null, [0, -1, 0]);
    for (const z of [216.5, 222, 228]) for (const x of [-208.5, -203]) panel(x, z, 1.2, 0.6);   // lobby
    for (const x of [-225, -219.5, -214.5]) panel(x, 222, 1.2, 0.3);                          // corridor
    CELLS.forEach(([cx0, cx1]) => panel((cx0 + cx1) / 2, (BACK + CZ) / 2, 0.6, 0.6));            // cells
    panel(-222, 228.5, 1.2, 0.6); panel(-214, 228.5, 0.6, 0.6);                                // interview room, store
    for (let x = X0 + 4; x < X1 - 3; x += 7) panel(x, (Z0 + BACK) / 2, 1.2, 0.6);               // offices behind
    take(foot);
    mapPolys.push([foot, 0x6f86a8]);
    mapLabels.push(['Polisstationen', (X0 + X1) / 2, (Z0 + Z1) / 2, 'landmark']);
    landmarkList.push({ name: 'Polisstationen', poly: foot });
    // the rooms as waypoints, for walking someone in or chasing you through the building
    const dx = doors.map((d) => d.door.x);
    const P = {
      E0: [-196.9, 222.0], E1: [-200.0, 222.0], L: [-205.5, 222.6], C0: [-213.3, 222.0], C3: [dx[2], 222.0], CF: [-217.7, 222.0],
      C2: [dx[1], 222.0], C1: [dx[0], 222.0], F0: [-217.7, 226.2], D1: [dx[0], 218.0], D2: [dx[1], 218.0], D3: [dx[2], 218.0]
    };
    const LINKS = [['E0', 'E1'], ['E1', 'L'], ['L', 'C0'], ['C0', 'C3'], ['C3', 'CF'], ['CF', 'C2'], ['C2', 'C1'], ['CF', 'F0'], ['C1', 'D1'], ['C2', 'D2'], ['C3', 'D3']];
    const inside = (x, z) => x > X0 + 0.2 && x < X1 && z > Z0 + 0.2 && z < Z1 - 0.2;
    let lowMesh = null, highMeshes = [], doorMeshes = [];
    return {
      X0, X1, Z0, Z1, GH, P, LINKS, inside, doors, desk: [-206.2, 212.3],
      // a police car pulls up at the kerb outside the door: facing south on the near side, or north on the far side
      curb: (h) => (Math.cos(h) >= 0 ? { x: -193.3, z: 221.0, h: 0 } : { x: -189.1, z: 223.5, h: Math.PI }),
      finish(facade, solid, modern) {
        const add = (B, mat, list) => { if (B.empty) return; const m = new THREE.Mesh(B.build(), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); list && list.push(m); return m; };
        for (const [B, mat] of [[low, facade], [low.altB, modern], [low.solidB, solid]]) add(B, mat);
        for (const [B, mat] of [[high, facade], [high.altB, modern], [high.solidB, solid]]) add(B, mat, highMeshes);
        const tile = canvasTex(128, 128, (g, w, h) => {
          g.fillStyle = '#c9ccce'; g.fillRect(0, 0, w, h);
          grain(g, 0, 0, w, h, 2400, 'rgba(90,96,102,.25)', 'rgba(255,255,255,.3)', 1.2);
          g.strokeStyle = 'rgba(80,86,92,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
        }, true);
        add(floorB, std({ map: tile, roughness: 0.45 }));
        add(glassB, new THREE.MeshPhysicalMaterial({ color: 0x9fc4d6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }));
        add(signB2, std({ map: signTex, roughness: 0.4, emissive: 0x334466, emissiveMap: signTex }));
        add(lampB, std({ map: lampTex, roughness: 0.3, emissive: 0xffffff, emissiveMap: lampTex, emissiveIntensity: 0.9 }));
        add(barsB, std({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.6 }));
        const dmat = std({ vertexColors: true, roughness: 0.4, metalness: 0.6 });
        for (const d of doors) { const m = new THREE.Mesh(d.geo.build(), dmat); m.position.set(d.x0, 0, 0.1); m.castShadow = true; scene.add(m); d.mesh = m; }
        const tiles = canvasTex(128, 128, (g, w, h) => {
          g.fillStyle = '#eceae4'; g.fillRect(0, 0, w, h);
          grain(g, 0, 0, w, h, 1800, 'rgba(120,118,110,.18)', 'rgba(255,255,255,.4)', 1.1);
          g.fillStyle = 'rgba(150,148,140,.8)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
        }, true);
        // lit by the panels rather than the sun: a little light of its own so it never reads as a hole
        const ceil = new THREE.Mesh(ceilB.build(), std({ map: tiles, roughness: 0.9, emissive: 0x6a6964, emissiveMap: tiles }));
        const panels = new THREE.Mesh(panelB.build(), new THREE.MeshBasicMaterial({ color: 0xfff6e2 }));
        scene.add(ceil, panels);
      },
      // the floors above come off while you are inside; cell doors slide towards where they are told to be
      update(dt, px, pz) {
        const show = !inside(px, pz);
        for (const m of highMeshes) m.visible = show;
        for (const d of doors) {
          d.open += clamp(d.want - d.open, -dt * 1.2, dt * 1.2);
          if (d.mesh) d.mesh.position.x = d.x0 - d.open * 1.1;
          d.obst.off = d.open > 0.6;
        }
      }
    };
  })();

  // Tessinska palatset and Finska kyrkan across Slottsbacken from the palace, and Järnpojken, the smallest statue
  // in town, in the yard behind the church
  landmark([20, 91, 1, 0], 25, 36, 0xe7dcc4, 17, { rh: 3, ri: 4, roofCol: 0x3a3e42, name: 'Tessinska palatset' });
  landmark([56, 91, 1, 0], 44, 24, 0xf0e2b6, 12, { rh: 6, ri: 8, roofCol: 0x3a3e42, name: 'Finska kyrkan' }).box(76, 12.4, 98, 80, 16, 102, 0xf0e2b6);
  {
    const B = cityAt(66, 122);
    B.box(65.6, 0, 121.6, 66.4, 0.5, 122.4, 0x8a867f);
    B.box(65.85, 0.5, 121.9, 66.15, 0.65, 122.1, 0x3b4a44);
    addCircle(66, 122, 0.45, 0.7);
    take(axisPoly(53, 116, 72, 130));
    mapLabels.push(['Järnpojken', 66, 122, 'landmark']);
  }
  // Drakens gränd got its name from the tavern Draken at its western end: its sign, a gilded dragon on a green board,
  // hangs from a wrought-iron arm over the corner of Österlånggatan
  {
    const dragonTex = canvasTex(256, 192, (g, w, h) => {
      g.fillStyle = '#1d3b2c'; roundRect(g, 4, 4, w - 8, h - 8, 14); g.fill();
      g.strokeStyle = '#d4a53a'; g.lineWidth = 6; roundRect(g, 12, 12, w - 24, h - 24, 10); g.stroke();
      g.fillStyle = '#e2b240'; g.strokeStyle = '#8a6418'; g.lineWidth = 2;
      g.beginPath(); // body, neck and head
      g.moveTo(70, 112); g.bezierCurveTo(90, 86, 140, 84, 160, 100); g.bezierCurveTo(176, 84, 178, 60, 196, 52);
      g.lineTo(214, 58); g.lineTo(200, 64); g.lineTo(212, 72); g.lineTo(194, 72); g.bezierCurveTo(186, 92, 180, 112, 160, 122);
      g.bezierCurveTo(140, 132, 96, 132, 80, 122); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); // wing
      g.moveTo(108, 96); g.lineTo(96, 40); g.lineTo(118, 62); g.lineTo(130, 34); g.lineTo(140, 64); g.lineTo(160, 46); g.lineTo(146, 96); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); // tail, curling round to an arrow point
      g.moveTo(80, 118); g.bezierCurveTo(52, 128, 38, 104, 52, 92); g.lineTo(42, 84); g.lineTo(60, 86); g.lineTo(58, 98); g.bezierCurveTo(52, 106, 62, 114, 78, 108); g.closePath(); g.fill(); g.stroke();
      for (const lx of [96, 140]) { g.beginPath(); g.moveTo(lx, 124); g.lineTo(lx - 4, 142); g.lineTo(lx + 8, 142); g.lineTo(lx + 8, 124); g.fill(); }
      g.fillStyle = '#7a1414'; g.beginPath(); g.moveTo(212, 66); g.lineTo(228, 60); g.lineTo(222, 70); g.closePath(); g.fill();
      g.fillStyle = '#e9cf8a'; g.font = '900 30px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('DRAKEN', w / 2, h - 34);
    });
    const x0 = 135.5, x1 = 136.7, z = 308.4, y0 = 2.55, y1 = 3.45, B = cityAt(136, z), sB = new Builder();
    B.box(x0 - 0.15, y1 + 0.08, z - 0.03, 137.2, y1 + 0.14, z + 0.03, 0x1c1d1f);
    B.box(x0 + 0.05, y1, z - 0.015, x0 + 0.08, y1 + 0.1, z + 0.015, 0x1c1d1f);
    B.box(x1 - 0.08, y1, z - 0.015, x1 - 0.05, y1 + 0.1, z + 0.015, 0x1c1d1f);
    B.box(x0, y0, z - 0.03, x1, y1, z + 0.03, 0x3a2a1a);
    for (const s of [1, -1]) sB.quad([s > 0 ? x0 : x1, y0, z + s * 0.035], [s > 0 ? x1 : x0, y0, z + s * 0.035], [s > 0 ? x1 : x0, y1, z + s * 0.035], [s > 0 ? x0 : x1, y1, z + s * 0.035], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, s]);
    scene.add(new THREE.Mesh(sB.build(), std({ map: dragonTex, roughness: 0.45, metalness: 0.1 })));
  }
  {
    const B = landmark([-455, 80, 1, 0], 40, 90, 0x9a4a32, 18, { rh: 10, ri: 20, roofCol: 0x3a3e42, name: 'Riddarholmskyrkan' });
    steeple(B, -444, 62, -426, 80, 32, 58, 0x9a4a32, 0x2f3236, false);
  }
  // Katarina kyrka: a Greek cross under a big dome
  {
    const cx = 240, cz = 1262, wall = 0xe9cf7c, dome = 0x3d4144, B = cityAt(cx, cz);
    landmark([cx - 24, cz - 12, 1, 0], 48, 24, wall, 16, { rh: 6, ri: 10, roofCol: dome });
    B.box(cx - 12, 0, cz - 24, cx + 12, 16, cz + 24, wall, true, false);
    B.hip(cx - 12, cz - 24, cx + 12, cz + 24, 16, 6, 10, 10, dome);
    B.prism(cx, cz, 10, 16, 26, 16, wall, 10, false);
    B.prism(cx, cz, 10.5, 26, 36, 16, dome, 3);
    B.prism(cx, cz, 2.2, 36, 42, 8, wall, 1.2);
    B.box(cx - 0.12, 42, cz - 0.12, cx + 0.12, 45, cz + 0.12, 0xd4a53a);
    addBox(cx - 12, cz - 24, cx + 12, cz + 24, 40);
    mapLabels.push(['Katarina kyrka', cx, cz, 'landmark']);
  }
  // Katarinahissen: the lift tower at Slussen, its footbridge with Gondolen underneath, up to the heights above
  {
    const B = cityAt(120, 740), steel = 0x3b4248;
    landmark([95, 775, 1, 0], 75, 55, 0x9a7a5c, 38, { roof: 'flat', modern: true, name: 'Katarinahissen' });
    for (const [px, pz] of [[116, 701], [124, 701], [116, 709], [124, 709]]) B.box(px - 0.3, 0, pz - 0.3, px + 0.3, 38, pz + 0.3, steel);
    for (let y = 4; y < 38; y += 4) B.box(115.7, y, 700.7, 124.3, y + 0.25, 709.3, steel);
    B.box(117.5, 0, 702.5, 122.5, 36, 707.5, 0x5a6670);
    B.box(117.5, 36, 700, 122.5, 38.5, 776, steel);
    B.box(116, 31, 712, 124, 35.6, 738, 0x2a3540);
    B.box(115.8, 35.6, 711.8, 124.2, 36, 738.2, 0xe8e8e8);
    addBox(115.7, 700.7, 124.3, 709.3, 38);
  }
  landmark([1008, -300, 1, 0], 42, 70, 0x5b4636, 20, { rh: 8, ri: 8, roofCol: 0x3f3229, name: 'Vasamuseet' })
    .box(1027.8, 28, -262, 1028.6, 58, -261.2, 0x3a2c22);
  landmark([125, -1125, 1, 0], 60, 22, 0xe2d6bd, 14, { rh: 3, roofCol: 0x5f9c86, name: 'Kungliga biblioteket' });
  // further out: Stadion with its towers, KTH, the armed forces' headquarters on Gärdet, DN-skrapan at Marieberg, the
  // old prison on Långholmen, Rosendals slott on Djurgården and Tele2 Arena beside Globen
  {
    const cx = 420, cz = -1840, a = 100, b = 72, brick = 0x9a4a32, n = 44, B = cityAt(cx, cz), ring = [];
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * TAU, t1 = ((i + 1) / n) * TAU, p0 = [cx + Math.cos(t0) * a, cz + Math.sin(t0) * b], p1 = [cx + Math.cos(t1) * a, cz + Math.sin(t1) * b];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), c = (p1[0] - p0[0]) / len, sn = (p1[1] - p0[1]) / len;
      B.setFrame(p0[0], p0[1], c, sn);
      B.box(0, 0, 0, len + 0.3, 15, 7, brick, true, true);
      B.setFrame();
      ring.push(p0);
    }
    const inner = (k) => Array.from({ length: 40 }, (_, i) => [cx + Math.cos((i / 40) * TAU) * (a - k), cz + Math.sin((i / 40) * TAU) * (b - k)]);
    const track = inner(8), field = inner(16);
    for (let i = 0; i < 40; i++) {
      const [ax, az] = track[i], [bx, bz] = track[(i + 1) % 40], [cx2, cz2] = field[(i + 1) % 40], [dx, dz] = field[i];
      B.quad([ax, 0.03, az], [bx, 0.03, bz], [cx2, 0.03, cz2], [dx, 0.03, dz], 0xa5523a, null, [0, 1, 0]);
    }
    triangulate(grassB, field, 0.035, 0xffffff, 6);
    for (const s of [-1, 1]) {
      const tx = cx + s * 16, tz = cz + b - 2;
      B.box(tx - 5, 0, tz - 5, tx + 5, 30, tz + 5, brick, true, false);
      B.hip(tx - 5.3, tz - 5.3, tx + 5.3, tz + 5.3, 30, 7, 5.3, 5.3, 0x5f9c86);
    }
    addBox(cx - a, cz - b, cx + a, cz + b, 15);
    take(ring); mapPolys.push([ring, brick]); mapGreens.push(field);
    mapLabels.push(['Stadion', cx, cz, 'landmark']);
  }
  {
    const B = landmark([150, -1810, 1, 0], 90, 40, 0x9a4a32, 18, { rh: 4, roofCol: 0x3a3e42, name: 'KTH' });
    B.box(189, 0, -1822, 201, 42, -1810, 0x9a4a32, true, false);
    B.hip(188.7, -1822.3, 201.3, -1809.7, 42, 8, 6.3, 6.3, 0x5f9c86);
  }
  landmark([1250, -1458, 1, 0], 60, 36, 0xc9bfa6, 18, { rh: 3, roofCol: 0x3a3e42, name: 'Försvarsmaktens högkvarter' });
  landmark([-2212.5, -292.5, 1, 0], 25, 25, 0x9aa3a8, 82, { modern: true, roof: 'flat', plinth: false, name: 'DN-skrapan' });
  landmark([-1630, 596, 1, 0], 70, 24, 0xe0b864, 12, { rh: 3, roofCol: 0x3a3e42, name: 'Långholmens fängelse' });
  landmark([2185, -262, 1, 0], 34, 16, 0xe7b4a2, 10, { rh: 4, roofCol: 0x3a3e42, name: 'Rosendals slott' });
  landmark([560, 2715, 1, 0], 160, 140, 0x5b6268, 30, { modern: true, roof: 'flat', plinth: false, name: 'Tele2 Arena' });
  // Globen, the white ball of the arena in Johanneshov (110 m across, 85 m tall), and Kaknästornet, the 155 m television
  // tower on Gärdet. They tower over everything, so they are drawn even beyond the fog (see FAR)
  const GLOBE = { x: 560, z: 2620, R: 55, y: 30 }, KAKNAS = { x: 2540, z: -1000 };
  {
    const poly = Array.from({ length: 24 }, (_, i) => [GLOBE.x + Math.cos((i / 24) * TAU) * 46.1, GLOBE.z + Math.sin((i / 24) * TAU) * 46.1]);
    addCircle(GLOBE.x, GLOBE.z, 46.5, 85); take(poly); mapPolys.push([poly, 0xf1f1ef]); mapLabels.push(['Globen', GLOBE.x, GLOBE.z, 'landmark']);
    const kp = Array.from({ length: 8 }, (_, i) => [KAKNAS.x + Math.cos((i / 8) * TAU + 0.39) * 6, KAKNAS.z + Math.sin((i / 8) * TAU + 0.39) * 6]);
    addCircle(KAKNAS.x, KAKNAS.z, 6.2, 172); take(kp); mapPolys.push([kp, 0xc9c6bf]); mapLabels.push(['Kaknästornet', KAKNAS.x, KAKNAS.z, 'landmark']);
  }
  // more of the city: Klara kyrka's tall spire, Rosenbad by the water, Johannes kyrka in Vasastan, Östermalms saluhall,
  // and on Kungsholmen the Rådhuset court house and Polishuset, the police headquarters
  {
    const B = landmark([-458, -548, 1, 0], 26, 46, 0xa3503a, 15, { rh: 9, ri: 12, roofCol: 0x3a3e42, name: 'Klara kyrka' });
    steeple(B, -452, -562, -438, -548, 42, 62, 0xa3503a, 0x5f9c86, false);
  }
  landmark([-300, -345, 1, 0], 60, 38, 0xd9b8a0, 22, { rh: 4, ri: 4, roofCol: 0x5f9c86, name: 'Rosenbad' });
  {
    const B = landmark([-266, -1218, 1, 0], 22, 40, 0xa3503a, 14, { rh: 8, ri: 10, roofCol: 0x3a3e42, name: 'Johannes kyrka' });
    steeple(B, -262, -1232, -248, -1218, 32, 46, 0xa3503a, 0x3a3e42, false);
  }
  {
    const B = landmark([364, -990, 1, 0], 48, 52, 0x9a4a32, 11, { rh: 5, ri: 10, roofCol: 0x4a4f52, name: 'Östermalms saluhall' });
    for (const x of [364, 404]) { B.box(x, 0, -990, x + 8, 17, -982, 0x9a4a32, true, false); B.hip(x - 0.3, -990.3, x + 8.3, -981.7, 17, 4, 4, 4, 0x4a4f52); }
  }
  {
    const B = landmark([-1100, -626, 1, 0], 65, 52, 0xa45a3d, 18, { rh: 4, ri: 4, roofCol: 0x5f9c86, name: 'Rådhuset' });
    B.box(-1072, 18, -626, -1062, 30, -616, 0xa45a3d, true, false); B.hip(-1072.3, -626.3, -1061.7, -615.7, 30, 6, 5, 5, 0x5f9c86);
  }
  landmark([-1340, -634, 1, 0], 50, 59, 0xd6c49c, 21, { roof: 'flat', name: 'Polishuset' });
  {
    const B = cityAt(650, 40);
    B.prism(650, 40, 13, 0, 14, 20, 0xe6d8b0);
    B.prism(650, 40, 13.6, 14, 22, 20, 0x5f9c86, 3);
    B.prism(650, 40, 2.4, 22, 27, 8, 0xe6d8b0, 1.4);
    addCircle(650, 40, 13.2, 22);
    take(axisPoly(636, 26, 664, 54));
    mapPolys.push([axisPoly(637, 27, 663, 53), 0xe6d8b0]);
    mapLabels.push(['Skeppsholmskyrkan', 650, 40, 'landmark']);
  }
  landmark([560, 110, 1, 0], 80, 50, 0xd8d5ce, 7, { roof: 'flat', modern: true, name: 'Moderna museet' });
  {
    const B = cityAt(730, 430);
    landmark([718, 420, 1, 0], 24, 22, 0xa45a3d, 8, { rh: 2, roofCol: 0x3a3e42 });
    B.prism(722, 424, 5, 0, 16, 14, 0xa45a3d);
    B.prism(722, 424, 5.4, 16, 17, 14, 0x8a4a35);
    B.box(721.9, 17, 423.9, 722.1, 24, 424.1, 0xe8e8e8);
    B.box(722.1, 21.6, 423.95, 725.1, 23.6, 424.05, 0xf2c200);
    mapLabels.push(['Kastellet', 722, 424, 'landmark']);
  }

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
          const fr = lotFrame(f, side, s, lot, set);
          if (fits(rectPoly(fr, 0, 0, lot, depth))) { addBuilding(fr, lot, depth, S); built = true; break; }
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
