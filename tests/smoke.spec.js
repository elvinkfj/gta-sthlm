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
