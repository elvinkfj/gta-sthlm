'use strict';

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
    // at a kiosk, a balloon seller or a bucket of water balloons E buys, otherwise it is for the car you stand by
    // riding along with a friend, or by a friend's car you can get in
    const mpP = started ? MP.prompt() : null, flyP = started ? FLY.prompt() || CHUTE.prompt() || METRO.prompt() || GARAGE.prompt() || RIDES.prompt() : null;
    const liftP = started && !driving && !FLY.on ? LIFT.prompt() : null, shop = !liftP && started && !driving && !FLY.on ? SPLASH.prompt() || VENDORS.prompt() : null;
    const prompt = mpP || flyP || liftP || shop || (started && !driving && nearCar ? (nearCar.bot ? 'Ta ' + nearCar.M.def : 'Kliv in i ' + nearCar.M.def) : null);
    if (prompt !== lastPrompt) {
      lastPrompt = prompt;
      el.prompt.hidden = !prompt || isTouch;
      if (prompt) { el.promptText.textContent = prompt; el.prompt.classList.toggle('steal', !mpP && !flyP && !shop && !liftP && !!nearCar && !!nearCar.bot); el.prompt.classList.toggle('shop', !mpP && !!shop); }
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
    const bucket = !driving && !FLY.on && SPLASH.near, vendor = !bucket && !driving && !FLY.on && VENDORS.near;
    const use = ph === 'talk' ? 'Skriv under' : ph === 'transport' || ph === 'park' ? 'Hoppa fram' : ph === 'jail' ? 'Sov' : mpP ? (MP.ride ? 'Kliv ur' : 'Åk med') : flyP || FLY.on ? (flyP === 'Flyg helikoptern' ? 'Flyg' : !flyP || flyP === 'Kliv ur' ? 'Kliv ur' : flyP === 'Gå ur kön' ? 'Kön' : flyP.startsWith('Åk tunnelbana') ? 'T-bana' : flyP.startsWith('Åk upp') || flyP.startsWith('Hoppa') ? 'Hoppa' : 'Åk') : driving ? 'Kliv ur' : liftP ? 'Hissen' : bucket ? 'Köp 5 st' : vendor ? (vendor.seller ? 'Köp glass' : 'Köp ballong') : nearCar && nearCar.bot ? 'Ta bilen' : 'Kliv in';
    if (use !== lastUse) { el.btnUse.textContent = use; lastUse = use; }
    el.btnUse.classList.toggle('off', !mpP && !flyP && !driving && !nearCar && !vendor && !bucket && !liftP && !['talk', 'transport', 'park', 'jail'].includes(ph));
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
    WORKSHOP.drawMini(g, px, pz, 1 / s);
    GARAGE.drawMini(g, px, pz, 1 / s);
    CASH.drawMini(g, px, pz, 1 / s);
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
    FLY.drawMini(g, px, pz, 1 / s);
    MP.drawMini(g, px, pz, 1 / s);
    WAYPOINT.drawMini(g, px, pz, 1 / s);
    const rot = driving ? driving.h : player.rot, u = 1 / s;
    g.translate(px, pz); g.rotate(-rot);
    g.beginPath(); g.moveTo(0, 9 * u); g.lineTo(6.5 * u, -6 * u); g.lineTo(0, -2.5 * u); g.lineTo(-6.5 * u, -6 * u); g.closePath();
    g.fillStyle = driving ? hex(driving.color) : '#ffffff'; g.strokeStyle = '#0a5ba8'; g.lineWidth = 2 * u; g.lineJoin = 'round';
    g.fill(); g.stroke();
    g.restore();
    WAYPOINT.drawLabel(g, S);
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
    WORKSHOP.drawBig(g, toX, toY, k);
    GARAGE.drawBig(g, toX, toY, k);
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
    FLY.drawBig(g, toX, toY, text);
    CHUTE.drawBig(g, toX, toY, text);
    MP.drawBig(g, toX, toY, text);
    WAYPOINT.drawBig(g, toX, toY, k);
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
    bm.cv.addEventListener('pointerdown', (e) => { bigmap.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; try { bm.cv.setPointerCapture(e.pointerId); } catch (err) { /* (the mouse still locked a moment) */ } });
    bm.cv.addEventListener('pointermove', (e) => {
      const d = bigmap.drag;
      if (!d || d.id !== e.pointerId) return;
      const k = bigmapFit() * Math.pow(2, bigmap.zoom);
      bigmap.cx -= (e.clientX - d.x) / k; bigmap.cz -= (e.clientY - d.y) / k;
      d.x = e.clientX; d.y = e.clientY;
      drawBigmap();
    });
    const endDrag = (e) => { if (bigmap.drag && bigmap.drag.id === e.pointerId) bigmap.drag = null; };
    // a click that didn't drag puts your own goal there (or, on it, takes it away); a moment later, as a double click
    // finds you instead
    let tapT = 0;
    bm.cv.addEventListener('pointerup', (e) => {
      const d = bigmap.drag;
      if (d && d.id === e.pointerId && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) {
        const r = bm.cv.getBoundingClientRect(), k = bigmapFit() * Math.pow(2, bigmap.zoom), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
        const x = bigmap.cx + mx / k, z = bigmap.cz + my / k, G = WAYPOINT.goal, near = G ? Math.hypot((G.x - bigmap.cx) * k - mx, (G.z - bigmap.cz) * k - (my + 9)) : Infinity;
        clearTimeout(tapT);
        tapT = setTimeout(() => { WAYPOINT.tap(x, z, near); drawBigmap(); }, 280);
      }
      endDrag(e);
    });
    bm.cv.addEventListener('pointercancel', endDrag);
    bm.cv.addEventListener('dblclick', () => { clearTimeout(tapT); const p = driving || player; bigmap.cx = p.x; bigmap.cz = p.z; drawBigmap(); });
    $('bigmapIn').addEventListener('click', () => zoomBy(0.6));
    $('bigmapOut').addEventListener('click', () => zoomBy(-0.6));
    $('bigmapClose').addEventListener('click', closeBigmap);
    bm.el.addEventListener('click', (e) => { if (e.target === bm.el) closeBigmap(); });
    $('map').addEventListener('click', (e) => { e.stopPropagation(); openBigmap(); });
  }
