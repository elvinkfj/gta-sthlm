// Playwright runs the tests in tests/ in a headless Chromium. The game is opened straight from disk (file://), like Elvin plays it.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    // software WebGL, so the test also runs on machines without a graphics card (like GitHub's)
    launchOptions: { args: ['--enable-unsafe-swiftshader'] }
  }
});
