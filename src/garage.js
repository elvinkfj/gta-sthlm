'use strict';

  /* ================= the garage ================= */
  // Your own garage, under the yellow house in Drakens gränd. The way down is a door in the house on the corner of
  // Skeppsbron, where there is room to drive up: stop on the yellow box in front of it (J opens it again), or walk up and
  // press E. The screen fades and the camera is down in the hall, with the cars you have bought in their bays and the
  // board beside them. Pick one and drive it out (you come up by the door, sitting in it), or buy another at the car
  // dealer's (Bilhandeln) and it is parked in a free bay. A car you drive back in is parked again, and every car you own
  // is there whenever you come (one left out in town is towed back). The paint and the parts are the workshop's, kept
  // for each model (WORKSHOP.kept), so a car comes out as you made it; a car without new paint keeps the colour you
  // bought it in. The board pauses the game like the car picker. Kept in the browser.
  const GARAGE = (() => {
    const KEY = 'gubbe-garage', BAYS = 10, HALL_Y = -10;
    // what a car costs at the dealer's (M.price for one with a price of its own), and what it fetches sold back
    const price = (M) => M.price || Math.round(((M.moped ? 1200 : M.sport ? 2000 + Math.max(0, M.max - 60) * 120 : 900 + M.max * 18) * (M.group === 'classic' ? 1.3 : 1)) / 100) * 100;
    const resale = (M) => Math.round(price(M) / 2 / 100) * 100;
    const FOR_SALE = MODELS.filter((M) => !M.boat && !M.police && !M.mil && !M.bus);
    const GROUPS = [['new', 'Exklusiva, bara här'], ['super', 'Superbilar'], ['sport', 'Sportbilar'], ['classic', 'Klassiker'], ['normal', 'Vanliga bilar'], ['moped', 'Moped']];
    const groupOf = (M) => (M.buy ? 'new' : M.moped ? 'moped' : M.group === 'super' ? 'super' : M.group === 'classic' ? 'classic' : M.sport ? 'sport' : 'normal');

    /* ---------- the cars you own ---------- */
    // in bay order: the model and the colour it was bought in (checked, so an old or edited entry can't break anything)
    let owned = [];
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && Array.isArray(s.cars)) for (const o of s.cars) {
        if (o && MODEL[o.id] && FOR_SALE.includes(MODEL[o.id]) && !owned.some((x) => x.id === o.id) && owned.length < BAYS) owned.push({ id: o.id, color: typeof o.color === 'number' ? o.color : MODEL[o.id].colors[0] });
      }
    } catch (e) { /* a private window: kept for this visit only */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ cars: owned })); } catch (e) { /* kept for this visit */ } };
    // a car's colour: new paint from the workshop, or the one it was bought in
    const colorOf = (o) => { const k = WORKSHOP.kept(MODEL[o.id]); return k && k.paint !== null ? k.paint : o.color; };

    /* ---------- the door on Skeppsbron ---------- */
    // its own frame: x along the street (the door 3.4 m wide in the middle), z into the house (the facade at 0, the
    // street at minus); the yellow box on the pavement in front
    const door = (() => {
      // (on the side away from the water, 12 m short of Drakens gränd: in the house on the corner, and clear of the street
      // sign's post a little further along)
      const e = nearestEdge(213.8, 300, (x) => x.name === 'Skeppsbron').e, f = edgeFrame(e.a, e.b);
      const set = e.hw + e.walk + 0.2, s = (213.8 - f.A.x) * f.ux + (300 - f.A.z) * f.uz - 1.7;
      const side = f.rx < 0 ? 1 : -1, fr = lotFrame(f, side, s, 3.4, set);
      return { x: fr[0] + fr[2] * 1.7, z: fr[1] + fr[3] * 1.7, face: Math.atan2(-fr[3], fr[2]) };
    })();
    const co = Math.cos(door.face), si = Math.sin(door.face);
    const toW = (lx, lz) => [door.x + lx * co + lz * si, door.z - lx * si + lz * co];
    const toL = (x, z) => { const dx = x - door.x, dz = z - door.z; return [dx * co - dz * si, dx * si + dz * co]; };
    const inMark = (x, z) => { const [lx, lz] = toL(x, z); return Math.abs(lx) < 2 && lz > -6.4 && lz < -0.3; };
    // driving out: on the box, facing the street
    const OUT = toW(0, -3.6), OUT_H = Math.atan2(-si, -co);
    {
      const m = new Merger(), bx = (x0, y0, z0, x1, y1, z1, col) => m.box(x1 - x0, y1 - y0, z1 - z0, col, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const GREY = 0x6f757b, RIB = 0x5a6066, FRAME = 0x2b2f33, YELLOW = 0xf2c200;
      // the shutter, ribbed, in a dark frame, with a bump stop each side and the box painted on the pavement
      bx(-1.7, 0, -0.08, 1.7, 2.7, -0.02, GREY);
      for (let y = 0.15; y < 2.7; y += 0.18) bx(-1.7, y, -0.1, 1.7, y + 0.04, -0.08, RIB);
      bx(-1.95, 0, -0.16, -1.7, 3.0, 0, FRAME); bx(1.7, 0, -0.16, 1.95, 3.0, 0, FRAME); bx(-1.95, 2.7, -0.16, 1.95, 3.0, 0, FRAME);
      for (const x of [-2.25, 2.25]) bx(x - 0.12, 0, -0.5, x + 0.12, 0.9, -0.26, YELLOW);
      bx(-2, 0.02, -6.4, -1.85, 0.035, -0.4, YELLOW); bx(1.85, 0.02, -6.4, 2, 0.035, -0.4, YELLOW); bx(-2, 0.02, -6.4, 2, 0.035, -6.25, YELLOW);
      for (let z = -5.8; z < -0.8; z += 1.2) bx(-0.5, 0.02, z, 0.5, 0.035, z + 0.12, 0xd9b000);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(m.build(), std({ vertexColors: true, roughness: 0.55, metalness: 0.2 })));
      // the sign over it: GARAGE beside a blue P
      const tex = canvasTex(512, 128, (c, w, h) => {
        c.fillStyle = '#14325c'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#ffffff'; c.lineWidth = 6; roundRect(c, 8, 8, w - 16, h - 16, 12); c.stroke();
        c.fillStyle = '#1f6bc4'; roundRect(c, 22, 22, 84, 84, 10); c.fill();
        c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 70px Overpass, "Arial Black", Arial, sans-serif';
        c.fillText('P', 64, 68); c.font = '900 64px Overpass, "Arial Black", Arial, sans-serif'; c.fillText('GARAGE', 300, 68);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), std({ map: tex, roughness: 0.6, emissive: 0x0a1424, emissiveMap: tex }));
      sign.position.set(0, 3.55, -0.12); sign.rotation.y = Math.PI;
      g.add(sign);
      g.position.set(door.x, 0, door.z); g.rotation.y = door.face;
      scene.add(g);
    }

    /* ---------- the hall under the yellow house ---------- */
    // its own frame, lined up with the world: the bays in two rows of five either side of the aisle along x (row 0 on
    // the -z side facing +z, row 1 facing -z), the turntable for the dealer's cars at the -x end, the ramp at the +x end
    const HX = 184, HZ = 302, BX = [-7.2, -3.6, 0, 3.6, 7.2], ROW_Z = [-7, 7], TURN = { x: -13, z: 0 };
    const X0 = -17, X1 = 10.6, Z0 = -10.4, Z1 = 10.4, CEIL = 3.6;
    const bayAt = (i) => ({ x: HX + BX[i % 5], z: HZ + ROW_Z[Math.floor(i / 5)], h: i < 5 ? 0 : Math.PI });
    const hall = new THREE.Group();
    hall.visible = false;
    {
      const m = new Merger(), lights = new Merger();
      const bx = (x0, y0, z0, x1, y1, z1, col, into = m) => into.box(x1 - x0, y1 - y0, z1 - z0, col, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const WALL = 0xb9bcbf, LOW = 0x5d646b, CEILING = 0x9ea3a8, PILLAR = 0xc7c9cb, YELLOW = 0xf2c200;
      // walls with a dark band at the bottom, a yellow stripe, the ceiling and its beams, pillars between the bays
      bx(X0, 0, Z0 - 0.3, X1, CEIL, Z0, WALL); bx(X0, 0, Z1, X1, CEIL, Z1 + 0.3, WALL); bx(X0 - 0.3, 0, Z0, X0, CEIL, Z1, WALL);
      bx(X1, 0, Z0, X1 + 0.3, CEIL, -2.6, WALL); bx(X1, 0, 2.6, X1 + 0.3, CEIL, Z1, WALL); bx(X1, 2.9, -2.6, X1 + 0.3, CEIL, 2.6, WALL);
      for (const z of [Z0 + 0.01, Z1 - 0.01]) { bx(X0, 0, z - 0.01, X1, 0.9, z + 0.01, LOW); bx(X0, 0.9, z - 0.01, X1, 1.05, z + 0.01, YELLOW); }
      bx(X0, CEIL, Z0 - 0.3, X1 + 0.3, CEIL + 0.3, Z1 + 0.3, CEILING);
      for (const x of [-9, -5.4, -1.8, 1.8, 5.4, 9]) bx(x - 0.2, CEIL - 0.45, Z0, x + 0.2, CEIL, Z1, CEILING);
      for (const x of [-9, -5.4, -1.8, 1.8, 5.4, 9]) for (const z of [-4.2, 4.2]) {
        bx(x - 0.2, 0, z - 0.2, x + 0.2, CEIL, z + 0.2, PILLAR);
        bx(x - 0.21, 0, z - 0.21, x + 0.21, 0.6, z + 0.21, YELLOW); bx(x - 0.21, 0.6, z - 0.21, x + 0.21, 0.9, z + 0.21, 0x1b1c1e);
      }
      // the ramp up to the street at the +x end, into the dark
      for (let i = 0; i < 10; i++) bx(X1 + 0.3 + i * 0.8, 0, -2.6, X1 + 1.1 + i * 0.8, 0.05 + i * 0.32, 2.6, 0x7d8287);
      bx(X1 + 0.3, 0, -2.9, X1 + 8.5, CEIL, -2.6, WALL); bx(X1 + 0.3, 0, 2.6, X1 + 8.5, CEIL, 2.9, WALL); bx(X1 + 0.3, CEIL, -2.9, X1 + 8.5, CEIL + 0.3, 2.9, CEILING);
      bx(X1 + 8.5, 0, -2.9, X1 + 8.8, CEIL + 0.3, 2.9, 0x0d0f11);
      // the turntable for the dealer's cars
      m.add(new THREE.CylinderGeometry(3.2, 3.2, 0.12, 48), 0x2b2f33, TURN.x, 0.06, TURN.z);
      m.add(new THREE.CylinderGeometry(3.3, 3.3, 0.06, 48), 0xd9b000, TURN.x, 0.03, TURN.z);
      // strip lights along the bays and over the turntable
      for (const x of BX) for (const z of [-7, 0, 7]) bx(x - 1.1, CEIL - 0.08, z - 0.09, x + 1.1, CEIL - 0.02, z + 0.09, 0xffffff, lights);
      for (const z of [-2, 2]) bx(TURN.x - 2, CEIL - 0.08, z - 0.09, TURN.x + 2, CEIL - 0.02, z + 0.09, 0xffffff, lights);
      const walls = new THREE.Mesh(m.build(), std({ vertexColors: true, roughness: 0.75, metalness: 0.05 }));
      walls.receiveShadow = true;
      const glow = new THREE.Mesh(lights.build(), std({ vertexColors: true, emissive: 0xfff6e0, emissiveIntensity: 1.2 }));
      // the floor: grey concrete with the bays marked in white and their numbers, and an arrow up the ramp
      const fw = X1 - X0, fd = Z1 - Z0;
      const floorTex = canvasTex(1024, Math.round((1024 * fd) / fw), (c, w, h) => {
        const k = w / fw, X = (x) => (x - X0) * k, Z = (z) => (z - Z0) * k;
        c.fillStyle = '#7b8086'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 1600; i++) { c.fillStyle = 'rgba(0,0,0,' + (0.03 + ((i * 37) % 7) * 0.008) + ')'; c.fillRect((i * 613) % w, (i * 389) % h, 3, 3); }
        c.fillStyle = '#f2f2f0';
        for (const [z0, z1] of [[-10.2, -4.2], [4.2, 10.2]]) for (const x of [-9, -5.4, -1.8, 1.8, 5.4, 9]) c.fillRect(X(x) - 2, Z(z0), 4, (z1 - z0) * k);
        c.font = '900 ' + Math.round(1.1 * k) + 'px Overpass, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < BAYS; i++) {
          const b = bayAt(i), x = X(b.x - HX), z = Z(b.z - HZ + (i < 5 ? -2.4 : 2.4));
          c.save(); c.translate(x, z); if (i >= 5) c.rotate(Math.PI); c.fillText(String(i + 1), 0, 0); c.restore();
        }
        c.fillStyle = '#f2c200';
        c.beginPath(); c.moveTo(X(6), Z(-0.6)); c.lineTo(X(8.6), Z(-0.6)); c.lineTo(X(8.6), Z(-1.3)); c.lineTo(X(10), Z(0)); c.lineTo(X(8.6), Z(1.3)); c.lineTo(X(8.6), Z(0.6)); c.lineTo(X(6), Z(0.6)); c.fill();
      });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), std({ map: floorTex, roughness: 0.85 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set((X0 + X1) / 2, 0.005, (Z0 + Z1) / 2); floor.receiveShadow = true;
      // the name on the far wall
      const nameTex = canvasTex(1024, 192, (c, w, h) => {
        c.fillStyle = '#14325c'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 110px Overpass, "Arial Black", Arial, sans-serif';
        c.fillText('GARAGET', w / 2, h / 2 + 6);
      });
      const name = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.9), std({ map: nameTex, roughness: 0.6, emissive: 0x0a1424, emissiveMap: nameTex }));
      name.position.set(X0 + 0.02, 2.4, 0); name.rotation.y = Math.PI / 2;
      hall.add(walls, glow, floor, name);
      hall.position.set(HX, HALL_Y, HZ);
      scene.add(hall);
    }

    /* ---------- the cars on show: one in each bay with a car, and the dealer's on the turntable ---------- */
    // (built as cars, then taken out of the list of cars, so nothing drives or bumps them)
    function showCar(M, color, x, z, h) {
      const c = makeCar(M, color);
      cars.splice(cars.indexOf(c), 1);
      c.group.position.set(x, HALL_Y, z); c.group.rotation.y = h;
      return c;
    }
    let shown = [], preview = null;
    function park() {
      for (const c of shown) if (c) removeCar(c);
      shown = owned.map((o, i) => {
        const b = bayAt(i), M = MODEL[o.id], c = showCar(M, colorOf(o), b.x, b.z, b.h);
        WORKSHOP.fit(c, WORKSHOP.kept(M));
        return c;
      });
    }
    function showPreview(M, color) {
      if (preview) removeCar(preview);
      preview = M ? showCar(M, color, HX + TURN.x, HZ + TURN.z, 0) : null;
      if (preview) WORKSHOP.fit(preview, WORKSHOP.kept(M));
    }
    function unpark() { for (const c of shown) if (c) removeCar(c); shown = []; showPreview(null); }

    /* ---------- inside: the light, the board ---------- */
    // down here the sun and the sky's light are switched for the hall's lamps (and put back on the way out), the same by
    // day and by night: the reflections and soft light come from a grey room with bright strip lights, baked once
    let was = null, roomEnv = null;
    function bakeRoom() {
      const room = new THREE.Scene(), lamp = new THREE.MeshBasicMaterial({ color: 0xffffff });
      lamp.color.setRGB(6, 6, 5.6);
      room.add(new THREE.Mesh(new THREE.BoxGeometry(30, 4, 22), new THREE.MeshBasicMaterial({ color: 0x5c6167, side: THREE.BackSide })));
      for (const x of [-9, -3, 3, 9]) for (const z of [-6, 0, 6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.3), lamp); l.position.set(x, 1.9, z); room.add(l); }
      const pmrem = new THREE.PMREMGenerator(renderer);
      roomEnv = pmrem.fromScene(room, 0.03);
      pmrem.dispose();
    }
    function indoors(on) {
      if (on) {
        if (!roomEnv) bakeRoom();
        was = { sun: sun.intensity, hemi: hemi.intensity, sky: hemi.color.getHex(), gnd: hemi.groundColor.getHex(), exp: renderer.toneMappingExposure, env: scene.environment };
        sun.intensity = 0.3; hemi.intensity = 0.25; hemi.color.setHex(0xf4f6ff); hemi.groundColor.setHex(0x9a9ea3); renderer.toneMappingExposure = 1;
        scene.environment = roomEnv.texture;
      } else if (was) {
        sun.intensity = was.sun; hemi.intensity = was.hemi; hemi.color.setHex(was.sky); hemi.groundColor.setHex(was.gnd); renderer.toneMappingExposure = was.exp;
        scene.environment = was.env;
        was = null;
      }
    }
    const E = {
      board: $('garage'), close: $('garageClose'), mine: $('garTabMine'), shop: $('garTabShop'), count: $('garCount'), cash: $('garCash'), list: $('garList'),
      colors: $('garColors'), sum: $('garSum'), sell: $('garSell'), go: $('garGo')
    };
    // tab: your cars or the dealer's; sel: the bay picked, or the dealer's model; color: the colour to buy it in
    let open = false, busy = false, tab = 'mine', sel = 0, pick = null, color = null, sure = false, openT = 0;
    function fade(fn) {
      busy = true;
      $('fade').classList.add('on');
      setTimeout(() => { fn(); setTimeout(() => { $('fade').classList.remove('on'); busy = false; }, 150); }, 450);
    }
    function enter() {
      if (busy || open) return;
      if (PARTY.busy()) { toast('Inget garage mitt i en lek!'); return; }
      if (wanted) { toast('Polisen är efter dig! Skaka av dig dem först.'); return; }
      fade(() => {
        // the car you came in: yours is parked in its bay; and yours left out in town are towed back
        const c = driving;
        if (c && c.owned) { exitCar(); removeCar(c); }
        for (const o of cars.filter((x) => x.owned && x !== driving)) removeCar(o);
        if (!driving) { const [x, z] = toW(0, -1); player.x = x; player.z = z; player.y = 0; player.rot = OUT_H; player.vx = player.vz = 0; }
        park();
        hall.visible = true;
        indoors(true);
        open = true; openT = performance.now() / 1000;
        tab = owned.length ? 'mine' : 'shop'; sel = 0; pick = null; sure = false;
        E.board.hidden = false;
        document.body.classList.add('garage');
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        for (const k in keys) keys[k] = false;
        joy.x = joy.y = 0;
        render();
        if (!isTouch) E.close.focus();
        beep([523, 659], 0.03, 0.2);
      });
    }
    function shut() {
      if (!open) return;
      open = false;
      unpark();
      hall.visible = false;
      indoors(false);
      E.board.hidden = true;
      document.body.classList.remove('garage');
      if (E.board.contains(document.activeElement)) document.activeElement.blur();
    }
    function leave() { if (open && !busy) fade(() => { shut(); camYaw = OUT_H; requestLock(); }); }
    function driveOut() {
      const o = owned[sel];
      if (!o || busy) return;
      fade(() => {
        shut();
        // (the car you came in stays behind; one you picked with B goes)
        if (driving) { const old = driving; setOccupant(old, null); driving = null; removeCar(old); }
        if (spawnedCar) removeCar(spawnedCar);
        const M = MODEL[o.id], c = makeCar(M, colorOf(o));
        WORKSHOP.fit(c, WORKSHOP.kept(M));
        c.owned = true; c.x = OUT[0]; c.z = OUT[1]; c.h = OUT_H;
        spawnedCar = c;
        enterCar(c);
        camYaw = c.h; greeted = true;
        toast(M.name + ' rullar ut ur garaget.');
        requestLock();
      });
    }
    function buy() {
      const M = pick;
      if (!M) return;
      if (owned.some((o) => o.id === M.id)) { toast('Du har redan ' + M.def + ' i garaget.'); return; }
      if (owned.length >= BAYS) { toast('Garaget är fullt. Sälj en bil först.'); return; }
      if (!JOBS.spend(price(M))) { render(); return; }
      owned.push({ id: M.id, color }); save();
      park(); showPreview(null);
      tab = 'mine'; sel = owned.length - 1; pick = null;
      beep([659, 880, 1175], 0.03, 0.3);
      PROGRESS.show({ cls: 'daily', kind: 'Ny bil i garaget', title: M.name + '!', sub: 'Den står på plats ' + owned.length + '. Kör ut den när du vill.' });
      render();
    }
    function sellIt() {
      const o = owned[sel];
      if (!o) return;
      if (!sure) { sure = true; render(); return; }
      const M = MODEL[o.id];
      owned.splice(sel, 1); save();
      JOBS.reward(resale(M));
      toast('Du sålde ' + M.def + ' för ' + fmtKr(resale(M)) + '.');
      sel = Math.max(0, Math.min(sel, owned.length - 1)); sure = false;
      park();
      if (!owned.length) tab = 'shop';
      render();
    }
    // a model as a little picture on its row
    function row(M, title, sub, right, on, click) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gar-item' + (on ? ' on' : '');
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 60; drawSilhouette(cv, M);
      const t = document.createElement('span'), nb = document.createElement('b'), sm = document.createElement('small'), r = document.createElement('span');
      nb.textContent = title; sm.textContent = sub; t.append(nb, sm);
      r.className = 'gar-right'; r.textContent = right;
      b.append(cv, t, r);
      b.addEventListener('click', click);
      return b;
    }
    // what the workshop has done to a car, in a few words
    function partsOf(M) {
      const k = WORKSHOP.kept(M), W = WORKSHOP.debug, bits = [];
      if (!k) return M.kind;
      if (k.paint !== null) bits.push('ny lack');
      if (k.rim) bits.push('fälgar ' + (W.RIMS.find((r) => r[0] === k.rim) || ['', ''])[1].toLowerCase());
      if (k.low) bits.push(W.LOWS[k.low].name.toLowerCase());
      if (k.engine) bits.push('motor ' + W.ENGINES[k.engine].name.toLowerCase());
      return bits.length ? bits.join(', ') : M.kind;
    }
    function render() {
      E.mine.classList.toggle('on', tab === 'mine'); E.shop.classList.toggle('on', tab === 'shop');
      E.mine.setAttribute('aria-selected', String(tab === 'mine')); E.shop.setAttribute('aria-selected', String(tab === 'shop'));
      E.count.textContent = owned.length + '/' + BAYS;
      E.cash.textContent = 'Kassa ' + fmtKr(JOBS.earned);
      E.list.textContent = ''; E.colors.textContent = '';
      if (tab === 'mine') {
        if (!owned.length) { const p = document.createElement('p'); p.className = 'shop-note'; p.textContent = 'Garaget är tomt. Köp en bil i bilhandeln!'; E.list.append(p); }
        owned.forEach((o, i) => {
          const M = MODEL[o.id];
          E.list.append(row(M, M.name, partsOf(M), 'Plats ' + (i + 1), i === sel, () => { sel = i; sure = false; render(); }));
        });
        const o = owned[sel];
        E.sum.textContent = o ? MODEL[o.id].name : '';
        E.sum.classList.remove('short');
        E.go.textContent = 'Kör ut'; E.go.disabled = !o;
        E.sell.hidden = !o; E.sell.textContent = sure ? 'Säker? Sälj för ' + fmtKr(o ? resale(MODEL[o.id]) : 0) : 'Sälj';
        E.sell.classList.toggle('sure', sure);
      } else {
        for (const [g, label] of GROUPS) {
          const list = FOR_SALE.filter((M) => groupOf(M) === g).sort((a, b) => price(b) - price(a));
          if (!list.length) continue;
          const h = document.createElement('h3'); h.textContent = label; E.list.append(h);
          for (const M of list) {
            const mine = owned.some((o) => o.id === M.id);
            E.list.append(row(M, M.name, M.kind + ' · ' + Math.round(M.max * 3.6) + ' km/h', mine ? 'Din' : fmtKr(price(M)), pick === M, () => { pick = M; color = M.colors[0]; showPreview(M, color); render(); }));
          }
        }
        // the colours it comes in
        if (pick) for (const col of pick.colors) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'shop-swatch' + (col === color ? ' on' : ''); b.style.background = hex(col); b.setAttribute('aria-label', 'Färg');
          b.addEventListener('click', () => { color = col; showPreview(pick, color); render(); });
          E.colors.append(b);
        }
        const p = pick ? price(pick) : 0, have = pick && owned.some((o) => o.id === pick.id), afford = JOBS.earned >= p;
        E.sum.textContent = !pick ? 'Välj en bil' : have ? 'Den har du redan' : afford ? 'Pris: ' + fmtKr(p) : 'Den kostar ' + fmtKr(p) + ', du har ' + fmtKr(JOBS.earned);
        E.sum.classList.toggle('short', !!pick && !have && !afford);
        E.go.textContent = 'Köp'; E.go.disabled = !pick || have || !afford || owned.length >= BAYS;
        E.sell.hidden = true;
      }
      E.colors.hidden = !E.colors.childElementCount;
      // (the picked row in sight)
      const on = E.list.querySelector('.gar-item.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    E.close.addEventListener('click', leave);
    E.mine.addEventListener('click', () => { tab = 'mine'; sure = false; showPreview(null); render(); });
    E.shop.addEventListener('click', () => { tab = 'shop'; sure = false; render(); });
    E.go.addEventListener('click', () => (tab === 'mine' ? driveOut() : buy()));
    E.sell.addEventListener('click', sellIt);

    /* ---------- the camera down in the hall ---------- */
    // looking at the car picked (from the aisle), or at the turntable; moving there smoothly. The board pauses the game,
    // so the turntable turns here
    const _p = new THREE.Vector3(), _d = new THREE.Vector3(), cam = { p: new THREE.Vector3(), t: new THREE.Vector3(), at: 0 };
    function view() {
      if (!open) return null;
      const now = performance.now() / 1000, dt = Math.min(0.1, now - (cam.at || now)), phone = window.innerWidth < 760;
      cam.at = now;
      // (on a narrow screen the board is at the bottom: further back and higher, looking down so the car sits above it)
      const far = phone ? 1.4 : 1;
      let px, pz, tx, tz;
      if (tab === 'shop' && preview) {
        preview.group.rotation.y = (now - openT) * 0.35;
        tx = HX + TURN.x; tz = HZ + TURN.z; px = tx + (phone ? 8 : 5.6); pz = tz + (phone ? 1.2 : 3.4);
      } else if (owned[sel]) {
        const b = bayAt(sel), dz = sel < 5 ? 6.4 : -6.4;
        tx = b.x; tz = b.z + dz * 0.15; px = b.x + 3 * far; pz = b.z + dz * (phone ? 1.3 : 1);
      } else { tx = HX - 6; tz = HZ; px = HX + 8.5; pz = HZ + 1.5; }
      const goalP = _p.set(px, HALL_Y + (phone ? 3.2 : 1.7), pz), goalT = _d.set(tx, HALL_Y + 0.6, tz);
      if (now - openT < 0.05 || !cam.p.lengthSq()) { cam.p.copy(goalP); cam.t.copy(goalT); }
      const k = 1 - Math.exp(-5 * dt);
      cam.p.lerp(goalP, k); cam.t.lerp(goalT, k);
      // (looking to the right of the car by as much as puts it in the middle of the part the board leaves free)
      const dx = cam.t.x - cam.p.x, dz = cam.t.z - cam.p.z, l = Math.hypot(dx, dz) || 1, side = phone ? 0 : (l * 0.6 * (E.board.firstElementChild.offsetWidth + 16)) / window.innerHeight;
      _p.copy(cam.p);
      _d.set(dx - (dz / l) * side, cam.t.y - cam.p.y - (phone ? 2.2 : 0), dz + (dx / l) * side);
      return { pos: _p, dir: _d };
    }

    /* ---------- every frame: coming up to the door ---------- */
    let greeted = false, near = false;
    function update() {
      const c = driving, onMark = !!c && !c.M.boat && inMark(c.x, c.z);
      const close = !!c && Math.hypot(c.x - door.x, c.z - door.z) < 30;
      if (close && !near && started) toast('Garaget! Stanna på den gula rutan framför porten.');
      near = close;
      if (onMark && !greeted && Math.hypot(c.vx, c.vz) < 0.6 && started) { greeted = true; enter(); }
      if (!onMark) greeted = false;
    }
    const footNear = () => !driving && !FLY.on && !CHUTE.on && Math.hypot(player.x - OUT[0], player.z - OUT[1]) < 4.2;

    /* ---------- on the maps: a blue square with a P ---------- */
    function icon(g, X, Y, s) {
      g.fillStyle = '#1f6bc4'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.6 * s;
      g.fillRect(X - 7 * s, Y - 7 * s, 14 * s, 14 * s); g.strokeRect(X - 7 * s, Y - 7 * s, 14 * s, 14 * s);
      g.fillStyle = '#ffffff'; g.font = '900 ' + Math.round(11 * s) + 'px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('P', X, Y + 0.5 * s);
    }
    function drawMini(g, px, pz, u) { if (Math.abs(door.x - px) < 110 && Math.abs(door.z - pz) < 110) icon(g, door.x, door.z, u); }
    function drawBig(g, toX, toY, k) {
      const X = toX(door.x), Y = toY(door.z), s = clamp(k / 0.35, 1, 1.4);
      icon(g, X, Y, s);
      if (k > 0.3) { g.font = '800 11px Overpass, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText('Garaget', X + 12, Y); g.fillStyle = '#14325c'; g.fillText('Garaget', X + 12, Y); }
    }

    return {
      update, view, drawMini, drawBig, price,
      get open() { return open; }, get owned() { return owned.map((o) => o.id); },
      prompt() { return footNear() ? 'Garaget' : null; },
      // E by the door, on foot
      use() { if (!footNear()) return false; enter(); return true; },
      // J on the yellow box opens it again
      key() {
        if (!driving || !inMark(driving.x, driving.z)) return false;
        if (Math.hypot(driving.vx, driving.vz) > 1) { toast('Stanna bilen först.'); return true; }
        enter();
        return true;
      },
      // the board closes, nothing taken out (a game with friends starts, or you go to a friend)
      bail: shut,
      // keys while the board is open: Esc closes it, the rest wait
      keydown(e) {
        if (!open) return false;
        if (e.code === 'Escape') { e.preventDefault(); leave(); }
        return true;
      },
      // for the tests
      debug: { door, toW, toL, inMark, OUT, bayAt, FOR_SALE, resale, enter, leave, driveOut, buy, sellIt, render, get busy() { return busy; }, get shown() { return shown; }, get preview() { return preview; }, set tab(t) { tab = t; render(); }, set pick(M) { pick = M; color = M ? M.colors[0] : null; showPreview(M, color); render(); }, set sel(i) { sel = i; render(); } }
    };
  })();
