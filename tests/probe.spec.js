// Runs the probe end to end the way a PS5 user would: wait, press each prompted button, read the QR payload.
const { test, expect } = require('@playwright/test');
const zlib = require('zlib');

const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', x: 'Enter', sq: 'KeyS', tri: 'KeyT',
  l1: 'KeyQ', r1: 'KeyE', l2: 'Digit1', r2: 'Digit2', opt: 'KeyO', lsr: null, rsd: null, o: 'Escape' };

function decode(text) {
  if (text.startsWith('PS5P1Z:')) return JSON.parse(zlib.inflateRawSync(Buffer.from(text.slice(7).replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString());
  return JSON.parse(text.slice(7));
}

test('probe completes and produces a decodable result', async ({ page }, info) => {
  const errors = [];
  // WebKit reports the deliberate no-CORS probe of example.com as a page error; that one is expected.
  page.on('pageerror', e => { if (!/access control checks/.test(e.message)) errors.push(e.message); });
  await page.goto('probe/');
  await expect(page.locator('#keysPanel')).toBeVisible({ timeout: 240000 });

  // Answer the controller prompts; sticks have no keyboard equivalent, so those steps time out (as on a pad-less run).
  for (const [id, key] of Object.entries(KEYS)) {
    const label = await page.locator('#prompt span').textContent();
    if (key) { await page.keyboard.press(key); }
    await expect(page.locator('#prompt span')).not.toHaveText(label, { timeout: 15000 });
  }
  await page.locator('#fsBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-done', '1', { timeout: 60000 });

  const text = await page.evaluate(() => window.PS5PROBE_RESULT);
  const r = decode(text);
  await info.attach('result.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  console.log(info.project.name, 'payload chars:', text.length, '\n', JSON.stringify({ play: r.play, net: r.net, perf: r.perf, fs: r.fs, keysUp: r.keys.up, keysO: r.keys.o }, null, 1));

  expect(r.v).toBe('p1');
  expect(Object.keys(r.keys)).toHaveLength(15);
  expect(r.keys.up.k).toBe('ArrowUp');
  expect(r.keys.o.pop || r.keys.o.k).toBeTruthy();
  expect(r.pers.ls).toBe(0); // fresh browser context: no marker from a previous visit
  expect(errors).toEqual([]);
  if (info.project.name === 'edge-playback') {
    expect(r.play.hlsjsVod.ok).toBe(1);
    expect(r.play.hlsjsLive.ok).toBe(1);
    expect(r.play.mpegts.ok).toBe(1);
  }
});

test('second visit sees persisted marker and reuses controller results', async ({ page }) => {
  // Seed storage from the landing page (same origin) so a running probe can't overwrite the marker.
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('ps5probe.marker', JSON.stringify({ t: '2026-01-01T00:00:00.000Z', n: 1 }));
    const steps = {}; ['up','down','left','right','x','sq','tri','l1','r1','l2','r2','opt','lsr','rsd','o'].forEach(k => steps[k] = { none: 1 });
    localStorage.setItem('ps5probe.keys', JSON.stringify({ v: 'p1', steps }));
  });
  await page.goto('probe/');
  await expect(page.locator('#fsButtons')).toBeVisible({ timeout: 240000 });
  await page.locator('#skipBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-done', '1', { timeout: 30000 });
  const r = decode(await page.evaluate(() => window.PS5PROBE_RESULT));
  expect(r.visit).toBe(2);
  expect(r.pers.ls).toBe('2026-01-01T00:00:00.000Z');
});
