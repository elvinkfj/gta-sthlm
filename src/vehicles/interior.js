'use strict';

  /* ================= the inside of the vehicles ================= */
  // What you see from the driver's seat in first person (C): the dashboard with its instruments, the steering wheel with
  // your hands on it, the seats, the console, the doors, the pillars and the headliner. It is built only for the vehicle
  // you drive in first person, once per model, and hung in its body (and, on the moped, in what turns with the bars), so
  // the cars in the traffic cost nothing. The needles, the screens and the wheel move in update.
  const INTERIOR = (() => {
    // (nothing of Three.js is made while the page loads: a new object takes a Math.random for its uuid, which would shift
    // the seeded traffic of the tests' baseline. assets() makes the materials and the screens the first time they're needed)
    let matte, shiny, needleMat, needleGeo, digitalTex, teslaTex, SCREEN = null;
    const BLACK = 0x111214, DARKG = 0x1d1f22, SKIN = playerId.skin, SLEEVE = playerId.shirt;
    const CLASSIC = new Set(['v240', 'saab', 'p1800', 'etype', 'cobra', 'countach', 'rs27', 'gt40', 'f40']);
    const WOODEN = new Set(['etype', 'p1800', 'cobra', 'rs27', 'gt40']);
    const LUX = new Set(['suv', 'x5', 'g63', 'dbs', 'taycan', 'rs6', 'chiron', 'huayra', 'tourbillon', 'saab95', 'xc60', 'v70', 'xc40']);
    const TESLA = new Set(['sedan', 'modely']);

    /* ---------- screens and dials ---------- */
    // a round dial: ticks and numbers round 270 degrees from the bottom left, a red zone at the end
    function dial(g, cx, cy, r, max, step, red, face, ink, label) {
      g.fillStyle = face; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      g.strokeStyle = '#8a9096'; g.lineWidth = r * 0.06; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      const ang = (f) => Math.PI * 0.75 + f * Math.PI * 1.5;
      if (red) { g.strokeStyle = '#d0202a'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(cx, cy, r * 0.84, ang(red), ang(1)); g.stroke(); }
      g.fillStyle = ink; g.strokeStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${Math.round(r * 0.2)}px sans-serif`;
      const n = Math.round(max / step);
      for (let i = 0; i <= n * 2; i++) {
        const a = ang(i / (n * 2)), big = i % 2 === 0, r0 = r * (big ? 0.72 : 0.8);
        g.lineWidth = big ? r * 0.045 : r * 0.025;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); g.stroke();
        if (big) g.fillText(String((i / 2) * step), cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
      }
      g.font = `${Math.round(r * 0.15)}px sans-serif`; g.fillText(label, cx, cy + r * 0.42);
    }
    // the cluster behind the wheel: the speedometer on the left, the rev counter (or the power meter) on the right, and
    // the little screen between them. A dial's centre is 0.095 m either side of the middle (see the needles)
    const clusters = new Map();
    function clusterTex(kind, kmh, rpm) {
      const key = kind + kmh + ':' + rpm;
      if (!clusters.has(key)) clusters.set(key, canvasTex(512, 192, (g, w, h) => {
        const classic = kind === 'classic', face = classic ? '#efe6cf' : '#0b0c0e', ink = classic ? '#1a1a1a' : '#f2f2f2';
        g.fillStyle = classic ? '#1a1712' : '#050506'; g.fillRect(0, 0, w, h);
        dial(g, 104, 96, 82, kmh, kmh > 200 ? 40 : 20, 0, face, ink, 'km/h');
        if (rpm) dial(g, 408, 96, 82, rpm, 1, (rpm - 1.2) / rpm, face, ink, 'x1000 rpm');
        else dial(g, 408, 96, 82, 100, 20, 0, face, ink, 'kW %');
        if (!classic) {
          // the screen between the dials: the outside temperature, the clock and the distance
          g.fillStyle = '#10161c'; g.fillRect(200, 40, 112, 112);
          g.fillStyle = '#7fd1ff'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('8°C', 256, 72);
          g.fillStyle = '#e8eef2'; g.font = '18px sans-serif'; g.fillText('D', 256, 102); g.fillText('12 345 km', 256, 132);
        } else {
          // the warning lamps between the classic dials
          for (let i = 0; i < 4; i++) { g.fillStyle = ['#d0202a', '#f0b400', '#2ea043', '#3b7dd8'][i]; g.beginPath(); g.arc(226 + i * 20, 160, 6, 0, TAU); g.fill(); }
        }
      }));
      return clusters.get(key);
    }
    // a single round dial of its own (for the moped, the boats), its centre in the middle
    const dials = new Map();
    function dialTex(kind, max) {
      const key = kind + max;
      if (!dials.has(key)) dials.set(key, canvasTex(192, 192, (g, w, h) => {
        g.fillStyle = kind === 'classic' ? '#1a1712' : '#050506'; g.fillRect(0, 0, w, h);
        dial(g, 96, 96, 82, max, max > 100 ? 40 : max > 60 ? 20 : 10, 0, kind === 'classic' ? '#efe6cf' : '#0b0c0e', kind === 'classic' ? '#1a1a1a' : '#f2f2f2', 'km/h');
      }));
      return dials.get(key);
    }
    // the screens drawn again while you look at them: the digital cluster and the big Tesla screen show your speed
    const live = { kmh: 0, gear: 'D', t: 0 };
    function assets() {
    if (SCREEN) return;
    matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide });
    shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.9, side: THREE.DoubleSide });
    needleMat = new THREE.MeshBasicMaterial({ color: 0xff4a1c });
    needleGeo = new THREE.BoxGeometry(0.0035, 0.044, 0.002); needleGeo.translate(0, 0.017, 0);
    digitalTex = canvasTex(512, 192, (g, w, h) => {
      g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
      const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#0d2233'); grd.addColorStop(0.5, '#05070a'); grd.addColorStop(1, '#0d2233');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 84px sans-serif'; g.fillText(String(live.kmh), 256, 86);
      g.font = '22px sans-serif'; g.fillStyle = '#9fb3c2'; g.fillText('km/h', 256, 140);
      g.font = 'bold 30px sans-serif'; g.fillStyle = '#4fc3ff'; g.fillText(live.gear, 70, 96);
      // the battery and a map arrow
      g.strokeStyle = '#9fb3c2'; g.lineWidth = 3; g.strokeRect(390, 70, 80, 28); g.fillStyle = '#2ea043'; g.fillRect(393, 73, 56, 22);
      g.fillStyle = '#9fb3c2'; g.font = '18px sans-serif'; g.fillText('312 km', 430, 120);
    });
    teslaTex = canvasTex(512, 320, (g, w, h) => {
      g.fillStyle = '#0d0f12'; g.fillRect(0, 0, w, h);
      // the map on the right: streets, water, the route and you
      g.fillStyle = '#1b2430'; g.fillRect(170, 0, w - 170, h);
      g.fillStyle = '#123049'; g.beginPath(); g.moveTo(380, 0); g.quadraticCurveTo(330, 160, 512, 240); g.lineTo(512, 0); g.fill();
      g.strokeStyle = '#3a4656'; g.lineWidth = 8;
      for (const [a, b, c, d] of [[170, 60, 512, 120], [220, 0, 300, 320], [170, 220, 512, 200], [420, 120, 380, 320]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
      g.strokeStyle = '#3d8bff'; g.lineWidth = 10; g.beginPath(); g.moveTo(262, 320); g.lineTo(258, 170); g.lineTo(380, 150); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(262, 230); g.lineTo(250, 258); g.lineTo(262, 250); g.lineTo(274, 258); g.fill();
      // on the left: your speed, the gear and the car seen from above
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 64px sans-serif'; g.fillText(String(live.kmh), 85, 70);
      g.font = '18px sans-serif'; g.fillStyle = '#9aa4ae'; g.fillText('KM/H', 85, 110);
      g.font = 'bold 22px sans-serif'; g.fillStyle = '#ffffff'; g.fillText('P R N ' + live.gear, 85, 150);
      g.fillStyle = '#d9dde1'; g.fillRect(65, 190, 40, 80); g.fillStyle = '#0d0f12'; g.fillRect(70, 205, 30, 20);
      g.fillStyle = '#9aa4ae'; g.font = '16px sans-serif'; g.fillText('Stockholm', 85, 300);
      // the bar along the bottom: the temperature, music
      g.fillStyle = '#000000'; g.fillRect(170, h - 34, w - 170, 34);
      g.fillStyle = '#d9dde1'; g.font = '16px sans-serif'; g.fillText('21.0°   ♪   ❄   ☰', 340, h - 17);
    });
    // the centre screen of an ordinary modern car: the map
    const navTex = canvasTex(256, 150, (g, w, h) => {
      g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#a9cbe6'; g.beginPath(); g.moveTo(170, 0); g.quadraticCurveTo(150, 80, 256, 110); g.lineTo(256, 0); g.fill();
      g.fillStyle = '#c8e0b4'; g.fillRect(20, 90, 60, 40);
      g.strokeStyle = '#ffffff'; g.lineWidth = 7;
      for (const [a, b, c, d] of [[0, 40, 256, 60], [100, 0, 120, 150], [0, 120, 256, 100]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
      g.strokeStyle = '#2f7de1'; g.lineWidth = 6; g.beginPath(); g.moveTo(112, 150); g.lineTo(110, 52); g.lineTo(256, 58); g.stroke();
      g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(113, 108); g.lineTo(104, 126); g.lineTo(113, 120); g.lineTo(122, 126); g.fill();
      g.fillStyle = 'rgba(20,24,28,0.85)'; g.fillRect(0, 0, w, 24);
      g.fillStyle = '#ffffff'; g.font = 'bold 14px sans-serif'; g.textBaseline = 'middle'; g.fillText('↱ 300 m  Skeppsbron', 8, 12);
    });
    // the radio of an old car: a cassette slot, a dial and buttons
    const radioTex = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b2a26'; g.fillRect(70, 14, 116, 34);
      g.fillStyle = '#e9c46a'; g.fillRect(74, 18, 108, 26);
      g.fillStyle = '#3a2a10'; for (let i = 0; i < 9; i++) g.fillRect(80 + i * 11, 22, 2, 10);
      g.fillStyle = '#d0202a'; g.fillRect(118, 18, 2, 26);
      g.fillStyle = '#0a0a0a'; g.fillRect(70, 58, 116, 10);
      g.fillStyle = '#9a9a9a'; for (let i = 0; i < 5; i++) g.fillRect(74 + i * 23, 74, 18, 12);
    });
    const taxiTex = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#060606'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2bd94a'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LEDIG', w / 2, h / 2);
    });
    const polisTex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = '#0b2a5b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd200'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLISEN', w / 2, 46);
      g.fillStyle = '#d7e3f4'; g.font = '15px sans-serif';
      ['Larm: inga nya', 'Enhet 2210 Gamla stan', 'Status: på väg'].forEach((t, i) => g.fillText(t, w / 2, 86 + i * 22));
    });
    const busTex = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#050505'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff9a1a'; g.font = 'bold 36px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Nästa: Slussen', w / 2, h / 2);
    });
    const plotterTex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = '#0d3550'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8d9a8'; g.beginPath(); g.moveTo(0, 0); g.lineTo(110, 0); g.quadraticCurveTo(80, 70, 0, 90); g.fill();
      g.beginPath(); g.moveTo(256, 160); g.lineTo(150, 160); g.quadraticCurveTo(190, 90, 256, 70); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.arc(128, 80, i * 18, 0, TAU); g.stroke(); }
      g.strokeStyle = '#ff5a5a'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 80); g.lineTo(200, 20); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(128, 70); g.lineTo(121, 88); g.lineTo(135, 88); g.fill();
      g.fillStyle = '#ffffff'; g.font = 'bold 13px sans-serif'; g.fillText('12.4 kn   SOG', 8, h - 10);
    });
    const radarTex = canvasTex(160, 160, (g, w, h) => {
      g.fillStyle = '#031208'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1f7a3a'; g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(80, 80, i * 24, 0, TAU); g.stroke(); }
      // (blips at fixed places, not from the seeded random)
      g.fillStyle = '#5cff8a'; for (let i = 0; i < 40; i++) { const a = i * 2.39996, r = 20 + ((i * 37) % 55); g.fillRect(80 + Math.cos(a) * r, 80 + Math.sin(a) * r, 2, 2); }
      g.strokeStyle = '#5cff8a'; g.lineWidth = 2; g.beginPath(); g.moveTo(80, 80); g.lineTo(140, 40); g.stroke();
    });
    SCREEN = {
      nav: basic(navTex), radio: basic(radioTex), taxi: basic(taxiTex), polis: basic(polisTex), bus: basic(busTex),
      plotter: basic(plotterTex), radar: basic(radarTex), digital: basic(digitalTex), tesla: basic(teslaTex)
    };
    }
    const basic = (t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false });

    /* ---------- building helpers ---------- */
    // a quad with a flat normal turned towards the inside point `to`
    function quad(m, a, b, c, d, col, to) {
      const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-9) return;
      n = n.map((k) => k / l);
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, mz = (a[2] + c[2]) / 2;
      if (to && n[0] * (to[0] - mx) + n[1] * (to[1] - my) + n[2] * (to[2] - mz) < 0) n = n.map((k) => -k);
      m.triN(a, b, c, n, n, n, col); m.triN(a, c, d, n, n, n, col);
    }
    // a flat picture (a screen or a dial face) facing back towards the driver, tilted back by `tilt`
    function screen(group, mat, w, h, x, y, z, tilt = 0, uv) {
      const g = new THREE.PlaneGeometry(w, h);
      if (uv) { const U = g.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, lerp(uv[0], uv[2], U.getX(i)), lerp(uv[1], uv[3], U.getY(i))); }
      const s = new THREE.Mesh(g, mat);
      s.position.set(x, y, z); s.rotation.set(tilt, Math.PI, 0);
      group.add(s);
      return s;
    }
    // a needle on a dial at (x, y, z), turning in the plane of a dial tilted back by `tilt`
    function needle(group, x, y, z, tilt, kind, max, scale = 1) {
      const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.rotation.set(tilt, Math.PI, 0); pivot.scale.setScalar(scale);
      const n = new THREE.Mesh(needleGeo, needleMat); n.position.z = 0.002; pivot.add(n);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10), needleMat); hub.rotation.x = Math.PI / 2; hub.position.z = 0.003; pivot.add(hub);
      group.add(pivot);
      return { n, kind, max };
    }
    // a round dial size x size with its needle, facing back and tilted back by `tilt`
    function roundGauge(I, group, x, y, z, tilt, max, size, classic) {
      screen(group, basic(dialTex(classic ? 'classic' : 'modern', max)), size, size, x, y, z, tilt);
      I.needles.push(needle(group, x, y, z - 0.002 * Math.cos(tilt), tilt, 'kmh', max, size * 8.4));
    }
    // the steering wheel: a rim, spokes, the hub, and your hands, turning about the column (a mount turned rx about x:
    // positive leans the top of the wheel away from you, as in a real car)
    function steeringWheel(I, at, r, rx, style) {
      const mount = new THREE.Group(); mount.position.set(...at); mount.rotation.x = rx;
      const turn = new THREE.Group(); mount.add(turn);
      const m = new Merger(), k = new Merger();
      const rimCol = style.wood ? 0x6b3e1f : style.white ? 0xf2f2ee : 0x16171a;
      m.add(new THREE.TorusGeometry(r, r * 0.165, 10, 40), rimCol);
      // spokes: three (left, right and down), two on the Tesla, four thin metal ones on the old cars
      const sp = style.classic ? [0, Math.PI / 2, Math.PI, Math.PI * 1.5] : style.two ? [0, Math.PI] : [0, Math.PI, Math.PI * 1.5];
      for (const a of sp) {
        const ca = Math.cos(a), sa = Math.sin(a), len = r - 0.05;
        if (style.classic) tubeTo(k, [ca * 0.035, sa * 0.035, 0.012], [ca * (r - 0.01), sa * (r - 0.01), 0], 0.006, 0xb9bec4);
        else m.add(new THREE.BoxGeometry(len, a === Math.PI * 1.5 ? 0.035 : 0.045, 0.018), 0x202226, ca * (0.05 + len / 2 - 0.02), sa * (0.05 + len / 2 - 0.02), 0.004, 0, 0, a);
      }
      // the hub with the airbag, a badge in the middle, buttons on the spokes
      m.add(new THREE.CylinderGeometry(style.classic ? 0.035 : 0.068, style.classic ? 0.035 : 0.072, 0.05, 20), 0x1a1b1e, 0, 0, 0.012, Math.PI / 2, 0, 0);
      k.add(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 16), 0xc9ced3, 0, 0, -0.016, Math.PI / 2, 0, 0);
      if (!style.classic) for (const s of [1, -1]) for (let i = 0; i < 3; i++) m.box(0.014, 0.01, 0.004, 0x3a3d42, s * (0.085 + i * 0.018), 0.008, -0.006);
      // a red mark at the top on a sports car, paddles behind the wheel
      if (style.sport) {
        m.box(0.03, 0.035, r * 0.36, 0xc8102e, 0, r, 0);
        for (const s of [1, -1]) k.box(0.05, 0.08, 0.008, 0x9aa0a6, s * 0.11, 0.035, 0.035);
      }
      // your hands at a quarter to three, your sleeves going back towards you
      for (const s of [1, -1]) {
        const hx = s * r, hy = 0.01;
        m.add(new THREE.SphereGeometry(0.032, 12, 8), SKIN, hx, hy, -0.012);
        for (let f = 0; f < 4; f++) m.add(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 6), SKIN, hx - s * 0.015, hy + 0.03 - f * 0.02, 0.01, 0, 0, Math.PI / 2);
        tubeTo(m, [hx, hy - 0.02, -0.03], [hx + s * 0.015, hy - 0.07, -0.1], 0.022, SKIN, 0.025);
        tubeTo(m, [hx + s * 0.015, hy - 0.07, -0.1], [hx + s * 0.03, hy - 0.15, -0.22], 0.03, SLEEVE, 0.034);
      }
      const tm = new THREE.Mesh(m.build(), matte), tk = new THREE.Mesh(k.build(), shiny);
      tm.receiveShadow = true;
      turn.add(tm, tk);
      // the column and its shroud, the stalks for the indicators and the wipers (they don't turn)
      const c = new Merger();
      tubeTo(c, [0, 0, 0.03], [0, 0, 0.42], 0.035, DARKG);
      c.box(0.12, 0.085, 0.16, 0x1a1b1e, 0, 0, 0.12);
      for (const s of [1, -1]) { tubeTo(c, [s * 0.05, 0.015, 0.07], [s * 0.17, 0.03, 0.05], 0.007, 0x26282b); c.box(0.03, 0.016, 0.016, 0x3a3d42, s * 0.18, 0.031, 0.05); }
      mount.add(new THREE.Mesh(c.build(), matte));
      I.group.add(mount);
      I.wheel = turn;
    }
    // a vent: a dark mouth with slats across it
    function vent(m, k, w, h, x, y, z) {
      m.box(w, h, 0.012, 0x08090a, x, y, z);
      for (let i = 1; i < 4; i++) k.box(w - 0.01, 0.004, 0.014, 0x8a9096, x, y - h / 2 + (h * i) / 4, z - 0.002);
    }
    // a little seat, high-backed, for the vehicles that don't have their own (boats and the army)
    function seat(m, x, y, z, col, w = 0.5) {
      m.box(w, 0.1, 0.48, col, x, y, z);
      m.box(w, 0.62, 0.12, col, x, y + 0.34, z - 0.22);
      m.box(w * 0.55, 0.18, 0.1, col, x, y + 0.75, z - 0.24);
      for (const s of [1, -1]) m.box(0.06, 0.5, 0.18, shade(col, 0.8), x + s * (w / 2 - 0.02), y + 0.32, z - 0.18);
    }
    function palette(M) {
      const S = M.shape || {}, p = {
        dash: 0x24262a, top: 0x1c1e21, trim: 0x2f3236, pillar: 0x8f8b84, head: 0x9b978f, seat: S.seatCol || 0x2b2d31,
        side: shade(S.seatCol || 0x2b2d31, 0.75), accent: 0x9aa0a6, wood: null, console: 0x1f2124
      };
      if (M.sport) Object.assign(p, { dash: 0x161719, top: 0x121314, trim: 0x1c1d20, pillar: 0x27282b, head: 0x2a2b2e, side: 0x8f1018, accent: 0xc8102e, console: 0x18191b });
      if (LUX.has(M.id)) Object.assign(p, { seat: 0x9a6a3e, side: 0x7f5532, head: 0xbcb5a8, pillar: 0xb1aa9d, wood: 0x5a3520 });
      if (CLASSIC.has(M.id)) Object.assign(p, { dash: 0x1b1b1b, top: 0x151515, head: 0x8e877b, pillar: 0x7d776c, accent: 0xb9bec4 });
      if (WOODEN.has(M.id)) p.wood = 0x6b3e1f;
      if (TESLA.has(M.id)) Object.assign(p, { seat: 0xe8e6e1, side: 0xd7d4cd, wood: 0x6a4a30, head: 0x2a2b2e, pillar: 0x2a2b2e });
      if (M.police) Object.assign(p, { seat: 0x2b2d31, side: 0x23252a });
      return p;
    }

    /* ---------- a car ---------- */
    function buildCar(M, geo, I) {
      const sh = carShape(M), S = M.shape, cab = geo.cabin, drv = geo.driver, P = palette(M);
      const m = new Merger(), k = new Merger(), G = I.group;
      const { hl, r0, r1, r2, r3 } = sh, y1 = cab.y1, eye = [drv.x, drv.y + 0.84, drv.z], open = !!S.open;
      const inside = [0, eye[1] - 0.2, drv.z];
      // (in first person the dark tub that fills the car up to the window line is taken away: see tub. In its place there is
      // a floor just over the sills, and you sit on a cushion with your eyes where the driver's are)
      const fy = sh.sill(0) + 0.1, hipY = Math.max(fy + 0.14, drv.y + 0.12);
      const fw = Math.min(r3 + 0.15, hl - S.rc[1] - 0.05), pz = Math.min(drv.z + 0.86, fw - 0.1);
      const zA = Math.max(-hl + 0.12, cab.z0 - 0.05);
      // the inside of the shell: the doors, the window sills, the pillars and the headliner, a few centimetres in from the
      // body, where the body is not glass (the same colours as the loft in loftBody, so the pillars fall where they are
      // outside). In front of the windscreen only the sides, down in the footwells
      const zs = [...new Set([zA, ...sh.Z.filter((z) => z > zA && z < fw), r3, fw])].filter((z) => z <= fw).sort((a, b) => a - b);
      const q = { tag: '', z: 0, x: 0, y: 0, yt: 0, yb: 0, h: 0, side: 1, seam: 0, stripe: 0, grilleBody: 0, roofTone: null };
      const inset = (p) => (p[2] === 'roof' || p[2] === 'end' || p[2] === 'rail' ? [p[0] * 0.985, p[1] - 0.028] : [Math.max(0, p[0] - 0.03), Math.max(p[1], fy - 0.02)]);
      const door = P.wood && LUX.has(M.id) ? shade(P.seat, 0.85) : shade(P.trim, 1.25);
      for (let i = 0; i < zs.length - 1; i++) {
        const za = zs[i], zb = zs[i + 1], A = sh.ring(za), B = sh.ring(zb), ahead = za >= r3 - 1e-6;
        q.z = (za + zb) / 2; q.yt = (A.yt + B.yt) / 2; q.yb = (A.yb + B.yb) / 2; q.h = (A.h + B.h) / 2;
        for (let s = 0; s < A.pts.length - 1; s++) {
          const tag = A.pts[s][2], low = tag === 'side' || tag === 'rocker';
          if (tag === 'under' || (ahead && !low)) continue;
          if (open && (tag === 'rail' || tag === 'roof')) continue;
          q.tag = tag; q.x = (A.pts[s][0] + A.pts[s + 1][0] + B.pts[s][0] + B.pts[s + 1][0]) / 4;
          q.y = (A.pts[s][1] + A.pts[s + 1][1] + B.pts[s][1] + B.pts[s + 1][1]) / 4;
          if (!low && bodyColour(sh, q, 0x010203) === CAR_GLASS) continue;
          const col = low ? door : tag === 'ledge' ? P.trim : tag === 'glass' ? P.pillar : P.head;
          const a0 = inset(A.pts[s]), a1 = inset(A.pts[s + 1]), b0 = inset(B.pts[s]), b1 = inset(B.pts[s + 1]);
          for (const sx of [1, -1]) quad(m, [sx * a0[0], a0[1], za], [sx * a1[0], a1[1], za], [sx * b1[0], b1[1], zb], [sx * b0[0], b0[1], zb], col, inside);
        }
      }
      // the floor with its carpet, mats in front, the housings of the wheels where they come in
      const fx = cab.xi + 0.03;
      quad(m, [-fx, fy, zA], [fx, fy, zA], [fx, fy, fw], [-fx, fy, fw], 0x2a2b2e, [0, 2, 0]);
      for (const s of [1, -1]) m.box(0.38, 0.008, 0.5, 0x151617, s * drv.x, fy + 0.005, pz - 0.18);
      for (const az of [M.wb / 2, -M.wb / 2]) if (az + sh.rA > zA && az - sh.rA < fw) for (const s of [1, -1]) {
        const x0 = wheelX(M) - 0.2, ht = sh.archTop + 0.03 - fy;
        if (ht > 0.05 && fx > x0) m.box(fx - x0, ht, sh.rA * 1.8, P.trim, s * (fx + x0) / 2, fy + ht / 2, az);
      }
      // the boot wall behind the back seat, up to the window line
      m.box(2 * fx, Math.max(0.05, sh.belt(zA) - fy + 0.02), 0.03, P.trim, 0, (fy + sh.belt(zA)) / 2 + 0.01, zA + 0.02);
      // on each door: an armrest with the window switches, the handle, a pocket, a speaker low down
      const inX = (z, y) => Math.min(sh.sideX(z, Math.min(y, sh.belt(z) - 0.02)), sh.ring(z).gB + 0.04) - 0.06;
      for (const s of [1, -1]) {
        const za = drv.z + 0.1, ya = Math.min(hipY + 0.2, sh.belt(za) - 0.08), xa = inX(za, ya);
        m.box(0.09, 0.05, 0.5, P.trim, s * (xa - 0.03), ya, za);
        m.box(0.07, 0.006, 0.5, door, s * (xa - 0.03), ya + 0.026, za);
        for (let i = 0; i < 2; i++) m.box(0.025, 0.012, 0.03, 0x3a3d42, s * (xa - 0.04), ya + 0.03, za + 0.12 + i * 0.045);
        const zh = drv.z + 0.38, yh = Math.min(ya + 0.12, sh.belt(zh) - 0.04);
        k.box(0.02, 0.03, 0.12, 0xb9bec4, s * (inX(zh, yh) - 0.005), yh, zh);
        m.box(0.07, 0.1, 0.45, 0x141517, s * (inX(za, fy + 0.16) - 0.03), fy + 0.16, za + 0.05);
        const zs2 = Math.min(drv.z + 0.55, fw - 0.15), ysp = fy + 0.2;
        m.add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 18), 0x0c0d0e, s * (inX(zs2, ysp) + 0.01), ysp, zs2, 0, 0, Math.PI / 2);
        k.add(new THREE.TorusGeometry(0.075, 0.005, 6, 24), 0x8a9096, s * (inX(zs2, ysp) + 0.005), ysp, zs2, 0, Math.PI / 2, 0);
        // the seat belt hanging on the B-pillar
        const pil = (S.pillars || []).find(([pz2]) => pz2 < drv.z + 0.1 && pz2 > drv.z - 0.9);
        if (pil && !open) {
          const bz = pil[0], rg = sh.ring(bz), yTop = rg.yt + rg.h * 0.75;
          m.box(0.006, yTop - hipY, 0.045, 0x0f1011, s * (rg.gB - 0.04), (yTop + hipY) / 2, bz + 0.04);
          k.box(0.012, 0.03, 0.05, 0x9aa0a6, s * (rg.gB - 0.045), yTop, bz + 0.04);
        }
      }

      // the dashboard: a slab from the windscreen back to just in front of the wheel, under the glass all across
      const W = cab.wheel, zr = Math.min(W[2] + 0.17, r3 - 0.08), yT = W[1] + 0.13;
      const xin = (z) => Math.max(0.3, sh.ring(z).gB - 0.035);
      const topY = (x, z) => Math.max(y1 + 0.03, open ? Math.min(yT, sh.belt(z) + 0.1) : Math.min(yT, sh.shellY(x, z) - 0.02));
      const NX = 16, NZ = 6, zEnd = Math.min(r3 + 0.02, hl - 0.15);
      for (let j = 0; j < NZ; j++) {
        const za = lerp(zr, zEnd, j / NZ), zb = lerp(zr, zEnd, (j + 1) / NZ), wa = xin(za), wb = xin(zb);
        for (let i = 0; i < NX; i++) {
          const ua = -1 + (2 * i) / NX, ub = -1 + (2 * (i + 1)) / NX;
          const p = [[ua * wa, za], [ub * wa, za], [ub * wb, zb], [ua * wb, zb]].map(([x, z]) => [x, topY(x, z), z]);
          quad(m, p[0], p[1], p[2], p[3], P.top, [0, 3, zr]);
        }
      }
      // its face towards you, in strips that follow the top, and a soft lip along the edge
      const wr = xin(zr), face = (x) => topY(x, zr), yk = y1 - 0.03, yl = Math.max(fy + 0.25, yk - 0.16);
      for (let i = 0; i < NX; i++) {
        const xa = -wr + (2 * wr * i) / NX, xb = xa + (2 * wr) / NX;
        quad(m, [xa, yk, zr], [xb, yk, zr], [xb, face(xb), zr], [xa, face(xa), zr], P.dash, [0, y1 + 0.1, zr - 1]);
        tubeTo(m, [xa, face(xa) - 0.012, zr - 0.006], [xb, face(xb) - 0.012, zr - 0.006], 0.016, P.dash);
      }
      // under it the knee pads leaning away from you, the underside of the dash, and the wall to the engine at the front
      const zk = Math.min(zr + 0.12, fw - 0.05);
      quad(m, [-wr, yk, zr], [wr, yk, zr], [wr, yl, zk], [-wr, yl, zk], P.dash, [0, fy, zr - 1]);
      quad(m, [-wr, yl, zk], [wr, yl, zk], [wr, yl, fw], [-wr, yl, fw], 0x141517, [0, fy, zr]);
      quad(m, [-fx, fy, fw], [fx, fy, fw], [fx, yl, fw], [-fx, yl, fw], 0x1b1c1e, [0, 1, zr]);
      // the centre stack down to the tunnel between the footwells
      m.hexa([[-0.14, fy, zr - 0.02], [0.14, fy, zr - 0.02], [0.14, fy, fw], [-0.14, fy, fw], [-0.13, yk, zr - 0.02], [0.13, yk, zr - 0.02], [0.13, yk, fw], [-0.13, yk, fw]], P.console);
      // a band of wood or metal across the face, and a seam for the glovebox in front of the passenger
      const band = P.wood || (M.sport ? 0x2b2d31 : 0x5a5f66), yb = Math.min(face(0) - 0.05, y1 + 0.09);
      m.box(2 * wr - 0.1, 0.022, 0.006, band, 0, yb, zr - 0.012);
      m.box(0.34, 0.004, 0.004, 0x0b0b0c, -Math.max(0.3, drv.x), yb - 0.03, zr - 0.012);
      k.box(0.06, 0.012, 0.01, 0x9aa0a6, -Math.max(0.3, drv.x) + 0.12, yb - 0.045, zr - 0.012);

      // the instruments behind the wheel: a dark well, the cluster and a brow over it (none on the Tesla)
      const yc = Math.min(face(W[0]) - 0.055, W[1] + 0.075);
      if (!TESLA.has(M.id)) {
        const digital = M.ev && !CLASSIC.has(M.id);
        m.box(0.36, 0.13, 0.02, 0x060607, W[0], yc, zr - 0.004);
        if (digital) screen(G, SCREEN.digital, 0.32, 0.12, W[0], yc, zr - 0.016), I.live = true;
        else {
          const kmh = CLASSIC.has(M.id) ? 220 : M.max > 75 ? 360 : M.max > 55 ? 300 : 240, rpm = Math.ceil(M.red / 1000) + (M.red % 1000 ? 0 : 1);
          screen(G, basic(clusterTex(CLASSIC.has(M.id) ? 'classic' : 'modern', kmh, rpm)), 0.32, 0.12, W[0], yc, zr - 0.016);
          I.needles.push(needle(G, W[0] + 0.095, yc, zr - 0.017, 0, 'kmh', kmh), needle(G, W[0] - 0.095, yc, zr - 0.017, 0, 'rpm', rpm * 1000));
          if (CLASSIC.has(M.id)) for (const s of [1, -1]) k.add(new THREE.TorusGeometry(0.052, 0.004, 6, 24), 0xc9ced3, W[0] + s * 0.095, yc, zr - 0.018);
        }
        m.box(0.4, 0.03, 0.11, P.top, W[0], Math.min(face(W[0]) + 0.012, yc + 0.08), zr - 0.04);
      }

      // the middle: vents, the screen (or an old radio), the climate knobs and the hazard button
      const ys = face(0);
      vent(m, k, 0.08, 0.03, 0.06, ys - 0.03, zr - 0.012); vent(m, k, 0.08, 0.03, -0.06, ys - 0.03, zr - 0.012);
      for (const s of [1, -1]) vent(m, k, 0.07, 0.035, s * (wr - 0.1), face(s * (wr - 0.1)) - 0.035, zr - 0.012);
      if (TESLA.has(M.id)) {
        // the Tesla: one big screen standing on the dash, and nothing else
        m.box(0.4, 0.25, 0.02, 0x0a0a0b, 0, ys + 0.12, zr + 0.07);
        m.box(0.05, 0.08, 0.04, 0x0a0a0b, 0, ys + 0.02, zr + 0.08);
        screen(G, SCREEN.tesla, 0.38, 0.235, 0, ys + 0.12, zr + 0.058, 0.12);
        I.tesla = true;
      } else {
        const sw = 0.2, sh2 = Math.min(0.11, ys - y1 - 0.07);
        if (CLASSIC.has(M.id)) screen(G, SCREEN.radio, 0.2, Math.max(0.05, sh2 * 0.7), 0, ys - 0.06 - sh2 * 0.35, zr - 0.014);
        else if (sh2 > 0.04) {
          m.box(sw + 0.02, sh2 + 0.02, 0.016, 0x08090a, 0, ys - 0.06 - sh2 / 2, zr - 0.01);
          screen(G, SCREEN.nav, sw, sh2, 0, ys - 0.06 - sh2 / 2, zr - 0.019, 0, [0, 0.5 - (sh2 / sw) * 0.86, 1, 0.5 + (sh2 / sw) * 0.86]);
        } else {
          // too low for a screen: a modern car gets it standing on top of the dash
          m.box(0.24, 0.15, 0.02, 0x08090a, 0, ys + 0.07, zr + 0.03);
          screen(G, SCREEN.nav, 0.22, 0.13, 0, ys + 0.07, zr + 0.019, 0.08);
        }
        for (let i = -1; i <= 1; i++) k.add(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 14), 0x9aa0a6, i * 0.07, yk + 0.03, zr - 0.012, Math.PI / 2, 0, 0);
        m.add(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 3), 0xd0202a, 0, Math.max(y1 + 0.03, ys - 0.06 - sh2 - 0.025), zr - 0.014, Math.PI / 2, 0, 0);
      }
      // a speaker grille on top of the dash in each corner, a slot for the demister along the glass
      for (const s of [1, -1]) m.box(0.1, 0.004, 0.06, 0x0b0b0c, s * (xin(zr + 0.15) - 0.16), topY(s * (xin(zr + 0.15) - 0.16), zr + 0.15) + 0.003, zr + 0.15);

      // the steering wheel, at the same place as the plain one the car always has
      steeringWheel(I, W, 0.17, 0.45, { classic: CLASSIC.has(M.id) && !M.sport, wood: WOODEN.has(M.id), sport: M.sport && !CLASSIC.has(M.id), two: TESLA.has(M.id) });
      I.wheelK = 2.6;

      // the seats: the cushion on its base and rails, the backrest with bolsters and seams, the headrest on its two posts
      const st = cab.seat;
      if (st) for (const s of [1, -1]) {
        const x = s * st.sx, c0 = st.bz + 0.07, c1 = st.bz + 0.6;
        m.hexa([[x - 0.26, hipY - 0.12, c0], [x + 0.26, hipY - 0.12, c0], [x + 0.26, hipY - 0.1, c1], [x - 0.26, hipY - 0.1, c1], [x - 0.26, hipY, c0], [x + 0.26, hipY, c0], [x + 0.26, hipY + 0.04, c1], [x - 0.26, hipY + 0.04, c1]], P.seat);
        for (const b of [1, -1]) m.hexa([[x + b * 0.2, hipY - 0.02, c0], [x + b * 0.27, hipY - 0.02, c0], [x + b * 0.27, hipY, c1], [x + b * 0.2, hipY, c1], [x + b * 0.2, hipY + 0.04, c0], [x + b * 0.27, hipY + 0.04, c0], [x + b * 0.27, hipY + 0.07, c1], [x + b * 0.2, hipY + 0.07, c1]], P.side);
        if (hipY - 0.12 > fy) m.box(0.42, hipY - 0.12 - fy, 0.44, 0x18191b, x, (hipY - 0.12 + fy) / 2, (c0 + c1) / 2);
        for (const b of [1, -1]) k.box(0.03, 0.02, 0.62, 0x6a6f75, x + b * 0.17, fy + 0.01, (c0 + c1) / 2);
        m.box(0.03, 0.08, 0.12, 0x26282b, x + s * 0.28, hipY - 0.07, c0 + 0.2);
        const bot = hipY - 0.02, h = st.top - bot, my = (st.top + bot) / 2;
        m.box(0.54, h, 0.14, P.seat, x, my, st.bz);
        for (const b of [1, -1]) m.box(0.075, h - 0.02, 0.2, P.side, x + b * 0.25, my - 0.01, st.bz + 0.03);
        m.box(0.36, h - 0.1, 0.006, shade(P.seat, 0.86), x, my - 0.02, st.bz + 0.072);
        for (let i = 1; i < 4; i++) m.box(0.36, 0.006, 0.006, shade(P.seat, 0.7), x, bot + (h * i) / 4, st.bz + 0.076);
        if (M.sport) m.box(0.06, h - 0.1, 0.008, P.accent, x, my - 0.02, st.bz + 0.077);
        if (st.hTop - st.hBot > 0.08) {
          const hh = st.hTop - st.hBot;
          m.box(0.27, hh, 0.11, P.seat, x, (st.hTop + st.hBot) / 2, st.bz - 0.02);
          for (const b of [1, -1]) k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8), 0xb9bec4, x + b * 0.08, st.hBot - 0.01, st.bz - 0.02);
        }
      }
      // the back seat: a bench split 60/40, three headrests where the roof lets them in
      const rs = cab.rear;
      if (rs) {
        const bot = hipY - 0.04, h = rs.rTop - bot, my = (rs.rTop + bot) / 2, cz = rs.rz + 0.3;
        m.box(rs.rW + 0.04, h, 0.16, P.seat, 0, my, rs.rz);
        m.box(rs.rW + 0.04, 0.13, 0.46, P.seat, 0, bot - 0.04, cz);
        if (bot - 0.1 > fy) m.box(rs.rW, bot - 0.1 - fy, 0.42, 0x18191b, 0, (bot - 0.1 + fy) / 2, cz);
        m.box(0.006, h - 0.04, 0.008, shade(P.seat, 0.6), rs.rW * 0.1, my, rs.rz + 0.082);
        for (let i = 1; i < 3; i++) m.box(rs.rW - 0.1, 0.006, 0.006, shade(P.seat, 0.7), 0, bot + (h * i) / 3, rs.rz + 0.082);
        if (rs.ceil - rs.rTop > 0.2) for (const x of [-(rs.rW / 2 - 0.24), 0, rs.rW / 2 - 0.24]) m.box(0.24, 0.13, 0.09, P.seat, x, rs.rTop + 0.085, rs.rz - 0.02);
      }

      // the console between the seats: the gear lever, cup holders, an armrest at the back
      const cw = st ? clamp(st.sx - 0.31, 0.06, 0.13) : 0.1, c0 = st ? st.bz + 0.06 : drv.z - 0.25, c1 = zr - 0.01;
      const ct0 = Math.min(hipY + 0.2, yk - 0.08), ct1 = Math.min(hipY + 0.27, yk - 0.02);
      m.hexa([[-cw, fy, c0], [cw, fy, c0], [cw, fy, c1], [-cw, fy, c1], [-cw, ct0, c0], [cw, ct0, c0], [cw * 0.9, ct1, c1], [-cw * 0.9, ct1, c1]], P.console);
      m.box(cw * 2 + 0.02, 0.06, 0.26, P.seat, 0, ct0 + 0.03, c0 + 0.14);
      const gz = c0 + 0.36, gy = ct0 + 0.005 + ((ct1 - ct0) * (gz - c0)) / Math.max(0.1, c1 - c0);
      for (const s of [1, -1]) m.add(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 16), 0x060607, s * 0.045, gy + 0.008, gz + 0.12);
      if (M.ev && !CLASSIC.has(M.id)) {
        // a phone charging pad and a rotary drive selector
        m.box(cw * 1.6, 0.004, 0.14, 0x0a0a0b, 0, gy + 0.006, gz);
        k.add(new THREE.CylinderGeometry(0.025, 0.028, 0.03, 18), 0x9aa0a6, 0, gy + 0.02, gz - 0.12);
      } else if (CLASSIC.has(M.id) || M.sport && M.gears >= 6 && ['rs27', 'cobra', 'gt40', 'f40', 'countach', 'mx5', 'elise'].includes(M.id)) {
        // a manual box: a leather boot, the lever and a round knob; the handbrake beside it
        m.add(new THREE.ConeGeometry(0.05, 0.06, 12), 0x141516, 0, gy + 0.03, gz);
        tubeTo(k, [0, gy + 0.03, gz], [0, gy + 0.17, gz - 0.03], 0.008, 0xb9bec4);
        m.add(new THREE.SphereGeometry(0.03, 14, 10), 0x111111, 0, gy + 0.18, gz - 0.03);
        tubeTo(m, [0.0, gy + 0.02, gz - 0.2], [0.0, gy + 0.08, gz - 0.42], 0.016, 0x1a1a1a);
      } else {
        // an automatic: the selector in its gate, P R N D printed beside it
        m.box(0.07, 0.008, 0.12, 0x0b0b0c, 0, gy + 0.006, gz);
        m.box(0.045, 0.06, 0.07, 0x1b1c1f, 0, gy + 0.04, gz);
        k.box(0.047, 0.01, 0.072, 0xb9bec4, 0, gy + 0.072, gz);
      }
      // the parking brake button, the drive modes, belt buckles beside the seats
      m.box(0.03, 0.01, 0.03, 0x2b2d31, cw * 0.5, gy + 0.008, gz - 0.13);
      if (st) for (const s of [1, -1]) { m.box(0.03, 0.08, 0.03, 0x0f1011, s * (cw + 0.03), hipY + 0.03, st.bz + 0.12); k.box(0.028, 0.02, 0.035, 0x9aa0a6, s * (cw + 0.03), hipY + 0.075, st.bz + 0.12); }

      // the pedals: the accelerator on the right, the brake, a clutch in a manual car (or a rest for the left foot)
      const manual = CLASSIC.has(M.id) || ['rs27', 'cobra', 'gt40', 'f40', 'countach', 'mx5', 'elise'].includes(M.id);
      const pedals = [[drv.x - 0.17, 0.06, 0.12], [drv.x - 0.02, 0.09, 0.07], [drv.x + 0.15, manual ? 0.09 : 0.12, 0.07]];
      pedals.forEach(([x, w, h], i) => {
        if (i === 2 && !manual) { m.add(new THREE.BoxGeometry(w, 0.02, 0.2), 0x2b2d31, x, fy + 0.07, pz - 0.02, -0.6, 0, 0); return; }
        k.add(new THREE.BoxGeometry(w, h, 0.015), 0x6a6f75, x, fy + 0.12, pz, -0.45, 0, 0);
        tubeTo(m, [x, fy + 0.12 + h / 2, pz + 0.02], [x, yl - 0.02, pz + 0.1], 0.01, 0x1a1a1a);
      });
      // and you: your legs down to the pedals, your body, your upper arms out to the wheel
      const PANTS = playerId.pants, hipZ = st ? st.bz + 0.18 : drv.z;
      for (const [hx, fx2] of [[drv.x + 0.11, drv.x + 0.15], [drv.x - 0.1, drv.x - 0.17]]) {
        const knee = [hx + (fx2 - hx) * 0.4, Math.min(hipY + 0.16, yl - 0.08), Math.min(hipZ + 0.45, zk - 0.02)], foot = [fx2, fy + 0.12, pz - 0.1];
        tubeTo(m, [hx, hipY + 0.07, hipZ], knee, 0.075, PANTS, 0.065);
        m.add(new THREE.SphereGeometry(0.065, 10, 8), PANTS, ...knee);
        tubeTo(m, knee, foot, 0.06, PANTS, 0.048);
        m.add(new THREE.BoxGeometry(0.1, 0.08, 0.27), 0x1c1c1c, fx2, fy + 0.08, pz - 0.04, -0.5, 0, 0);
      }
      const chest = [drv.x, eye[1] - 0.3, drv.z - 0.06];
      tubeTo(m, [drv.x, hipY + 0.08, hipZ - 0.04], chest, 0.15, SLEEVE, 0.17);
      const ca = Math.cos(0.45), sa = Math.sin(0.45);
      for (const s of [1, -1]) {
        const lx = s * 0.2, ly = -0.14, lz = -0.22;
        const elbow = [W[0] + lx, W[1] + ly * ca - lz * sa, W[2] + ly * sa + lz * ca];
        const shoulder = [drv.x + s * 0.2, eye[1] - 0.3, drv.z - 0.1];
        m.add(new THREE.SphereGeometry(0.075, 10, 8), SLEEVE, ...shoulder);
        tubeTo(m, shoulder, elbow, 0.055, SLEEVE, 0.04);
      }


      // the mirror at the top of the windscreen, the sun visors and the light in the roof
      if (!open) {
        const zm = r2 + 0.06, ym = sh.shellY(0, zm) - 0.025;
        tubeTo(m, [0, ym, zm], [0, ym - 0.06, zm - 0.03], 0.008, 0x1a1b1e);
        m.box(0.25, 0.07, 0.035, 0x1a1b1e, 0, ym - 0.085, zm - 0.04);
        k.box(0.23, 0.055, 0.004, 0xc9d6dd, 0, ym - 0.085, zm - 0.059);
        for (const s of [1, -1]) {
          const xv = s * Math.min(0.33, sh.ring(r2).xe * 0.7), zv = r2 - 0.1, yv = sh.shellY(xv, zv) - 0.03;
          m.add(new THREE.BoxGeometry(0.4, 0.014, 0.17), P.head, xv, yv, zv, 0.12, 0, 0);
          if (s < 0) k.box(0.16, 0.002, 0.08, 0xc9d6dd, xv, yv - 0.009, zv + 0.01);
        }
        const zl = lerp(r1, r2, 0.75), yl = sh.shellY(0, zl) - 0.03;
        m.box(0.18, 0.02, 0.1, 0x2a2b2e, 0, yl, zl);
        for (const s of [1, -1]) m.box(0.06, 0.006, 0.05, 0xf3eedf, s * 0.045, yl - 0.012, zl);
      }

      // what the police have: the radio, a laptop on its arm in front of the passenger, the switch panel for the lights
      if (M.police) {
        m.box(0.16, 0.05, 0.12, 0x101112, 0, gy + 0.03, gz + 0.16);
        screen(G, SCREEN.polis, 0.05, 0.025, 0, gy + 0.045, gz + 0.099, 0.6, [0.2, 0.3, 0.8, 0.6]);
        for (let i = 0; i < 4; i++) m.box(0.025, 0.01, 0.02, [0x1f4fae, 0xd0202a, 0xf0b400, 0x2ea043][i], -0.045 + i * 0.03, gy + 0.06, gz + 0.14);
        const lx = -Math.max(0.25, drv.x - 0.05), ly = face(lx) + 0.09, lz = zr - 0.06;
        tubeTo(m, [lx * 0.4, yk + 0.05, zr - 0.02], [lx, ly - 0.08, lz], 0.012, 0x1a1b1e);
        m.add(new THREE.BoxGeometry(0.3, 0.2, 0.015), 0x15161a, lx, ly, lz, -0.25, 0.25, 0);
        const lap = screen(G, SCREEN.polis, 0.28, 0.175, lx, ly, lz - 0.009, 0.25);
        lap.rotation.y = Math.PI + 0.25;
      }
      // the taxi's meter on the dash
      if (S.taxi) {
        m.box(0.16, 0.05, 0.08, 0x0b0b0c, -0.16, ys + 0.025, zr + 0.06);
        screen(G, SCREEN.taxi, 0.13, 0.032, -0.16, ys + 0.027, zr + 0.019);
      }
      return { m, k };
    }

    /* ---------- the bus ---------- */
    function buildBus(M, geo, I) {
      const sh = carShape(M), S = M.shape, drv = geo.driver, P = palette(M), G = I.group;
      const m = new Merger(), k = new Merger(), { hl, hw } = sh;
      const y1 = 1.12, inside = [0, 2, 0];
      // the inside of the shell, as for a car
      const zs = sh.Z.filter((z) => z > -hl + 0.1 && z < hl - 0.1), q = { tag: '', z: 0, x: 0, y: 0, yt: 0, yb: 0, h: 0, side: 1, seam: 0, stripe: 0, grilleBody: 0, roofTone: null };
      for (let i = 0; i < zs.length - 1; i++) {
        const za = zs[i], zb = zs[i + 1], A = sh.ring(za), B = sh.ring(zb);
        q.z = (za + zb) / 2; q.yt = (A.yt + B.yt) / 2; q.yb = (A.yb + B.yb) / 2; q.h = (A.h + B.h) / 2;
        for (let s = 0; s < A.pts.length - 1; s++) {
          const tag = A.pts[s][2];
          if (tag === 'under' || tag === 'rocker' || tag === 'side') continue;
          for (const sd of [1, -1]) {
            q.tag = tag; q.side = sd; q.x = (A.pts[s][0] + A.pts[s + 1][0]) / 2; q.y = (A.pts[s][1] + B.pts[s + 1][1]) / 2;
            if (bodyColour(sh, q, 0x010203) === CAR_GLASS) continue;
            const o = tag === 'roof' || tag === 'end' || tag === 'rail' ? [0.985, -0.03] : [1, 0], dx = tag === 'roof' || tag === 'end' || tag === 'rail' ? 0 : 0.03;
            const f = (p, z) => [sd * Math.max(0, p[0] * o[0] - dx), p[1] + o[1], z];
            quad(m, f(A.pts[s], za), f(A.pts[s + 1], za), f(B.pts[s + 1], zb), f(B.pts[s], zb), tag === 'roof' || tag === 'end' ? 0xd8d6d0 : 0x9aa0a6, inside);
          }
        }
      }
      // the floor, grey with a yellow edge at the doors
      m.box(2 * hw - 0.2, 0.01, 2 * hl - 0.4, 0x5d6166, 0, y1 + 0.005, 0);
      for (const [a, b] of S.busDoors || []) m.box(0.08, 0.012, b - a, 0xf2c200, -(hw - 0.2), y1 + 0.008, (a + b) / 2);
      // the seats: a cushion in front of each back, a grab handle on top
      for (let z = hl - 3.2; z > -hl + 1.2; z -= 0.85) for (const sx of [1, -1]) if (!S.busDoors.some(([a, b]) => z > a - 0.3 && z < b + 0.3)) {
        m.box(0.9, 0.08, 0.42, 0x2f4f7a, sx * (hw - 0.6), y1 + 0.03, z + 0.24);
        m.box(0.86, 0.04, 0.02, 0xc8102e, sx * (hw - 0.6), y1 + 0.42, z + 0.06);
        tubeTo(k, [sx * (hw - 0.6) - 0.35, y1 + 0.53, z], [sx * (hw - 0.6) + 0.35, y1 + 0.53, z], 0.014, 0xd9dde1);
      }
      // yellow poles down the aisle with red stop buttons, rails under the roof
      for (let z = hl - 2.4; z > -hl + 0.8; z -= 1.7) for (const sx of [1, -1]) {
        const x = sx * 0.4, yTop = sh.shellY(x, z) - 0.04;
        tubeTo(k, [x, y1, z], [x, yTop, z], 0.02, 0xf2c200);
        m.box(0.05, 0.07, 0.05, 0xd0202a, x, y1 + 0.95, z);
      }
      for (const sx of [1, -1]) tubeTo(k, [sx * 0.45, sh.shellY(0.45, 0) - 0.2, hl - 2], [sx * 0.45, sh.shellY(0.45, 0) - 0.2, -hl + 0.6], 0.018, 0xd9dde1);
      // the driver's place: a dash across the front, the big flat wheel, the ticket machine, the sign for the next stop
      const dz = hl - 0.45, dy = y1 + 0.55;
      m.box(2 * hw - 0.25, dy - y1, 0.4, 0x2a2c30, 0, (dy + y1) / 2, dz);
      m.box(1.0, 0.25, 0.3, 0x2a2c30, drv.x, dy + 0.06, dz - 0.25);
      screen(G, basic(clusterTex('modern', 100, 3)), 0.36, 0.135, drv.x, dy + 0.12, dz - 0.402, 0.5);
      I.needles.push(needle(G, drv.x + 0.107, dy + 0.12, dz - 0.403, 0.5, 'kmh', 100), needle(G, drv.x - 0.107, dy + 0.12, dz - 0.403, 0.5, 'rpm', 3000));
      for (let i = 0; i < 8; i++) m.box(0.03, 0.012, 0.025, [0xd0202a, 0x2ea043, 0xf0b400, 0x3a3d42][i % 4], drv.x - 0.35 + i * 0.05, dy + 0.19, dz - 0.3);
      m.box(0.24, 0.32, 0.18, 0x1b1c1f, drv.x - 0.75, dy + 0.1, dz - 0.25);
      screen(G, SCREEN.nav, 0.15, 0.09, drv.x - 0.75, dy + 0.18, dz - 0.345, 0.3);
      const by = sh.shellY(0, hl - 0.6) - 0.18;
      m.box(1.3, 0.16, 0.06, 0x111111, 0, by, hl - 0.6);
      screen(G, SCREEN.bus, 1.24, 0.12, 0, by, hl - 0.635);
      steeringWheel(I, [drv.x, y1 + 0.75, drv.z + 0.55], 0.25, 1.05, {});
      I.wheelK = 4;
      return { m, k };
    }

    /* ---------- the moped and the jet ski ---------- */
    function buildMoped(M, geo, I) {
      // on the bars, over the lamps: the round speedometer, a fuel gauge, the ignition key
      const head = geo.head, rake = geo.rake, up = [0, Math.cos(rake), -Math.sin(rake)];
      const bar = [0, head[1] + up[1] * 0.17, head[2] + up[2] * 0.17], mk = [0, bar[1] - 0.1, bar[2] + 0.17];
      const toHead = new THREE.Matrix4().makeRotationX(rake).multiply(new THREE.Matrix4().makeTranslation(-head[0], -head[1], -head[2]));
      const m = new Merger(), k = new Merger(), F = new THREE.Group();
      const c = [0, mk[1] + 0.13, mk[2] - 0.1];
      m.add(new THREE.BoxGeometry(0.2, 0.08, 0.08), 0x1c1d20, c[0], c[1] - 0.02, c[2] + 0.02, 0.6, 0, 0);
      const pos = new THREE.Vector3(...c).applyMatrix4(toHead);
      I.steer = F;
      roundGauge(I, F, pos.x, pos.y + 0.02, pos.z - 0.03, 0.6 + rake, 80, 0.075);
      k.add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), 0xb9bec4, 0.06, c[1] - 0.04, c[2] - 0.03);
      const g1 = m.build(), g2 = k.build(); g1.applyMatrix4(toHead); g2.applyMatrix4(toHead);
      F.add(new THREE.Mesh(g1, matte), new THREE.Mesh(g2, shiny));
      return { m: new Merger(), k: new Merger() };
    }
    function buildJetski(M, geo, I) {
      const m = new Merger(), G = I.group;
      // a little screen in the console under the windscreen
      m.add(new THREE.BoxGeometry(0.2, 0.09, 0.05), 0x1c1d20, 0, 0.86, 0.42, 0.5, 0, 0);
      screen(G, SCREEN.digital, 0.17, 0.064, 0, 0.885, 0.405, 0.5);
      I.live = true;
      return { m, k: new Merger() };
    }

    /* ---------- the boats ---------- */
    function buildBoat(M, geo, I) {
      const m = new Merger(), k = new Merger(), G = I.group, b = M.boat;
      const gauge = (x, y, z, tilt, max) => roundGauge(I, G, x, y, z, tilt, max, 0.09);
      const throttle = (x, y, z) => {
        m.box(0.08, 0.06, 0.12, 0x1c1d20, x, y, z);
        tubeTo(k, [x, y + 0.03, z], [x, y + 0.14, z - 0.05], 0.008, 0xb9bec4);
        m.add(new THREE.SphereGeometry(0.022, 10, 8), 0x111111, x, y + 0.15, z - 0.055);
      };
      if (b === 'console') {
        // the Anytec: a chart plotter, a compass, the throttle beside the wheel
        m.add(new THREE.BoxGeometry(0.34, 0.22, 0.04), 0x111214, 0, 1.2, 0.45, -0.55, 0, 0);
        screen(G, SCREEN.plotter, 0.3, 0.18, 0, 1.2, 0.425, 0.55);
        m.add(new THREE.SphereGeometry(0.05, 14, 10), 0x0b0b0c, 0.22, 1.13, 0.55);
        gauge(-0.2, 1.13, 0.3, 0.7, 80);
        throttle(-0.25, 1.12, 0.12);
        steeringWheel(I, [0, 1.12, 0.08], 0.16, -0.9, {});
      } else if (b === 'patrol') {
        // the police boat: radar and chart over the helm, the throttles, the radio in the roof
        m.add(new THREE.BoxGeometry(0.72, 0.26, 0.08), 0x1c1d20, 0.45, 1.3, 1.27, -0.5, 0, 0);
        screen(G, SCREEN.radar, 0.22, 0.2, 0.62, 1.3, 1.225, 0.5);
        screen(G, SCREEN.plotter, 0.32, 0.2, 0.33, 1.3, 1.225, 0.5);
        gauge(0.18, 1.14, 1.0, 0.8, 80);
        throttle(0.12, 1.14, 1.05);
        m.box(0.3, 0.08, 0.2, 0x15161a, 0.1, 2.12, 1.0);
        screen(G, SCREEN.polis, 0.12, 0.04, 0.1, 2.12, 0.899, 0, [0.2, 0.4, 0.8, 0.6]);
        steeringWheel(I, [0.45, 1.25, 0.98], 0.17, -0.9, {});
      } else if (b === 'riva') {
        // the Riva: a row of chrome-ringed dials in the mahogany dash, the white wheel, chrome throttles
        for (let i = 0; i < 3; i++) {
          const x = -0.45 + (i - 1) * 0.16;
          roundGauge(I, G, x, 1.0, 0.648, 0, 60, 0.07, true);
          k.add(new THREE.TorusGeometry(0.036, 0.004, 6, 22), 0xc9ced3, x, 1.0, 0.646);
        }
        throttle(-0.05, 1.07, 0.6);
        steeringWheel(I, [-0.45, 1.12, 0.6], 0.19, -0.5, { classic: true, white: true });
      } else if (b === 'cb90') {
        // Stridsbåt 90: the wheelhouse from the inside (walls round the band of windows), a console with screens
        const yb = 1.36, yt = 3.0, ya = 2.3, yc = 2.78, ins = [0, 2.3, 0];
        const fz = (y) => lerp(1.6, 0.92, (y - yb) / (yt - yb)) - 0.03, sxw = (y) => lerp(1.62, 1.25, (y - yb) / (yt - yb)) - 0.03;
        const WALL = 0x5d6656, ROOF = 0x6d7566;
        const frontWall = (y0, y2, x0) => quad(m, [-sxw(y0) + x0, y0, fz(y0)], [sxw(y0) - x0, y0, fz(y0)], [sxw(y2) - x0, y2, fz(y2)], [-sxw(y2) + x0, y2, fz(y2)], WALL, ins);
        frontWall(yb, ya, 0); frontWall(yc, yt, 0);
        for (const s of [1, -1]) {
          quad(m, [s * sxw(ya), ya, fz(ya)], [s * (sxw(ya) - 0.12), ya, fz(ya)], [s * (sxw(yc) - 0.12), yc, fz(yc)], [s * sxw(yc), yc, fz(yc)], WALL, ins);
          const side = (y0, y2, z0, z1) => quad(m, [s * sxw(y0), y0, z0], [s * sxw(y0), y0, z1], [s * sxw(y2), y2, z1], [s * sxw(y2), y2, z0], WALL, ins);
          side(yb, ya, -1.65, fz(yb)); side(yc, yt, -1.42, fz(yc));
          side(ya, yc, -1.6, -1.2); side(ya, yc, 1.0, fz(ya));
        }
        quad(m, [-1.6, yb, -1.67], [1.6, yb, -1.67], [1.22, yt, -1.42], [-1.22, yt, -1.42], WALL, ins);
        m.box(2.4, 0.02, 2.3, ROOF, 0, yt - 0.03, -0.25);
        m.box(2.9, 0.02, 3.0, 0x3a3f36, 0, yb + 0.05, -0.05);
        // the console under the windows, its screens, the wheel and the two seats
        m.box(2.6, 0.82, 0.3, 0x2a2c2e, 0, 1.8 + 0.41 - 0.4, 1.12);
        screen(G, SCREEN.radar, 0.3, 0.28, -0.1, 2.3, 0.955, 0.5);
        screen(G, SCREEN.plotter, 0.36, 0.22, 0.25, 2.3, 0.955, 0.5);
        gauge(0.75, 2.18, 0.96, 0.6, 80);
        throttle(0.25, 2.2, 0.9);
        steeringWheel(I, [0.6, 2.12, 0.98], 0.2, 0.7, {});
        seat(m, 0.6, 1.9, 0.45, 0x23262a);
        seat(m, -0.6, 1.9, 0.45, 0x23262a);
      } else if (b === 'jetski') return buildJetski(M, geo, I);
      I.wheelK = 3;
      return { m, k };
    }

    /* ---------- the army ---------- */
    function buildTruck(M, geo, I) {
      // the Scania's cab from the inside: walls round the windscreen and the side windows, a dash, the big wheel
      const m = new Merger(), k = new Merger(), G = I.group, hw = M.W / 2, hl = M.L / 2;
      const cab0 = 2.3, cab1 = hl - 0.1, x = hw - 0.03, y0 = 1.2, y3 = 2.66, ya = 2.12, yc = 2.62, ins = [0, 2.2, (cab0 + cab1) / 2];
      const WALL = 0x4f5a3c, z1 = cab1 - 0.03;
      quad(m, [-x, y0, z1], [x, y0, z1], [x, ya, z1], [-x, ya, z1], WALL, ins);
      quad(m, [-x, yc, z1], [x, yc, z1], [x, y3, z1], [-x, y3, z1], WALL, ins);
      for (const s of [1, -1]) {
        quad(m, [s * x, ya, z1], [s * (hw - 0.12), ya, z1], [s * (hw - 0.12), yc, z1], [s * x, yc, z1], WALL, ins);
        const zw0 = cab1 - 0.925, zw1 = cab1 - 0.175;
        quad(m, [s * x, y0, cab0], [s * x, y0, z1], [s * x, ya, z1], [s * x, ya, cab0], WALL, ins);
        quad(m, [s * x, yc, cab0], [s * x, yc, z1], [s * x, y3, z1], [s * x, y3, cab0], WALL, ins);
        quad(m, [s * x, ya, cab0], [s * x, ya, zw0], [s * x, yc, zw0], [s * x, yc, cab0], WALL, ins);
        quad(m, [s * x, ya, zw1], [s * x, ya, z1], [s * x, yc, z1], [s * x, yc, zw1], WALL, ins);
      }
      quad(m, [-x, y0, cab0 + 0.03], [x, y0, cab0 + 0.03], [x, y3, cab0 + 0.03], [-x, y3, cab0 + 0.03], WALL, ins);
      m.box(2 * x, 0.02, cab1 - cab0, 0x434c33, 0, y3, (cab0 + cab1) / 2);
      // the dash: grey metal, dials, switches in a row
      const dz = cab1 - 0.25, dy = 2.05;
      m.box(2 * x, dy - y0, 0.4, 0x2a2c2e, 0, (dy + y0) / 2, dz);
      screen(G, basic(clusterTex('modern', 120, 3)), 0.36, 0.135, 0.6, dy - 0.05, dz - 0.202);
      I.needles.push(needle(G, 0.6 + 0.107, dy - 0.05, dz - 0.203, 0, 'kmh', 120), needle(G, 0.6 - 0.107, dy - 0.05, dz - 0.203, 0, 'rpm', 3000));
      for (let i = 0; i < 6; i++) k.box(0.02, 0.04, 0.02, 0x9aa0a6, -0.1 - i * 0.07, dy - 0.06, dz - 0.21);
      m.box(0.3, 0.1, 0.2, 0x1c1d20, -0.55, dy + 0.05, dz);
      steeringWheel(I, [0.6, 1.98, 3.35 + 0.5], 0.23, 0.95, {});
      I.wheelK = 4;
      seat(m, 0.6, 1.55, 3.3, 0x2b2f26);
      seat(m, -0.6, 1.55, 3.3, 0x2b2f26);
      tubeTo(k, [0.15, 1.6, 3.5], [0.12, 1.85, 3.45], 0.012, 0x1a1a1a);
      m.add(new THREE.SphereGeometry(0.035, 10, 8), 0x111111, 0.12, 1.87, 3.45);
      return { m, k };
    }
    function buildHatch(M, geo, I) {
      // the tank and the Patria: your head is out of the hatch; the rim of it and the periscopes round you
      const m = new Merger(), d = geo.driver, y = d.y + 0.58;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + (i - 2.5) * 0.35;
        m.add(new THREE.BoxGeometry(0.12, 0.08, 0.06), 0x1a1c19, d.x + Math.cos(a) * 0.42, y, d.z + Math.sin(a) * 0.42, 0, -a + Math.PI / 2, 0);
      }
      return { m, k: new Merger() };
    }

    /* ---------- one per model ---------- */
    const made = new Map();
    function make(c) {
      const M = c.M, key = M.id;
      if (made.has(key)) return made.get(key);
      assets();
      const I = { group: new THREE.Group(), steer: null, wheel: null, wheelK: 2.6, needles: [], live: false, tesla: false };
      const geo = c.geo;
      const r = M.moped ? buildMoped(M, geo, I) : M.boat ? buildBoat(M, geo, I) : M.mil === 'truck' || (M.mil && !geo.head) ? buildTruck(M, geo, I)
        : M.mil ? buildHatch(M, geo, I) : M.bus ? buildBus(M, geo, I) : geo.cabin && geo.cabin.wheel ? buildCar(M, geo, I) : { m: new Merger(), k: new Merger() };
      const a = new THREE.Mesh(r.m.build(), matte), b = new THREE.Mesh(r.k.build(), shiny);
      a.receiveShadow = true;
      I.group.add(a, b);
      made.set(key, I);
      return I;
    }
    let cur = null, curCar = null, redraw = 0, tubKept = null;
    // the dark tub that fills a car up to the window line (so that from outside you don't see the driver's legs sunk in
    // it) is flattened onto its bottom in your own car while you are in first person, and put back afterwards. The car gets
    // a geometry of its own for it, as for a dent (ownGeometry)
    function tub(c, on) {
      const t = c.geo.cabin && c.geo.cabin.tub;
      if (!t || c.M.bus || t[1] <= t[0]) return;
      if (on) {
        ownGeometry(c);
        const g = c.geo.body, A = g.attributes.position, P = A.array;
        if (!g.userData.orig) g.userData.orig = P.slice();
        tubKept = { g, P: P.slice(t[0] * 3, t[1] * 3) };
        let y0 = Infinity;
        for (let i = t[0]; i < t[1]; i++) y0 = Math.min(y0, P[i * 3 + 1]);
        for (let i = t[0]; i < t[1]; i++) P[i * 3 + 1] = y0;
        A.needsUpdate = true;
      } else if (tubKept && tubKept.g === c.geo.body) {
        c.geo.body.attributes.position.array.set(tubKept.P, t[0] * 3);
        c.geo.body.attributes.position.needsUpdate = true;
        tubKept = null;
      }
    }
    // show the inside of car c (null: of none)
    function show(c) {
      if (c === curCar) return;
      if (cur) { if (cur.group.parent) cur.group.parent.remove(cur.group); if (cur.steer && cur.steer.parent) cur.steer.parent.remove(cur.steer); }
      if (curCar) tub(curCar, false);
      cur = null; curCar = c;
      if (!c) return;
      cur = make(c);
      tub(c, true);

      c.body.add(cur.group);
      if (cur.steer && c.steerGroup) c.steerGroup.add(cur.steer);
    }
    function update(c, dt, vf) {
      if (!cur || c !== curCar) return;
      const M = c.M, kmh = Math.abs(vf) * 3.6;
      if (cur.wheel) cur.wheel.rotation.z = -c.steer * cur.wheelK;
      for (const n of cur.needles) {
        const v = n.kind === 'kmh' ? kmh : M.ev ? c.throttle * n.max : c.rpm;
        n.n.rotation.z = Math.PI * 0.75 - clamp(v / n.max, 0, 1) * Math.PI * 1.5;
      }
      if (cur.live || cur.tesla) {
        redraw -= dt;
        if (redraw <= 0) {
          redraw = 0.15;
          const k = Math.round(kmh), g = c.reversing ? 'R' : kmh < 0.5 && !c.throttle ? 'P' : 'D';
          if (k !== live.kmh || g !== live.gear) { live.kmh = k; live.gear = g; if (cur.live) digitalTex.redraw(); if (cur.tesla) teslaTex.redraw(); }
        }
      }
    }
    return { show, update };
  })();
