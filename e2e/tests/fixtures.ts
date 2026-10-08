import { test as base, expect, type Locator, type Page } from '@playwright/test';

export type Mode = 'local' | 'supabase';

/** Console errors / page errors collected during a test; asserted empty after each test. */
export const test = base.extend<{ consoleErrors: string[]; mode: Mode }>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()} @ ${msg.location().url}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await use(errors);
  }, { auto: true }],
  mode: async ({ page, baseURL }, use) => {
    const res = await page.request.get(`${baseURL}/api/config`).catch(() => null);
    let mode: Mode = 'local';
    if (res && res.ok() && (res.headers()['content-type'] ?? '').includes('json')) {
      const cfg = (await res.json()) as { supabaseUrl?: string };
      if (cfg.supabaseUrl) mode = 'supabase';
    }
    await use(mode);
  },
});

test.afterEach(async ({ consoleErrors }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    expect(consoleErrors, 'no console errors').toEqual([]);
  }
});

export { expect };

export const SAT = '2027-10-02';
export const SUN = '2027-10-03';

export async function openDemo(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-demo').click();
  await page.waitForURL(/\/trip\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByTestId('step-scheduling')).toHaveAttribute('aria-current', 'step', { timeout: 20_000 });
  await expect(page.getByTestId('schedule-card').first()).toBeVisible();
}

export function scheduleCard(page: Page, title: string): Locator {
  return page.locator(`[data-testid="schedule-card"][data-title="${title}"]`);
}

/** Card titles of the visible day, in order. */
export async function dayOrder(page: Page): Promise<string[]> {
  return page.getByTestId('schedule-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-title') ?? ''));
}

export async function startTimeOf(page: Page, card: Locator): Promise<string> {
  return (await page.locator('li.tl-row', { has: card }).locator('.tl-start').innerText()).trim();
}

/**
 * Starts a @dnd-kit mouse drag on `source` (down + a few ≥6 px moves). Returns helpers to hover a target and drop.
 */
export async function beginDrag(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const box = await stableBox(page, source);
  // Grab the left part of the card (not the image link / buttons), vertically centred.
  const x = box.x + Math.min(box.width / 2, 120);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(x, y + i * 4);
  await expect(page.locator('.schedule.is-dragging')).toBeVisible();
  return {
    async hover(target: Locator) {
      await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const t = await stableBox(page, target);
      const tx = t.x + t.width / 2;
      const ty = t.y + t.height / 2;
      await page.mouse.move(tx, ty - 6, { steps: 8 });
      await page.mouse.move(tx, ty, { steps: 3 });
    },
    async drop() {
      await page.mouse.up();
      await expect(page.locator('.schedule.is-dragging')).toHaveCount(0);
    },
  };
}

/** Bounding box once the element has stopped moving (drawer / sheet animations). */
export async function stableBox(page: Page, el: Locator) {
  let prev = await el.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(80);
    const cur = await el.boundingBox();
    if (prev && cur && Math.abs(prev.x - cur.x) < 0.5 && Math.abs(prev.y - cur.y) < 0.5 && Math.abs(prev.height - cur.height) < 0.5) return cur;
    prev = cur;
  }
  if (!prev) throw new Error('element not visible');
  return prev;
}
