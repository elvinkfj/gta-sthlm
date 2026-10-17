// Playwright runs the tests in tests/ in a headless Chromium. The game is opened straight from disk (file://), like Elvin plays it.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 90000,
  // one worker per test file: the smoke test and the baseline load the game side by side
  workers: 2,
  reporter: 'list',
  // the baseline screenshot lies next to baseline.json
  snapshotPathTemplate: '{testDir}/{arg}{ext}',
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    // software WebGL, so the test also runs on machines without a graphics card (like GitHub's)
    launchOptions: { args: ['--enable-unsafe-swiftshader'] }
  }
});
