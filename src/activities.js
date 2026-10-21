'use strict';

  /* ================= Högvakten and the Dalahäst hunt ================= */
  // The royal guard marches up and down Yttre borggården in two files, turning at either end of the courtyard.
  const GUARD_ID = makeIdentity({ skin: 0xf0c08a, shirt: 0x1d2c5a, pants: 0x1d2c5a, hat: 'helmet', belts: true });
  function guardTarget(post, t) {
    const T = 64, ph = (t % T) / T, hold = 0.09;
    // a triangle wave with a halt at each end: march north, halt, about turn, march south, halt
    const s = ph < 0.5 ? clamp((ph - hold) / (0.5 - hold), 0, 1) : 1 - clamp((ph - 0.5 - hold) / (0.5 - hold), 0, 1);
    const dir = ph < hold || (ph >= 0.5 && ph < 0.5 + hold) ? (ph < 0.5 ? 1 : -1) : ph < 0.5 ? 1 : -1;
    const lead = lerp(-24, 24, s);
    return { x: post.x, z: lead - dir * post.rank * 2.3, face: dir > 0 ? 0 : Math.PI };
  }
  for (let i = 0; i < 8; i++) {
    const post = { x: i % 2 ? -73 : -85, rank: Math.floor(i / 2) }, g = guardTarget(post, 0);
    const p = makePerson(GUARD_ID, g.x, g.z, { state: 'guard', post, dodgeT: 0 });
    p.keep = true;
  }
  mapLabels.push(['Högvakten', -79, 30, 'landmark']);
  // at the station: the officer behind the counter, and somebody already sitting in the first cell
  {
    const desk = makePerson(makeIdentity(OFFICER), STATION.desk[0], STATION.desk[1], { state: 'idle', face: 0, dodgeT: 0 });
    desk.keep = true;
    const [x0, z0, x1, z1] = STATION.doors[0].inside, inmate = makePerson(makeIdentity({ shirt: 0xe46f2a, pants: 0x3b3f45 }), (x0 + x1) / 2 + 0.6, z1 - 1.2, { state: 'idle', face: 0, dodgeT: 0 });
    inmate.keep = true;
  }

  // Twenty Dalahästar are hidden around town, nine of them in the lanes of Gamla stan. Walk or drive into one to
  // collect it and learn something about the place. Find them all for fireworks over Strömmen and golden cars.
  const HORSES = [
    ['Mårten Trotzigs gränd', -87.5, 371, 'Gamla stans smalaste gränd, bara 90 cm bred på det smalaste stället. Den är en enda lång trappa.'],
    ['Järnpojken', 59, 124, 'Järnpojken bakom Finska kyrkan är Stockholms minsta staty. På vintern får han stickade mössor och mynt.'],
    ['Brända tomten', 80, 279, 'Här brann ett hus för länge sedan och tomten fick stå tom. Nu är den ett litet torg med ett träd.'],
    ['Stortorget', -55, 226, 'Stockholms äldsta torg. Här skedde Stockholms blodbad 1520.'],
    ['Köpmantorget', 103, 237, 'Sankt Göran och draken på Köpmantorget är en kopia av skulpturen inne i Storkyrkan.'],
    ['Slottsbacken', 141, 2, 'Obelisken på Slottsbacken restes år 1800 som tack till Stockholms borgare.'],
    ['Mynttorget', -118, -78, 'Mynttorget har fått sitt namn efter Myntet, där Sveriges mynt präglades.'],
    ['Gåsgränd', -170, 165, 'Gränderna väster om Västerlånggatan går ner mot Stora Nygatan och vattnet vid Munkbron.'],
    ['Skeppar Karls gränd', 171, 156, 'Gränderna öster om Österlånggatan ledde förr ner till hamnen där skeppen lade till.'],
    ['Tyska brinken', 76, 351, 'Tyska kyrkans klockspel spelar flera gånger om dagen över Gamla stans tak.'],
    ['Evert Taubes terrass', -478, 236, 'Från Evert Taubes terrass på Riddarholmen har man en av Stockholms finaste utsikter över Riddarfjärden.'],
    ['Kungsträdgården', 29.5, -545, 'Kungsträdgården var från början kungens köksträdgård. På våren blommar körsbärsträden.'],
    ['Sergels torg', -225, -600, 'Glasobelisken på Sergels torg heter Kristallvertikalaccent och är 37 meter hög.'],
    ['Skeppsholmen', 780, 5, 'På Skeppsholmen hade flottan sin bas i flera hundra år.'],
    ['Djurgården', 1220, -90, 'Djurgården var kungens jaktpark. Här finns Skansen och Gröna Lund.'],
    ['Mariatorget', -520, 1082, 'Fontänen på Mariatorget föreställer Tor som fiskar upp Midgårdsormen.'],
    ['Humlegården', 150, -1100, 'Humlegården var kungens humleodling. Här ligger Kungliga biblioteket.'],
    ['Medborgarplatsen', 150, 1422, 'Medborgarplatsen är Södermalms stora torg, uppkallat efter Medborgarhuset.'],
    ['Stadshuset', -1000, -32, 'Stadshusets torn är 106 meter högt och har tre kronor i toppen.'],
    ['Slussen', 30, 725, 'Vid Slussen möts Mälaren och Saltsjön. Mälaren ligger lite högre, så båtarna slussas mellan dem.']
  ];
  const HORSE_KEY = 'gubbe-dalahastar';
  let horsesFound = new Set(), goldCars = false, fireworksT = 0, rocketT = 0;
  const bursts = [];
  try { horsesFound = new Set(JSON.parse(localStorage.getItem(HORSE_KEY) || '[]')); } catch (e) { /* private window: the hunt just starts over */ }
  goldCars = horsesFound.size >= HORSES.length;
  const horseGeo = (() => {
    const m = new Merger(), red = 0xc8102e, yel = 0xf2c200, blu = 0x1f5fa8, grn = 0x2e8b57, wht = 0xf4f1ea;
    m.box(0.34, 0.42, 1.0, red, 0, 0.95, 0);
    m.box(0.32, 0.62, 0.24, red, 0, 0.44, 0.34); m.box(0.32, 0.62, 0.24, red, 0, 0.44, -0.36);
    m.box(0.3, 0.6, 0.32, red, 0, 1.36, 0.4); m.box(0.28, 0.3, 0.52, red, 0, 1.62, 0.6); m.box(0.24, 0.14, 0.08, red, 0, 1.82, 0.44);
    m.box(0.36, 0.06, 0.44, blu, 0, 1.18, -0.08); m.box(0.37, 0.04, 0.46, yel, 0, 1.13, -0.08);
    m.box(0.36, 0.05, 0.5, yel, 0, 1.6, 0.66); m.box(0.32, 0.46, 0.06, 0x1d1d1f, 0, 1.42, 0.24);
    for (const sx of [1, -1]) {
      m.box(0.02, 0.16, 0.16, yel, sx * 0.172, 0.98, 0.18); m.box(0.02, 0.08, 0.08, wht, sx * 0.174, 0.98, 0.18);
      m.box(0.02, 0.06, 0.28, grn, sx * 0.172, 0.84, 0.12); m.box(0.02, 0.12, 0.12, blu, sx * 0.172, 0.98, -0.3);
      m.box(0.02, 0.05, 0.05, wht, sx * 0.142, 1.66, 0.74);
    }
    return m.build();
  })();
  const horseMat = std({ vertexColors: true, roughness: 0.32, emissive: 0x2a0606 });
  const horses = HORSES.map(([name, x, z, fact], i) => {
    const mesh = new THREE.Mesh(horseGeo, horseMat), glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf5a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.scale.setScalar(1.45); mesh.castShadow = true; glow.scale.set(3.2, 3.2, 1);
    const g = new THREE.Group(); g.add(mesh, glow); g.position.set(x, 0, z); glow.position.y = 1.2;
    const found = horsesFound.has(name);
    g.visible = !found; scene.add(g);
    return { name, x, z, fact, g, mesh, found, ph: i * 0.7 };
  });
  const fireFx = new Particles(1800, THREE.AdditiveBlending, false);
  // the white water behind a boat: spray thrown up from the stern, and foam left lying on the water
  const foamFx = new Particles(700, THREE.NormalBlending, true), FOAM_COL = new THREE.Color(0xf4f8fa);
  function boatWake(c, dt) {
    const v = Math.hypot(c.vx, c.vz);
    if (v < 1.5 || Math.hypot(c.x - camTarget.x, c.z - camTarget.z) > 160) return;
    const co = Math.cos(c.h), si = Math.sin(c.h), lz = -c.M.L / 2 + 0.2, n = Math.min(4, v * dt * 6);
    for (let i = 0; i < n; i++) {
      const lx = (Math.random() - 0.5) * c.M.W * 0.8, x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
      foamFx.spawn({ x, y: WATER_Y + 0.15, z, vx: -c.vx * 0.15 + (Math.random() - 0.5), vy: 0, vz: -c.vz * 0.15 + (Math.random() - 0.5), life: 2.6 + Math.random(), size: [0.7, 2.6 + v * 0.06], alpha: Math.min(0.65, 0.2 + v * 0.025), c: FOAM_COL, drag: 1.2, floor: WATER_Y + 0.15, fadeIn: 0.05 });
      if (v > 6 && Math.random() < 0.5) foamFx.spawn({ x, y: WATER_Y + 0.4, z, vx: -c.vx * 0.3 + (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2.5, vz: -c.vz * 0.3 + (Math.random() - 0.5) * 2, life: 0.9, size: [0.3, 1.4], alpha: 0.5, c: FOAM_COL, grav: 9, drag: 0.6, floor: WATER_Y + 0.08 });
    }
    // the bow wave, peeling off both sides of the front
    if (v > 3 && Math.random() < dt * 14) for (const sd of [1, -1]) {
      const lx = sd * c.M.W * 0.45, bz = c.M.L * 0.25, x = c.x + lx * co + bz * si, z = c.z - lx * si + bz * co;
      foamFx.spawn({ x, y: WATER_Y + 0.12, z, vx: sd * co * 1.6 + c.vx * 0.2, vy: 0.5, vz: -sd * si * 1.6 + c.vz * 0.2, life: 1.6, size: [0.4, 1.6], alpha: 0.4, c: FOAM_COL, grav: 3, drag: 0.8, floor: WATER_Y + 0.08 });
    }
    // sliding through a hard turn: the side the hull skids towards throws up a sheet of spray, a little out from the hull
    // and faster sideways than the hull itself, so that the hull doesn't slide into its own spray
    const vl = c.vx * co - c.vz * si;
    if (c.slip > 2 && v > 3 && Math.random() < dt * c.slip * 6) {
      const sd = Math.sign(vl), lx = sd * (c.M.W * 0.5 + 0.25), lz = (Math.random() - 0.6) * c.M.L * 0.6, x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
      const kick = vl * 0.7 + sd * (1.5 + c.slip * 0.4);
      foamFx.spawn({ x, y: WATER_Y + 0.3, z, vx: c.vx * 0.3 + co * kick, vy: 1.5 + Math.random() * 2, vz: c.vz * 0.3 - si * kick, life: 1.1, size: [0.4, 1.8], alpha: Math.min(0.6, 0.15 + c.slip * 0.05), c: FOAM_COL, grav: 9, drag: 0.6, floor: WATER_Y + 0.08 });
    }
  }
  const FIRE_COLS = [0x2f7bff, 0xf7c600, 0xe0203a, 0x3fd06a, 0xffffff, 0xff7ad9];
  function launchRocket() {
    const x = rr(-60, 320), z = rr(-220, -110), top = rr(55, 85), col = new THREE.Color(rpick(FIRE_COLS));
    fireFx.spawn({ x, y: 2, z, vx: rr(-1, 1), vy: top / 1.4, vz: rr(-1, 1), life: 1.4, size: [0.9, 0.5], alpha: 1, color: 0xffe0a0, drag: 0.7 });
    bursts.push({ t: 1.4, fn: () => {
      for (let i = 0; i < 90; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), s = rr(11, 15);
        fireFx.spawn({ x, y: top, z, vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s, life: rr(1.8, 2.6), size: [3.6, 1.0], alpha: 1, c: col, grav: 3.5, drag: 0.9 });
      }
      if (audio && !muted) { const ps = placeSound(x, z, 2500); noiseBurst(audio.ctx.currentTime + ps.d / 340, 1.1, 0.5 * Math.max(0.15, ps.level), 'lowpass', 320, 0.7, ps.pan, 0.003); }
    } });
  }
  function collectHorse(h) {
    h.found = true; h.g.visible = false;
    horsesFound.add(h.name);
    try { localStorage.setItem(HORSE_KEY, JSON.stringify([...horsesFound])); } catch (e) { /* not saved, still counted */ }
    const n = horsesFound.size;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU, s = rr(2, 5);
      sparkFx.spawn({ x: h.x, y: 1.2, z: h.z, vx: Math.cos(a) * s, vy: rr(2, 6), vz: Math.sin(a) * s, life: rr(0.5, 0.9), size: [0.14, 0.04], alpha: 1, color: rpick([0xf2c200, 0xc8102e, 0xffffff]), grav: 9, drag: 1 });
    }
    beep([784, 988, 1319], 0.035, 0.32);
    if (n >= HORSES.length) {
      goldCars = true; fireworksT = 60;
      toast('Alla ' + HORSES.length + ' dalahästar hittade! Fyrverkeri över Strömmen, och nu finns alla bilar i guld (tryck B).');
    } else toast('Dalahäst ' + n + ' av ' + HORSES.length + ': ' + h.name + '. ' + h.fact + ' Hittelön 50 kr.');
    // a finder's fee for every one
    JOBS.reward(50);
  }
  function updateSurprises(dt) {
    const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z, reach = driving ? 3.4 : 1.7;
    for (const h of horses) {
      if (h.found) continue;
      const d = Math.hypot(h.x - px, h.z - pz);
      if (d > 220) continue;
      h.mesh.rotation.y = clock * 1.1 + h.ph;
      h.mesh.position.y = 0.25 + Math.sin(clock * 2.2 + h.ph) * 0.18;
      if (d < reach && (driving || player.y < 2.5) && !(policeStop && policeStop.riding)) collectHorse(h);
    }
    if (fireworksT > 0) {
      fireworksT = Math.max(0, fireworksT - dt);
      if ((rocketT -= dt) <= 0) { launchRocket(); rocketT = rr(0.25, 0.9); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) if ((bursts[i].t -= dt) <= 0) { bursts[i].fn(); bursts.splice(i, 1); }
  }

  /* ================= jobs and street races ================= */
  // J starts a job in the car you drive: fares in the taxi, parcels in the Sprinter, a route in the SL bus. At the
  // yellow pillars of light around town J starts a street race against the clock. A pillar of light marks where to go
  // and a GPS line on both maps shows the way along the streets. What you earn goes in the Kassa, kept between visits.
  const JOBS = (() => {
    // you start with some pocket money, enough for an ice cream and a balloon
    const CASH_KEY = 'gubbe-kassa', RACE_KEY = 'gubbe-gatlopp', POCKET_MONEY = 100;
    let earned = POCKET_MONEY, records = {};
    try { const kept = localStorage.getItem(CASH_KEY); earned = kept === null ? POCKET_MONEY : Math.max(0, +kept || 0); records = JSON.parse(localStorage.getItem(RACE_KEY) || '{}') || {}; } catch (e) { /* a private window: kept for this visit only */ }
    const save = () => { try { localStorage.setItem(CASH_KEY, String(earned)); localStorage.setItem(RACE_KEY, JSON.stringify(records)); } catch (e) { /* counted anyway */ } };
    const fmtTime = (t) => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0').replace('.', ',');
    const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km');
    // places a fare can ask for, in the real spots
    const PLACES = [
      ['Stadshuset', -1000, -100], ['Centralstationen', -610, -490], ['Kungliga Operan', -56, -320], ['Grand Hôtel', 200, -295], ['Nationalmuseum', 335, -305],
      ['Östermalmstorg', 387, -903], ['Stureplan', 130, -968], ['Hötorget', -455, -890], ['Sergels torg', -254, -606], ['Kungliga biblioteket', 155, -1110],
      ['Vasamuseet', 1029, -265], ['Moderna museet', 600, 135], ['Slussen', 40, 700], ['Medborgarplatsen', 152, 1422], ['Mariatorget', -500, 1080],
      ['Katarina kyrka', 240, 1262], ['Nytorget', 680, 1263], ['Rådhuset', -1067, -600], ['Polishuset', -1315, -604], ['Riddarholmskyrkan', -435, 125],
      ['Kungsträdgården', 29, -500], ['Strandvägen', 700, -620], ['Djurgården', 1200, -100], ['Fridhemsplan', -1500, -640],
      ['Mosebacke torg', 210, 822], ['Skeppsbron', 225, 160], ['Kungsholms strand', -930, -700], ['Hornstull', -950, 1250], ['Tegnérlunden', -816, -1192],
      ['Gröna Lund', 1330, 410], ['Skansen', 1560, 0], ['Kaknästornet', 2600, -1000], ['Globen', 420, 2520], ['Tele2 Arena', 640, 2525], ['Stadion', 420, -1690],
      ['Karlaplan', 1100, -1205], ['Sankt Eriksplan', -1560, -1440], ['Norrtull', -870, -2060], ['Roslagstull', -8, -1700], ['Rålambshovsparken', -1880, -100],
      ['Långholmen', -1440, 640], ['Hammarby sjöstad', 1000, 2195], ['Liljeholmen', -1300, 2200], ['Rosendals slott', 2200, -300], ['Danvikstull', 1900, 1250],
      ['Skanstull', 125, 1955], ['Odenplan', -795, -1425], ['KTH', 195, -1690], ['DN-skrapan', -2212, -440]
    ];
    const SAYS = ['Hej! Till {p}, tack.', 'Till {p}, och gärna lite fort, jag är sen!', 'Kan du köra mig till {p}?', '{p}, tack. Ta det lugnt i kurvorna.', 'Hej hej! {p} blir bra.'];
    // the moped's food runs: from a restaurant to someone's door
    const RESTAURANTS = ['Pizzeria Napoli', 'Sushibaren', 'Thaiköket', 'Burgerbaren', 'Falafelkungen', 'Pastabaren', 'Dumplinghuset', 'Kebabhuset', 'Tacobaren', 'Ramen-baren', 'Indiska köket', 'Pokébaren'];
    // the boat taxi's piers, the quays where the boats lie moored round town
    const PIER_SPOTS = [['Skeppsbron', ...LOT.at(66, 34)], ['Strandvägen', 735, -606], ['Gröna Lund', 1480, 650], ['Hammarby sjöstad', 600, 1965], ['Norr Mälarstrand', -1250, -45],
      ['Långholmen', -1560, 695], ['Marieberg', -2300, -95], ['Nacka strand', 2600, 1120], ['Lilla Värtan', 3000, -1300], ['Hammarby kaj', 400, 1972]];
    // the scrapyard in Hammarby hamn, where cars taken off the street are bought (not the ones you choose with B)
    const SCRAP = (() => { const k = kerbNear(1000, 2195); return { x: k.x, z: k.z, k, name: 'Bilskroten i Hammarby hamn' }; })();
    // the street races: a route of named junctions; every junction after the start is a checkpoint
    const RACES = [
      { id: 'gamla', name: 'Gamla stan runt', route: 'SK1 SK2 SK3 SK4 SL0 KH MB3 MB2 MB1 RT gRHN MT LB SBs SK1' },
      { id: 'djurgarden', name: 'Strandvägen–Djurgården', route: 'NP SV1 SV2 SV3 SV4 DJ0 DJ1 DJ2 DJ3' },
      { id: 'soder', name: 'Söder runt', route: 'SMT GG1 GG2 GG3 GG4 MP GG5 OG3 RG3 RG2 RG1 RG0 KV2 KV1 SL1' },
      { id: 'city', name: 'Cityslingan', route: 'TB V2 V3 V4 V5 D5 S2 R4 SP BJs BJr NP NT KT2 KT1 KT0 OP GA D0 TB' }
    ].map((r) => ({ ...r, pts: r.route.split(' ').map((id) => { const n = nodes[nodeIndex.get(id)]; return { x: n.x, z: n.z }; }) }));

    /* pillars of light: where to go (gold), the checkpoint after it (orange), and the race starts (yellow) */
    const beamTex = canvasTex(4, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    function beam(color, r, h) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      b.position.y = h / 2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.5, r * 1.85, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
      g.add(b, ring); g.visible = false; scene.add(g);
      return g;
    }
    const goalBeam = beam(0xffc21a, 1.7, 70), nextBeam = beam(0xff7a1a, 1.3, 45);
    const startBeams = RACES.map((r) => { const b = beam(0xffe14a, 2.3, 90); b.position.set(r.pts[0].x, 0, r.pts[0].z); b.visible = true; return b; });
    // parcels waiting at the kerb, and bus stop poles with the SL sign
    const parcelGeo = (() => { const m = new Merger(); m.box(0.6, 0.45, 0.5, 0xa77c4f, 0, 0.225, 0); m.box(0.5, 0.4, 0.45, 0xb98d5c, 0.1, 0.65, 0.05); m.box(0.4, 0.3, 0.4, 0x9c7147, -0.05, 1.0, 0); m.box(0.62, 0.04, 0.06, 0xd8c9a0, 0, 0.46, 0); return m.build(); })();
    const parcels = new THREE.Mesh(parcelGeo, personMat); parcels.visible = false; parcels.castShadow = true; scene.add(parcels);
    // a paper bag of takeaway on a crate by the kerb
    const bagGeo = (() => { const m = new Merger(); m.box(0.5, 0.42, 0.4, 0x6b5a45, 0, 0.21, 0); m.box(0.32, 0.38, 0.2, 0xc9a36a, 0, 0.61, 0); m.box(0.33, 0.08, 0.21, 0xc8102e, 0, 0.66, 0); m.box(0.2, 0.06, 0.02, 0xc9a36a, 0, 0.84, 0); return m.build(); })();
    const bag = new THREE.Mesh(bagGeo, personMat); bag.visible = false; bag.castShadow = true; scene.add(bag);
    const scrapBeam = beam(0x4cc26a, 2.6, 60);
    scrapBeam.position.set(SCRAP.x, 0, SCRAP.z); scrapBeam.visible = true;
    const slTex = canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#1f5fae'; roundRect(g, 8, 8, w - 16, w - 16, 14); g.fill();
      g.fillStyle = '#ffffff'; g.font = '900 64px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SL', w / 2, w / 2 + 4);
    });
    const stopGeo = (() => { const m = new Merger(); m.add(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 8), 0x5d646a, 0, 1.45, 0); m.box(0.5, 0.06, 0.06, 0x5d646a, 0, 2.6, 0); return m.build(); })();
    const stopSignMat = std({ map: slTex, roughness: 0.4, emissive: 0x222222, emissiveMap: slTex });
    const stopSignGeo = new THREE.PlaneGeometry(0.55, 0.55);
    const stopMeshes = [];
    function busStop(k) {
      const g = new THREE.Group(), pole = new THREE.Mesh(stopGeo, std({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
      const s1 = new THREE.Mesh(stopSignGeo, stopSignMat), s2 = new THREE.Mesh(stopSignGeo, stopSignMat);
      s1.position.set(0, 2.62, 0.04); s2.position.set(0, 2.62, -0.04); s2.rotation.y = Math.PI;
      g.add(pole, s1, s2); g.position.set(k.walkX, 0, k.walkZ); g.rotation.y = k.h + Math.PI / 2;
      scene.add(g); stopMeshes.push(g);
      return g;
    }

    /* where to stop: the kerb of a street, on one side or the other, and the pavement beside it */
    function kerbOn(e, t, side) {
      const A = nodes[e.a], B = nodes[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len;
      const s = clamp(t * e.len, Math.min(e.len / 2, A.r + 7), Math.max(e.len / 2, e.len - B.r - 7)), lat = side * Math.max(1.6, e.hw - 1.3), walk = side * (e.hw + Math.max(0.9, Math.min(2.2, e.walk * 0.55)));
      return { x: A.x + ux * s - uz * lat, z: A.z + uz * s + ux * lat, walkX: A.x + ux * s - uz * walk, walkZ: A.z + uz * s + ux * walk, h: Math.atan2(ux * side, uz * side), e };
    }
    function kerbNear(x, z) {
      const ne = nearestEdge(x, z, (e) => e.drive && !e.bridge && e.len > 25), e = ne.e, A = nodes[e.a], B = nodes[e.b];
      const t = ((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / (e.len * e.len), side = (x - A.x) * -(B.z - A.z) + (z - A.z) * (B.x - A.x) >= 0 ? 1 : -1;
      return kerbOn(e, t, side);
    }
    // only streets that run through the ring between dmin and dmax are tried (picking from the whole map, most tries
    // would land too far away); if none of them has a free kerb, the ring is widened
    function randomKerb(cx, cz, dmin, dmax) {
      for (let wide = 1; wide <= 2; wide++) {
        const lo = dmin / wide, hi = dmax * wide;
        const pool = edges.filter((e) => {
          if (!e.drive || e.bridge || e.len <= 35 || e.hw < 4.5) return false;
          const A = nodes[e.a], B = nodes[e.b], d = Math.hypot((A.x + B.x) / 2 - cx, (A.z + B.z) / 2 - cz);
          return d > lo - e.len / 2 && d < hi + e.len / 2;
        });
        if (!pool.length) continue;
        for (let i = 0; i < 80; i++) {
          const e = rpick(pool), k = kerbOn(e, 0.25 + Math.random() * 0.5, Math.random() < 0.5 ? 1 : -1), d = Math.hypot(k.x - cx, k.z - cz);
          if (d < lo || d > hi || !personFits(k.walkX, k.walkZ) || blockedAt(k.walkX, k.walkZ, 0.5)) continue;
          return k;
        }
      }
      return null;
    }

    /* the way there along the streets, for the maps */
    let route = null, routeT = 0;
    const driveNode = (x, z) => { let b = 0, bd = Infinity; nodes.forEach((n, i) => { if (!n.nb.length) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = i; } }); return b; };
    function routeTo(x0, z0, x1, z1) {
      const goal = driveNode(x1, z1), D = distTo(goal, false);
      let n = driveNode(x0, z0);
      const path = [[x0, z0], [nodes[n].x, nodes[n].z]];
      for (let k = 0; k < 500 && n !== goal; k++) {
        let best = -1, bv = D[n];
        for (const m of nodes[n].nb) if (D[m] < bv) { bv = D[m]; best = m; }
        if (best < 0) break;
        n = best; path.push([nodes[n].x, nodes[n].z]);
      }
      path.push([x1, z1]);
      return path;
    }
    const routeLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };

    /* the job */
    let job = null, nearRace = null, bigT = 0;
    const hinted = {};
    const el2 = { job: $('job'), icon: $('jobIcon'), title: $('jobTitle'), hint: $('jobHint'), clock: $('jobClock'), big: $('bigText'), cash: $('cash'), cashTag: $('cashTag') };
    function big(text, sub, t = 2.2) { el2.big.textContent = text; if (sub) { const s = document.createElement('small'); s.textContent = sub; el2.big.append(s); } el2.big.hidden = false; bigT = t; }
    function pay(kr, why) { earned += kr; save(); beep([660, 880, 1320], 0.03, 0.3); toast(why + ' +' + fmtKr(kr)); }
    const speed = () => (driving ? Math.hypot(driving.vx, driving.vz) : 0);
    const kindOf = (c) => (!c ? null : c.M.shape.taxi ? 'taxi' : c.M.id === 'skapbil' ? 'paket' : c.M.bus ? 'buss' : c.M.moped ? 'mat'
      : c.M.police && !c.M.boat ? 'polis' : c.M.boat === 'console' || c.M.boat === 'riva' ? 'battaxi' : null);
    function target() { return !job ? null : job.kind === 'race' ? job.race.pts[job.i] : job.goal; }
    function setGoal(k, name) { job.goal = { x: k.x, z: k.z, name, k }; route = routeTo(driving ? driving.x : player.x, driving ? driving.z : player.z, k.x, k.z); routeT = 1.5; }
    function cleanup() {
      goalBeam.visible = nextBeam.visible = false; parcels.visible = false; bag.visible = false; route = null;
      // a robber still out there drives on as ordinary traffic
      if (job && job.robber && cars.includes(job.robber)) { const r = job.robber; r.getaway = false; r.keep = false; if (r.bot) r.bot.cruise = 14; }
      if (job && job.npcs) for (const p of job.npcs) { if (persons.includes(p)) { p.keep = false; p.ai = { state: 'wander', wx: Math.random() - 0.5, wz: Math.random() - 0.5, t: 15, dodgeT: 0 }; } }
      if (job && job.rider && job.car && job.car.rearSeat) job.car.rearSeat.visible = false;
      while (stopMeshes.length) scene.remove(stopMeshes.pop());
    }
    function end(msg) { cleanup(); job = null; if (msg) toast(msg); }

    // a fare: someone waiting on the pavement of a street a little way off
    function newFare() {
      const k = randomKerb(driving.x, driving.z, 110, 450);
      if (!k) { end('Inga kunder här just nu.'); return; }
      const p = makePerson(makeIdentity(), k.walkX, k.walkZ, { state: 'idle', face: k.h - Math.PI / 2, dodgeT: 0 });
      p.keep = true; p.rot = k.h - Math.PI / 2;
      Object.assign(job, { phase: 'find', npcs: [p], who: p, t: 0 });
      setGoal(k, 'Kund på ' + k.e.name);
      toast('En kund väntar på ' + k.e.name + '. Kör dit och stanna vid trottoaren.');
    }
    function newParcel() {
      const k = randomKerb(driving.x, driving.z, 120, 500);
      if (!k) { end('Inga paket att hämta här just nu.'); return; }
      parcels.position.set(k.walkX, 0, k.walkZ); parcels.rotation.y = k.h; parcels.visible = true;
      Object.assign(job, { phase: 'find', t: 0 });
      setGoal(k, 'Paket på ' + k.e.name);
      toast('Hämta paketen på ' + k.e.name + '.');
    }
    function newRoute() {
      // a run of stops along the streets ahead, about 250 m apart
      const stops = [];
      let e0 = nearestEdge(driving.x, driving.z, (e) => e.drive).e, from = Math.hypot(nodes[e0.a].x - driving.x, nodes[e0.a].z - driving.z) < Math.hypot(nodes[e0.b].x - driving.x, nodes[e0.b].z - driving.z) ? e0.a : e0.b;
      let at = from === e0.a ? e0.b : e0.a, run = 0, prev = from;
      for (let k = 0; k < 120 && stops.length < 6; k++) {
        const opts = nodes[at].nb.filter((n) => n !== prev);
        if (!opts.length) break;
        const nx = rpick(opts), e = edgeBetween(at, nx) || edgeToward(at, nx);
        run += e ? e.len : 50;
        if (e && run > 230 && e.len > 40 && !e.bridge && e.hw >= 4.5) {
          const side = e.a === at ? 1 : -1, ks = kerbOn(e, e.a === at ? 0.6 : 0.4, side);
          if (personFits(ks.walkX, ks.walkZ) && !blockedAt(ks.walkX, ks.walkZ, 0.5)) { stops.push(ks); run = 0; }
        }
        prev = at; at = nx;
      }
      if (stops.length < 2) { end('Ingen busslinje gick att lägga härifrån. Kör ut på en större gata och försök igen.'); return; }
      job.stops = stops; job.si = 0; job.npcs = []; job.waiting = [];
      stops.forEach((k, i) => {
        busStop(k);
        const n = 1 + Math.floor(Math.random() * 4), list = [];
        for (let j = 0; j < n; j++) {
          const p = makePerson(makeIdentity(), k.walkX + (Math.random() - 0.5) * 2.4, k.walkZ + (Math.random() - 0.5) * 1.2, { state: 'idle', face: k.h - Math.PI / 2, dodgeT: 0 });
          p.keep = true; job.npcs.push(p); list.push(p);
        }
        job.waiting.push(list);
      });
      job.phase = 'drive';
      setGoal(stops[0], 'Hållplats 1 av ' + stops.length);
      toast('Busslinje med ' + stops.length + ' hållplatser. Stanna vid varje så kliver resenärerna på.');
    }
    // food on the moped: pick it up at a restaurant, take it to someone's door while it's hot
    function newFood() {
      const k = randomKerb(driving.x, driving.z, 80, 350);
      if (!k) { end('Ingen restaurang har något att köra ut just nu.'); return; }
      bag.position.set(k.walkX, 0, k.walkZ); bag.rotation.y = k.h; bag.visible = true;
      Object.assign(job, { phase: 'find', t: 0, place: rpick(RESTAURANTS) });
      setGoal(k, job.place + ', ' + k.e.name);
      toast('Maten är klar på ' + job.place + ' på ' + k.e.name + '. Hämta den!');
    }
    // the police car's job: a robber getting away in a fast car somewhere near. Catch them: stop their car, or wreck it
    function newRobber() {
      const c = spawnBot(170, rpick(SPORTS.filter((M) => !M.police)), 420);
      if (!c) { end('Inga larm just nu. Försök igen om en stund.'); return; }
      c.keep = true; c.getaway = true; c.bot.cruise = 24; c.bot.turnV = 9;
      Object.assign(job, { phase: 'chase', t: 0, robber: c, par: 150, heldT: 0, fleeT: 0 });
      job.goal = { x: c.x, z: c.z, name: c.M.name };
      toast('Larm! En rånare flyr i ' + c.M.def + '. Kör ikapp och stoppa bilen. L slår på blåljuset.');
    }
    // the boat taxi: someone waiting on a pier, wanting to go to another one
    let piers = null;
    function pierList() {
      if (piers) return piers;
      piers = PIER_SPOTS.map(([name, x, z]) => {
        const b = findBerth(MODEL.anytec, x, z, 60);
        if (!b) return null;
        // where the passenger waits: the nearest bit of quay to the berth
        let best = null, bd = Infinity;
        for (let r = 2; r <= 16 && !best; r += 2) for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU, px = b.x + Math.sin(a) * r, pz = b.z + Math.cos(a) * r;
          if (personFits(px, pz) && !blockedAt(px, pz, 0.4) && Math.hypot(px - b.x, pz - b.z) < bd) { bd = Math.hypot(px - b.x, pz - b.z); best = { x: px, z: pz }; }
        }
        return best ? { name, x: b.x, z: b.z, walk: best } : null;
      }).filter(Boolean);
      return piers;
    }
    function newBoatFare() {
      const c = driving, list = pierList().filter((p) => { const d = Math.hypot(p.x - c.x, p.z - c.z); return d > 200 && d < 2200; });
      if (!list.length) { end('Inga resenärer väntar just nu.'); return; }
      const pier = rpick(list), w = pier.walk;
      const p = makePerson(makeIdentity(), w.x, w.z, { state: 'idle', face: Math.atan2(pier.x - w.x, pier.z - w.z), dodgeT: 0 });
      p.keep = true; p.rot = Math.atan2(pier.x - w.x, pier.z - w.z);
      Object.assign(job, { phase: 'find', npcs: [p], who: p, t: 0, pier, bt: 0 });
      job.goal = { x: pier.x, z: pier.z, name: pier.name }; route = null;
      toast('En resenär väntar på bryggan vid ' + pier.name + '. Lägg till där.');
    }
    function start(kind) {
      job = { kind, car: driving, t: 0, done: 0, offT: 0 };
      if (kind === 'taxi') newFare(); else if (kind === 'paket') newParcel(); else if (kind === 'mat') newFood();
      else if (kind === 'polis') newRobber(); else if (kind === 'battaxi') newBoatFare(); else newRoute();
    }
    // the scrapyard's price: a sports car is worth a lot, a dented one less
    function priceOf(c) {
      const M = c.M, base = M.moped ? 150 : M.sport ? 900 + M.max * 14 : 250 + M.max * 5;
      return Math.round((base * (M.classic ? 1.4 : 1) * clamp(c.health / 100, 0.2, 1)) / 10) * 10;
    }
    let nearScrap = false;
    function sell() {
      const c = driving, M = c.M;
      if (c === spawnedCar) { toast('Bilen du valde med B kan du inte sälja. Ta en bil ute i trafiken och kom tillbaka med den.'); return; }
      if (M.police || M.mil) { toast('Bilskroten: Den köper vi inte! Ska vi åka fast allihop?'); return; }
      if (M.bus) { toast('Bilskroten: En SL-buss? Nej tack, den vill SL ha tillbaka.'); return; }
      if (Math.hypot(c.vx, c.vz) > 1.3) { toast('Stanna bilen först.'); return; }
      const kr = priceOf(c);
      if (!exitCar()) return;
      removeCar(c);
      pay(kr, 'Bilskroten köpte ' + M.def + '.');
    }
    function startRace(r) {
      job = { kind: 'race', race: r, car: driving, i: 1, t: -3.5, offT: 0 };
      goalBeam.visible = true;
      route = null;
      big('3', r.name);
    }
    // J
    function key() {
      if (policeStop && policeStop.locked) return;
      if (job) { end(job.kind === 'race' ? 'Gatloppet avbrutet.' : 'Du slutade jobba.'); return; }
      if (!driving) { toast('Jobben görs med fordon: taxin, Sprintern, bussen, mopeden, polisbilen och motorbåtarna. Gatloppen startar vid de gula ljuspelarna, och bilar säljer du på bilskroten i Hammarby hamn.'); return; }
      if (nearScrap) { sell(); return; }
      if (nearRace) { startRace(nearRace); return; }
      const kind = kindOf(driving);
      if (kind) start(kind);
      else toast('Med ' + driving.M.def + ' kan du köra gatlopp vid de gula ljuspelarna, eller sälja den på bilskroten i Hammarby hamn. Taxin, Sprintern, bussen, mopeden, polisbilen och motorbåtarna har egna jobb.');
    }

    function update(dt) {
      if (bigT > 0 && (bigT -= dt) <= 0) el2.big.hidden = true;
      // near a race start in a car, with nothing else on: say so once
      nearRace = null;
      if (driving && !job) for (const r of RACES) if (Math.hypot(r.pts[0].x - driving.x, r.pts[0].z - driving.z) < 11) nearRace = r;
      if (nearRace && nearRace !== update.lastNear) toast('Gatlopp: ' + nearRace.name + (records[nearRace.id] ? ', rekord ' + fmtTime(records[nearRace.id]) : '') + '. Tryck J för att starta.');
      update.lastNear = nearRace;
      for (const b of startBeams) b.visible = !job || job.kind !== 'race';
      // pulled in at the scrapyard: what they would give for this one
      nearScrap = !!driving && !job && !driving.M.boat && Math.hypot(SCRAP.x - driving.x, SCRAP.z - driving.z) < 12;
      if (nearScrap && !update.atScrap) toast(driving === spawnedCar || driving.M.police || driving.M.mil || driving.M.bus ? 'Bilskroten: Den här köper vi inte.' : 'Bilskroten: Vi ger ' + fmtKr(priceOf(driving)) + ' för ' + driving.M.def + '. Stanna och tryck J för att sälja.');
      update.atScrap = nearScrap;
      if (!job) return;
      job.t += dt;
      // the car is gone, wrecked or left behind, or you were arrested
      if (policeStop && policeStop.locked) { end('Uppdraget avbröts, du är gripen.'); return; }
      if (!cars.includes(job.car) || job.car.dead) { end('Bilen är förstörd. Uppdraget är slut.'); return; }
      job.offT = driving === job.car ? 0 : job.offT + dt;
      if (job.offT > (job.kind === 'race' ? 3 : 25)) { end(job.kind === 'race' ? 'Du klev ur bilen. Gatloppet är slut.' : 'Du lämnade bilen. Uppdraget är slut.'); return; }
      const T = target();
      if (T) {
        goalBeam.position.set(T.x, 0, T.z); goalBeam.visible = true;
        goalBeam.children[1].scale.setScalar(1 + 0.06 * Math.sin(clock * 5));
      }
      if (job.kind !== 'race' && job.kind !== 'battaxi' && (routeT -= dt) <= 0 && T && driving) { route = routeTo(driving.x, driving.z, T.x, T.z); routeT = 1.5; }
      const c = job.car, d = T ? Math.hypot(T.x - c.x, T.z - c.z) : Infinity, still = speed() < 1.3 && driving === c;
      if (job.kind === 'race') {
        const R = job.race;
        if (job.t < 0) {
          // countdown: the car is held on the line
          c.vx = c.vz = 0;
          const n = Math.ceil(-job.t);
          if (n !== job.shown) { job.shown = n; if (n <= 3) { big(String(n), R.name, 1.1); beep([440], 0.04, 0.25); } }
          return;
        }
        if (job.shown !== 0) { job.shown = 0; big('KÖR!', null, 1); beep([880], 0.05, 0.4); }
        const nx = R.pts[job.i + 1];
        nextBeam.visible = !!nx; if (nx) nextBeam.position.set(nx.x, 0, nx.z);
        if (d < 13) {
          job.i++;
          if (job.i >= R.pts.length) {
            const t = job.t, rec = records[R.id], best = !rec || t < rec;
            if (best) records[R.id] = t;
            save();
            big('MÅL! ' + fmtTime(t), best ? (rec ? 'Nytt rekord! Förra: ' + fmtTime(rec) : 'Första rekordet på ' + R.name) : 'Rekord: ' + fmtTime(rec), 4);
            pay(best ? 600 : 250, R.name + ' klart.');
            end();
            return;
          }
          beep([988, 1319], 0.03, 0.18);
        }
        return;
      }
      if (job.kind === 'taxi') {
        if (job.phase === 'find') {
          if (d < 10 && still) {
            const p = job.who;
            p.ai = { state: 'board', car: c, dodgeT: 0 };
            job.phase = 'board'; job.bt = 0;
          }
        } else if (job.phase === 'board') {
          const p = job.who;
          job.bt += dt;
          if (!persons.includes(p) || Math.hypot(p.x - c.x, p.z - c.z) < c.M.W / 2 + 1.1 || job.bt > 6) {
            if (persons.includes(p)) removePerson(p);
            job.npcs = []; job.rider = p.id;
            if (c.rearSeat) { c.rearSeat.geometry = p.id.driverGeo; c.rearSeat.visible = true; }
            // where to: somewhere a fair way off
            const here = PLACES.filter(([, x, z]) => { const dd = Math.hypot(x - c.x, z - c.z); return dd > 380 && dd < 1700; });
            const [name, px, pz] = rpick(here.length ? here : PLACES), k = kerbNear(px, pz);
            setGoal(k, name);
            const L = routeLen(route);
            Object.assign(job, { phase: 'ride', t: 0, par: L / 10.5 + 25, len: L, hp: c.health });
            toast('Kunden: ' + rpick(SAYS).replace('{p}', name));
          }
        } else if (job.phase === 'ride' && d < 13 && still) {
          const late = job.t > job.par, dmg = Math.max(0, job.hp - c.health);
          let kr = Math.round((75 + job.len * 0.3) * (job.t < job.par * 0.8 ? 1.3 : late ? 0.75 : 1) - dmg * 4);
          kr = Math.max(20, kr);
          const exit = exitSpot(c) || { x: c.x, z: c.z };
          if (c.rearSeat) c.rearSeat.visible = false;
          const p = makePerson(job.rider, exit.x, exit.z, { state: 'wander', wx: Math.random() - 0.5, wz: Math.random() - 0.5, t: 20, dodgeT: 0 });
          p.rot = c.h; job.rider = null;
          job.done++;
          pay(kr, dmg > 8 ? 'Kunden betalar, men klagar på bucklorna.' : job.t < job.par * 0.8 ? 'Snabbt! Kunden ger dricks.' : late ? 'Kunden betalar, men tyckte det tog för lång tid.' : 'Kunden betalar.');
          newFare();
        }
        return;
      }
      if (job.kind === 'paket') {
        if (job.phase === 'find' && d < 10 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1.2) {
            job.lt = 0; parcels.visible = false;
            const k = randomKerb(c.x, c.z, 300, 1300);
            if (!k) { end('Ingen adress att leverera till härifrån.'); return; }
            const no = 1 + Math.floor(Math.random() * 60);
            setGoal(k, k.e.name + ' ' + no);
            const L = routeLen(route);
            Object.assign(job, { phase: 'deliver', t: 0, par: L / 10 + 30, len: L, hp: c.health });
            toast('Paketen är lastade. Leverera till ' + job.goal.name + '.');
          }
        } else if (job.phase === 'deliver' && d < 13 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1.2) {
            job.lt = 0;
            const dmg = Math.max(0, job.hp - c.health), late = job.t > job.par;
            const kr = Math.max(30, Math.round((110 + job.len * 0.25) * (late ? 0.7 : job.t < job.par * 0.75 ? 1.3 : 1) - dmg * 3));
            job.done++;
            pay(kr, late ? 'Paketen kom fram, men sent.' : 'Paketen levererade.');
            newParcel();
          }
        } else job.lt = 0;
        return;
      }
      if (job.kind === 'mat') {
        if (job.phase === 'find' && d < 9 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1) {
            job.lt = 0; bag.visible = false;
            const k = randomKerb(c.x, c.z, 250, 900);
            if (!k) { end('Ingen adress att köra till härifrån.'); return; }
            setGoal(k, k.e.name + ' ' + (1 + Math.floor(Math.random() * 60)));
            const L = routeLen(route);
            Object.assign(job, { phase: 'deliver', t: 0, par: L / 9 + 25, len: L });
            toast('Maten är i boxen. Kör den till ' + job.goal.name + ' medan den är varm!');
          }
        } else if (job.phase === 'deliver' && d < 11 && still) {
          job.lt = (job.lt || 0) + dt;
          if (job.lt > 1) {
            job.lt = 0;
            const late = job.t > job.par, quick = job.t < job.par * 0.75;
            const kr = Math.max(25, Math.round((60 + job.len * 0.22) * (late ? 0.7 : quick ? 1.35 : 1)));
            job.done++;
            pay(kr, late ? 'Maten kom fram, men den hann kallna.' : quick ? 'Varm och god! Kunden ger dricks.' : 'Maten är levererad.');
            newFood();
          }
        } else job.lt = 0;
        return;
      }
      if (job.kind === 'polis') {
        const r = job.robber;
        if (!r || !cars.includes(r)) { end('Rånaren kom undan.'); return; }
        job.goal = { x: r.x, z: r.z, name: r.M.name };
        // the robber runs from you: now and then a new place to get to, well away from you
        if (r.bot && (job.fleeT -= dt) <= 0) {
          job.fleeT = 3;
          const ax = r.x - c.x, az = r.z - c.z, al = Math.hypot(ax, az) || 1;
          let best = -1, bv = -Infinity;
          for (let i = 0; i < 40; i++) {
            const n = Math.floor(Math.random() * nodes.length), N = nodes[n];
            if (!N.nb.length) continue;
            const dd = Math.hypot(N.x - r.x, N.z - r.z), v = ((N.x - r.x) * ax + (N.z - r.z) * az) / al - Math.abs(dd - 450) * 0.3;
            if (dd > 200 && v > bv) { bv = v; best = n; }
          }
          if (best >= 0) { r.bot.goal = { node: best, x: nodes[best].x, z: nodes[best].z }; if (r.bot.phase === 'edge') r.bot.next = chooseNext(r.bot.from, r.bot.to, r.bot.goal, true); }
        }
        // caught: the getaway car wrecked, or stopped with you right on it
        const rs = Math.hypot(r.vx, r.vz), close = Math.hypot(r.x - c.x, r.z - c.z) < (r.M.L + c.M.L) / 2 + 3;
        job.heldT = rs < 1.5 && close ? job.heldT + dt : 0;
        if (r.dead || job.heldT > 2) {
          const kr = Math.round(300 + Math.max(0, job.par - job.t) * 4);
          const spot = exitSpot(r);
          if (spot && r.occupant) { const p = makePerson(r.occupant, spot.x, spot.z, { state: 'idle', face: r.h, dodgeT: 0 }); p.cuffed = true; p.rot = r.h; }
          setOccupant(r, null); r.bot = null; r.getaway = false; r.keep = false; job.robber = null;
          job.done++;
          pay(kr, 'Rånaren är gripen!');
          end();
          return;
        }
        if (job.t > job.par || Math.hypot(r.x - c.x, r.z - c.z) > 700) { end('Rånaren kom undan.'); return; }
        return;
      }
      if (job.kind === 'battaxi') {
        const P = job.pier;
        if (job.phase === 'find') {
          if (d < 16 && still) {
            job.bt += dt;
            const p = job.who;
            if (persons.includes(p)) { p.ai = { state: 'board', car: c, dodgeT: 0 }; }
            if (job.bt > 1.5 || !persons.includes(p) || Math.hypot(p.x - c.x, p.z - c.z) < c.M.W / 2 + 1.5) {
              if (persons.includes(p)) removePerson(p);
              job.npcs = []; job.rider = p.id;
              const list = pierList().filter((q) => q !== P && Math.hypot(q.x - c.x, q.z - c.z) > 450);
              if (!list.length) { end('Ingen brygga att åka till härifrån.'); return; }
              const to = rpick(list), L = Math.hypot(to.x - c.x, to.z - c.z) * 1.35;
              Object.assign(job, { phase: 'ride', t: 0, pier: to, par: L / 12 + 30, len: L, hp: c.health });
              job.goal = { x: to.x, z: to.z, name: to.name };
              toast('Resenären: Till ' + to.name + ', tack!');
            }
          } else job.bt = 0;
        } else if (job.phase === 'ride' && d < 16 && still) {
          const late = job.t > job.par, dmg = Math.max(0, job.hp - c.health);
          const kr = Math.max(40, Math.round((140 + job.len * 0.3) * (job.t < job.par * 0.8 ? 1.3 : late ? 0.75 : 1) - dmg * 4));
          const w = P.walk, p = makePerson(job.rider, w.x, w.z, { state: 'wander', wx: Math.random() - 0.5, wz: Math.random() - 0.5, t: 20, dodgeT: 0 });
          p.rot = c.h; job.rider = null;
          job.done++;
          pay(kr, late ? 'Resenären betalar, men tyckte det tog lång tid.' : job.t < job.par * 0.8 ? 'Snabbt! Resenären ger dricks.' : 'Resenären betalar.');
          newBoatFare();
        }
        return;
      }
      if (job.kind === 'buss') {
        if (d < 12 && still) {
          job.lt = (job.lt || 0) + dt;
          const list = job.waiting[job.si];
          // they walk up to the door and get on, one by one
          for (const p of list) if (persons.includes(p) && p.ai.state === 'idle') p.ai = { state: 'board', car: c, dodgeT: 0 };
          for (const p of list) if (persons.includes(p) && (Math.hypot(p.x - c.x, p.z - c.z) < c.M.W / 2 + 1.2 || job.lt > 5)) removePerson(p);
          if (job.lt > 2.5 && !list.some((p) => persons.includes(p))) {
            job.lt = 0;
            const n = list.length, last = job.si === job.stops.length - 1;
            if (stopMeshes[job.si]) stopMeshes[job.si].visible = false;
            pay(40 + n * 30 + (last ? 250 : 0), last ? 'Slutstation! ' + (job.done + n) + ' resenärer.' : n + (n === 1 ? ' resenär' : ' resenärer') + ' klev på.');
            job.done += n;
            if (last) { end(); return; }
            job.si++;
            setGoal(job.stops[job.si], 'Hållplats ' + (job.si + 1) + ' av ' + job.stops.length);
          }
        } else job.lt = 0;
      }
    }

    // the panel at the top: what to do, how far, the clock
    let lastHud = '';
    function hud() {
      el2.cashTag.hidden = !earned && !job;
      el2.cash.textContent = fmtKr(earned);
      document.body.classList.toggle('job', !!job);
      el2.job.hidden = !job;
      if (!job) { lastHud = ''; return; }
      const T = target(), c = job.car, d = T ? Math.hypot(T.x - c.x, T.z - c.z) : 0;
      let icon, title, hint, clockTxt = '';
      if (job.kind === 'race') {
        icon = '⚑'; title = 'Gatlopp: ' + job.race.name;
        hint = job.t < 0 ? 'Gör dig redo …' : 'Kontroll ' + Math.min(job.i, job.race.pts.length - 1) + ' av ' + (job.race.pts.length - 1) + ' · ' + fmtDist(d) + (records[job.race.id] ? ' · rekord ' + fmtTime(records[job.race.id]) : '');
        clockTxt = job.t < 0 ? '' : fmtTime(job.t);
      } else if (job.kind === 'taxi') {
        icon = 'T'; title = job.phase === 'ride' ? 'Taxi till ' + job.goal.name : 'Taxi: hämta kunden';
        hint = (job.phase === 'board' ? 'Kunden kliver in …' : fmtDist(d) + (job.phase === 'ride' ? ' · stanna vid trottoaren' : ' · ' + job.goal.name)) + ' · ' + job.done + ' körda';
        if (job.phase === 'ride') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'paket') {
        icon = '▣'; title = job.phase === 'deliver' ? 'Leverera till ' + job.goal.name : 'Hämta paketen';
        hint = fmtDist(d) + ' · ' + (job.phase === 'deliver' ? 'stanna vid adressen' : job.goal.name) + ' · ' + job.done + ' levererade';
        if (job.phase === 'deliver') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'mat') {
        icon = 'M'; title = job.phase === 'deliver' ? 'Leverera maten till ' + job.goal.name : 'Hämta maten på ' + job.place;
        hint = fmtDist(d) + ' · ' + (job.phase === 'deliver' ? 'stanna vid adressen' : 'stanna vid restaurangen') + ' · ' + job.done + ' levererade';
        if (job.phase === 'deliver') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'polis') {
        icon = '★'; title = 'Polisuppdrag: stoppa rånaren';
        hint = fmtDist(d) + ' · ' + job.goal.name + ' · kör ikapp och stoppa bilen';
        clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else if (job.kind === 'battaxi') {
        icon = '⚓'; title = job.phase === 'ride' ? 'Båttaxi till ' + job.goal.name : 'Båttaxi: hämta vid ' + job.goal.name;
        hint = fmtDist(d) + ' · lägg till vid bryggan · ' + job.done + ' körda';
        if (job.phase === 'ride') clockTxt = fmtTime(Math.max(0, job.par - job.t));
      } else {
        icon = 'SL'; title = 'Busslinje: ' + job.goal.name;
        hint = fmtDist(d) + ' · stanna vid hållplatsen · ' + job.done + ' resenärer';
      }
      const key = icon + title + hint + clockTxt;
      if (key === lastHud) return;
      lastHud = key;
      el2.icon.textContent = icon; el2.title.textContent = title; el2.hint.textContent = hint; el2.clock.textContent = clockTxt;
    }

    // on the maps: the GPS line, where to go (an arrow at the edge of the minimap when it is further off) and the races
    function drawMini(g, px, pz, u) {
      const T = target();
      if (route && T) {
        g.strokeStyle = 'rgba(255,194,26,.9)'; g.lineWidth = 4.2 * u; g.lineJoin = g.lineCap = 'round';
        g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke();
      }
      const mark = (x, z, col, r) => {
        const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz), R = 100;
        if (d < R) { g.fillStyle = col; g.strokeStyle = '#ffffff'; g.lineWidth = 2 * u; g.beginPath(); g.arc(x, z, r * u, 0, TAU); g.fill(); g.stroke(); return; }
        const ux = dx / d, uz = dz / d, ex = px + ux * R, ez = pz + uz * R;
        g.fillStyle = col; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * u;
        g.beginPath(); g.moveTo(ex + ux * 9 * u, ez + uz * 9 * u); g.lineTo(ex - uz * 6 * u, ez + ux * 6 * u); g.lineTo(ex + uz * 6 * u, ez - ux * 6 * u); g.closePath(); g.fill(); g.stroke();
      };
      if (!job || job.kind !== 'race') for (const r of RACES) if (Math.hypot(r.pts[0].x - px, r.pts[0].z - pz) < 105) mark(r.pts[0].x, r.pts[0].z, '#ffe14a', 4.5);
      if (Math.hypot(SCRAP.x - px, SCRAP.z - pz) < 105) mark(SCRAP.x, SCRAP.z, '#4cc26a', 5);
      if (T) mark(T.x, T.z, job.kind === 'race' ? '#ff7a1a' : '#ffc21a', 6);
    }
    function drawBig(g, toX, toY, k) {
      if (route && target()) {
        g.strokeStyle = 'rgba(240,160,0,.9)'; g.lineWidth = Math.max(3, 5 * k); g.lineJoin = g.lineCap = 'round';
        g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(toX(x), toY(z)) : g.moveTo(toX(x), toY(z)))); g.stroke();
      }
      if (job && job.kind === 'race') {
        g.strokeStyle = 'rgba(255,122,26,.75)'; g.lineWidth = 3; g.setLineDash([6, 5]);
        g.beginPath(); job.race.pts.forEach((p, i) => (i ? g.lineTo(toX(p.x), toY(p.z)) : g.moveTo(toX(p.x), toY(p.z)))); g.stroke(); g.setLineDash([]);
      }
      for (const r of RACES) {
        const X = toX(r.pts[0].x), Y = toY(r.pts[0].z);
        g.fillStyle = '#ffe14a'; g.strokeStyle = '#1b1c1e'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(X, Y + 7); g.lineTo(X, Y - 11); g.lineTo(X + 11, Y - 7); g.lineTo(X, Y - 3); g.stroke(); g.fill();
        if (k > 0.3) { g.font = '800 11px Overpass, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(r.name, X + 13, Y - 6); g.fillStyle = '#7a5600'; g.fillText(r.name, X + 13, Y - 6); }
      }
      {
        // the scrapyard: a green square with a krona sign
        const X = toX(SCRAP.x), Y = toY(SCRAP.z);
        g.fillStyle = '#4cc26a'; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.fillRect(X - 7, Y - 7, 14, 14); g.strokeRect(X - 7, Y - 7, 14, 14);
        g.fillStyle = '#ffffff'; g.font = '900 10px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('kr', X, Y + 0.5);
        if (k > 0.3) { g.font = '800 11px Overpass, sans-serif'; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText('Bilskroten', X + 11, Y); g.fillStyle = '#1f6b2f'; g.fillText('Bilskroten', X + 11, Y); }
      }
      const T = target();
      if (T) { g.fillStyle = '#ffc21a'; g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.beginPath(); g.arc(toX(T.x), toY(T.z), 7, 0, TAU); g.fill(); g.stroke(); }
    }
    // say what J does the first time you sit in a car that has a job
    function entered(c) {
      const k = kindOf(c);
      // (not in a game with friends, where J does nothing)
      if (k && !job && !(hinted[k]) && !PARTY.busy()) {
        hinted[k] = true;
        setTimeout(() => toast({ taxi: 'Tryck J för att köra taxi.', paket: 'Tryck J för att köra ut paket.', buss: 'Tryck J för att köra en busslinje.', mat: 'Tryck J för att köra ut mat.',
          polis: 'Tryck J för ett polisuppdrag: stoppa en rånare.', battaxi: 'Tryck J för att köra båttaxi mellan bryggorna.' }[k]), 2600);
      }
    }
    return {
      key, update, hud, drawMini, drawBig, entered, RACES, PLACES,
      // paying out of the Kassa: false (and nothing taken) when there is not enough
      spend(kr) { if (earned < kr) return false; earned -= kr; save(); return true; },
      // money from elsewhere (the Dalahästar's finder's fee), without a word of its own
      reward(kr) { earned += kr; save(); },
      SCRAP, priceOf,
      get job() { return job; }, get earned() { return earned; }, get route() { return route; },
      // test hooks: hold the race countdown short, skip to a checkpoint
      _skipCountdown() { if (job && job.kind === 'race') job.t = 0; }
    };
  })();

  /* ================= ice cream kiosks and balloon sellers ================= */
  // A glasskiosk and a balloon seller at the car park where you start, in Kungsträdgården, on Medborgarplatsen and on
  // Djurgården. Walk up and press E to buy with what is in the Kassa. You eat the ice cream as you walk, lick by lick,
  // and the balloons follow you on their strings, out of the car window when you drive. V lets one go, and with
  // balloons in your hand you fall slowly when you jump.
  const VENDORS = (() => {
    const ICE_PRICE = 35, BALLOON_PRICE = 40, MAX_BALLOONS = 6, SELLER_STOCK = 10, BITES = 10;
    const FLAVORS = [['vanilj', 0xf6e7b8], ['choklad', 0x6b3e26], ['jordgubb', 0xf28bb0], ['päron', 0xdfe68f], ['pistage', 0xa9cf8c],
      ['lakrits', 0x2c2a2b], ['mango', 0xffb23f], ['blåbär', 0x6d5bc4], ['hallon', 0xd6336c], ['citron', 0xfff27a]];
    const BALLOONS = [[0xe0203a, 'röd'], [0x2f6fdb, 'blå'], [0xf7c600, 'gul'], [0x2fae5a, 'grön'], [0xff6fb0, 'rosa'], [0x8e44ad, 'lila'], [0xff8a1f, 'orange'], [0x4fc3f7, 'ljusblå']];
    const PINK = 0xe8457a, CREAM = 0xf6f1e8, STEEL = 0xc5c9ce;
    // where they stand: x, z and which way the hatch and the seller face
    const lotFace = Math.atan2(LOT.f.ux, LOT.f.uz);
    const SPOTS = [
      { name: 'Skeppsbron', kiosk: [...LOT.at(4, 27), lotFace], seller: [...LOT.at(9, 20.5), lotFace] },
      { name: 'Kungsträdgården', kiosk: [55, -512.5, 0], seller: [31, -489, 0] },
      { name: 'Medborgarplatsen', kiosk: [190, 1452, Math.PI], seller: [172, 1446, Math.PI] },
      { name: 'Djurgården', kiosk: [1252, -112, -Math.PI / 2], seller: [1247, -100, -Math.PI / 2] }
    ];
    // a point given in a kiosk's own frame (front towards +z) out in the world
    const toWorld = (k, lx, lz) => [k.x + lx * Math.cos(k.face) + lz * Math.sin(k.face), k.z - lx * Math.sin(k.face) + lz * Math.cos(k.face)];
    const toLocal = (k, x, z) => { const dx = x - k.x, dz = z - k.z; return [dx * Math.cos(k.face) - dz * Math.sin(k.face), dx * Math.sin(k.face) + dz * Math.cos(k.face)]; };

    /* textures: the GLASS sign, the waffle of the cones and the chalkboard with the flavours */
    const drawCone = (g, x, y, s) => {
      g.fillStyle = '#d9a35f'; g.beginPath(); g.moveTo(x - s * 0.5, y); g.lineTo(x + s * 0.5, y); g.lineTo(x, y + s * 1.25); g.closePath(); g.fill();
      g.fillStyle = '#f7c8d8'; g.beginPath(); g.arc(x, y - s * 0.12, s * 0.5, 0, TAU); g.fill();
      g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(x, y - s * 0.62, s * 0.4, 0, TAU); g.fill();
    };
    const signTex = canvasTex(512, 112, (g, w, h) => {
      g.fillStyle = '#e8457a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; roundRect(g, 8, 8, w - 16, h - 16, 14); g.stroke();
      g.fillStyle = '#ffffff'; g.font = '900 74px Overpass, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('G L A S S', w / 2, h / 2 + 5);
      drawCone(g, 58, 44, 34); drawCone(g, w - 58, 44, 34);
    });
    const waffleTex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#d9a35f'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#a8712f'; g.lineWidth = 3;
      for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    }, true);
    waffleTex.repeat.set(5, 2);
    const menuTex = canvasTex(256, 384, (g, w, h) => {
      g.fillStyle = '#7a5230'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#24372c'; g.fillRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 44px Overpass, "Arial Black", Arial, sans-serif'; g.fillText('GLASS', w / 2, 46);
      drawCone(g, 40, 36, 22); drawCone(g, w - 40, 36, 22);
      g.font = '700 22px Overpass, Arial, sans-serif'; g.fillStyle = '#ffe7a3'; g.fillText('Strut, två kulor', w / 2, 96);
      g.font = '900 30px Overpass, Arial, sans-serif'; g.fillText(ICE_PRICE + ' kr', w / 2, 128);
      g.font = '600 20px Overpass, Arial, sans-serif'; g.fillStyle = '#ffffff';
      FLAVORS.forEach(([n, c], i) => {
        const x = i % 2 ? w * 0.7 : w * 0.3, y = 178 + Math.floor(i / 2) * 38;
        g.fillStyle = hex(c); g.beginPath(); g.arc(x - 52, y, 9, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.fillText(n[0].toUpperCase() + n.slice(1), x + 6, y);
      });
    });

    /* an ice cream: a waffle cone with two scoops, in your hand (and the kiosk seller's) */
    const iceCone = new THREE.ConeGeometry(0.06, 0.18, 12, 1, true).rotateX(Math.PI);
    const iceScoop = new THREE.SphereGeometry(0.066, 12, 9);
    function makeIce(cols) {
      const group = new THREE.Group(), cone = new THREE.Mesh(iceCone, waffleMat), s = [];
      cone.position.y = -0.03;
      group.add(cone);
      cols.forEach((c, i) => { const m = new THREE.Mesh(iceScoop, std({ color: c, roughness: 0.5 })); m.position.y = 0.08 + i * 0.085; m.castShadow = true; group.add(m); s.push(m); });
      cone.castShadow = true;
      return { group, cone, scoops: s };
    }
    /* the kiosk: a little white hut with a serving hatch, a striped awning, a big cone on the roof and a menu board */
    const kioskGeo = (() => {
      const B = new Builder();
      B.box(-1.4, 0, -1.2, 1.4, 0.06, 1.2, 0x8a8f94);
      B.box(-1.4, 0.06, -1.2, -1.32, 2.6, 1.2, CREAM); B.box(1.32, 0.06, -1.2, 1.4, 2.6, 1.2, CREAM);
      B.box(-1.32, 0.06, -1.2, 1.32, 2.6, -1.12, CREAM);
      B.box(-1.32, 0.06, 1.12, 1.32, 1.0, 1.2, CREAM);
      B.box(-1.32, 1.0, 1.12, -1.12, 2.0, 1.2, CREAM); B.box(1.12, 1.0, 1.12, 1.32, 2.0, 1.2, CREAM);
      B.box(-1.32, 2.0, 1.12, 1.32, 2.6, 1.2, PINK);
      // pink bands round the bottom, a steel counter in the hatch, a back door
      B.box(-1.44, 0.06, -1.24, 1.44, 0.2, 1.24, 0xb7385f);
      B.box(-1.42, 0.82, 1.2, 1.42, 0.9, 1.23, PINK); B.box(-1.43, 0.82, -1.2, -1.4, 0.9, 1.2, PINK); B.box(1.4, 0.82, -1.2, 1.43, 0.9, 1.2, PINK);
      B.box(-1.18, 1.0, 0.98, 1.18, 1.05, 1.42, STEEL);
      B.box(-0.42, 0.2, -1.24, 0.42, 2.02, -1.2, 0x5f7480); B.box(0.24, 1.0, -1.27, 0.32, 1.06, -1.24, STEEL);
      // the roof, with a pink edge and the ceiling inside
      B.box(-1.56, 2.6, -1.36, 1.56, 2.74, 1.36, 0xefe9df);
      B.box(-1.57, 2.6, 1.35, 1.57, 2.78, 1.39, PINK); B.box(-1.57, 2.6, -1.39, 1.57, 2.78, -1.35, PINK);
      B.quad([-1.32, 2.59, -1.12], [1.32, 2.59, -1.12], [1.32, 2.59, 1.12], [-1.32, 2.59, 1.12], 0xfdfcf8, null, [0, -1, 0]);
      // inside: the freezer with the tubs of ice cream under its glass lid
      B.box(-1.2, 0.06, 0.42, 1.2, 0.92, 1.08, 0xf2f4f6);
      FLAVORS.slice(0, 7).forEach(([, c], i) => B.box(-1.1 + i * 0.315, 0.92, 0.5, -0.83 + i * 0.315, 0.98, 0.98, c));
      // a litter bin by the hatch
      B.prism(1.9, 1.55, 0.24, 0, 0.82, 12, 0x2f6b43); B.prism(1.9, 1.55, 0.26, 0.82, 0.88, 12, 0x24372c);
      return B.build();
    })();
    const kioskMat = std({ vertexColors: true, roughness: 0.65 });
    // the awning: stripes sloping out over the hatch with a scalloped edge, seen from both sides
    const awningGeo = (() => {
      const B = new Builder(), n = 10, x0 = -1.5, x1 = 1.5;
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n, col = i % 2 ? 0xffffff : PINK;
        B.quad([a, 2.14, 1.22], [b, 2.14, 1.22], [b, 1.96, 1.86], [a, 1.96, 1.86], col, null, [0, 1, 0.3]);
        B.quad([a, 1.96, 1.86], [b, 1.96, 1.86], [b, 1.84, 1.86], [a, 1.84, 1.86], col, null, [0, 0, 1]);
        B.tri([a, 1.84, 1.86], [b, 1.84, 1.86], [(a + b) / 2, 1.76, 1.86], col, [0, 0, 1]);
      }
      for (const s of [-1, 1]) B.tri([s * 1.5, 2.14, 1.22], [s * 1.5, 1.96, 1.86], [s * 1.5, 1.84, 1.86], PINK, [s, 0, 0]);
      return B.build();
    })();
    const awningMat = std({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const signMat = std({ map: signTex, roughness: 0.5, emissive: 0x331018, emissiveMap: signTex });
    const menuMat = std({ map: menuTex, roughness: 0.85, side: THREE.DoubleSide });
    const waffleMat = std({ map: waffleTex, roughness: 0.8, side: THREE.DoubleSide });
    const scoopMat = std({ vertexColors: true, roughness: 0.45 });
    // the big cone on the roof
    const bigConeGeo = new THREE.ConeGeometry(0.44, 1.1, 20, 1, true).rotateX(Math.PI).translate(0, 3.32, 0);
    const bigScoopGeo = (() => {
      const m = new Merger();
      m.add(new THREE.SphereGeometry(0.47, 18, 12), 0xf28bb0, 0, 3.92, 0);
      m.add(new THREE.SphereGeometry(0.4, 18, 12), 0xfff6dc, 0, 4.48, 0);
      m.add(new THREE.SphereGeometry(0.1, 10, 8), 0xc8102e, 0, 4.92, 0);
      m.add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), 0x3f6b22, 0.03, 5.05, 0, 0, 0, -0.3);
      return m.build();
    })();
    const frontSignGeo = new THREE.PlaneGeometry(2.6, 0.57), sideSignGeo = new THREE.PlaneGeometry(2.3, 0.5), menuGeo = new THREE.PlaneGeometry(0.6, 0.9);
    const kiosks = SPOTS.map((sp) => {
      const [x, z, face] = sp.kiosk, k = { name: sp.name, x, z, face, serveT: 0 };
      const g = new THREE.Group();
      g.position.set(x, 0, z); g.rotation.y = face;
      const body = new THREE.Mesh(kioskGeo, kioskMat), awning = new THREE.Mesh(awningGeo, awningMat);
      const cone = new THREE.Mesh(bigConeGeo, waffleMat), scoops = new THREE.Mesh(bigScoopGeo, scoopMat);
      for (const m of [body, awning, cone, scoops]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
      // the GLASS sign on the front and both sides, the menu on both faces of the A-frame
      const sign = (geo, px, pz, ry) => { const m = new THREE.Mesh(geo, signMat); m.position.set(px, 2.3, pz); m.rotation.y = ry; g.add(m); };
      sign(frontSignGeo, 0, 1.205, 0); sign(sideSignGeo, 1.405, 0, Math.PI / 2); sign(sideSignGeo, -1.405, 0, -Math.PI / 2);
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(menuGeo, menuMat);
        m.position.set(-1.95, 0.55, 1.73 + s * 0.135); m.rotation.set(-s * 0.29, s > 0 ? 0 : Math.PI, 0); m.castShadow = true;
        g.add(m);
      }
      scene.add(g);
      // the seller behind the counter: in a white coat and a pink cap, turning to whoever comes up
      const id = makeIdentity({ shirt: 0xfbfbf8, hat: 'cap', hatColor: PINK, sleeves: true });
      k.seller = makePersonModel(id);
      const [sx, sz] = toWorld(k, 0, 0.1);
      k.seller.group.position.set(sx, 0, sz);
      k.seller.group.rotation.y = face; k.look = face;
      const hand = makeIce([FLAVORS[2][1], FLAVORS[0][1]]);
      hand.group.position.set(0, -0.6, 0.06); hand.group.rotation.x = 1.4; hand.group.visible = false;
      k.seller.armR.add(hand.group); k.handIce = hand.group;
      addOBox(x, z, Math.cos(face), -Math.sin(face), 1.46, 1.32, 3);
      addCircle(...toWorld(k, -1.95, 1.73), 0.42, 1.1);
      addCircle(...toWorld(k, 1.9, 1.55), 0.3, 0.9);
      return k;
    });

    // your ice cream: held up in the right hand, and every few seconds a lick
    const HOLD = -0.75;
    let ice = null;
    function dropIce() { if (ice) { player.model.armR.remove(ice.model.group); for (const s of ice.model.scoops) s.material.dispose(); } ice = null; }

    /* balloons on strings: lift, a little wind, drag through the air, kept apart from each other and held by the string */
    const balloonGeo = (() => {
      const m = new Merger();
      m.add(new THREE.SphereGeometry(0.27, 16, 12).scale(1, 1.17, 1), 0xffffff, 0, 0, 0);
      m.add(new THREE.ConeGeometry(0.045, 0.07, 8), 0xffffff, 0, -0.33, 0, Math.PI, 0, 0);
      return m.build();
    })();
    const balloonMats = new Map(BALLOONS.map(([c]) => [c, std({ color: c, vertexColors: true, roughness: 0.2, metalness: 0.05 })]));
    const stringMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.85 });
    const tailGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, -0.35, 0, 0.04, -0.9, 0.02, 0.04, -0.9, 0.02, -0.02, -1.45, 0], 3));
    const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _q = new THREE.Vector3();
    const wind = { x: 0, z: 0 };
    function makeBalloon(col, x, y, z, len) {
      const mesh = new THREE.Mesh(balloonGeo, balloonMats.get(col));
      mesh.castShadow = true; mesh.position.set(x, y, z);
      scene.add(mesh);
      return { col, mesh, x, y, z, ox: x, oy: y, oz: z, vx: 0, vy: 0, vz: 0, len, want: len, ph: Math.random() * TAU };
    }
    function makeBunch(cap) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cap * 12), 3));
      const lines = new THREE.LineSegments(geo, stringMat);
      lines.frustumCulled = false;
      scene.add(lines);
      return { list: [], lines, ax: null, ay: 0, az: 0 };
    }
    function stepBunch(B, ax, ay, az, dt) {
      const L = B.list;
      // a jump of the hand further than a balloon can follow (a teleport, a ride skipped ahead): they come along
      if (B.ax !== null && (ax - B.ax) ** 2 + (ay - B.ay) ** 2 + (az - B.az) ** 2 > 64) {
        for (const b of L) { b.x += ax - B.ax; b.y += ay - B.ay; b.z += az - B.az; b.vx = b.vy = b.vz = 0; }
      }
      B.ax = ax; B.ay = ay; B.az = az;
      const drag = 1 - Math.exp(-2.4 * dt);
      for (const b of L) {
        b.ox = b.x; b.oy = b.y; b.oz = b.z;
        const wx = wind.x + Math.sin(clock * 1.3 + b.ph) * 0.5, wz = wind.z + Math.cos(clock * 1.1 + b.ph * 1.7) * 0.5;
        b.vx += (wx - b.vx) * drag; b.vz += (wz - b.vz) * drag; b.vy += 5 * dt - b.vy * drag;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      }
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const p = L[i], q = L[j], dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0.3 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (0.55 - d) * 0.25 / d;
        p.x += dx * push; p.y += dy * push; p.z += dz * push; q.x -= dx * push; q.y -= dy * push; q.z -= dz * push;
      }
      const pos = B.lines.geometry.attributes.position.array;
      L.forEach((b, i) => {
        if (b.len > b.want) b.len = Math.max(b.want, b.len - 2.2 * dt);
        const dx = b.x - ax, dy = b.y - ay, dz = b.z - az, d = Math.hypot(dx, dy, dz) || 1e-4;
        if (d > b.len) { const k = b.len / d; b.x = ax + dx * k; b.y = ay + dy * k; b.z = az + dz * k; }
        b.y = Math.max(b.y, 0.4);
        b.vx = clamp((b.x - b.ox) / dt, -30, 30); b.vy = clamp((b.y - b.oy) / dt, -30, 30); b.vz = clamp((b.z - b.oz) / dt, -30, 30);
        // the knot points down the string
        _q.set(b.x - ax, b.y - ay, b.z - az).normalize();
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.quaternion.setFromUnitVectors(UP, _q);
        // the string: from the hand to the knot, with a slight curl halfway
        const kx = b.x - _q.x * 0.36, ky = b.y - _q.y * 0.36, kz = b.z - _q.z * 0.36, mx = (ax + kx) / 2 + Math.sin(clock * 2 + b.ph) * 0.03, my = (ay + ky) / 2, mz = (az + kz) / 2;
        pos.set([ax, ay, az, mx, my, mz, mx, my, mz, kx, ky, kz], i * 12);
      });
      B.lines.geometry.setDrawRange(0, L.length * 4);
      B.lines.geometry.attributes.position.needsUpdate = true;
    }
    function hideBunch(B, on) { B.lines.visible = on; for (const b of B.list) b.mesh.visible = on; }
    // balloons let go: up and away with the wind, a bit of string trailing
    const flying = [];
    function letFly(b) {
      const tail = new THREE.LineSegments(tailGeo, stringMat);
      b.mesh.add(tail); b.mesh.visible = true; b.t = 0;
      flying.push(b);
    }

    /* the balloon sellers: a bunch held up high, back to their spot after jumping out of the way of a car */
    const SELLER_ID = makeIdentity({ shirt: 0x6a3d9a, pants: 0x3b5b8c, hair: 0x2b1d14, hat: 'beanie', hatColor: 0xc8102e, sleeves: true });
    const sellers = SPOTS.map((sp) => {
      const [x, z, face] = sp.seller, p = makePerson(SELLER_ID, x, z, { state: 'vendor', post: { x, z, face }, dodgeT: 0 });
      p.keep = true; p.rot = face;
      const s = { name: sp.name, p, bunch: makeBunch(SELLER_STOCK), restock: [] };
      for (let i = 0; i < SELLER_STOCK; i++) addToBunch(s);
      return s;
    });
    function addToBunch(s) {
      const B = s.bunch, have = new Set(B.list.map((b) => b.col)), free = BALLOONS.filter(([c]) => !have.has(c)), [col] = rpick(free.length ? free : BALLOONS);
      B.list.push(makeBalloon(col, s.p.x + (Math.random() - 0.5), 3.4 + Math.random() * 0.6, s.p.z + (Math.random() - 0.5), 1.1 + Math.random() * 0.75));
    }
    const mine = makeBunch(MAX_BALLOONS);

    /* where your balloons are tied: your left hand, or out of the window of the car you sit in */
    function anchor() {
      const S = policeStop;
      const seat = driving ? driving.driver : S && S.riding && S.car && S.car.rearSeat && S.car.rearSeat.visible ? S.car.rearSeat : null;
      if (seat) {
        const c = driving || S.car, side = Math.sign(seat.position.x) || 1;
        c.group.updateMatrixWorld(true);
        return seat.parent.localToWorld(_v.set(side * (c.M.W / 2 + 0.06), seat.position.y + 0.42, seat.position.z + 0.1));
      }
      if (player.model.group.visible) { player.model.group.updateMatrixWorld(true); return player.model.armL.localToWorld(_v.set(0, -0.6, 0.02)); }
      return _v.set(player.x, player.y + 1, player.z);
    }

    /* buying */
    let near = null;
    const broke = (what, kr) => toast(what + ' kostar ' + fmtKr(kr) + ', men du har bara ' + fmtKr(JOBS.earned) + '. Tjäna pengar på ett jobb: ta taxin, Sprintern, SL-bussen, mopeden, en polisbil eller en motorbåt och tryck J, eller sälj en bil på bilskroten i Hammarby hamn.');
    function buyIce(k) {
      if (ice) { toast('Du har redan en glass. Ät upp den först!'); return; }
      if (!JOBS.spend(ICE_PRICE)) { broke('En strut', ICE_PRICE); return; }
      const a = rpick(FLAVORS), b = rpick(FLAVORS.filter((f) => f !== a));
      ice = { model: makeIce([a[1], b[1]]), eaten: 0, t: -0.8 };
      ice.model.group.position.set(0, -0.6, 0.07); ice.model.group.rotation.x = -HOLD; ice.model.group.visible = false;
      player.model.armR.add(ice.model.group);
      k.serveT = 1.1;
      beep([988, 1319], 0.03, 0.16);
      toast('En strut med ' + a[0] + ' och ' + b[0] + '. Mums! −' + fmtKr(ICE_PRICE));
    }
    const handsFull = () => mine.list.length >= MAX_BALLOONS;
    function buyBalloon(s) {
      if (handsFull()) { toast('Du har redan ' + MAX_BALLOONS + ' ballonger. Fler orkar du inte hålla i!'); return; }
      if (!s.bunch.list.length) { toast('Ballongförsäljaren har sålt slut. Vänta lite, snart finns det fler.'); return; }
      if (!JOBS.spend(BALLOON_PRICE)) { broke('En ballong', BALLOON_PRICE); return; }
      // one from the seller's bunch, in a colour you don't have yet if there is one
      const have = new Set(mine.list.map((b) => b.col)), L = s.bunch.list;
      const pickB = L.find((b) => !have.has(b.col)) || L[0], first = !mine.list.length;
      L.splice(L.indexOf(pickB), 1);
      pickB.want = 1.25 + Math.random() * 0.2;
      pickB.len = Math.max(pickB.want, Math.hypot(pickB.x - player.x, pickB.y - 1, pickB.z - player.z));
      mine.list.push(pickB);
      s.restock.push(7 + Math.random() * 5);
      beep([784, 1175], 0.03, 0.16);
      const name = BALLOONS.find(([c]) => c === pickB.col)[1];
      toast('En ' + name + ' ballong! −' + fmtKr(BALLOON_PRICE) + (first && !isTouch ? ' Tryck V om du vill släppa den.' : ''));
    }
    function use() {
      if (!near || driving || !started || paused()) return false;
      if (near.seller) buyIce(near); else buyBalloon(near);
      return true;
    }
    function letGo() {
      if (!mine.list.length || paused()) return;
      const b = mine.list.pop();
      b.vy = Math.max(b.vy, 1);
      letFly(b);
      if (audio && !muted) tone(audio.ctx.currentTime, 'sine', 520, 1250, 0.5, 0.05);
      toast(mine.list.length ? 'Ballongen flög iväg!' : 'Hej då, ballong!');
    }
    function prompt() {
      if (!near) return null;
      return near.seller ? (ice ? 'Du har redan en glass' : 'Köp glass · ' + fmtKr(ICE_PRICE)) : handsFull() ? 'Händerna är fulla av ballonger' : 'Köp en ballong · ' + fmtKr(BALLOON_PRICE);
    }

    /* every frame, after the people have been posed */
    function update(dt) {
      wind.x = 0.6 + Math.sin(clock * 0.07) * 0.5; wind.z = -0.3 + Math.cos(clock * 0.05) * 0.45;
      const walking = !driving && !(policeStop && (policeStop.locked || policeStop.riding)) && player.y < 1.5;
      near = null;
      // the kiosks: the seller turns to you, and reaches out with your cone when you buy one
      for (const k of kiosks) {
        const [lx, lz] = toLocal(k, player.x, player.z), d = Math.hypot(lx, lz - 1.2);
        if (walking && lz > 1.25 && lz < 3.6 && Math.abs(lx) < 1.9) near = k;
        const S = k.seller;
        if (d > 60) continue;
        const want = d < 9 ? k.face + clamp(wrapAngle(Math.atan2(player.x - S.group.position.x, player.z - S.group.position.z) - k.face), -0.7, 0.7) : k.face;
        k.look = lerpAngle(k.look, want, 1 - Math.exp(-4 * dt));
        S.group.rotation.y = k.look;
        S.inner.position.y = Math.sin(clock * 1.7 + k.x) * 0.012;
        k.serveT = Math.max(0, k.serveT - dt);
        const reach = k.serveT > 0 ? -1.35 : 0;
        S.armR.rotation.x = lerp(S.armR.rotation.x, reach, 1 - Math.exp(-10 * dt));
        k.handIce.visible = k.serveT > 0.35;
      }
      // the balloon sellers: one arm up holding the bunch
      for (const s of sellers) {
        const p = s.p, on = !p.asleep;
        hideBunch(s.bunch, on);
        for (let i = s.restock.length - 1; i >= 0; i--) if ((s.restock[i] -= dt) <= 0) { s.restock.splice(i, 1); addToBunch(s); }
        if (!on) continue;
        if (walking && Math.hypot(player.x - p.x, player.z - p.z) < 2.3 && !near) near = s;
        const G = p.model;
        if (p.grounded) { G.armR.rotation.x = -2.55; G.armR.rotation.z = -0.12; }
        G.group.updateMatrixWorld(true);
        const h = G.armR.localToWorld(_v.set(0, -0.62, 0));
        stepBunch(s.bunch, h.x, h.y, h.z, dt);
      }
      // your ice cream: hold it, lick it now and then until it is gone
      const shown = player.model.group.visible && !player.cuffed;
      if (ice) {
        const G = player.model;
        ice.t += dt;
        ice.model.group.visible = shown && ice.t > 0;
        if (shown && ice.t > 0) {
          const ph = ice.t % 3.2, licking = ph > 2.2;
          if (licking) ice.eaten += dt;
          const up = licking ? Math.sin((ph - 2.2) * Math.PI) : 0;
          G.armR.rotation.x = lerp(HOLD, -2.05, up);
          G.armR.rotation.z = lerp(0.12, 0.45, up);
          // tipped towards the mouth, not right over
          ice.model.group.rotation.set(lerp(-HOLD, 1.25, up), 0, lerp(-0.12, -0.35, up));
          // the top scoop goes first, then the bottom one, then the cone
          const [s1, s2] = ice.model.scoops, b = ice.eaten;
          s2.scale.setScalar(clamp(1 - b / 4, 0, 1)); s2.visible = b < 4;
          s1.scale.setScalar(clamp(1 - (b - 4) / 4, 0, 1)); s1.visible = b < 8;
          ice.model.cone.scale.setScalar(clamp(1 - (b - 8) / 2.5, 0.2, 1));
          if (b >= BITES && !licking) { dropIce(); toast('Mums! Glassen är uppäten.'); }
        }
      }
      // your balloons: they make you fall slowly
      const n = mine.list.length;
      player.floaty = n ? 0.6 / (1 + 0.2 * (n - 1)) : 0;
      if (n) { const a = anchor(); stepBunch(mine, a.x, a.y, a.z, dt); hideBunch(mine, true); }
      else mine.ax = null;
      // and the ones that got away
      for (let i = flying.length - 1; i >= 0; i--) {
        const b = flying[i];
        b.t += dt;
        b.vx += (wind.x * 2.5 - b.vx) * dt * 0.6; b.vz += (wind.z * 2.5 - b.vz) * dt * 0.6; b.vy = Math.min(3.2, b.vy + 2 * dt);
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.set(Math.sin(clock * 1.4 + b.ph) * 0.15, b.ph + b.t * 0.3, Math.cos(clock * 1.2 + b.ph) * 0.15);
        if (b.y > 170 || b.t > 60) { scene.remove(b.mesh); flying.splice(i, 1); }
      }
    }

    /* on the maps: a cone for the kiosks, a balloon for the sellers */
    function icon(g, kind, X, Y, s) {
      if (kind === 'ice') {
        g.fillStyle = '#d9a35f'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * s;
        g.beginPath(); g.moveTo(X - 3.6 * s, Y - 1 * s); g.lineTo(X + 3.6 * s, Y - 1 * s); g.lineTo(X, Y + 7 * s); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#e8457a'; g.beginPath(); g.arc(X, Y - 2.6 * s, 3.8 * s, 0, TAU); g.fill(); g.stroke();
      } else {
        g.strokeStyle = '#ffffff'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(X, Y + 1.5 * s); g.lineTo(X + 1.2 * s, Y + 8 * s); g.stroke();
        g.fillStyle = '#e0203a'; g.lineWidth = 1.5 * s; g.beginPath(); g.ellipse(X, Y - 2.5 * s, 3.6 * s, 4.4 * s, 0, 0, TAU); g.fill(); g.stroke();
      }
    }
    function drawMini(g, px, pz, u) {
      for (const k of kiosks) if (Math.abs(k.x - px) < 110 && Math.abs(k.z - pz) < 110) icon(g, 'ice', k.x, k.z, u);
      for (const s of sellers) if (Math.abs(s.p.x - px) < 110 && Math.abs(s.p.z - pz) < 110) icon(g, 'balloon', s.p.x, s.p.z, u);
    }
    function drawBig(g, toX, toY, k) {
      if (k < 0.2) return;
      const sc = clamp(k / 0.35, 1.3, 2);
      for (const q of kiosks) icon(g, 'ice', toX(q.x), toY(q.z), sc);
      for (const s of sellers) icon(g, 'balloon', toX(s.p.x), toY(s.p.z), sc);
    }

    return {
      update, use, letGo, prompt, drawMini, drawBig, kiosks, sellers,
      get near() { return near; }, get ice() { return ice; }, get balloons() { return mine.list.length; }, get flying() { return flying.length; }
    };
  })();
