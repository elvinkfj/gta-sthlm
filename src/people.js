'use strict';

  /* ================= people ================= */
  const personMat = std({ vertexColors: true, roughness: 0.8 });
  const SKINS = [0xf0c08a, 0xe0ac7e, 0xc68b5e, 0x8d5a3b, 0xf5d0a9];
  const SHIRTS = [0xc8102e, 0x2f6fdb, 0x2e8b57, 0xf2b705, 0x6a3d9a, 0xe8e8e8, 0x222428, 0xe46f2a, 0x1f9aa8, 0xb03a74, 0x7a8b99];
  const PANTS = [0x27324a, 0x1c1d21, 0x5a4a3a, 0x3b5b8c, 0x6b6f75];
  const HAIRS = [0xe8d08a, 0x6b4a2b, 0x2b1d14, 0x9a9a9a, 0xc4733a];
  // People are about 1.8 m tall, with rounded heads (a face, ears and hair or a hat), a neck and shoulders, arms with
  // hands and legs with knees and shoes. A person is a body and four limbs that swing from the hips and shoulders.
  const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
  const ball = (r, w = 12, hs = 8, tl = Math.PI) => new THREE.SphereGeometry(r, w, hs, 0, TAU, 0, tl);
  const squash = (g, x, y, z) => { g.scale(x, y, z); return g; };
  // a head centred at (0, cy, 0), s times the usual size
  function head(m, id, cy, s) {
    const r = 0.115 * s;
    m.add(squash(ball(r, 14, 10), 0.92, 1.08, 1), id.skin, 0, cy, 0);
    for (const sx of [1, -1]) {
      m.add(squash(ball(r * 0.22, 6, 5), 0.5, 1, 0.8), id.skin, sx * r * 0.9, cy, -r * 0.05);
      m.add(ball(r * 0.1, 6, 5), 0x15181c, sx * r * 0.36, cy + r * 0.16, r * 0.88);
      m.box(r * 0.3, r * 0.06, r * 0.05, shade(id.hair, 0.8), sx * r * 0.36, cy + r * 0.38, r * 0.86);
    }
    m.add(squash(cyl(r * 0.05, r * 0.15, r * 0.34, 6), 1, 1, 0.9), id.skin, 0, cy - r * 0.04, r * 0.98, -0.3, 0, 0);
    m.box(r * 0.36, r * 0.05, r * 0.05, shade(id.skin, 0.7), 0, cy - r * 0.44, r * 0.86);
    const cap = (rr, tl, col, tilt = 0) => m.add(ball(rr, 14, 6, tl), col, 0, cy + r * 0.04, -r * 0.04, tilt, 0, 0);
    if (id.hat === 'cap') {
      cap(r * 1.08, Math.PI * 0.5, id.hatColor);
      m.add(squash(cyl(r * 0.9, r * 0.9, r * 0.08, 14), 1, 1, 0.75), id.hatColor, 0, cy + r * 0.12, r * 0.85, 0.12, 0, 0);
    } else if (id.hat === 'beanie') {
      cap(r * 1.1, Math.PI * 0.58, id.hatColor);
      m.add(ball(r * 0.22, 6, 5), id.hatColor, 0, cy + r * 1.12, 0);
    } else if (id.hat === 'combat') {
      // the army's combat helmet under its camouflage cover
      cap(r * 1.2, Math.PI * 0.56, 0x4a5638);
      m.add(squash(cyl(r * 1.16, r * 1.22, r * 0.1, 14), 1, 1, 1.08), 0x3d4730, 0, cy - r * 0.08, -r * 0.02);
      for (const [a, b] of [[0.6, 0.3], [-0.7, 0.5], [0.1, -0.6]]) m.add(ball(r * 0.32, 6, 4), 0x2a3221, Math.sin(a) * r * 0.95, cy + r * 0.55 + b * r * 0.2, Math.cos(a) * r * 0.6 * Math.sign(b));
    } else if (id.hat === 'helmet') {
      // Högvakten's spiked helmet (pickelhuva): black leather with a brass spike and plate
      cap(r * 1.14, Math.PI * 0.55, 0x15171a);
      m.add(squash(cyl(r * 1.05, r * 1.1, r * 0.08, 14), 1, 1, 1.1), 0x15171a, 0, cy - r * 0.02, r * 0.1);
      m.add(new THREE.ConeGeometry(r * 0.16, r * 0.8, 8), 0xd4a53a, 0, cy + r * 1.45, 0);
      m.box(r * 0.7, r * 0.6, r * 0.05, 0xd4a53a, 0, cy + r * 0.55, r * 1.04);
    } else cap(r * 1.05, Math.PI * 0.56, id.hair, -0.35); // hair, over the top and down the back
  }
  function makeIdentity(o = {}) {
    const id = {
      skin: o.skin ?? rpick(SKINS), shirt: o.shirt ?? rpick(SHIRTS), pants: o.pants ?? rpick(PANTS), hair: o.hair ?? rpick(HAIRS),
      hat: o.hat !== undefined ? o.hat : Math.random() < 0.25 ? 'cap' : Math.random() < 0.35 ? 'beanie' : null,
      hatColor: o.hatColor ?? rpick(SHIRTS), sleeves: o.sleeves ?? Math.random() < 0.7
    };
    const b = new Merger();
    b.add(squash(cyl(0.15, 0.155, 0.18, 12), 1.15, 1, 0.78), id.pants, 0, 0.99, 0);
    b.add(squash(cyl(0.175, 0.15, 0.4, 12), 1.2, 1, 0.75), id.shirt, 0, 1.27, 0);
    b.add(squash(ball(0.175, 12, 8), 1.22, 0.42, 0.76), id.shirt, 0, 1.46, 0);
    b.add(cyl(0.048, 0.055, 0.12, 8), id.skin, 0, 1.55, 0.005);
    head(b, id, 1.67, 1);
    if (o.belts) {
      // Högvakten: white belt with a brass buckle and white bandoliers crossed over the chest
      b.add(squash(cyl(0.157, 0.157, 0.05, 12), 1.17, 1, 0.8), 0xf2f2ee, 0, 1.08, 0);
      b.box(0.05, 0.05, 0.02, 0xd4a53a, 0, 1.08, 0.128);
      for (const s of [1, -1]) b.add(new THREE.BoxGeometry(0.045, 0.48, 0.02), 0xf2f2ee, s * 0.05, 1.29, 0.122, 0, 0, s * 0.45);
    }
    if (o.soldier) {
      // M90 camouflage: splinters of dark green and black over the green, and a vest of webbing over the chest
      for (const [x, y, z, sx, sy] of [[0.1, 1.2, 0.12, 0.09, 0.06], [-0.12, 1.33, 0.11, 0.07, 0.08], [0.15, 1.36, -0.1, 0.08, 0.05], [-0.08, 1.1, -0.12, 0.09, 0.05], [0.0, 1.0, 0.13, 0.06, 0.04], [-0.16, 1.18, -0.06, 0.06, 0.07]]) {
        b.add(new THREE.BoxGeometry(sx * 2, sy * 2, 0.02), Math.abs(x + y) % 0.3 < 0.15 ? 0x2c3623 : 0x1c1f17, x, y, z, 0, Math.atan2(x, z), 0.5);
      }
      b.add(squash(cyl(0.185, 0.17, 0.3, 12), 1.2, 1, 0.8), 0x3f4a33, 0, 1.25, 0);
      for (const sx of [1, -1]) b.box(0.07, 0.09, 0.05, 0x323b28, sx * 0.1, 1.18, 0.15);
    }
    if (o.police) {
      // the police: reflective yellow-green band round the chest and a POLIS-blue collar
      b.add(squash(cyl(0.172, 0.168, 0.06, 12), 1.21, 1, 0.76), 0xc9d82a, 0, 1.33, 0);
      b.add(squash(cyl(0.07, 0.075, 0.05, 10), 1.3, 1, 1.1), 0x0f2350, 0, 1.51, 0);
    }
    id.bodyGeo = b.build();
    const l = new Merger();
    l.add(cyl(0.082, 0.066, 0.47, 10), id.pants, 0, -0.235, 0);
    l.add(ball(0.066, 8, 6), id.pants, 0, -0.47, 0.005);
    l.add(cyl(0.064, 0.05, 0.41, 10), id.pants, 0, -0.68, 0);
    l.add(squash(ball(0.062, 10, 6), 0.95, 0.62, 1.95), 0x1c1c1c, 0, -0.9, 0.055);
    l.box(0.11, 0.025, 0.24, 0x2c2c2c, 0, -0.925, 0.05);
    id.legGeo = l.build();
    const a = new Merger(), sl = id.sleeves ? id.shirt : id.skin;
    a.add(ball(0.06, 8, 6), id.shirt, 0, -0.01, 0);
    a.add(cyl(0.055, 0.047, 0.29, 8), id.shirt, 0, -0.15, 0);
    a.add(cyl(0.046, 0.038, 0.26, 8), sl, 0, -0.42, 0);
    a.add(squash(ball(0.045, 8, 6), 0.75, 1.25, 0.55), id.skin, 0, -0.6, 0);
    id.armGeo = a.build();
    // sitting at the wheel: upper body, head and arms out to the wheel, inside the room the seats were fitted for
    const d = new Merger();
    d.add(squash(cyl(0.18, 0.16, 0.42, 12), 1.15, 1, 0.75), id.shirt, 0, 0.23, 0);
    d.add(squash(ball(0.18, 12, 8), 1.17, 0.42, 0.76), id.shirt, 0, 0.44, 0);
    d.add(cyl(0.048, 0.055, 0.1, 8), id.skin, 0, 0.51, 0.005);
    head(d, id, 0.64, 1.05);
    for (const s of [1, -1]) {
      d.add(cyl(0.05, 0.045, 0.28, 8), id.shirt, s * 0.21, 0.32, 0.08, 0.55, 0, 0);
      d.add(cyl(0.043, 0.038, 0.27, 8), sl, s * 0.17, 0.24, 0.3, 1.35, 0, -s * 0.2);
      d.add(ball(0.045, 8, 6), id.skin, s * 0.15, 0.27, 0.43);
    }
    id.driverGeo = d.build();
    return id;
  }
  function makePersonModel(id) {
    const group = new THREE.Group(), inner = new THREE.Group();
    group.add(inner);
    const body = new THREE.Mesh(id.bodyGeo, personMat); body.castShadow = true; inner.add(body);
    const limb = (geo, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(geo, personMat); m.castShadow = true; p.add(m); inner.add(p); return p; };
    const legL = limb(id.legGeo, 0.09, 0.93), legR = limb(id.legGeo, -0.09, 0.93);
    const armL = limb(id.armGeo, 0.24, 1.43), armR = limb(id.armGeo, -0.24, 1.43);
    scene.add(group);
    return { group, inner, legL, legR, armL, armR };
  }
  const persons = [];
  function makePerson(id, x, z, ai) {
    const p = { id, model: makePersonModel(id), x, y: 0, z, vx: 0, vy: 0, vz: 0, rot: 0, grounded: true, walkPhase: Math.random() * 6, ai, asleep: false, blocked: false, knockT: 0, intent: null };
    p.model.group.position.set(x, 0, z);
    persons.push(p);
    return p;
  }
  function removePerson(p) {
    scene.remove(p.model.group);
    const i = persons.indexOf(p);
    if (i >= 0) persons.splice(i, 1);
  }
  const playerId = makeIdentity({ skin: 0xf0c08a, shirt: 0x2f6fdb, pants: 0x27324a, hat: 'cap', hatColor: 0xf7c600 });
  // you start in the car park on the quay at Skeppsbron, in the aisle between the bays, looking along it towards the palace
  const SPAWN = (() => {
    const [x, z] = LOT.at(58, LOT.aisle);
    return { x, z, s: 58, rot: Math.atan2(-LOT.f.ux, -LOT.f.uz) };
  })();
  const player = makePerson(playerId, SPAWN.x, SPAWN.z, null);
  player.rot = SPAWN.rot;
