// Invariants: while the code is being split into files (PLAN.md), the game must look and count exactly the same.
// Math.random is seeded so the traffic comes out the same every time. After a real change to the game, record a new
// baseline with `npm run baseline` and commit tests/baseline.json and tests/baseline.png.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const BASELINE = path.join(__dirname, 'baseline.json');
test('spelet ser likadant ut som i baseline', async ({ page }) => {
  const UPDATE = test.info().config.updateSnapshots === 'all';
  await page.addInitScript(() => {
    let s = 1;
    Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    // no frame loop: it would step the game with real time before the test starts, more often on a slow machine
    window.requestAnimationFrame = () => 0;
  });
  await page.goto(GAME);
  await page.waitForFunction(() => window.gubbeTest);
  const now = await page.evaluate(() => {
    const t = gubbeTest;
    const x = 239.5, z = 95.8;
    t.start();
    t.teleport(x, z);
    t.run(5);
    t.shot(x + 30, 25, z + 30, x, 0, z);
    const { calls, triangles, geometries } = t.info();
    return { calls, triangles, geometries, models: t.MODELS.length, mapProblems: t.mapProblems().length };
  });
  // only the 3D picture: hide the HUD, the maps and the start sign on top of it
  await page.addStyleTag({ content: 'body > :not(#game) { visibility: hidden !important; }' });
  const shot = await page.locator('#game').screenshot();

  if (UPDATE) fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
  expect(now).toEqual(JSON.parse(fs.readFileSync(BASELINE, 'utf8')));
  expect(shot).toMatchSnapshot('baseline.png', { maxDiffPixelRatio: 0.01 });
});
