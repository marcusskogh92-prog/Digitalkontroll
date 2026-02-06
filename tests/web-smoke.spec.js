const { test, expect } = require('@playwright/test');

test('web smoke: loads app, title set, Ionicons font served', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/DigitalKontroll/i);

  // Fonts are typically loaded shortly after boot.
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await page.waitForFunction(
    () => {
      if (!document.fonts) return false;
      return Array.from(document.fonts).some((font) => /ionicons/i.test(font.family));
    },
    { timeout: 15_000 }
  );
});
