// Walks the live web hops of the message-free route into the PS5 browser, logged out, with PS5-like user agents.
// Hits real third-party sites, so it only runs when asked: ROUTE=1 npx playwright test entry-route --project=webkit-ps5
// It deliberately does not run a Google search (automated queries are against Google's terms); that one hop is manual.
const { test, expect } = require('@playwright/test');

test.skip(!process.env.ROUTE, 'set ROUTE=1 to walk the live entry route');

const UAS = {
  // Format seen in PS5 UA reports; the exact string is captured by the probe on the real console.
  ps5Plain: 'Mozilla/5.0 (PlayStation; PlayStation 5/14.10) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  ps5Safari: 'Mozilla/5.0 (PlayStation; PlayStation 5/14.10) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
};

for (const [name, ua] of Object.entries(UAS)) {
  test.describe(name, () => {
    test.use({ userAgent: ua });

    test('Google sign-in page → Terms → Google home', async ({ page }) => {
      await page.goto('https://accounts.google.com/ServiceLogin?hl=en');
      // Footer link reads "Terms"; its accessible name is "Google Terms of Service (external, …)".
      const terms = page.getByRole('link', { name: /Terms of Service/ });
      await expect(terms).toBeVisible({ timeout: 20000 });
      // The real flow stays in one window; follow the href instead of a possible new tab.
      await page.goto(await terms.getAttribute('href'));
      await expect(page).toHaveURL(/policies\.google\.com\/terms/);
      const home = page.locator('a[href^="https://www.google.com"], a[href="https://google.com"], a[aria-label="Google"]').first();
      await expect(home).toBeAttached({ timeout: 20000 });
      const href = await home.getAttribute('href');
      console.log(name, 'Terms page links to Google home:', href);
      expect(href).toMatch(/^https:\/\/(www\.)?google\.[a-z.]+\/?/);
    });

    test('github.com → search "ps5tv" → repo → Website link → probe', async ({ page }) => {
      await page.goto('https://github.com/');
      // Logged-out GitHub shows a search button that opens a "Quick search" dialog.
      await page.getByRole('button', { name: /search/i }).first().click();
      const box = page.getByRole('combobox', { name: /Search or jump to/ });
      await box.fill('ps5tv');
      await box.press('Enter');
      await expect(page).toHaveURL(/github\.com\/search/, { timeout: 20000 });
      const result = page.getByRole('link', { name: 'ussa24/ps5tv' }).first();
      await expect(result).toBeVisible({ timeout: 20000 });
      await result.click();
      await expect(page).toHaveURL(/github\.com\/ussa24\/ps5tv\/?$/, { timeout: 20000 });
      // GitHub renders the About box twice (wide and narrow layouts); take the visible copy.
      const site = page.locator('a[href="https://ussa24.github.io/ps5tv/probe/"]').filter({ visible: true }).first();
      await expect(site).toBeVisible({ timeout: 20000 });
      await site.click();
      await expect(page).toHaveTitle('PS5 TV Probe', { timeout: 20000 });
      console.log(name, 'reached', page.url());
    });
  });
}
