import type { Page } from '@playwright/test';
import { test, expect, openDemo, scheduleCard, dayOrder, startTimeOf, beginDrag, SAT, SUN } from './fixtures';

const SCHUMANNS = "Cocktails at Schumann's";
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

test.describe('landing', () => {
  test('landing renders and opens the Munich demo', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('actually fit');
    await expect(page.getByTestId('open-demo')).toBeEnabled();
    await expect(page.getByTestId('new-trip')).toBeEnabled();
    await openDemo(page);
    await expect(page.locator('.trip-title')).toContainText('Munich');
    await expect(page.getByTestId('day-tab')).toHaveCount(2);
  });

  test('/?demo=munich deep link opens the demo', async ({ page }) => {
    await page.goto('/?demo=munich');
    await page.waitForURL(/\/trip\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByTestId('schedule-card').first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('schedule', () => {
  test.beforeEach(async ({ page }) => openDemo(page));

  test('day tabs: Sat 2 / Sun 3 Oct with the holiday marker on Sunday', async ({ page }) => {
    const sat = page.locator(`[data-testid="day-tab"][data-day="${SAT}"]`);
    const sun = page.locator(`[data-testid="day-tab"][data-day="${SUN}"]`);
    await expect(sat).toContainText('Sat');
    await expect(sun).toContainText('Sun');
    await expect(sat).toHaveAttribute('aria-selected', 'true');
    await expect(sat.locator('.day-hol')).toHaveCount(0);
    await expect(sun.locator('.day-hol')).toHaveText('Holiday');
    await expect(page.locator('.holiday-note')).toHaveCount(0);
    expect(await dayOrder(page)).toEqual([
      'ICE arrival at München Hbf', 'Drop luggage at Hotel Uhland', 'Glockenspiel at Marienplatz',
      'Frauenkirche & south tower view', 'Lunch at Weisses Bräuhaus', 'Viktualienmarkt stroll', 'Residenz München',
      'Check in at Hotel Uhland', 'Dinner at Augustiner-Keller',
    ]);
    // The prepared plan has no blockers.
    await expect(page.locator('.day-counts .sev-blocker')).toHaveCount(0);

    await sun.click();
    await expect(sun).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.holiday-note')).toContainText(/German Unity Day|Tag der Deutschen Einheit/);
    expect(await dayOrder(page)).toContain('Böllerschießen at the Bavaria');
    expect(await startTimeOf(page, scheduleCard(page, 'Böllerschießen at the Bavaria'))).toBe('12:00');
  });

  test('Residenz after the hotel check-in is blocked with the exact reason and snaps back', async ({ page }) => {
    const before = await dayOrder(page);
    const residenzStart = await startTimeOf(page, scheduleCard(page, 'Residenz München'));
    expect(residenzStart).toBe('15:21');
    const drag = await beginDrag(page, scheduleCard(page, 'Residenz München'));
    // Rest order without the Residenz: … Viktualienmarkt(5), Check-in(6), Dinner(7) -> slot 7 = right after check-in.
    const slot = page.locator('[data-testid="drop-slot"][data-slot="7"]');
    await expect(slot).toHaveAttribute('data-severity', 'blocker');
    await drag.hover(slot);
    await expect(slot).toHaveClass(/is-over/);
    const reason = 'Visit ends at 18:40, after Residenz München closes at 18:00';
    await expect(slot).toContainText(reason);
    await expect(page.locator('.drag-hint')).toContainText('Can’t go here.');
    await expect(page.locator('.drag-hint')).toContainText(reason);
    await page.screenshot({ path: 'screenshots/residenz-conflict-hover.png' });
    await drag.drop();
    await expect(page.locator('.toast').filter({ hasText: 'Can’t place it there' })).toBeVisible();
    expect(await dayOrder(page)).toEqual(before);
    expect(await startTimeOf(page, scheduleCard(page, 'Residenz München'))).toBe(residenzStart);
  });

  test('Residenz after dinner is blocked (starts after closing)', async ({ page }) => {
    const drag = await beginDrag(page, scheduleCard(page, 'Residenz München'));
    const slot = page.locator('[data-testid="drop-slot"][data-slot="8"]');
    await drag.hover(slot);
    await expect(slot).toHaveClass(/is-over/);
    await expect(slot).toHaveAttribute('data-severity', 'blocker');
    await expect(slot).toContainText('Visit starts at 18:46, after Residenz München closes at 18:00');
    await drag.drop();
  });

  test('drawer card into a needs-checking slot is allowed with a badge, then back to the drawer', async ({ page }) => {
    await page.getByTestId('drawer-toggle').click();
    const drawerCard = page.locator(`[data-testid="drawer-card"][data-title="${SCHUMANNS}"]`);
    await expect(drawerCard).toBeVisible();
    const drag = await beginDrag(page, drawerCard);
    // The drawer collapses to peek while dragging; slot 9 = after dinner (9 cards on Sat).
    const slot = page.locator('[data-testid="drop-slot"][data-slot="9"]');
    await drag.hover(slot);
    await expect(slot).toHaveClass(/is-over/);
    await expect(slot).toHaveAttribute('data-severity', 'needs_checking');
    await page.screenshot({ path: 'screenshots/schumanns-needs-checking-hover.png' });
    await drag.drop();
    await expect(page.locator('.toast').filter({ hasText: 'Placed – needs checking' })).toBeVisible();
    const card = scheduleCard(page, SCHUMANNS);
    await expect(card).toBeVisible();
    expect((await dayOrder(page)).at(-1)).toBe(SCHUMANNS);
    await expect(card).toHaveClass(/sev-needs_checking/);
    await expect(card.locator('.tl-issues')).toBeVisible();
    await expect(page.locator(`[data-testid="drawer-card"][data-title="${SCHUMANNS}"]`)).toHaveCount(0);
    await page.screenshot({ path: 'screenshots/schumanns-placed.png' });

    // ...and drag it back into the drawer.
    const back = await beginDrag(page, card);
    await expect(page.locator('.drawer-drop-hint')).toBeVisible();
    await back.hover(page.getByTestId('drawer-handle'));
    await expect(page.locator('.drag-hint')).toContainText('Release to move it back to the drawer');
    await back.drop();
    await expect(page.locator('.toast').filter({ hasText: 'Moved to the drawer' })).toBeVisible();
    await expect(scheduleCard(page, SCHUMANNS)).toHaveCount(0);
    await page.getByTestId('drawer-toggle').click();
    await expect(page.locator(`[data-testid="drawer-card"][data-title="${SCHUMANNS}"]`)).toBeVisible();
  });

  test('Deutsches Museum from the drawer after the Residenz is blocked (conflict G)', async ({ page }) => {
    await page.getByTestId('drawer-toggle').click();
    const drag = await beginDrag(page, page.locator('[data-testid="drawer-card"][data-title="Deutsches Museum"]'));
    // After the Residenz (index 6) = slot 7.
    const slot = page.locator('[data-testid="drop-slot"][data-slot="7"]');
    await drag.hover(slot);
    await expect(slot).toHaveClass(/is-over/);
    await expect(slot).toHaveAttribute('data-severity', 'blocker');
    await expect(slot).toContainText('after Deutsches Museum closes at 17:00');
    await drag.drop();
    await expect(scheduleCard(page, 'Deutsches Museum')).toHaveCount(0);
  });

  test('buffer +/- recalculates the following times', async ({ page }) => {
    // Add a buffer between Frauenkirche and lunch (the gap row right before lunch).
    const lunch = scheduleCard(page, 'Lunch at Weisses Bräuhaus');
    const t0 = toMin(await startTimeOf(page, lunch));
    const gap = page.locator('li.tl-row', { has: lunch }).locator('xpath=preceding-sibling::li[1]');
    await gap.getByRole('button', { name: 'Add buffer here' }).click();
    const buffer = page.getByTestId('schedule-buffer');
    await expect(buffer).toHaveCount(1);
    await expect(buffer).toContainText('15 min');
    await expect.poll(async () => toMin(await startTimeOf(page, lunch)) - t0).toBe(15);
    await buffer.getByRole('button', { name: '5 minutes more' }).click();
    await expect(buffer).toContainText('20 min');
    await expect.poll(async () => toMin(await startTimeOf(page, lunch)) - t0).toBe(20);
    await buffer.getByRole('button', { name: '5 minutes less' }).click();
    await buffer.getByRole('button', { name: '5 minutes less' }).click();
    await expect(buffer).toContainText('10 min');
    await expect.poll(async () => toMin(await startTimeOf(page, lunch)) - t0).toBe(10);
    await page.screenshot({ path: 'screenshots/buffer.png' });
  });

  test('card detail sheet shows evidence and sources', async ({ page }) => {
    await scheduleCard(page, 'Residenz München').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('#detail-title')).toHaveText('Residenz München');
    await expect(sheet.locator('.detail-time')).toContainText('15:21–17:21');
    await expect(sheet.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(sheet.locator('.evidence-claim').first()).toBeVisible();
    await expect(sheet.locator('.ev-chip').first()).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Sources' })).toBeAttached();
    const links = sheet.locator('.source-list a');
    expect(await links.count()).toBeGreaterThan(0);
    const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.some((h) => h.includes('residenz-muenchen.de'))).toBe(true);
    expect(hrefs.some((h) => h.includes('muenchen.de/'))).toBe(true);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/detail-residenz.png' });
    await sheet.locator('.sheet-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.screenshot({ path: 'screenshots/detail-residenz-sources.png' });
    await page.getByTestId('sheet-close').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('swipe', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page);
    await page.getByTestId('step-swiping').click();
    await expect(page.getByTestId('step-swiping')).toHaveAttribute('aria-current', 'step');
  });

  const deckCount = async (page: Page) => Number(await page.locator('.deck-count b').innerText());

  async function ensureDeck(page: Page, min: number) {
    if ((await deckCount(page)) < min) {
      await page.getByTestId('open-search').click();
      await page.getByTestId('search-submit').click();
      await expect.poll(() => deckCount(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(min);
    }
  }

  test('like / skip / undo', async ({ page }) => {
    await ensureDeck(page, 2);
    const top = page.getByTestId('swipe-card-top');
    const kept = page.locator('.deck-liked b');
    const kept0 = Number(await kept.innerText());
    const first = (await top.getAttribute('data-title'))!;
    await page.getByTestId('swipe-like').click();
    await expect(kept).toHaveText(String(kept0 + 1));
    await expect(top).not.toHaveAttribute('data-title', first);
    const second = (await top.getAttribute('data-title'))!;
    await page.getByTestId('swipe-skip').click();
    await expect(top).not.toHaveAttribute('data-title', second);
    await expect(kept).toHaveText(String(kept0 + 1));
    await page.getByTestId('swipe-undo').click();
    await expect(top).toHaveAttribute('data-title', second);
    await page.getByTestId('swipe-undo').click();
    await expect(top).toHaveAttribute('data-title', first);
    await expect(kept).toHaveText(String(kept0));
    await expect(page.getByTestId('swipe-undo')).toBeDisabled();
  });

  test('"Search again" streams new cards into the deck', async ({ page, mode }) => {
    const n0 = await deckCount(page);
    await page.screenshot({ path: 'screenshots/swipe-initial.png' });
    await page.getByTestId('open-search').click();
    await expect(page.getByTestId('search-input')).toBeVisible();
    await page.getByTestId('search-input').fill('more indoor activities');
    const jobInsert = page
      .waitForResponse((r) => r.url().includes('/rest/v1/research_jobs') && r.request().method() === 'POST', { timeout: 15_000 })
      .catch(() => null);
    await page.getByTestId('search-submit').click();
    if (mode === 'supabase') {
      const res = await jobInsert;
      expect(res, 'research_jobs insert request').not.toBeNull();
      expect(res!.status()).toBeLessThan(300);
    }
    await expect(page.locator('.agent-status')).toBeVisible();
    await expect.poll(() => deckCount(page), { timeout: mode === 'supabase' ? 120_000 : 20_000 }).toBeGreaterThan(n0);
    await expect(page.getByTestId('swipe-card-top')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'screenshots/swipe-deck.png' });
  });

  test('card info opens the detail sheet', async ({ page }) => {
    await ensureDeck(page, 1);
    const title = (await page.getByTestId('swipe-card-top').getAttribute('data-title'))!;
    await page.getByTestId('swipe-info').click();
    await expect(page.getByRole('dialog').locator('#detail-title')).toHaveText(title);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Sources' })).toBeAttached();
    await page.getByTestId('sheet-close').click();
  });
});

test('visit every step without console errors (screens at 390x844)', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'screenshots/01-landing.png', fullPage: true });
  await openDemo(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/02-schedule-sat.png' });
  await page.screenshot({ path: 'screenshots/02-schedule-sat-full.png', fullPage: true });
  await page.locator(`[data-testid="day-tab"][data-day="${SUN}"]`).click();
  await page.screenshot({ path: 'screenshots/03-schedule-sun.png', fullPage: true });
  await page.getByTestId('drawer-toggle').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/04-drawer-half.png' });
  await page.getByTestId('drawer-search').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/05-drawer-search.png' });
  await page.locator('.drawer-scrim').click({ position: { x: 20, y: 20 } });
  await page.getByTestId('step-swiping').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/06-swipe.png' });
  await page.getByTestId('step-preferences').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/07-preferences.png', fullPage: true });
  await page.goto('/');
  await page.getByTestId('new-trip').click();
  await page.waitForURL(/\/trip\//);
  await expect(page.getByTestId('step-preferences')).toHaveAttribute('aria-current', 'step');
  await page.screenshot({ path: 'screenshots/08-new-trip.png', fullPage: true });
});
