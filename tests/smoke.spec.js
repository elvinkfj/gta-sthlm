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
