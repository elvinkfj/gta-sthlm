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
    PARTY.debug.begin(['me', 'f1']);
    const G = () => PARTY.debug.G, s = {};
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
