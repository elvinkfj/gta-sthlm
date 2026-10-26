'use strict';

  /* ================= the waypoint ================= */
  // Your own goal, like a GPS: click (or tap) a spot on the big map and a purple pillar of light stands there, with the
  // way there along the streets on both maps (JOBS.routeTo, the jobs' own GPS) and how far it is at the bottom of the
  // minimap. Click it again on the big map to take it away; it goes by itself when you get there. The job board can put
  // it at a race's start or at the scrapyard.
  const WAYPOINT = (() => {
    const COL = '#b14bd8', REACH = 15;
    // (the pillar is made the first time it's needed: nothing new in the scene until then)
    let pillar = null;
    // goal: where (and its name, if it has one); route: the way there, worked out again every second and a half
    let goal = null, route = null, routeT = 0, left = 0;
    const here = () => driving || player;
    const routeLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
    function reroute() {
      const p = here();
      route = JOBS.routeTo(p.x, p.z, goal.x, goal.z); routeT = 1.5;
      left = routeLen(route);
    }
    function set(x, z, name) {
      if (!walkable(x, z)) { toast('Dit går det inte att komma. Välj en plats på land.'); return false; }
      goal = { x, z, name: name || null };
      if (!pillar) pillar = JOBS.beam(0xb14bd8, 1.9, 80);
      pillar.position.set(x, 0, z); pillar.visible = true;
      reroute();
      beep([660, 880], 0.03, 0.18);
      toast((name ? 'Vägen till ' + name : 'Ditt mål') + ' är satt. Följ den lila linjen på kartan.');
      return true;
    }
    function clear(msg) {
      goal = null; route = null;
      if (pillar) pillar.visible = false;
      if (msg) toast(msg);
    }
    function update(dt) {
      if (!goal) return;
      const p = here();
      if (Math.hypot(goal.x - p.x, goal.z - p.z) < REACH) { const n = goal.name; clear(n ? 'Du är framme vid ' + n + '!' : 'Du är framme!'); beep([784, 988], 0.03, 0.2); return; }
      if ((routeT -= dt) <= 0) reroute();
    }
    // a click on the big map at (x, z), d pixels from the goal there: near it takes it away, anywhere else puts it there
    function tap(x, z, d) {
      if (goal && d < 16) { clear('Målet är borttaget.'); return; }
      set(x, z);
    }

    /* ---------- on the maps ---------- */
    const line = (g, w) => {
      if (!route) return;
      g.strokeStyle = 'rgba(177,75,216,.9)'; g.lineWidth = w; g.lineJoin = g.lineCap = 'round';
      g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke();
    };
    function pin(g, X, Y, s) {
      g.fillStyle = COL; g.strokeStyle = '#ffffff'; g.lineWidth = 2 * s;
      g.beginPath(); g.arc(X, Y - 9 * s, 7 * s, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(X, Y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X, Y - 9 * s, 2.6 * s, 0, TAU); g.fill();
    }
    // the minimap (in metres, u metres a pixel): the way, and the goal, or an arrow at the edge pointing to it
    function drawMini(g, px, pz, u) {
      if (!goal) return;
      line(g, 4.2 * u);
      const dx = goal.x - px, dz = goal.z - pz, d = Math.hypot(dx, dz), R = 100;
      if (d < R) { g.fillStyle = COL; g.strokeStyle = '#ffffff'; g.lineWidth = 2 * u; g.beginPath(); g.arc(goal.x, goal.z, 5.5 * u, 0, TAU); g.fill(); g.stroke(); return; }
      const ux = dx / d, uz = dz / d, ex = px + ux * R, ez = pz + uz * R;
      g.fillStyle = COL; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5 * u;
      g.beginPath(); g.moveTo(ex + ux * 10 * u, ez + uz * 10 * u); g.lineTo(ex - uz * 7 * u, ez + ux * 7 * u); g.lineTo(ex + uz * 7 * u, ez - ux * 7 * u); g.closePath(); g.fill(); g.stroke();
    }
    // how far it is, along the way, at the bottom of the minimap (in its pixels, S across)
    function drawLabel(g, S) {
      if (!goal) return;
      const t = 'Mål ' + (left >= 1000 ? (left / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(left / 10) * 10 + ' m');
      g.font = '900 ' + Math.round(S * 0.075) + 'px Overpass, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(t).width + S * 0.08, h = S * 0.11, y = S * 0.86;
      g.fillStyle = COL; g.beginPath(); g.roundRect ? g.roundRect(S / 2 - w / 2, y - h / 2, w, h, h / 2) : g.rect(S / 2 - w / 2, y - h / 2, w, h); g.fill();
      g.fillStyle = '#ffffff'; g.fillText(t, S / 2, y + 0.5);
    }
    function drawBig(g, toX, toY, k) {
      if (!goal) return;
      if (route) {
        g.save(); g.strokeStyle = 'rgba(177,75,216,.9)'; g.lineWidth = 5; g.lineJoin = g.lineCap = 'round';
        g.beginPath(); route.forEach(([x, z], i) => (i ? g.lineTo(toX(x), toY(z)) : g.moveTo(toX(x), toY(z)))); g.stroke(); g.restore();
      }
      const X = toX(goal.x), Y = toY(goal.z);
      pin(g, X, Y, 1.4);
      g.font = '800 12px Overpass, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.9)';
      const t = goal.name || 'Mitt mål';
      g.strokeText(t, X + 12, Y - 12); g.fillStyle = '#6a1f8a'; g.fillText(t, X + 12, Y - 12);
    }

    return {
      update, set, clear, tap, drawMini, drawLabel, drawBig,
      get goal() { return goal; }, get route() { return route; }, get left() { return left; },
      debug: { get pillar() { return pillar; } }
    };
  })();
