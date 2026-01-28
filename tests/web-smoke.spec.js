const { test, expect } = require('@playwright/test');

test('web smoke: loads app, title set, Ionicons font served', async ({ page }) => {
  const ioniconsUrls = [];

  page.on('response', (res) => {
    try {
      const url = res.url();
      if (/Ionicons\..*\.(ttf|otf|woff2?)(\?|$)/i.test(url)) {
        ioniconsUrls.push(url);
      }
    } catch (_e) {}
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/DigitalKontroll/i);

  // Fonts are typically loaded shortly after boot.
  const ioniconsResponse = await page.waitForResponse(
    (res) => /Ionicons\..*\.(ttf|otf|woff2?)(\?|$)/i.test(res.url()) && res.status() === 200,
    { timeout: 15_000 }
  );

  expect(ioniconsResponse.status()).toBe(200);
  expect(ioniconsUrls.length).toBeGreaterThan(0);
});
