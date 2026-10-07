// Captures the submission screenshots from the running app (offline Munich demo).
// Usage: BASE=http://localhost:5173 node submission/scripts/shots.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../video/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:5173';
const out = new URL('../shots/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto(base + '/?store=local');
await page.evaluate(() => localStorage.clear());
await page.goto(base + '/?store=local');
await page.getByTestId('open-demo').click();
await page.waitForSelector('[data-testid=schedule-card]');
await page.waitForTimeout(800);

// 1. Suggestions (swipe deck)
await page.getByTestId('step-swiping').click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: /search again/i }).first().click();
await page.waitForTimeout(500);
await page.getByTestId('search-input').fill('Rainy afternoon ideas');
await page.getByTestId('search-submit').click();
await page.waitForTimeout(5000);
await page.screenshot({ path: out + '1-swipe.png' });

// 2. Schedule with conflict while dragging Residenz after check-in
await page.getByTestId('step-scheduling').click();
await page.waitForSelector('[data-testid=schedule-card]');
await page.waitForTimeout(600);
const residenz = page.locator('[data-testid=schedule-card][data-title*="Residenz"]');
const checkin = page.locator('[data-testid=schedule-card][data-title*="Check in"]');
await checkin.scrollIntoViewIfNeeded();
const a = await residenz.boundingBox();
const b = await checkin.boundingBox();
await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
await page.mouse.down();
await page.waitForTimeout(250);
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + ((b.y + b.height + 8 - a.y - a.height / 2) * i) / 20);
  await page.waitForTimeout(30);
}
await page.waitForTimeout(500);
await page.screenshot({ path: out + '2-conflict.png' });
await page.mouse.up();
await page.waitForTimeout(600);
await page.screenshot({ path: out + '2b-after-drop.png' });

// 3. Card detail with sources
await page.waitForTimeout(5000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('[data-testid=schedule-card][data-title*="Viktualienmarkt"]').click();
await page.waitForTimeout(900);
await page.screenshot({ path: out + '3-detail.png' });
console.log('saved to', out);
await browser.close();
