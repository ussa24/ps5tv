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

    // Backup entry (Settings → Network → View PSN status) lands on Sony's status site; check it leads to a Google sign-in page.
    test('PSN status page → Blog → YouTube → Google sign-in', async ({ page }) => {
      await page.goto('https://status.playstation.com/');
      const blog = page.getByRole('link', { name: 'Blog', exact: true }).first();
      await expect(blog).toBeAttached({ timeout: 20000 });
      const psHref = await blog.getAttribute('href');
      await page.goto(psHref);
      await expect(page).toHaveURL(/blog\.playstation\.com/);
      const yt = page.locator('a[href*="youtube.com"]').first();
      await expect(yt).toBeAttached({ timeout: 20000 });
      const ytHref = await yt.getAttribute('href');
      await page.goto(ytHref);
      // In the EU YouTube first shows a cookie wall; its own "Terms" link reaches Google's Terms page without accepting
      // anything. Elsewhere YouTube loads directly and its "Sign in" leads to the Google sign-in page instead.
      // Both links are script-driven (no href), so they have to be clicked; they may open a new window.
      const terms = page.getByRole('link', { name: /^(Terms|Sign in)$/ }).last();
      await expect(terms).toBeVisible({ timeout: 20000 });
      const label = (await terms.textContent()).trim();
      let landed = null;
      await expect(async () => {
        await terms.click();
        await expect.poll(() => {
          landed = page.context().pages().find(p => /policies\.google\.com\/terms|accounts\.google\.com/.test(p.url())) || null;
          return !!landed;
        }, { timeout: 8000 }).toBe(true);
      }).toPass({ timeout: 40000 });
      console.log(name, 'status →', psHref, '→', ytHref, '→', label, '→', landed.url().slice(0, 50));
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
      // GitHub's search page can swallow a click made before its scripts finish loading; click again like a person would.
      await expect(async () => {
        await result.click();
        await expect(page).toHaveURL(/github\.com\/ussa24\/ps5tv\/?$/, { timeout: 5000 });
      }).toPass({ timeout: 30000 });
      // GitHub renders the About box twice (wide and narrow layouts); take the visible copy.
      const site = page.locator('a[href="https://ussa24.github.io/ps5tv/probe/"]').filter({ visible: true }).first();
      await expect(site).toBeVisible({ timeout: 20000 });
      // The link has target=_blank: desktop WebKit may open a new tab, the single-window PS5 browser likely won't.
      // Same as above, the first click can come before GitHub's scripts are ready, so retry until a window shows the probe.
      let landed = null;
      await expect(async () => {
        await site.click();
        await expect.poll(() => {
          landed = page.context().pages().find(p => /ussa24\.github\.io\/ps5tv\/probe/.test(p.url())) || null;
          return !!landed;
        }, { timeout: 8000 }).toBe(true);
      }).toPass({ timeout: 40000 });
      await expect(landed).toHaveTitle('PS5 TV Probe', { timeout: 20000 });
      console.log(name, 'reached', landed.url(), landed === page ? '(same window)' : '(new window)');
    });
  });
}
