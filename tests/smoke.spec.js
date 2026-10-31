// Smoke test: open the game from disk, start it, drive a car and build every model. Run with `npm test`.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

// landmarks that stood on a street when the test was written; this number may only go down
const MAP_PROBLEMS_MAX = 0;

// fonts come from the internet and may be unreachable; that is not a game error
const ignorable = (text) => /fonts\.(googleapis|gstatic)\.com/.test(text);

let page, errors;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text() + ' ' + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => { if (!ignorable(r.url())) errors.push('request failed: ' + r.url()); });
  await page.goto(GAME);
  await page.waitForFunction(() => window.gubbeTest);
});

test.afterAll(async () => { await page.close(); });

test('sidan laddar utan fel', async () => {
  expect(errors).toEqual([]);
});

test('versionen står i hörnet', async () => {
  const v = await page.evaluate(() => document.getElementById('version').textContent);
  expect(v).toMatch(/^Version \d+ · /);
});

test('filerna har versionen i adressen, så att webbläsaren aldrig blandar gamla och nya', async () => {
  const r = await page.evaluate(() => ({
    nr: VERSION.nr,
    files: [...document.querySelectorAll('script[src^="src/"], link[rel="stylesheet"][href^="style.css"]')].map((e) => e.getAttribute('src') || e.getAttribute('href'))
  }));
  expect(r.files.length).toBeGreaterThan(30);
  expect(r.files.filter((f) => !f.endsWith('?v=' + r.nr))).toEqual([]);
});

test('spelet startar och kan köra 10 sekunder', async () => {
  const state = await page.evaluate(() => { gubbeTest.start(); return gubbeTest.run(10); });
  expect(state.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('gubben sätter sig i en bil och kör iväg', async () => {
  // choose() puts a car beside the player and gets in; leave it and get back in with E
  const before = await page.evaluate(() => {
    gubbeTest.choose(gubbeTest.MODELS.find((m) => !m.boat && !m.police && !m.mil).id);
    gubbeTest.run(0.5);
    gubbeTest.press('KeyE');
    gubbeTest.run(1);
    const out = gubbeTest.state();
    gubbeTest.press('KeyE');
    return { walking: out.driving, ...gubbeTest.run(0.5) };
  });
  expect(before.walking).toBeNull();
  expect(before.driving).not.toBeNull();
  const after = await page.evaluate(() => {
    gubbeTest.key('KeyW', true);
    const s = gubbeTest.run(4);
    gubbeTest.key('KeyW', false);
    return s;
  });
  expect(after.driving).toBe(before.driving);
  const moved = Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z);
  expect(moved).toBeGreaterThan(5);
  expect(after.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('inga landmärken står på gatorna', async () => {
  const problems = await page.evaluate(() => gubbeTest.mapProblems());
  expect(problems.length).toBeLessThanOrEqual(MAP_PROBLEMS_MAX);
});

test('alla bilar och båtar går att bygga', async () => {
  const built = await page.evaluate(() => {
    const ids = gubbeTest.MODELS.map((m) => m.id);
    return { ids: ids.length, built: gubbeTest.showroom(ids, 0, 0, 6).filter((r) => r.tris > 0).length };
  });
  expect(built.built).toBe(built.ids);
  expect(errors).toEqual([]);
});

test('förstaperson: alla fordon har en insida, och bilens mörka låda tas bort och kommer tillbaka', async () => {
  const r = await page.evaluate(() => {
    const verts = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += m.geometry.attributes.position.count; }); return n; };
    const out = { ids: MODELS.length, inside: [], tub: null };
    for (const M of MODELS) {
      const c = makeCar(M, M.colors[0]), before = verts(c.group);
      INTERIOR.show(c);
      if (verts(c.group) > before + 100) out.inside.push(M.id);
      if (M.id === 'kombi') {
        const t = c.geo.cabin.tub, P = () => c.geo.body.attributes.position.array, top = () => { let y = -9; for (let i = t[0]; i < t[1]; i++) y = Math.max(y, P()[i * 3 + 1]); return y; };
        const shown = top();
        INTERIOR.show(null);
        out.tub = { shown, back: top(), y1: c.geo.cabin.y1 };
      }
      INTERIOR.show(null);
      removeCar(c);
    }
    return out;
  });
  expect(r.inside.length).toBe(r.ids);
  expect(r.tub.shown).toBeLessThan(r.tub.y1 - 0.3);
  expect(r.tub.back).toBeCloseTo(r.tub.y1, 3);
  expect(errors).toEqual([]);
});

test('polis och tjuv: polisen tar tjuven och leken räknar poäng', async () => {
  // a pretend room with one friend, Oscar, standing a little way off; you have the room and are the police first
  const r = await page.evaluate(() => {
    gubbeTest.hold(true);
    Object.assign(MP.debug.S, { code: 'TEST', host: true, myId: 'me', hostId: 'me', name: 'Elvin' });
    const P = MP.debug.addPlayer('f1', 'Oscar', {});
    const fx = gubbeTest.state().player.x - 6, fz = gubbeTest.state().player.z + 4;
    const feed = () => MP.debug.take(P, [performance.now(), fx, 0, fz, 0, 0, 0, 1, 0, 0, 0]);
    feed(); gubbeTest.run(0.2, 1 / 60, false); feed();
    // the police are after you when the game starts: they give up, and leave you alone while you play
    gubbeTest.startChase('fart', 20);
    const chased = !!gubbeTest.wanted;
    PARTY.debug.begin(['me', 'f1']);
    const G = () => PARTY.debug.G, s = { chased };
    s.chaseOver = gubbeTest.wanted; gubbeTest.startChase('stöld', 0); s.noNewChase = gubbeTest.wanted;
    s.count = G().ph; s.hold = PARTY.hold(); s.car = gubbeTest.state().driving;
    PARTY.debug.advance(10.5); feed(); gubbeTest.run(0.1, 1 / 60, false);
    s.hunt = G().ph; s.holdAfter = PARTY.hold();
    PARTY.debug.advance(20); feed();
    const c = driving;
    c.x = fx + 3; c.z = fz; c.h = -Math.PI / 2; c.vx = c.vz = 0;
    feed(); gubbeTest.run(0.05, 1 / 60, false);
    s.after = G().ph; s.out = G().out.slice(); s.sc = G().sc.map(Math.round);
    PARTY.debug.stopGame();
    s.stopped = PARTY.debug.G;
    MP.debug.leave();
    gubbeTest.hold(false);
    return s;
  });
  expect(r.chased).toBe(true);
  expect(r.chaseOver).toBeNull();
  expect(r.noNewChase).toBeNull();
  expect(r.count).toBe('count');
  expect(r.hold).toBe(true);
  expect(r.car).toBe('polis');
  expect(r.hunt).toBe('hunt');
  expect(r.holdAfter).toBe(false);
  expect(r.after).toBe('end');
  expect(r.out).toEqual([false, true]);
  // Oscar was free for about 20 seconds, and the police got the rest of the round
  expect(r.sc[1]).toBeGreaterThanOrEqual(20);
  expect(r.sc[0] + r.sc[1]).toBeGreaterThanOrEqual(178);
  expect(r.stopped).toBeNull();
  expect(errors).toEqual([]);
});

test('gatlopp mot varandra: alla till start, först i mål vinner', async () => {
  // a pretend room again: you and Oscar race Gamla stan runt; you drive through every checkpoint, Oscar comes home later
  const r = await page.evaluate(() => {
    gubbeTest.hold(true);
    Object.assign(MP.debug.S, { code: 'TEST', host: true, myId: 'me', hostId: 'me', name: 'Elvin' });
    const P = MP.debug.addPlayer('f1', 'Oscar', {});
    const R = gubbeTest.jobs.RACES[0], s1 = PARTY.debug.gridSpot(R, 1, gubbeTest.MODELS[0]);
    const feed = () => MP.debug.take(P, [performance.now(), s1.x, 0, s1.z, 0, 0, 0, 1, 0, 0, 0]);
    feed(); gubbeTest.run(0.2, 1 / 60, false); feed();
    PARTY.debug.beginRace(R.id); feed(); gubbeTest.run(0.1, 1 / 60, false);
    const G = () => PARTY.debug.G, s = {};
    s.grid = G().ph; s.hold = PARTY.hold(); s.atStart = Math.hypot(driving.x - R.pts[0].x, driving.z - R.pts[0].z);
    PARTY.debug.advance(15.5); feed(); gubbeTest.run(0.1, 1 / 60, false);
    s.race = G().ph; s.racing = !!(gubbeTest.jobs.job && gubbeTest.jobs.job.party);
    gubbeTest.jobs._skipCountdown();
    for (let i = 1; i < R.pts.length; i++) { driving.x = R.pts[i].x; driving.z = R.pts[i].z; driving.vx = driving.vz = 0; gubbeTest.run(0.05, 1 / 60, false); feed(); PARTY.debug.advance(1); }
    s.mine = PARTY.debug.mine.fin > 0;
    return s;
  });
  // (your time reaches the one who has the room a moment after the finish)
  await page.waitForTimeout(50);
  const r2 = await page.evaluate(() => {
    const G = () => PARTY.debug.G, s = {};
    s.fin = G().fin.map((f) => f > 0);
    PARTY.debug.heard('f1', { a: 'fin', t: 300 });
    s.over = G().ph; s.winner = document.getElementById('partyBoardTitle').textContent;
    PARTY.debug.advance(16);
    s.closed = G();
    MP.debug.leave();
    gubbeTest.hold(false);
    return s;
  });
  expect(r.grid).toBe('grid');
  expect(r.hold).toBe(true);
  expect(r.atStart).toBeLessThan(45);
  expect(r.race).toBe('race');
  expect(r.racing).toBe(true);
  expect(r.mine).toBe(true);
  expect(r2.fin).toEqual([true, false]);
  expect(r2.over).toBe('over');
  expect(r2.winner).toContain('du vann');
  expect(r2.closed).toBeNull();
  expect(errors).toEqual([]);
});

test('kurragömma: den som letar blundar, och hittar den som är nära', async () => {
  // a pretend room: you seek first, Oscar hides 12 m away
  const r = await page.evaluate(() => {
    gubbeTest.hold(true);
    if (driving) gubbeTest.press('KeyE');
    Object.assign(MP.debug.S, { code: 'TEST', host: true, myId: 'me', hostId: 'me', name: 'Elvin' });
    const P = MP.debug.addPlayer('f1', 'Oscar', {});
    const fx = gubbeTest.state().player.x - 12, fz = gubbeTest.state().player.z;
    const feed = () => MP.debug.take(P, [performance.now(), fx, 0, fz, 0, 0, 0, 1, 0, 0, 0]);
    feed(); gubbeTest.run(0.2, 1 / 60, false); feed();
    PARTY.debug.begin(['me', 'f1'], 'hide'); feed(); gubbeTest.run(0.1, 1 / 60, false);
    const G = () => PARTY.debug.G, blind = () => !document.getElementById('partyBlind').hidden, s = {};
    s.count = G().ph; s.hold = PARTY.hold(); s.blind = blind(); s.hidden = P.badge.hide && !P.tag.visible;
    PARTY.debug.advance(60.5); feed(); gubbeTest.run(0.1, 1 / 60, false);
    s.hunt = G().ph; s.blindAfter = blind();
    gubbeTest.teleport(fx + 6, fz); feed(); gubbeTest.run(0.05, 1 / 60, false);
    s.far = G().out.slice();
    gubbeTest.teleport(fx + 2.5, fz); feed(); gubbeTest.run(0.05, 1 / 60, false);
    s.near = G().out.slice(); s.after = G().ph;
    PARTY.debug.stopGame();
    MP.debug.leave();
    gubbeTest.hold(false);
    return s;
  });
  expect(r.count).toBe('count');
  expect(r.hold).toBe(true);
  expect(r.blind).toBe(true);
  expect(r.hidden).toBe(true);
  expect(r.hunt).toBe('hunt');
  expect(r.blindAfter).toBe(false);
  expect(r.far).toEqual([false, false]);
  expect(r.near).toEqual([false, true]);
  expect(r.after).toBe('end');
  expect(errors).toEqual([]);
});

test('helikoptern: kliv in, lyft, flyg, landa och kliv ur', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, H = FLY.heli, P = FLY.debug.PAD, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    t.teleport(P.x + Math.cos(P.h) * 4, P.z - Math.sin(P.h) * 4); t.run(0.2, 1 / 60, false);
    s.prompt = FLY.prompt();
    t.press('KeyE'); t.run(0.1, 1 / 60, false);
    s.on = FLY.on;
    // the rotor runs up first, then Space climbs
    t.key('Space', true); t.run(7, 1 / 60, false); t.key('Space', false);
    s.y = H.y;
    const x0 = H.x, z0 = H.z;
    t.key('KeyW', true); t.run(3, 1 / 60, false); t.key('KeyW', false);
    s.moved = Math.hypot(H.x - x0, H.z - z0);
    // back over the pad and down with Shift
    H.x = P.x; H.z = P.z; H.vx = H.vz = 0;
    t.key('ShiftLeft', true); t.run(5, 1 / 60, false); t.key('ShiftLeft', false);
    s.down = H.ground && H.y < 0.1;
    t.press('KeyE'); t.run(0.2, 1 / 60, false);
    s.out = !FLY.on && t.state().driving === null;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.prompt).toBe('Flyg helikoptern');
  expect(r.on).toBe(true);
  expect(r.y).toBeGreaterThan(15);
  expect(r.moved).toBeGreaterThan(20);
  expect(r.down).toBe(true);
  expect(r.out).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('fallskärm: hoppa från Kaknästornet, veckla ut och landa mjukt', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, K = CHUTE.debug.TOWERS[0], s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    t.teleport(K.x + 9, K.z); t.run(0.2, 1 / 60, false);
    s.prompt = CHUTE.prompt();
    t.press('KeyE'); t.run(0.1, 1 / 60, false);
    s.up = player.y;
    t.run(2, 1 / 60, false);
    s.falling = CHUTE.on && !CHUTE.open && CHUTE.debug.S.vy < -10;
    t.press('Space'); t.run(3, 1 / 60, false);
    s.open = CHUTE.open; s.slow = CHUTE.debug.S.vy > -6;
    let n = 0;
    while (CHUTE.on && n++ < 60) t.run(1, 1 / 60, false);
    s.landed = !CHUTE.on && player.y < 0.1;
    s.soft = document.getElementById('toast').textContent;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.prompt).toContain('Kaknästornet');
  expect(r.up).toBeGreaterThan(130);
  expect(r.falling).toBe(true);
  expect(r.open).toBe(true);
  expect(r.slow).toBe(true);
  expect(r.landed).toBe(true);
  expect(['Snygg landning!', 'Du landade på ett tak och klättrade ner.']).toContain(r.soft);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('tunnelbanan: från Slussen till Hötorget, med biljett', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, D = METRO.debug, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    const A = D.STOPS.find((x) => x.name === 'Slussen'), B = D.STOPS.find((x) => x.name === 'Hötorget');
    t.teleport(A.x + 1.5, A.z); t.run(0.2, 1 / 60, false);
    s.prompt = METRO.prompt();
    t.press('KeyE');
    s.board = METRO.boardOpen;
    const cash = t.jobs.earned;
    D.go(B);
    s.riding = METRO.riding; s.paid = cash - t.jobs.earned;
    t.run(10, 1 / 60, false);
    s.arrived = !METRO.riding && Math.hypot(player.x - B.x, player.z - B.z) < 13;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.prompt).toBe('Åk tunnelbana från Slussen');
  expect(r.board).toBe(true);
  expect(r.riding).toBe(true);
  expect(r.paid === 39 || r.paid === 0).toBe(true);
  expect(r.arrived).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('gröna lund: åk karusellen, med kameran i sadeln', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, s = {}, C = TIVOLI.CAROUSEL;
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    t.jobs.reward(100);
    t.teleport(C.x + 8.5, C.z); t.run(0.2, 1 / 60, false);
    s.prompt = RIDES.prompt();
    const cash = t.jobs.earned;
    t.press('KeyE'); t.run(2, 1 / 60, true);
    s.paid = cash - t.jobs.earned; s.riding = RIDES.riding; s.camY = camera.position.y;
    const x0 = player.x; t.run(2, 1 / 60, false); s.turned = Math.abs(player.x - x0) > 1;
    t.press('KeyE'); s.stays = RIDES.riding;
    t.run(18, 1 / 60, false);
    s.off = !RIDES.on && player.y < 0.1 && player.model.group.visible;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.prompt).toBe('Åk karusellen (30 kr)');
  expect(r.paid).toBe(30);
  expect(r.riding).toBe(true);
  expect(r.camY).toBeGreaterThan(3);
  expect(r.turned).toBe(true);
  expect(r.stays).toBe(true);
  expect(r.off).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('vattenballonger: köp i hinken, blöt en gubbe och en polis, och bli träffad av en vän', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    t.jobs.reward(100);
    // at the bucket beside the balloon seller in Kungsträdgården
    const b = SPLASH.debug.buckets[1], dx = b.x - b.s.p.x, dz = b.z - b.s.p.z, d = Math.hypot(dx, dz);
    t.teleport(b.x + (dx / d) * 0.9, b.z + (dz / d) * 0.9); t.run(0.3, 1 / 60, false);
    s.prompt = t.state().prompt;
    const cash = t.jobs.earned;
    t.press('KeyE');
    s.paid = cash - t.jobs.earned; s.count = SPLASH.count;
    // one throw over the grass, to see where it lands
    const throwFrom = () => { t.teleport(40, -470); t.look(0.3, 0.3); t.run(0.6, 1 / 60, false); t.press('KeyF'); };
    const fly = (who) => { for (let i = 0; i < 400 && SPLASH.debug.flying.length; i++) { if (who) { who.x = s.land.x; who.z = s.land.z; } t.run(1 / 60, 1 / 60, false); } };
    throwFrom(); fly(null);
    s.land = SPLASH.debug.lastSplash; s.far = Math.hypot(s.land.x - player.x, s.land.z - player.z);
    // someone standing there gets soaked and runs off
    const walker = makePerson(makeIdentity(), s.land.x, s.land.z, { state: 'wander', wx: 0, wz: 0, t: 30, dodgeT: 0 });
    walker.keep = true;
    throwFrom(); fly(walker);
    s.walkerWet = walker.wetT > 0; s.walkerRuns = walker.ai.state === 'flee';
    removePerson(walker);
    // and a police officer there starts a chase
    const cop = makePerson(makeIdentity({ police: true }), s.land.x, s.land.z, { state: 'cop', role: 'test', dodgeT: 0 });
    cop.keep = true;
    throwFrom(); fly(cop);
    s.copWet = cop.wetT > 0; s.chase = t.wanted ? [...t.wanted.kinds] : [];
    removePerson(cop);
    t.endChase(false);
    // a friend's balloon, straight at you
    const P = t.mp.debug.addPlayer('test-friend', 'Kalle', {}, VERSION.nr), v = 12, tt = 6 / v;
    SPLASH.heard(P, { p: [player.x + 6, 1.6, player.z], v: [-v, 0.5 * 9.81 * tt - 0.3 / tt, 0], c: 2 });
    fly(null);
    s.meWet = SPLASH.wet; s.screen = !document.getElementById('wetScreen').hidden; s.toast = t.state().toast;
    t.mp.debug.S.players.delete('test-friend');
    s.left = SPLASH.count;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.prompt).toBe('Köp 5 vattenballonger · 25 kr');
  expect(r.paid).toBe(25);
  expect(r.count).toBe(5);
  expect(r.land.kind).toBe('ground');
  expect(r.far).toBeGreaterThan(10);
  expect(r.walkerWet).toBe(true);
  expect(r.walkerRuns).toBe(true);
  expect(r.copWet).toBe(true);
  expect(r.chase).toContain('ballong');
  expect(r.meWet).toBe(true);
  expect(r.screen).toBe(true);
  expect(r.toast).toContain('Kalle träffade dig');
  expect(r.left).toBe(2);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('verkstaden: kör in, välj lack, fälgar, fjädring och motor, och de sparas för bilen', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, W = WORKSHOP.debug, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    t.jobs.reward(3000);
    // a SUV out on Götgatan with its nose to the door, driven in onto the bay and stopped
    t.teleport(...W.toW(0, -9)); t.run(0.3, 1 / 60, false);
    t.choose('suv'); t.run(0.2, 1 / 60, false);
    const c = t.driving, [x, z] = W.toW(0, -6);
    c.x = x; c.z = z; c.h = W.lot.face; c.vx = c.vz = 0;
    t.key('KeyW', true);
    for (let i = 0; i < 600 && !W.inBay(c.x, c.z); i++) t.run(1 / 60, 1 / 60, false);
    t.key('KeyW', false); t.key('KeyS', true);
    for (let i = 0; i < 300 && Math.hypot(c.vx, c.vz) > 0.3; i++) t.run(1 / 60, 1 / 60, false);
    t.key('KeyS', false);
    t.run(0.5, 1 / 60, false);
    s.open = WORKSHOP.open;
    // pick: yellow, aero rims, lowered, stage 1
    const pickOpt = (list, start) => [...document.querySelectorAll(list + ' button')].find((b) => b.textContent.startsWith(start)).click();
    [...document.querySelectorAll('#shopPaint button')].find((b) => b.title === 'Gul').click();
    pickOpt('#shopRims', 'Aero'); pickOpt('#shopLow', 'Sänkt'); pickOpt('#shopEngine', 'Steg 1');
    s.sum = document.getElementById('shopSum').textContent;
    s.preview = c.color !== 0xf7c600 && c.rimStyle === 'aero';
    const cash = t.jobs.earned;
    document.getElementById('shopBuy').click();
    s.paid = cash - t.jobs.earned;
    s.car = { color: c.color, rim: c.rimStyle, low: c.body.position.y, k: c.speedK, boost: c.boost };
    document.getElementById('shopClose').click();
    s.closed = !WORKSHOP.open && !document.body.classList.contains('shop');
    // back out, get out, and pick the same model again: it comes as you made it
    t.key('KeyS', true); t.run(3, 1 / 60, false); t.key('KeyS', false); t.run(1, 1 / 60, false);
    t.press('KeyE'); t.run(0.3, 1 / 60, false);
    t.choose('suv'); t.run(0.3, 1 / 60, false);
    const d = t.driving;
    s.again = { color: d.color, rim: d.rimStyle, low: d.body.position.y, k: d.speedK };
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.open).toBe(true);
  // (the thousands are split with a no-break space)
  expect(r.sum).toMatch(/^Att betala: 1\s600 kr$/);
  expect(r.preview).toBe(true);
  expect(r.paid).toBe(1600);
  expect(r.car).toEqual({ color: 0xf7c600, rim: 'aero', low: -0.04, k: 1.05, boost: 1.12 });
  expect(r.closed).toBe(true);
  expect(r.again).toEqual({ color: 0xf7c600, rim: 'aero', low: -0.04, k: 1.05 });
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('dag och natt: på natten lyser lamporna, fönstren och billjusen, och den som har rummet bestämmer tiden', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, D = t.daynight, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    s.startHour = D.hour;
    D.set(23); t.run(0.5, 1 / 60, false);
    const bot = t.cars.find((c) => c.bot && !c.dead && !c.M.boat);
    s.night = { lights: D.lights, sun: sun.intensity, fog: scene.fog.color.r, lamp: D.debug.lampU.value, pools: D.debug.pools.some((p) => p.visible), head: bot ? bot.mat.userData.glow.x : null, beam: !!(bot && bot.beam && bot.beam.visible), clock: document.getElementById('locTime').textContent };
    // O: an hour on
    t.press('KeyO');
    s.afterO = Math.round(D.hour * 100) / 100; s.toast = t.state().toast;
    // the time from the one who has the room, and not from anyone else
    D.heard(true, 15.5); s.fromHost = D.hour;
    D.heard(false, 3); s.fromOther = D.hour;
    D.set(10); t.run(0.5, 1 / 60, false);
    s.day = { lights: D.lights, sun: sun.intensity, head: bot ? bot.mat.userData.glow.x : null, pools: D.debug.pools.some((p) => p.visible) };
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.night.lights).toBeCloseTo(1, 2);
  expect(r.night.sun).toBeLessThan(0.5);
  expect(r.night.fog).toBeLessThan(0.2);
  expect(r.night.lamp).toBeGreaterThan(3);
  expect(r.night.pools).toBe(true);
  expect(r.night.head).toBeGreaterThan(2);
  expect(r.night.beam).toBe(true);
  expect(r.night.clock).toBe('23:00');
  expect(r.afterO).toBeCloseTo(0, 1);
  expect(r.toast).toContain('Klockan är 00:');
  expect(r.fromHost).toBe(15.5);
  expect(r.fromOther).toBe(15.5);
  expect(r.day.lights).toBe(0);
  expect(r.day.sun).toBeCloseTo(1.6, 1);
  expect(r.day.head).toBeCloseTo(0.6, 2);
  expect(r.day.pools).toBe(false);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('väder: U ger regn, sedan snö, sedan sol, och det blir halt', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, W = t.weather, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    s.start = W.kind;
    t.choose(t.MODELS.find((m) => !m.boat && !m.police && !m.mil && !m.moped).id); t.run(0.2, 1 / 30, false);
    t.press('KeyU'); s.toastRain = t.state().toast;
    t.run(25, 1 / 30, false);
    s.rain = { kind: W.name, amount: W.amount, wet: W.debug.wet, grip: W.grip, drops: W.debug.rain.visible, fog: scene.fog.far, glass: !document.getElementById('rainScreen').hidden };
    t.press('KeyU'); s.toastSnow = t.state().toast;
    t.run(45, 1 / 30, false);
    s.snow = { kind: W.name, cover: W.debug.cover, brake: W.brake, flakes: W.debug.snow.visible, glass: !document.getElementById('rainScreen').hidden };
    t.press('KeyU');
    t.run(25, 1 / 30, false);
    s.clear = { kind: W.name, amount: W.amount };
    // the weather from the one who has the room, and not from anyone else
    W.heard(false, 1); s.fromOther = W.kind;
    W.heard(true, 2); s.fromHost = W.kind;
    W.debug.now(0, 0); t.run(0.2, 1 / 30, false);
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.start).toBe(0);
  expect(r.toastRain).toContain('regna');
  expect(r.rain.kind).toBe('regn');
  expect(r.rain.amount).toBeGreaterThan(0.95);
  expect(r.rain.wet).toBeGreaterThan(0.3);
  expect(r.rain.grip).toBeLessThan(1);
  expect(r.rain.drops).toBe(true);
  expect(r.rain.fog).toBeLessThan(800);
  expect(r.rain.glass).toBe(true);
  expect(r.toastSnow).toContain('snöa');
  expect(r.snow.kind).toBe('snö');
  expect(r.snow.cover).toBeGreaterThan(0.5);
  expect(r.snow.brake).toBeLessThan(1);
  expect(r.snow.flakes).toBe(true);
  expect(r.snow.glass).toBe(false);
  expect(r.clear.kind).toBe('sol');
  expect(r.clear.amount).toBe(0);
  expect(r.fromOther).toBe(0);
  expect(r.fromHost).toBe(2);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('nivåer och troféer: XP ger nivåer och troféer, I visar tavlan, och verkstadens bästa delar väntar på en nivå', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, P = t.progress, D = P.debug, W = WORKSHOP.debug, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    // a job that pays 300 kr gives 50 XP, and the first time a trophy with 50 more (the races earlier may have taken it)
    const xp0 = P.xp, had = !!D.S.got.jobb;
    s.jobXp = P.job(300);
    s.gained = P.xp - xp0 - (had ? 0 : 50);
    s.first = !!D.S.got.jobb;
    // getting away from five stars: two trophies
    P.escaped(5);
    s.escape = !!D.S.got.undan && !!D.S.got.fem;
    // 300 km/h is watched every frame
    t.jobs.reward(5000);
    t.teleport(...W.toW(0, -9)); t.run(0.3, 1 / 60, false);
    t.choose('suv'); t.run(0.2, 1 / 60, false);
    const c = t.driving;
    c.vx = 0; c.vz = 84; P.update(0); c.vz = 0;
    s.fast = !!D.S.got.fart;
    s.level = P.level === D.levelOf(P.xp).lv;
    s.tag = document.getElementById('lvNum').textContent === String(P.level);
    // a new trophy or level shows in a moment
    t.run(0.2, 1 / 60, false);
    s.award = !document.getElementById('award').hidden;
    // into the workshop: motor steg 3 waits for level 8
    const [x, z] = W.toW(0, -6);
    c.x = x; c.z = z; c.h = W.lot.face; c.vx = c.vz = 0;
    t.key('KeyW', true);
    for (let i = 0; i < 600 && !W.inBay(c.x, c.z); i++) t.run(1 / 60, 1 / 60, false);
    t.key('KeyW', false); t.key('KeyS', true);
    for (let i = 0; i < 300 && Math.hypot(c.vx, c.vz) > 0.3; i++) t.run(1 / 60, 1 / 60, false);
    t.key('KeyS', false);
    t.run(0.5, 1 / 60, false);
    s.shop = WORKSHOP.open;
    const steg3 = () => [...document.querySelectorAll('#shopEngine button')].find((b) => b.textContent.startsWith('Steg 3'));
    s.before = { lv: P.level, locked: steg3().disabled };
    let need = 0;
    for (let lv = 1; lv < 8; lv++) need += D.need(lv);
    P.gain(Math.max(1, need - P.xp));
    W.render();
    s.after = { lv: P.level, locked: steg3().disabled };
    W.closeBoard();
    s.unlocks = WORKSHOP.unlocks.map((u) => u.lv);
    // I opens the board with every trophy, and pauses the game; Esc closes it
    t.press('KeyI');
    s.board = { open: P.open, paused: paused(), rows: document.querySelectorAll('#trList li').length, got: document.querySelectorAll('#trList li.got').length, trophies: D.TROPHIES.length, gotNow: Object.keys(D.S.got).length };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    s.closed = !P.open && document.getElementById('trophies').hidden;
    // it is kept in the browser
    t.run(4, 1 / 30, false);
    const kept = JSON.parse(localStorage.getItem('gubbe-niva'));
    s.kept = kept.xp === P.xp && kept.got.fart === 1;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.jobXp).toBe(50);
  expect(r.gained).toBe(50);
  expect(r.first).toBe(true);
  expect(r.escape).toBe(true);
  expect(r.fast).toBe(true);
  expect(r.level).toBe(true);
  expect(r.tag).toBe(true);
  expect(r.award).toBe(true);
  expect(r.shop).toBe(true);
  expect(r.before.locked).toBe(r.before.lv < 8);
  expect(r.after.lv).toBeGreaterThanOrEqual(8);
  expect(r.after.locked).toBe(false);
  expect(r.unlocks).toEqual([2, 3, 4, 5, 6, 8]);
  expect(r.board.open).toBe(true);
  expect(r.board.paused).toBe(true);
  expect(r.board.rows).toBe(r.board.trophies);
  expect(r.board.got).toBe(r.board.gotNow);
  expect(r.closed).toBe(true);
  expect(r.kept).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('dagliga utmaningar: tre om dagen, de räknas, ger pengar och XP, och nästa dag kommer nya', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, D = t.daily.debug, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    // the same date always gives the same three, an easy, a harder and a hard one
    s.same = D.choose('2026-10-25').join() === D.choose('2026-10-25').join();
    s.tiers = D.choose('2026-11-02').map((id) => D.POOL.find((c) => c.id === id).tier);
    s.today = t.daily.ids.length;
    // two taxi fares, a free fall, the speed: counted where they happen
    D.set(['taxi', 'fall', 'kmh']);
    const cash = t.jobs.earned, xp = t.progress.xp;
    t.progress.job(200, 'taxi'); s.one = D.D.v[0];
    t.progress.job(200, 'taxi'); s.taxi = t.daily.done[0];
    DAILY.add('fall', 30); s.short = t.daily.done[1];
    DAILY.add('fall', 55); s.fall = t.daily.done[1];
    t.choose('suv'); t.run(0.2, 1 / 30, false);
    const c = t.driving;
    c.vx = 0; c.vz = 70; DAILY.update(0); c.vz = 0;
    s.fast = t.daily.done[2];
    s.bonus = D.D.bonus;
    s.paid = t.jobs.earned - cash;
    s.xp = t.progress.xp - xp;
    // on the level board, and in the corner
    t.press('KeyI');
    s.rows = document.querySelectorAll('#trDaily li').length; s.got = document.querySelectorAll('#trDaily li.got').length;
    t.press('KeyI');
    t.run(0.1, 1 / 30, false);
    s.tag = document.getElementById('dailyCount').textContent;
    // a new day: three new ones, from nothing, and they are kept in the browser
    D.newDay(); t.run(0.1, 1 / 30, false);
    s.fresh = { done: t.daily.done.filter(Boolean).length, day: D.D.day === D.dayOf(new Date()) };
    t.run(4, 1 / 30, false);
    s.kept = JSON.parse(localStorage.getItem('gubbe-dagens')).ids.join() === t.daily.ids.join();
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.same).toBe(true);
  expect(r.tiers).toEqual([1, 2, 3]);
  expect(r.today).toBe(3);
  expect(r.one).toBe(1);
  expect(r.taxi).toBe(true);
  expect(r.short).toBe(false);
  expect(r.fall).toBe(true);
  expect(r.fast).toBe(true);
  expect(r.bonus).toBe(true);
  expect(r.paid).toBe(150 + 300 + 500 + 300);
  // (the two fares' XP and the challenges', and maybe a trophy or two)
  expect(r.xp).toBeGreaterThanOrEqual(2 * 33 + 75 + 150 + 250 + 200);
  expect(r.rows).toBe(3);
  expect(r.got).toBe(3);
  expect(r.tag).toBe('3/3');
  expect(r.fresh).toEqual({ done: 0, day: true });
  expect(r.kept).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('garaget: köp bilar i bilhandeln, de står kvar, kör ut en och parkera den igen', async () => {
  // (the garage opens and closes behind a fade, with timers)
  const isOpen = () => gubbeTest.garage.open && !gubbeTest.garage.debug.busy, isShut = () => !gubbeTest.garage.open && !gubbeTest.garage.debug.busy;
  await page.evaluate(() => {
    const t = gubbeTest, G = t.garage.debug;
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    t.jobs.reward(20000);
    t.teleport(...G.OUT); t.run(0.2, 1 / 60, false);
    t.press('KeyE');
  });
  await page.waitForFunction(isOpen);
  const r = await page.evaluate(() => {
    const t = gubbeTest, GA = t.garage, G = GA.debug, s = {};
    s.paused = paused(); s.view = !!GARAGE.view();
    s.empty = GA.owned.length;
    // a Chiron from the dealer's: it turns on the turntable, and once bought it stands in bay 1
    G.tab = 'shop'; G.pick = MODEL.chiron;
    s.preview = !!G.preview;
    const cash = t.jobs.earned;
    G.buy(); s.paid = cash - t.jobs.earned; s.price = GA.price(MODEL.chiron);
    G.tab = 'shop'; G.pick = MODEL.chiron; G.buy(); s.twice = GA.owned.length;
    G.tab = 'shop'; G.pick = MODEL.sedan; G.buy();
    s.owned = GA.owned; s.shown = G.shown.length; s.below = G.shown.every((c) => c.group.position.y < -5 && !cars.includes(c));
    s.kept = JSON.parse(localStorage.getItem('gubbe-garage')).cars.map((c) => c.id);
    G.sel = 0; G.driveOut();
    return s;
  });
  await page.waitForFunction(isShut);
  const r2 = await page.evaluate(() => {
    const t = gubbeTest, G = t.garage.debug, s = {};
    s.out = { id: driving && driving.M.id, owned: !!(driving && driving.owned), atDoor: !!driving && G.inMark(driving.x, driving.z), paused: paused() };
    // off the box and back onto it, stopped: it opens by itself, and the car is parked again
    const c = driving;
    [c.x, c.z] = G.toW(0, -14); c.vx = c.vz = 0; t.run(0.2, 1 / 60, false);
    [c.x, c.z] = G.OUT; c.vx = c.vz = 0; t.run(0.2, 1 / 60, false);
    return s;
  });
  await page.waitForFunction(isOpen);
  const r3 = await page.evaluate(() => {
    const t = gubbeTest, GA = t.garage, G = GA.debug, s = {};
    s.parked = { driving: !!driving, out: cars.filter((c) => c.owned).length, shown: G.shown.length };
    // selling the sedan: once to ask, once more to sell, for half
    const cash = t.jobs.earned;
    G.sel = 1; G.sellIt(); s.asked = GA.owned.length; G.sellIt();
    s.sold = { owned: GA.owned, got: t.jobs.earned - cash, half: Math.round(GA.price(MODEL.sedan) / 2 / 100) * 100 };
    G.leave();
    return s;
  });
  await page.waitForFunction(isShut);
  const r4 = await page.evaluate(() => {
    const t = gubbeTest, s = { paused: paused(), hidden: document.getElementById('garage').hidden, onFoot: !driving, bad: t.state().bad };
    t.hold(false);
    return s;
  });
  expect(r.paused).toBe(true);
  expect(r.view).toBe(true);
  expect(r.empty).toBe(0);
  expect(r.preview).toBe(true);
  expect(r.paid).toBe(r.price);
  expect(r.twice).toBe(1);
  expect(r.owned).toEqual(['chiron', 'sedan']);
  expect(r.shown).toBe(2);
  expect(r.below).toBe(true);
  expect(r.kept).toEqual(['chiron', 'sedan']);
  expect(r2.out).toEqual({ id: 'chiron', owned: true, atDoor: true, paused: false });
  expect(r3.parked).toEqual({ driving: false, out: 0, shown: 2 });
  expect(r3.asked).toBe(2);
  expect(r3.sold.owned).toEqual(['chiron']);
  expect(r3.sold.got).toBe(r3.sold.half);
  expect(r4).toEqual({ paused: false, hidden: true, onFoot: true, bad: [] });
  expect(errors).toEqual([]);
});

test('de nya hyperbilarna går bara att köpa i bilhandeln', async () => {
  const r = await page.evaluate(() => {
    const ids = ['tourbillon', 'nevera', 'f80', 'w1'], G = gubbeTest.garage;
    return {
      all: ids.every((id) => MODEL[id] && MODEL[id].buy),
      picker: PICKABLE.some((m) => m.buy) || ids.some((id) => document.getElementById('model-' + id)),
      traffic: SPORTS.some((m) => m.buy) || REGULARS.some((m) => m.buy) || cars.some((c) => c.M.buy && c !== driving),
      dealer: ids.every((id) => G.debug.FOR_SALE.includes(MODEL[id])),
      prices: ids.map((id) => G.price(MODEL[id])),
      fastest: Math.max(...MODELS.map((m) => m.max)) === MODEL.tourbillon.max
    };
  });
  expect(r.all).toBe(true);
  expect(r.picker).toBe(false);
  expect(r.traffic).toBe(false);
  expect(r.dealer).toBe(true);
  expect(r.prices).toEqual([30000, 25000, 20000, 20000]);
  expect(r.fastest).toBe(true);
  expect(errors).toEqual([]);
});

test('bilarna i garaget står överst när du väljer bil med B, i sin egen färg', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, G = t.garage, s = {};
    t.hold(true);
    if (JOBS.job) t.press('KeyJ');
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    const e = edges.find((x) => x.name === 'Ringvägen' && x.len > 100), f = edgeFrame(e.a, e.b);
    t.teleport(f.A.x + f.ux * e.len / 2 + f.rx * (e.hw + 2), f.A.z + f.uz * e.len / 2 + f.rz * (e.hw + 2)); t.run(0.2, 1 / 60, false);
    // (the garage test bought a Chiron; a Golf in red too, an ordinary car)
    G.debug.tab = 'shop'; G.debug.pick = MODEL.halvkombi; G.debug.buy();
    s.have = G.owned;
    t.press('KeyB');
    s.group = !document.getElementById('pickMine').hidden;
    s.shown = [...document.querySelectorAll('#gridMine button.model')].map((b) => b.id.slice(5));
    s.others = ['tourbillon', 'nevera', 'f80', 'w1', 'jesko'].some((id) => document.getElementById('model-' + id) || document.getElementById('mine-' + id));
    // your Golf from the top: yours, in its colour; the Chiron the same
    document.getElementById('mine-halvkombi').click(); t.run(0.3, 1 / 60, false);
    s.golf = { id: driving && driving.M.id, owned: !!(driving && driving.owned), color: driving && driving.color === G.mine('halvkombi').color };
    t.press('KeyE'); t.press('KeyB');
    document.getElementById('mine-chiron').click(); t.run(0.3, 1 / 60, false);
    s.chiron = { id: driving && driving.M.id, owned: !!(driving && driving.owned), color: driving && driving.color === G.mine('chiron').color };
    // a Golf from the ordinary cars further down is just a Golf
    t.press('KeyE'); t.press('KeyB');
    document.getElementById('model-halvkombi').click(); t.run(0.3, 1 / 60, false);
    s.plain = { id: driving && driving.M.id, owned: !!(driving && driving.owned) };
    t.press('KeyE');
    t.hold(false);
    return s;
  });
  expect(r.have).toEqual(['chiron', 'halvkombi']);
  expect(r.group).toBe(true);
  expect(r.shown).toEqual(['chiron', 'halvkombi']);
  expect(r.others).toBe(false);
  expect(r.golf).toEqual({ id: 'halvkombi', owned: true, color: true });
  expect(r.chiron).toEqual({ id: 'chiron', owned: true, color: true });
  expect(r.plain).toEqual({ id: 'halvkombi', owned: false });
  expect(errors).toEqual([]);
});

test('mer pengar: pengapåsar, belöning från polisen, nära ögat och drift', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, C = t.cash, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    // the same date lays the same fifteen bags, each on a pavement
    const a = C.debug.lay('2026-11-02'), b = C.debug.lay('2026-11-02');
    s.bags = { n: a.length, same: JSON.stringify(a) === JSON.stringify(b), ok: a.every((x) => walkable(x.x, x.z) && !blockedAt(x.x, x.z, 0.5)) };
    // walking onto one picks it up, and it stays picked up today
    const L = C.debug.list, i = L.findIndex((x, k) => !C.debug.got.has(k)), bag = L[i];
    let cash = t.jobs.earned;
    t.teleport(bag.x, bag.z); t.run(0.2, 1 / 60, false);
    s.bag = { got: t.jobs.earned - cash, kr: bag.kr, kept: JSON.parse(localStorage.getItem('gubbe-pasar')).got.includes(i) };
    // getting away from three stars pays 250 kr a star
    cash = t.jobs.earned; C.bounty(3); s.bounty = t.jobs.earned - cash;
    // on a long straight, the traffic out of the way: a near miss past a parked car at 25 m/s, half a metre to spare
    const e = edges.find((x) => x.name === 'Strandvägen' && x.len > 150), f = edgeFrame(e.a, e.b), h = Math.atan2(f.ux, f.uz);
    const at = (d, l) => [f.A.x + f.ux * d + f.rx * l, f.A.z + f.uz * d + f.rz * l];
    t.teleport(...at(10, 2)); t.run(0.2, 1 / 60, false);
    t.choose('superbil'); t.run(0.2, 1 / 60, false);
    const c = t.driving, o = cars.find((x) => x !== c && !x.M.boat && !x.M.police && !x.remote);
    for (const x of cars.slice()) if (x !== c && x !== o && !x.remote && Math.hypot(x.x - c.x, x.z - c.z) < 250) removeCar(x);
    o.bot = null; o.keep = true; [o.x, o.z] = at(60, 2 + (c.M.W + o.M.W) / 2 + 0.5); o.h = h; o.vx = o.vz = 0;
    [c.x, c.z] = at(10, 2); c.h = h; c.vx = f.ux * 25; c.vz = f.uz * 25;
    cash = t.jobs.earned;
    t.key('KeyW', true);
    for (let k = 0; k < 150; k++) t.run(1 / 60, 1 / 60, false);
    t.key('KeyW', false);
    s.miss = { got: t.jobs.earned - cash, touched: o.health < 100 };
    // a handbrake turn at speed: a drift of over a second pays
    [c.x, c.z] = at(10, 2); c.h = h; c.vx = f.ux * 26; c.vz = f.uz * 26; c.hitT = 0;
    cash = t.jobs.earned;
    t.key('KeyW', true); t.key('Space', true); t.key('KeyA', true);
    t.run(2, 1 / 60, false);
    t.key('Space', false); t.key('KeyA', false); t.key('KeyW', false); t.key('KeyS', true);
    t.run(1.5, 1 / 60, false); t.key('KeyS', false);
    s.drift = t.jobs.earned - cash;
    if (t.wanted) t.endChase(false);
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.bags).toEqual({ n: 15, same: true, ok: true });
  expect(r.bag.got).toBe(r.bag.kr);
  expect(r.bag.kept).toBe(true);
  expect(r.bounty).toBe(750);
  expect(r.miss).toEqual({ got: 25, touched: false });
  expect(r.drift).toBeGreaterThan(0);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('polisuppdrag i fred: polisen stoppar dig inte medan du jagar en rånare', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, s = {};
    t.hold(true);
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    t.choose('polis'); t.run(0.3, 1 / 60, false);
    // wanted when the job starts: the chase ends
    t.startChase('fart', 40); s.before = !!t.wanted;
    t.press('KeyJ'); t.run(0.2, 1 / 60, false);
    s.job = JOBS.job && JOBS.job.kind; s.after = !!t.wanted;
    // speeding, ramming, a water balloon: nothing
    t.startChase('fart', 60); t.startChase('krock', 0); t.startChase('ballong'); s.none = !t.wanted;
    // far too fast past a patrol
    const c = t.driving, p = cars.find((x) => x.police && !x.dead && x !== c);
    if (p) { p.x = c.x + Math.sin(c.h) * 15; p.z = c.z + Math.cos(c.h) * 15; }
    c.vx = Math.sin(c.h) * 40; c.vz = Math.cos(c.h) * 40;
    t.run(0.5, 1 / 60, false); s.speeding = !!t.wanted;
    // off duty again (J ends the job): the police care again
    t.press('KeyJ'); t.run(0.2, 1 / 60, false);
    s.offJob = JOBS.job; t.startChase('krock', 0); s.offDuty = !!t.wanted;
    t.endChase(false);
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.before).toBe(true);
  expect(r.job).toBe('polis');
  expect(r.after).toBe(false);
  expect(r.none).toBe(true);
  expect(r.speeding).toBe(false);
  expect(r.offJob).toBeNull();
  expect(r.offDuty).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('olika tid och väder när spelet startar: ibland natt, regn och åska eller snö', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, real = Math.random, s = {};
    t.hold(true);
    const dice = (v) => { let i = 0; Math.random = () => v[Math.min(i++, v.length - 1)]; };
    // a night with rain (snow in the winter months), falling hard at once, the streets already wet or white
    dice([0.7, 0.5, 0.5]); WEATHER.surprise(); dice([0.9, 0.9]); DAYNIGHT.surprise();
    s.storm = { kind: WEATHER.kind, amount: WEATHER.amount, ground: WEATHER.debug.wet + WEATHER.debug.cover, hour: DAYNIGHT.hour };
    // a sunny day
    dice([0.1, 0.5]); WEATHER.surprise(); dice([0.2, 0.2]); DAYNIGHT.surprise();
    s.sunny = { kind: WEATHER.kind, amount: WEATHER.amount, hour: Math.round(DAYNIGHT.hour * 10) / 10 };
    Math.random = real;
    WEATHER.debug.now(0, 0); DAYNIGHT.set(10);
    t.run(0.2, 1 / 30, false);
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.storm.kind).not.toBe(0);
  expect(r.storm.amount).toBe(1);
  expect(r.storm.ground).toBeGreaterThan(0.5);
  expect(r.storm.hour).toBeGreaterThanOrEqual(0);
  expect(r.storm.hour).toBeLessThan(5);
  expect(r.sunny).toEqual({ kind: 0, amount: 0, hour: 10.6 });
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('jobbtavlan: J utan jobb visar alla jobb, och Kör! ger fordonet och startar jobbet', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, s = {};
    t.hold(true);
    if (JOBS.job) t.press('KeyJ');
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    // on foot on Ringvägen, away from the race starts, the workshop and the scrapyard
    const e = edges.find((x) => x.name === 'Ringvägen' && x.len > 100), f = edgeFrame(e.a, e.b);
    t.teleport(f.A.x + f.ux * e.len / 2 + f.rx * (e.hw + 2), f.A.z + f.uz * e.len / 2 + f.rz * (e.hw + 2)); t.run(0.2, 1 / 60, false);
    t.press('KeyJ');
    s.open = JOBS.boardOpen; s.paused = paused();
    s.rows = document.querySelectorAll('#jobsList li').length; s.races = document.querySelectorAll('#jobsRaces li').length;
    // Kör! on the food job: the moped beside you, and the job on
    const i = JOBS.board.BOARD.findIndex((j) => j.kind === 'mat');
    document.querySelectorAll('#jobsList button')[i].click();
    t.run(0.3, 1 / 60, false);
    s.food = { open: JOBS.boardOpen, car: driving && driving.M.id, job: JOBS.job && JOBS.job.kind };
    // J ends it; in a car without a job of its own J opens the board, and Esc closes it
    t.press('KeyJ'); s.ended = JOBS.job;
    t.press('KeyE'); t.choose('kombi'); t.run(0.2, 1 / 60, false);
    t.press('KeyJ'); s.inCar = JOBS.boardOpen;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    s.closed = !JOBS.boardOpen && document.getElementById('jobs').hidden;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.open).toBe(true);
  expect(r.paused).toBe(true);
  expect(r.rows).toBe(6);
  expect(r.races).toBe(4);
  expect(r.food).toEqual({ open: false, car: 'stalker', job: 'mat' });
  expect(r.ended).toBeNull();
  expect(r.inCar).toBe(true);
  expect(r.closed).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('vägbeskrivning: ett eget mål visar vägen, försvinner när man är framme och sätts med ett klick på stora kartan', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, W = t.waypoint, s = {};
    t.hold(true);
    if (JOBS.job) t.press('KeyJ');
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    W.clear();
    const at = (name) => { const e = edges.find((x) => x.name === name && x.len > 100), f = edgeFrame(e.a, e.b); return { x: f.A.x + f.ux * e.len / 2 + f.rx * (e.hw + 2), z: f.A.z + f.uz * e.len / 2 + f.rz * (e.hw + 2) }; };
    const a = at('Ringvägen'), b = at('Götgatan');
    t.teleport(a.x, a.z); t.run(0.2, 1 / 60, false);
    s.set = W.set(b.x, b.z, 'Götgatan');
    s.goal = !!W.goal; s.route = W.route.length; s.left = W.left; s.pillar = W.debug.pillar.visible;
    // not on the water: the goal stays where it was
    let wx = 0, wz = 0;
    for (let x = -500; x < 500 && walkable(wx, wz); x += 7) for (let z = -500; z < 500; z += 7) if (!walkable(x, z)) { wx = x; wz = z; break; }
    s.water = W.set(wx, wz); s.still = W.goal && W.goal.name;
    t.run(2, 1 / 30, false); s.later = !!W.route;
    // there: it goes by itself
    t.teleport(b.x, b.z); t.run(0.3, 1 / 60, false);
    s.there = { goal: W.goal, pillar: W.debug.pillar.visible };
    // the job board puts it at a race's start
    t.teleport(a.x, a.z); t.run(0.2, 1 / 60, false);
    t.press('KeyJ'); document.querySelector('#jobsRaces button').click();
    s.race = { open: JOBS.boardOpen, name: W.goal && W.goal.name };
    W.clear();
    // the big map, its middle at Götgatan
    t.press('KeyK'); bigmap.cx = b.x; bigmap.cz = b.z; drawBigmap();
    const r = document.getElementById('bigmapCanvas').getBoundingClientRect();
    s.mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    s.k = bigmapFit() * Math.pow(2, bigmap.zoom); s.b = b;
    s.bad = t.state().bad;
    return s;
  });
  expect(r.set).toBe(true);
  expect(r.goal).toBe(true);
  expect(r.route).toBeGreaterThan(1);
  expect(r.left).toBeGreaterThan(100);
  expect(r.pillar).toBe(true);
  expect(r.water).toBe(false);
  expect(r.still).toBe('Götgatan');
  expect(r.later).toBe(true);
  expect(r.there).toEqual({ goal: null, pillar: false });
  expect(r.race.open).toBe(false);
  expect(typeof r.race.name).toBe('string');
  expect(r.bad).toEqual([]);
  // a click puts the goal there, a click on it takes it away
  await page.mouse.click(r.mid.x, r.mid.y);
  await page.waitForFunction(() => gubbeTest.waypoint.goal);
  const g = await page.evaluate(() => gubbeTest.waypoint.goal);
  expect(Math.hypot(g.x - r.b.x, g.z - r.b.z)).toBeLessThan(2 / r.k + 0.5);
  await page.waitForTimeout(600);
  await page.mouse.click(r.mid.x, r.mid.y - 10);
  await page.waitForFunction(() => !gubbeTest.waypoint.goal);
  const end = await page.evaluate(() => { const t = gubbeTest, g = t.waypoint.goal; t.press('KeyK'); t.hold(false); return { g, open: bigmap.open }; });
  expect(end).toEqual({ g: null, open: false });
  expect(errors).toEqual([]);
});

test('konto: kontorutan visar inloggningen och pausar spelet', async () => {
  const r = await page.evaluate(() => {
    ACCOUNT.open();
    const s = { ready: ACCOUNT.ready, open: ACCOUNT.isOpen, paused: paused(), off: !document.getElementById('acOff').hidden, form: !document.getElementById('acForm').hidden };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    s.closed = !ACCOUNT.isOpen;
    return s;
  });
  expect(r).toEqual({ ready: true, open: true, paused: true, off: false, form: true, closed: true });
  expect(errors).toEqual([]);
});

test('storyn: fem uppdrag för Kicki, från tipset till hoppet från Kaknästornet', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, S = t.story, D = S.debug, s = {};
    const run = (sec) => t.run(sec, 1 / 30, false);
    const step = () => (D.R ? D.R.M.id + '#' + D.R.i : null);
    t.hold(true);
    if (JOBS.job) t.press('KeyJ');
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    D.done = 0;
    // the boats' way out over Saltsjön is water all the way, and Kicki and the boss stand on land
    let bad = 0;
    for (let i = 1; i < D.BOAT_PATH.length; i++) {
      const [x0, z0] = D.BOAT_PATH[i - 1], [x1, z1] = D.BOAT_PATH[i], L = Math.hypot(x1 - x0, z1 - z0), h = Math.atan2(x1 - x0, z1 - z0);
      for (let d = 0; d <= L; d += 4) if (!boatFits(MODEL.anytec, x0 + (x1 - x0) * d / L, z0 + (z1 - z0) * d / L, h)) bad++;
    }
    s.places = { water: bad, kicki: walkable(D.KICKI.x, D.KICKI.z), boss: walkable(D.BOSS.x, D.BOSS.z) && FLY.heightAt(D.BOSS.x, D.BOSS.z, 3) === 0 };
    // Kicki outside the police station: E opens her sign, which pauses the game
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.5);
    s.kicki = { there: !!D.kicki, prompt: S.prompt() };
    t.press('KeyE');
    s.offer = { open: S.signOpen, paused: paused(), title: document.getElementById('stTitle').textContent };
    document.getElementById('stGo').click();
    s.m1 = [step()];
    // 1: the photo of the gang's car, then following it; too close and they see you, and you can try again
    let car = D.R.car;
    t.teleport(car.x + 6, car.z + 3); run(2);
    s.m1.push(step(), !!car.bot);
    for (let i = 0; i < 16 && D.R; i++) { const h = Math.atan2(car.vx, car.vz) || car.h; t.teleport(car.x - Math.sin(h) * 5, car.z - Math.cos(h) * 5); run(0.5); }
    s.seen = { sign: S.signOpen, text: document.getElementById('stLines').textContent, again: document.getElementById('stGo').textContent };
    D.close(true);
    car = D.R.car; t.teleport(car.x + 6, car.z + 3); run(2);
    for (let i = 0; i < 8 && D.R; i++) { const h = Math.atan2(car.vx, car.vz) || car.h; t.teleport(car.x - Math.sin(h) * 35, car.z - Math.cos(h) * 35); run(0.5); }
    s.m1.push(step());
    car.x = D.HIDEOUT.x; car.z = D.HIDEOUT.z; run(0.3);
    const cash = JOBS.earned;
    s.m1.push(S.done, S.signOpen);
    D.close(false);
    // 2: the helicopter over Nationalmuseum, and down on the pad again
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE'); document.getElementById('stGo').click();
    const P = FLY.debug.PAD; t.teleport(P.x + 3, P.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m2 = [FLY.on, step()];
    const H = FLY.heli;
    for (let i = 0; i < 12 && D.R && D.R.i === 1; i++) { H.x = D.MUSEUM.x; H.z = D.MUSEUM.z; H.y = 45; H.vx = H.vy = H.vz = 0; H.ground = false; run(0.5); }
    s.m2.push(step());
    H.x = P.x; H.z = P.z; H.y = 0; H.vy = 0; H.ground = true; run(0.5);
    s.m2.push(S.done);
    D.close(false);
    t.press('KeyE'); run(0.5);
    // 3: at night, the police car, and the gang's car stopped
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE'); document.getElementById('stGo').click();
    s.night = Math.round(DAYNIGHT.hour);
    const pc = D.R.police; t.teleport(pc.x + 2.5, pc.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m3 = [driving && driving.M.id, step()];
    driving.x = D.MUSEUM.x + 20; driving.z = D.MUSEUM.z + 70; run(3);
    const gang = D.R.car;
    s.m3.push(step(), !!gang.getaway, Math.hypot(gang.vx, gang.vz) > 5, S.duty);
    gang.dead = true; run(0.5);
    s.m3.push(S.done, document.getElementById('stGo').textContent);
    // 4 follows straight on: the police boat at the quay, and the thieves' boat caught
    D.close(true);
    t.press('KeyE'); run(0.3);
    const pb = D.R.police, q = boatExitSpot(pb);
    t.teleport(q.x + (pb.x - q.x) * 0.12, q.z + (pb.z - q.z) * 0.12); run(0.3); t.press('KeyE'); run(0.5);
    const tb = D.R.boat;
    s.m4 = [driving && driving.M.id, step()];
    run(5);
    s.m4.push(Math.round(Math.hypot(tb.vx, tb.vz)));
    for (let i = 0; i < 12 && D.R && D.R.i === 1; i++) { driving.x = tb.x + 6; driving.z = tb.z; driving.vx = tb.vx; driving.vz = tb.vz; run(0.5); }
    s.m4.push(S.done);
    // 5: up Kaknästornet and down by the boss's car, flying the parachute
    D.close(true);
    driving.x = 433; driving.z = -290; driving.h = Math.PI; driving.vx = driving.vz = 0; run(0.2); t.press('KeyE'); run(0.3);
    t.teleport(D.TOWER.x, D.TOWER.z); run(0.3); t.press('KeyE'); run(0.5);
    s.m5 = [CHUTE.on, step()];
    t.press('Space');
    for (let i = 0; i < 120 && CHUTE.on; i++) {
      let dh = Math.atan2(D.BOSS.x - player.x, D.BOSS.z - player.z) - CHUTE.debug.S.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      t.key('KeyW', true); t.key('KeyA', dh > 0.1); t.key('KeyD', dh < -0.1); run(0.25);
    }
    t.key('KeyW', false); t.key('KeyA', false); t.key('KeyD', false);
    run(0.5);
    s.m5.push(Math.hypot(player.x - D.BOSS.x, player.z - D.BOSS.z) < 45, S.done, document.getElementById('stTitle').textContent);
    D.close(false);
    s.end = { pay: JOBS.earned - cash, trophy: !!PROGRESS.debug.S.got.hjalte, kept: JSON.parse(localStorage.getItem('gubbe-story')).done, account: ACCOUNT.debug.SAVE.includes('gubbe-story'), duty: S.duty };
    t.press('KeyJ'); s.end.board = document.getElementById('jobsStoryText').textContent; JOBS.board.close();
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.places).toEqual({ water: 0, kicki: true, boss: true });
  expect(r.kicki).toEqual({ there: true, prompt: 'Prata med Kicki' });
  expect(r.offer).toEqual({ open: true, paused: true, title: 'Tipset' });
  expect(r.m1).toEqual(['tips#0', 'tips#2', true, 'tips#2', 1, true]);
  expect(r.seen.sign).toBe(true);
  expect(r.seen.text).toMatch(/såg dig/);
  expect(r.seen.again).toBe('Försök igen');
  expect(r.m2).toEqual([true, 'spaning#1', 'spaning#2', 2]);
  expect(r.night).toBe(2);
  expect(r.m3).toEqual(['polis', 'larm#1', 'larm#2', true, true, true, 3, 'Kör!']);
  expect(r.m4).toEqual(['polisbat', 'bat#1', 16, 4]);
  expect(r.m5).toEqual([true, 'hopp#1', true, 5, 'Hoppet: klart!']);
  // (and maybe a little more, from a daily challenge done on the way)
  expect(r.end.pay).toBeGreaterThanOrEqual(2000 + 3000 + 4000 + 15000);
  expect(r.end.trophy).toBe(true);
  expect(r.end.kept).toBe(5);
  expect(r.end.account).toBe(true);
  expect(r.end.duty).toBe(false);
  // (chapter 2 comes next)
  expect(r.end.board).toMatch(/^Kapitel 2, Kungakronan, uppdrag 1 av 5: Tipsaren/);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('storyn, kapitel 2: tunnelbanan, Högvakten, pariserhjulet, stormen och vattenskotern', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, S = t.story, D = S.debug, s = {};
    const run = (sec) => t.run(sec, 1 / 30, false);
    const step = () => (D.R ? D.R.M.id + '#' + D.R.i : null);
    t.hold(true);
    if (JOBS.job) t.press('KeyJ');
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    t.jobs.reward(500);
    D.done = 5;
    // (chapter 1 done: its five count towards the trophy, also when this test runs on its own)
    for (const M of D.MISSIONS.slice(0, 5)) PROGRESS.did('story', M.id, true);
    // the jet ski's way is water all the way
    let bad = 0;
    for (let i = 1; i < D.JET_PATH.length; i++) {
      const [x0, z0] = D.JET_PATH[i - 1], [x1, z1] = D.JET_PATH[i], L = Math.hypot(x1 - x0, z1 - z0), h = Math.atan2(x1 - x0, z1 - z0);
      for (let d = 0; d <= L; d += 4) if (!boatFits(MODEL.jetski, x0 + (x1 - x0) * d / L, z0 + (z1 - z0) * d / L, h)) bad++;
    }
    s.water = bad;
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE');
    s.offer = [document.getElementById('stKicker').textContent, document.getElementById('stTitle').textContent];
    document.getElementById('stGo').click();
    // 6: the tunnelbana from Gamla stan to Hötorget, then the tipster
    t.teleport(D.GAMLA.x + 1.5, D.GAMLA.z); run(0.3); t.press('KeyE');
    METRO.debug.go(METRO.debug.STOPS.find((x) => x.name === 'Hötorget'));
    s.m6 = [METRO.riding, step()];
    for (let i = 0; i < 60 && METRO.riding; i++) run(1);
    run(0.3);
    s.m6.push(step());
    const tip = D.R.tip; t.teleport(tip.x + 1.5, tip.z); run(0.3);
    s.m6.push(S.done);
    D.close(false);
    // 7: the helper among the tourists at the changing of the guard, and the run after them
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE'); document.getElementById('stGo').click();
    t.teleport(D.CROWD.x, D.CROWD.z + 15); run(0.3);
    s.m7 = [step()];
    const tourist = D.R.crowd.find((p) => p !== D.R.sus), sus = D.R.sus;
    t.teleport(tourist.x + 1.2, tourist.z); run(0.3);
    s.m7.push(step(), !!tourist.told);
    t.teleport(sus.x + 3.5, sus.z); run(0.3);
    s.m7.push(step(), sus.ai.state);
    run(2);
    s.m7.push(Math.hypot(sus.vx, sus.vz) > 3);
    t.teleport(sus.x + 1, sus.z); run(0.3);
    s.m7.push(S.done, !!sus.cuffed);
    D.close(false);
    // 8: up the Ferris wheel, then a soaked chauffeur
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE'); document.getElementById('stGo').click();
    t.teleport(D.WHEEL.x, D.WHEEL.z + 5); run(0.3); t.press('KeyE'); run(0.5);
    s.m8 = [RIDES.ride, step()];
    run(9);
    s.m8.push(step(), SPLASH.count >= 5);
    D.R.driver.wetT = 2; run(0.3);
    s.m8.push(S.done);
    D.close(false);
    for (let i = 0; i < 90 && RIDES.on; i++) run(1);
    // 9: the stormy night, the helicopter over the palace, and the jeep followed from the air
    t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE'); document.getElementById('stGo').click();
    s.storm = [Math.round(DAYNIGHT.hour * 2) / 2, WEATHER.kind];
    const P = FLY.debug.PAD, H = FLY.heli;
    FLY.debug.home(); t.teleport(P.x + 3, P.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m9 = [FLY.on, step()];
    H.x = D.PALACE.x + 20; H.z = D.PALACE.z + 20; H.y = 40; H.vx = H.vy = H.vz = 0; H.ground = false; run(0.3);
    const jeep = D.R.car;
    s.m9.push(step(), jeep && jeep.M.id, !!(jeep && jeep.getaway));
    for (let i = 0; i < 60 && D.R && D.R.i === 2; i++) { H.x = jeep.x + 10; H.z = jeep.z; H.y = 50; H.vx = H.vy = H.vz = 0; run(1); }
    s.m9.push(S.done, document.getElementById('stGo').textContent);
    // 10 follows straight on: down from the helicopter, onto the police jet ski, and alongside his
    D.close(true);
    H.x = 600; H.z = -700; H.y = 0; H.vy = 0; H.ground = true; run(0.3); t.press('KeyE'); run(0.3);
    const pj = D.R.police, q = boatExitSpot(pj);
    t.teleport(q.x + (pj.x - q.x) * 0.12, q.z + (pj.z - q.z) * 0.12); run(0.3); t.press('KeyE'); run(0.5);
    const js = D.R.boat;
    s.m10 = [driving && driving.M.id, step()];
    run(6);
    s.m10.push(Math.round(Math.hypot(js.vx, js.vz)));
    for (let i = 0; i < 12 && D.R && D.R.i === 1; i++) { driving.x = js.x + 4; driving.z = js.z; driving.vx = js.vx; driving.vz = js.vz; run(0.5); }
    s.m10.push(S.done, document.getElementById('stTitle').textContent, document.getElementById('stPay').textContent);
    D.close(false);
    s.trophy = !!PROGRESS.debug.S.got.kronan;
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.water).toBe(0);
  expect(r.offer).toEqual(['Kapitel 2: Kungakronan · uppdrag 1 av 5', 'Tipsaren']);
  expect(r.m6).toEqual([true, 'tipsare#0', 'tipsare#1', 6]);
  expect(r.m7).toEqual(['vakt#1', 'vakt#1', true, 'vakt#2', 'flee', true, 7, true]);
  expect(r.m8).toEqual(['wheel', 'hjulet#1', 'hjulet#2', true, 8]);
  expect(r.storm).toEqual([23.5, 1]);
  expect(r.m9).toEqual([true, 'storm#1', 'storm#2', 'g63', true, 9, 'Kör!']);
  expect(r.m10[0]).toBe('polisjet');
  expect(r.m10[1]).toBe('jet#1');
  expect(r.m10[2]).toBe(21);
  expect(r.m10[3]).toBe(10);
  expect(r.m10[4]).toBe('Vattenskotern: klart!');
  expect(r.m10[5]).toMatch(/klarat kapitel 2/);
  expect(r.trophy).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('storyn, kapitel 3: rymningen, skuggningen, lagret, skåpbilen och finalen på Globen', async () => {
  const r = await page.evaluate(() => {
    const t = gubbeTest, S = t.story, D = S.debug, s = {};
    const run = (sec) => t.run(sec, 1 / 30, false);
    const step = () => (D.R ? D.R.M.id + '#' + D.R.i : null);
    const kicki = () => { t.teleport(D.KICKI.x + 1.5, D.KICKI.z); run(0.3); t.press('KeyE'); };
    const behind = (o, h, d) => ({ x: o.x - Math.sin(h) * d, z: o.z - Math.cos(h) * d });
    // (started already, unless this test runs on its own)
    if (!started) t.start();
    t.hold(true);
    if (JOBS.job) t.press('KeyJ');
    // (out on the water on chapter 2's jet ski: in to a berth first, where you can step ashore)
    if (driving && driving.M.boat) { const b = findBerth(driving.M, 600, -680, 80); Object.assign(driving, { x: b.x, z: b.z, h: b.h, vx: 0, vz: 0 }); run(0.3); }
    if (t.state().driving) t.press('KeyE');
    if (t.wanted) t.endChase(false);
    D.done = 10;
    // (chapters 1 and 2 done: their ten count towards the trophy, also when this test runs on its own)
    for (const M of D.MISSIONS.slice(0, 10)) PROGRESS.did('story', M.id, true);
    // the helper and the meeting on the pavement, the roofs by the warehouse well under where they hear you, and
    // Globen's roof one to land on
    s.places = {
      walk: walkable(D.BIRGER.x, D.BIRGER.z) && walkable(D.STUREPLAN.x, D.STUREPLAN.z),
      roofs: Math.max(...D.SHOTS.map((p) => FLY.heightAt(p.x, p.z, 30))) < D.LOW - 10,
      globen: FLY.heightAt(D.GLOBEN.x, D.GLOBEN.z, 3)
    };
    kicki();
    s.offer = [document.getElementById('stKicker').textContent, document.getElementById('stTitle').textContent];
    document.getElementById('stGo').click();
    // 11: at night, the police car, and Mästaren's car from Centralbron kept up with until he runs for it
    s.night = Math.round(DAYNIGHT.hour * 2) / 2;
    let pc = D.R.police; t.teleport(pc.x + 2.5, pc.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m11 = [driving && driving.M.id, step()];
    driving.x = D.CENTRALBRON.x; driving.z = D.CENTRALBRON.z - 120; driving.vx = driving.vz = 0; run(0.5);
    const bmw = D.R.car;
    s.m11.push(step(), bmw && bmw.M.id, !!(bmw && bmw.getaway));
    for (let i = 0; i < 45 && D.R && D.R.i === 2; i++) { const q = behind(bmw, Math.atan2(bmw.vx, bmw.vz) || bmw.h, 25); driving.x = q.x; driving.z = q.z; driving.vx = bmw.vx; driving.vz = bmw.vz; run(1); }
    s.m11.push(step(), D.R && D.R.boss.ai.state, !!bmw.occupant);
    driving.vx = driving.vz = 0; run(0.3); t.press('KeyE'); run(0.3);
    const door = exitSpot(bmw) || { x: bmw.x + 2.5, z: bmw.z }; t.teleport(door.x, door.z); run(0.3);
    s.m11.push(S.done);
    D.close(false);
    // 12: the helper followed on foot to Stureplan, not too close, and the meeting photographed
    kicki(); document.getElementById('stGo').click();
    const helper = D.R.helper, contact = D.R.contact;
    t.teleport(helper.x + 20, helper.z); run(0.3);
    s.m12 = [step(), helper.ai.state];
    for (let i = 0; i < 400 && D.R && D.R.i === 1; i++) { const q = behind(helper, helper.rot, 15); t.teleport(q.x, q.z); run(0.5); }
    s.m12.push(step(), Math.hypot(helper.x - contact.x, helper.z - contact.z) < 2.5);
    player.vx = player.vz = 0; run(4);
    s.m12.push(S.done);
    D.close(false);
    // 13: the helicopter over the warehouse: too low and they hear it, and three photos from high enough
    kicki(); document.getElementById('stGo').click();
    const P = FLY.debug.PAD, H = FLY.heli;
    FLY.debug.home(); t.teleport(P.x + 3, P.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m13 = [FLY.on, step()];
    const hover = (x, z, y) => { H.x = x; H.z = z; H.y = y; H.vx = H.vy = H.vz = 0; H.ground = false; };
    hover(D.SHOTS[0].x, D.SHOTS[0].z, D.LOW - 10); run(1);
    s.m13.push(/För lågt/.test(D.R.note));
    for (const p of D.SHOTS) for (let i = 0; i < 8 && D.R && D.R.i === 1; i++) { hover(p.x, p.z, D.LOW + 15); run(0.5); }
    s.m13.push(S.done);
    D.close(false);
    hover(P.x, P.z, 0); H.ground = true; run(0.5); t.press('KeyE'); run(0.5);
    // 14: in the evening, the police car to the warehouse, and the gang's van stopped on its way to Globen
    kicki(); document.getElementById('stGo').click();
    s.evening = Math.round(DAYNIGHT.hour);
    pc = D.R.police; t.teleport(pc.x + 2.5, pc.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m14 = [driving && driving.M.id, step()];
    const n = nearestNode(D.LAGER.x - 150, D.LAGER.z); driving.x = nodes[n].x; driving.z = nodes[n].z; driving.vx = driving.vz = 0; run(0.5);
    const van = D.R.van;
    s.m14.push(step(), !!van.getaway);
    run(4);
    s.m14.push(Math.hypot(van.vx, van.vz) > 3);
    van.dead = true; run(0.5);
    s.m14.push(S.done);
    D.close(false);
    driving.vx = driving.vz = 0; run(0.3); t.press('KeyE'); run(0.3);
    // 15: the helicopter onto Globen's roof, his McLaren followed from the air, and Mästaren run down on foot
    kicki(); document.getElementById('stGo').click();
    FLY.debug.home(); t.teleport(P.x + 3, P.z); run(0.3); t.press('KeyE'); run(0.3);
    s.m15 = [FLY.on, step()];
    hover(D.GLOBEN.x, D.GLOBEN.z, 86); H.vy = -1; run(1);
    const mc = D.R.car;
    s.m15.push(H.ground, step(), mc && mc.M.id, !!(mc && mc.getaway));
    for (let i = 0; i < 40 && D.R && D.R.i === 2; i++) { hover(mc.x + 10, mc.z, 50); run(1); }
    const boss = D.R.boss;
    s.m15.push(step(), boss && boss.ai.state);
    const land = behind(mc, mc.h, 14); hover(land.x, land.z, 0); H.ground = true; run(0.3); t.press('KeyE'); run(0.3);
    s.m15.push(FLY.on);
    t.teleport(boss.x + 1, boss.z); run(0.3);
    s.m15.push(S.done, !!boss.cuffed, document.getElementById('stTitle').textContent, document.getElementById('stPay').textContent);
    D.close(false);
    s.trophy = !!PROGRESS.debug.S.got.mastaren;
    // Kicki's thanks, and the job board says the story is done
    kicki(); s.thanks = document.getElementById('stLines').textContent; D.close(false);
    t.press('KeyJ'); s.board = document.getElementById('jobsStoryText').textContent; JOBS.board.close();
    s.bad = t.state().bad;
    t.hold(false);
    return s;
  });
  expect(r.places).toEqual({ walk: true, roofs: true, globen: 85 });
  expect(r.offer).toEqual(['Kapitel 3: Mästarens hämnd · uppdrag 1 av 5', 'Rymningen']);
  expect(r.night).toBe(1.5);
  expect(r.m11).toEqual(['polis', 'rymning#1', 'rymning#2', 'm4', true, 'rymning#3', 'flee', false, 11]);
  expect(r.m12).toEqual(['telefon#1', 'goto', 'telefon#2', true, 12]);
  expect(r.m13).toEqual([true, 'lager#1', true, 13]);
  expect(r.evening).toBe(22);
  expect(r.m14).toEqual(['polis', 'fallan#1', 'fallan#2', true, true, 14]);
  expect(r.m15).toEqual([true, 'globen#1', true, 'globen#2', 'mclaren720', true, 'globen#3', 'flee', false, 15, true, 'Finalen på Globen: klart!', expect.stringMatching(/klarat hela storyn/)]);
  expect(r.trophy).toBe(true);
  expect(r.thanks).toMatch(/Mästaren sitter inlåst/);
  expect(r.board).toMatch(/Mästarens hämnd/);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});

// (last: it loads the page again, with every Dalahäst found)
test('alla dalahästar hittade sedan förut: spelet laddar och trofén delas ut', async () => {
  await page.evaluate(() => { localStorage.setItem('gubbe-dalahastar', JSON.stringify(HORSES.map((h) => h[0]))); localStorage.removeItem('gubbe-niva'); });
  await page.reload();
  await page.waitForFunction(() => window.gubbeTest);
  const r = await page.evaluate(() => {
    const t = gubbeTest;
    t.start(); t.run(1, 1 / 30, false);
    return { horses: PROGRESS.debug.S.st.horses.length, dala: !!PROGRESS.debug.S.got.dala, bad: t.state().bad };
  });
  expect(r.horses).toBe(20);
  expect(r.dala).toBe(true);
  expect(r.bad).toEqual([]);
  expect(errors).toEqual([]);
});
