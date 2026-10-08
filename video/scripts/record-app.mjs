#!/usr/bin/env node
// Records the app shots in one continuous Playwright session (390x844 mobile viewport) and writes
// shot markers so Remotion can cut each segment from the same video.
//
//   node scripts/record-app.mjs [baseUrl] [--shots S03,S04] [--headed] [--slow 1.0]
//   baseUrl default: $APP_BASE_URL or http://localhost:5174 (start your own: cd web && npx vite --port 5174)
//   e.g. node scripts/record-app.mjs https://prod-main-web-c3f29b-00kqxs6r2dz.compute.instacloud-edge.com
//
// Output: remotion/public/clips/app.webm + remotion/public/clips/manifest.json
//   { file, width, height, shots: { S03: { start, end } ... } }   (seconds from video start)
//
// Selectors are the data-testid attributes from web/ (see web/README.md, NEEDS_FROM_WEB.md).
// A missing selector does not abort the run: the step is skipped and reported at the end.
// Recording order differs from video order on purpose (S01/S02 need the planned day).
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const baseUrl = (argv.find((a) => /^https?:\/\//.test(a)) || process.env.APP_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
const onlyShots = flag('--shots')?.split(',');
const headed = argv.includes('--headed');
const slow = Number(flag('--slow') ?? 1); // multiplies all pauses

// ---------------------------------------------------------------------------
// Demo data: data/demo/munich.json (titles are matched via data-title).
// ---------------------------------------------------------------------------
const DEMO = {
  path: '/?demo=munich',
  day1: '2027-10-02',
  day2: '2027-10-03',
  conflictCard: 'Residenz München',          // Sat: open 09:00-18:00, last entry 17:00
  conflictAfter: 'Check in at Hotel Uhland', // drop after check-in -> "Visit ends at 18:40, after Residenz München closes at 18:00"
  detailCard: 'Residenz München',            // S05: open card sheet to show facts + sources
  holidayClosedCard: 'Viktualienmarkt',      // documented closure on 3 Oct (shown via the day view)
  holidayOpenCard: 'Alte Pinakothek',        // 3 Oct special hours 10:00-18:00 (muenchen.de)
  interests: ['Museums', 'Food', 'Beer gardens'],
  searchQuery: 'more indoor activities',
  hotelPdf: path.join(repo, 'data', 'demo', 'hotel-booking-sample.pdf'),
};

const VIEWPORT = { width: 390, height: 844 };
// Playwright's screencast is captured at CSS-pixel size (DPR is not applied); a larger size only pads it.
// 390x844 maps almost 1:1 onto the ~930 px phone screen in the 1080p composition.
const VIDEO_SIZE = { ...VIEWPORT };

const clipsDir = path.join(root, 'remotion', 'public', 'clips');
const tmpDir = path.join(clipsDir, '.tmp');
mkdirSync(tmpDir, { recursive: true });

const missing = [];
const shots = {};
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms * slow));

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: false, // mouse events -> dnd-kit MouseSensor (distance 6 px)
  colorScheme: 'light',
  locale: 'en-GB',
  timezoneId: 'Europe/Berlin',
  recordVideo: { dir: tmpDir, size: VIDEO_SIZE },
});

// Visible touch indicator (a soft dot that follows the pointer and shrinks on press).
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: '0', top: '0', width: '34px', height: '34px', margin: '-17px 0 0 -17px',
      borderRadius: '50%', background: 'rgba(29,26,22,.22)', border: '2px solid rgba(255,255,255,.9)',
      pointerEvents: 'none', zIndex: '2147483647', transition: 'transform .12s, opacity .2s', opacity: '0',
    });
    document.body.appendChild(dot);
    addEventListener('mousemove', (e) => { dot.style.opacity = '1'; dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.75)'; dot.style.background = 'rgba(15,107,92,.35)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = 'scale(1)'; dot.style.background = 'rgba(29,26,22,.22)'; }, true);
  });
});

const page = await context.newPage();
page.setDefaultTimeout(4000); // missing selectors fail fast and get reported
t0 = Date.now();

const tid = (id) => page.getByTestId(id);
const scheduleCard = (title) => page.locator(`[data-testid="schedule-card"][data-title*="${title}"]`);
const drawerCard = (title) => page.locator(`[data-testid="drawer-card"]${title ? `[data-title*="${title}"]` : ''}`);
const dayTab = (d) => page.locator(`[data-testid="day-tab"][data-day="${d}"]`);

async function step(desc, fn) {
  try {
    await fn();
  } catch (err) {
    missing.push(`${desc}: ${String(err.message).split('\n')[0]}`);
    console.warn(`  ! skipped: ${desc}`);
  }
}

async function tap(locator, desc, wait = 500) {
  await step(desc, async () => {
    const el = locator.first();
    await el.waitFor({ state: 'visible', timeout: 4000 });
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
    await pause(180);
    await el.click({ timeout: 2000 });
  });
  await pause(wait);
}

async function typeInto(locator, text, desc) {
  await tap(locator, desc, 150);
  await step(`type ${desc}`, async () => {
    await locator.first().fill('');
    await locator.first().pressSequentially(text, { delay: 55 * slow });
  });
  await pause(300);
}

/**
 * Smooth pointer drag. `target` is resolved after the drag has started (drop slots only render during a drag).
 * holdMs = hover time over the target before release (the slot shows its reason meanwhile).
 */
async function drag(source, resolveTarget, desc, { holdMs = 900 } = {}) {
  await step(desc, async () => {
    const src = source.first();
    await src.waitFor({ state: 'visible', timeout: 4000 });
    await src.scrollIntoViewIfNeeded();
    const a = await src.boundingBox();
    const sx = a.x + a.width / 2, sy = a.y + Math.min(30, a.height / 2);
    await page.mouse.move(sx, sy, { steps: 10 });
    await pause(250);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(sx + i * 2, sy + i * 4, { steps: 2 }); // > 6 px activates
    await pause(350);
    const b = await resolveTarget();
    if (!b) throw new Error('drop target not found');
    await page.mouse.move(b.x, b.y, { steps: 45 });
    await pause(holdMs);
    await page.mouse.up();
  });
  await pause(600);
}

/** Center of the first drop slot below the given card (slots appear between cards while dragging). */
async function slotAfter(title) {
  const anchor = await scheduleCard(title).first().boundingBox();
  if (!anchor) return null;
  const slots = page.getByTestId('drop-slot');
  const n = await slots.count();
  for (let i = 0; i < n; i++) {
    const box = await slots.nth(i).boundingBox();
    if (box && box.y >= anchor.y + anchor.height - 4) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height + 12 };
}

async function swipe(direction, desc) {
  const top = tid('swipe-card-top');
  await step(desc, async () => {
    await top.waitFor({ state: 'visible', timeout: 6000 });
    const before = await top.innerText();
    const box = await top.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy, { steps: 8 });
    await page.mouse.down();
    await page.mouse.move(cx + (direction === 'right' ? 260 : -260), cy - 20, { steps: 18 });
    await page.mouse.up();
    await pause(450);
    if ((await top.innerText().catch(() => '')) === before) {
      await tap(tid(direction === 'right' ? 'swipe-like' : 'swipe-skip'), `${desc} (button)`, 0);
    }
  });
  await pause(650);
}

async function scrollBy(dy, steps = 6, wait = 140) {
  await page.mouse.move(195, 520);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await pause(wait); }
}

async function shot(id, fn) {
  if (onlyShots && !onlyShots.includes(id)) return;
  console.log(`> ${id}`);
  const start = now();
  await fn();
  shots[id] = { start: +start.toFixed(2), end: +now().toFixed(2) };
}

// ---------------------------------------------------------------------------
// Shots (see SHOTLIST.md). The demo opens on the schedule; S03 starts from the Preferences step.
// ---------------------------------------------------------------------------
await page.goto(baseUrl + DEMO.path, { waitUntil: 'networkidle' });
await pause(1000);
await step('open demo (landing)', async () => { if (await tid('open-demo').isVisible()) await tid('open-demo').click(); });
await pause(800);
await tap(tid('step-preferences'), 'go to Preferences step', 900);

await shot('S03', async () => {
  // Step 1: trip + preferences + hotel PDF
  await scrollBy(260, 6, 160);
  await pause(400);
  await step('upload hotel PDF', async () => {
    const input = page.locator('input[type="file"]').first();
    if (existsSync(DEMO.hotelPdf)) await input.setInputFiles(DEMO.hotelPdf);
    else await input.setInputFiles({ name: 'Hotel-Uhland-booking.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  });
  await pause(2400); // extracted booking cards appear
  await tap(page.getByRole('button', { name: /Confirm all/ }), 'confirm extracted times', 900);
  await scrollBy(420, 6, 140);
  for (const i of DEMO.interests) await tap(page.getByRole('button', { name: i, exact: true }), `interest ${i}`, 220);
  await scrollBy(360, 5, 140);
  await tap(page.getByRole('radio', { name: /^Normal/ }), 'visit style normal', 300);
  await tap(tid('find-suggestions'), 'find suggestions', 1500);
});

await shot('S04', async () => {
  // Step 2: swipe while cards stream in
  await tap(tid('step-swiping'), 'ensure Suggestions step', 600);
  await swipe('right', 'swipe 1');
  await swipe('right', 'swipe 2');
  await swipe('left', 'swipe 3');
  await pause(1200); // let streamed cards arrive
  await swipe('right', 'swipe 4');
  await swipe('right', 'swipe 5');
  await tap(tid('plan-days'), 'plan my days', 1500);
});

await shot('S05', async () => {
  // Step 3: calendar overview, open one card's facts
  await tap(dayTab(DEMO.day1), 'day 1 tab', 600);
  await scrollBy(420, 8, 160);
  await pause(600);
  await scrollBy(-420, 6, 100);
  await tap(scheduleCard(DEMO.detailCard), 'open Residenz card', 2400);
  await tap(tid('sheet-close'), 'close card', 500);
});

await shot('S06', async () => {
  // The conflict: drag to an invalid slot, reason appears, card snaps back; then the holiday day
  await drag(scheduleCard(DEMO.conflictCard), () => slotAfter(DEMO.conflictAfter), 'drag Residenz after check-in', { holdMs: 2200 });
  await pause(1800); // toast + snap back
  await tap(dayTab(DEMO.day2), 'day 2 tab (German Unity Day)', 1500);
  await scrollBy(300, 6, 160);
  await tap(scheduleCard(DEMO.holidayOpenCard), 'Alte Pinakothek (holiday hours)', 2200);
  await tap(tid('sheet-close'), 'close card', 400);
  await scrollBy(-300, 4, 100);
  await tap(dayTab(DEMO.day1), 'back to day 1', 600);
});

await shot('S01', async () => {
  // Intro b-roll: the planned Saturday, slow scroll
  await scrollBy(480, 10, 200);
  await scrollBy(-480, 8, 120);
  await pause(600);
});

await shot('S02', async () => {
  // Hook: the conflict drag, short and punchy
  await drag(scheduleCard(DEMO.conflictCard), () => slotAfter(DEMO.conflictAfter), 'hook drag', { holdMs: 2400 });
  await pause(1400);
});

await shot('S07', async () => {
  // Search again from the drawer; new cards stream in; drag one into the day
  await tap(tid('drawer-search'), 'drawer: Search again', 700);
  await typeInto(tid('search-input'), DEMO.searchQuery, 'search query');
  await tap(tid('search-submit'), 'submit search', 800);
  const before = await drawerCard().count().catch(() => 0);
  await step('wait for new cards', () => page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="drawer-card"]').length > n, before, { timeout: 15000 }));
  await pause(2500);
  // Drag the newest drawer card into the free slot after lunch (if the planner allows it, times shift below).
  await drag(drawerCard().last(), () => slotAfter('Lunch at Weisses Bräuhaus'), 'drag new card into day', { holdMs: 1200 });
  await pause(2200);
});

await page.close();
const video = page.video();
const outFile = path.join(clipsDir, 'app.webm');
const tmpPath = video ? await video.path() : null;
await context.close();
await browser.close();
if (tmpPath) {
  if (existsSync(outFile)) rmSync(outFile);
  renameSync(tmpPath, outFile);
}

writeFileSync(path.join(clipsDir, 'manifest.json'), JSON.stringify({
  file: 'clips/app.webm', width: VIDEO_SIZE.width, height: VIDEO_SIZE.height, content: VIEWPORT, baseUrl, recordedAt: new Date().toISOString(), shots,
}, null, 2) + '\n');

console.log(`\nSaved ${path.relative(root, outFile)} with shots: ${Object.keys(shots).join(', ')}`);
if (missing.length) {
  console.log(`\n${missing.length} step(s) skipped (selector missing or app state differs). See NEEDS_FROM_WEB.md:`);
  for (const m of missing) console.log(`  - ${m}`);
}
void readFileSync;
