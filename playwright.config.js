// @ts-check
const { defineConfig } = require('@playwright/test');

// Approximate PS5 browser user agent; the real one is captured by the probe itself.
const PS5_UA = 'Mozilla/5.0 (PlayStation; PlayStation 5/14.10) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 300000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1920, height: 1080 }, userAgent: PS5_UA },
  webServer: { command: 'node tests/server.js', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'webkit-ps5', use: { browserName: 'webkit' } },
    // Edge ships H.264/AAC, so it checks that the playback tests pass when codecs exist.
    { name: 'edge-playback', use: { browserName: 'chromium', channel: 'msedge' } },
  ],
});
