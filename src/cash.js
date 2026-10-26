'use strict';

  /* ================= more ways to earn money ================= */
  // Besides the jobs and the races (JOBS, which pay twice what they did): money bags hidden round town, fifteen a day,
  // new every midnight (the date picks where, so friends look for the same ones); money for driving with style, a long
  // drift or a near miss past another car at speed; and a reward for getting away from the police. What you get shows
  // as a green +kr over the middle of the screen.
  const CASH = (() => {
    const BAG_KEY = 'gubbe-pasar', BAGS = 15;
    const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

    /* ---------- +kr on the screen ---------- */
    const popEl = $('cashPop');
    let popT = 0;
    // (text alone, while a drift goes on; or the money, with what for)
    function pop(text, gold) {
      if (!started) return;
      popEl.textContent = text; popEl.hidden = false; popEl.classList.toggle('gold', !!gold); popT = gold ? 2.2 : 0.4;
      if (gold) { popEl.classList.remove('go'); void popEl.offsetWidth; popEl.classList.add('go'); }
    }
    function earn(kr, why) {
      JOBS.reward(kr);
      pop('+' + fmt(kr) + ' kr · ' + why, true);
      beep([988, 1319], 0.025, 0.14);
    }

    /* ---------- the money bags ---------- */
    // where they lie today: on the pavement of a street (not a bridge), by a random number seeded with the date
    const dayOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const streets = edges.filter((e) => !e.bridge && e.walk >= 1.5 && e.len > 20);
    function lay(day) {
      let h = 2166136261;
      for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
      const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
      const out = [];
      for (let k = 0; k < 400 && out.length < BAGS; k++) {
        const e = streets[Math.floor(next() * streets.length)], f = edgeFrame(e.a, e.b), s = 6 + next() * (e.len - 12), side = next() < 0.5 ? 1 : -1, off = e.hw + e.walk * 0.55;
        const x = f.A.x + f.ux * s + f.rx * side * off, z = f.A.z + f.uz * s + f.rz * side * off, kr = 150 + 50 * Math.floor(next() * 7);
        if (!walkable(x, z) || blockedAt(x, z, 0.6) || FLY.heightAt(x, z, 0.4) > 0 || out.some((b) => Math.hypot(b.x - x, b.z - z) < 120)) continue;
        out.push({ x, z, kr, ph: next() * TAU });
      }
      return out;
    }
    let day = dayOf(new Date()), bags = lay(day), got = new Set();
    try { const s = JSON.parse(localStorage.getItem(BAG_KEY) || 'null'); if (s && s.day === day && Array.isArray(s.got)) got = new Set(s.got.filter((i) => Number.isInteger(i) && i >= 0 && i < BAGS)); } catch (e) { /* a private window */ }
    const saveBags = () => { try { localStorage.setItem(BAG_KEY, JSON.stringify({ day, got: [...got] })); } catch (e) { /* counted anyway */ } };
    // a sack of coarse green cloth tied at the neck, with a gold krona sign; and a soft glow over each, all in two draws
    // (so they are always drawn, wherever they lie: frustum culling off)
    const bagGeo = (() => {
      const m = new Merger();
      m.add(new THREE.SphereGeometry(0.34, 14, 10).scale(1, 0.92, 0.9), 0x3f7a3a, 0, 0.32, 0);
      m.add(new THREE.CylinderGeometry(0.1, 0.16, 0.14, 12), 0x35652f, 0, 0.66, 0);
      m.add(new THREE.TorusGeometry(0.11, 0.025, 6, 14).rotateX(Math.PI / 2), 0xc9a227, 0, 0.62, 0);
      m.add(new THREE.CylinderGeometry(0.15, 0.08, 0.12, 12), 0x3f7a3a, 0, 0.78, 0);
      m.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16).rotateX(Math.PI / 2), 0xf2c200, 0, 0.34, 0.31);
      return m.build();
    })();
    const bagMesh = new THREE.InstancedMesh(bagGeo, std({ vertexColors: true, roughness: 0.75, metalness: 0.1, emissive: 0x0d1a08 }), BAGS);
    bagMesh.frustumCulled = false; bagMesh.castShadow = true;
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BAGS * 3), 3));
    const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTex, color: 0xa8f07a, size: 2.6, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.frustumCulled = false;
    scene.add(bagMesh, glow);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
    // each bag where it lies, turning and bobbing (or gone: shrunk to nothing, its glow under the ground)
    function placeBags(t) {
      const gp = glowGeo.attributes.position;
      for (let i = 0; i < BAGS; i++) {
        const b = bags[i], here = b && !got.has(i), y = here ? 0.08 + Math.sin(t * 2 + b.ph) * 0.08 : -50;
        _q.setFromAxisAngle(_y, here ? t * 1.2 + b.ph : 0); _s.setScalar(here ? 1 : 0); _v.set(b ? b.x : 0, y, b ? b.z : 0);
        bagMesh.setMatrixAt(i, _m.compose(_v, _q, _s));
        gp.setXYZ(i, b ? b.x : 0, y + 0.5, b ? b.z : 0);
      }
      bagMesh.instanceMatrix.needsUpdate = true; gp.needsUpdate = true;
    }
    placeBags(0);
    function collect(i) {
      const b = bags[i];
      got.add(i); saveBags();
      JOBS.reward(b.kr);
      pop('+' + fmt(b.kr) + ' kr · Pengapåse ' + got.size + ' av ' + bags.length, true);
      beep([784, 1047, 1319], 0.03, 0.25);
      PROGRESS.did('bags');
      if (got.size === bags.length) toast('Du har hittat alla pengapåsar i dag! I morgon ligger det nya.');
    }

    /* ---------- driving with style ---------- */
    // a drift: sliding sideways (c.slip, m/s) at speed for over a second; a crash spoils it. A near miss: passing close
    // beside another car fast, without touching; a few in a row pay more
    const D = { t: 0, calm: 0, crashed: false }, MISS_GAP = 0.9;
    let combo = 0, comboT = 0;
    function drift(c, v, dt) {
      const sliding = c.slip > 3 && v > 9 && !c.M.boat && !c.dead;
      if (c.hitT > 0.1 && D.t > 0) D.crashed = true;
      if (sliding) {
        D.t += dt; D.calm = 0;
        if (D.t > 0.6 && !D.crashed) pop('Drift ' + D.t.toFixed(1).replace('.', ',') + ' s');
        return;
      }
      if (D.t > 0 && (D.calm += dt) > 0.35) {
        if (D.t >= 1.2 && !D.crashed) earn(Math.round(D.t * 25 / 5) * 5, 'Drift ' + D.t.toFixed(1).replace('.', ',') + ' s');
        else if (D.crashed && D.t >= 1.2) pop('Krock! Driften räknas inte.', true);
        D.t = 0; D.crashed = false;
      }
    }
    function nearMisses(c, v, now) {
      if (c.M.boat || c.dead || c.hitT > 0 || v < 14) return;
      const sn = Math.sin(c.h), cs = Math.cos(c.h);
      for (const o of cars) {
        if (o === c || o.M.boat || o.dead || (o.missAt && now - o.missAt < 5)) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
        const f = dx * sn + dz * cs, l = dx * cs - dz * sn, gap = Math.abs(l) - (c.M.W + o.M.W) / 2;
        if (Math.abs(f) > (c.M.L + o.M.L) * 0.3 || gap < 0.08 || gap > MISS_GAP || o.hitT > 0) continue;
        if (Math.hypot(c.vx - o.vx, c.vz - o.vz) < 12) continue;
        o.missAt = now;
        combo = comboT > 0 ? Math.min(combo + 1, 4) : 1; comboT = 3;
        earn(25 * combo, combo > 1 ? 'Nära ögat ×' + combo : 'Nära ögat!');
      }
    }

    /* ---------- every frame ---------- */
    let dayT = 0, tagged = '';
    const tagEl = $('bagCount');
    function update(dt) {
      const now = performance.now() / 1000;
      if (!started) return;
      // (a new day: new bags)
      if ((dayT -= dt) <= 0) { dayT = 10; const d = dayOf(new Date()); if (d !== day) { day = d; bags = lay(day); got = new Set(); saveBags(); } }
      placeBags(now);
      const c = driving, px = c ? c.x : player.x, pz = c ? c.z : player.z, reach = c ? 3 : 1.6;
      if (!FLY.on && !(policeStop && policeStop.riding) && (c || player.y < 2.5)) bags.forEach((b, i) => { if (!got.has(i) && Math.hypot(b.x - px, b.z - pz) < reach) collect(i); });
      if (c) { const v = Math.hypot(c.vx, c.vz); drift(c, v, dt); nearMisses(c, v, now); }
      else D.t = 0;
      if (comboT > 0) comboT -= dt;
      if (popT > 0 && (popT -= dt) <= 0) popEl.hidden = true;
      const k = got.size + '/' + bags.length;
      if (k !== tagged) { tagged = k; tagEl.textContent = k; }
    }
    // on the minimap: the bags within reach, as gold dots
    function drawMini(g, px, pz, u) {
      bags.forEach((b, i) => {
        if (got.has(i) || Math.abs(b.x - px) > 110 || Math.abs(b.z - pz) > 110) return;
        g.fillStyle = '#f2c200'; g.strokeStyle = '#1f4a1c'; g.lineWidth = 1.5 * u;
        g.beginPath(); g.arc(b.x, b.z, 4 * u, 0, TAU); g.fill(); g.stroke();
      });
    }

    return {
      update, drawMini,
      get found() { return got.size; }, get bags() { return bags.length; },
      // you got away from the police with this many stars
      bounty(stars) { earn(250 * stars, 'Undan polisen'); },
      // for the tests
      debug: { lay, collect, get list() { return bags; }, get got() { return got; }, D, pop }
    };
  })();
