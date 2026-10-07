// Builds the submission files from screenshots, slides and logo.
// Usage: node submission/scripts/compose.mjs   (after shots.mjs)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire(new URL('../../video/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('../../', import.meta.url);
const file = (p) => new URL(p, root);
const fsPath = (u) => decodeURIComponent(u.pathname).replace(/^\/(\w:)/, '$1');
const b64 = (p) => readFileSync(file(p)).toString('base64');
mkdirSync(fsPath(file('submission/out/')), { recursive: true });
const out = (n) => fsPath(file('submission/out/' + n));
const LIVE = 'https://prod-main-web-c3f29b-00kqxs6r2dz.compute.instacloud-edge.com';
const REPO = 'github.com/topsrek/ausflieger-agent-hackathon-07-10-2026';
const logo = readFileSync(file('brand/logo.svg'), 'utf8');
const mark = readFileSync(file('brand/logo-mark.svg'), 'utf8');
const shot = (n) => `data:image/png;base64,${b64('submission/shots/' + n)}`;

const base = `
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1b1a17;background:#f6f3ee}
  h1,h2{font-family:Fraunces,Georgia,serif;letter-spacing:-.01em}
  .accent{color:#0f6b5c}
</style>`;

const screens = `<!doctype html><html><head>${base}<style>
  body{width:1920px;height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;
       background:radial-gradient(ellipse at top,#e4f3ee,#f6f3ee 60%)}
  header{display:flex;align-items:center;gap:22px}
  header svg{height:64px;width:64px}
  header h1{font-size:46px}
  .row{display:flex;gap:56px}
  figure{display:flex;flex-direction:column;align-items:center;gap:18px}
  .phone{width:360px;height:779px;border-radius:44px;overflow:hidden;border:10px solid #1b1a17;box-shadow:0 30px 60px rgba(15,60,50,.22);background:#fff}
  .phone img{width:100%;display:block}
  figcaption{font-size:24px;font-weight:700;text-align:center}
  figcaption span{display:block;font-weight:500;font-size:18px;color:#6b665d;margin-top:4px}
</style></head><body>
  <header>${mark}<h1>Ausflieger <span class="accent">— trip plans that actually fit</span></h1></header>
  <div class="row">
    <figure><div class="phone"><img src="${shot('1-swipe.png')}"></div><figcaption>1 · Swipe suggestions<span>researched cards with sourced facts</span></figcaption></figure>
    <figure><div class="phone"><img src="${shot('2-conflict.png')}"></div><figcaption>2 · Drag into your day<span>every slot checked, conflicts explained</span></figcaption></figure>
    <figure><div class="phone"><img src="${shot('3-detail.png')}"></div><figcaption>3 · Evidence per fact<span>uncertain facts marked "needs checking"</span></figcaption></figure>
  </div>
</body></html>`;

const onepager = `<!doctype html><html><head>${base}<style>
  @page{size:A4;margin:0}
  body{width:210mm;padding:14mm 16mm 10mm;background:#fff}
  .top{display:flex;justify-content:space-between;align-items:center}
  .top svg{height:44px;width:auto}
  .links{font-size:9pt;white-space:nowrap;text-align:right;line-height:1.5;color:#3d3a34}
  h1{font-size:26pt;margin:6mm 0 3mm;line-height:1.1}
  .lede{font-size:12pt;line-height:1.5;color:#3d3a34}
  h2{font-size:14pt;margin:6mm 0 2mm}
  p{font-size:10.5pt;line-height:1.5}
  .usp{margin-top:5mm;padding:4mm 6mm;border-radius:4mm;background:#e8f4f0;border-left:2mm solid #0f6b5c}
  .usp p{font-size:11pt}
  .quote{font-weight:700;color:#b42318}
  .shots{display:flex;gap:5mm;margin-top:5mm;justify-content:center}
  .shots img{width:24%;border-radius:3mm;border:1px solid #e5e0d8}
  table{border-collapse:collapse;width:100%;font-size:9.8pt}
  td{padding:1.4mm 2mm;border-bottom:1px solid #ece7df;vertical-align:top;line-height:1.4}
  td:first-child{font-weight:700;white-space:nowrap;width:28mm}
</style></head><body>
  <div class="top">${logo}<div class="links">Live demo: ${LIVE.replace('https://', '')}<br>Code: ${REPO}<br>Agent Hackathon · 07.10.2026</div></div>
  <h1>Trip plans that <span class="accent">actually fit.</span></h1>
  <p class="lede">Ausflieger is an agentic trip planner focused on schedule coordination. An agent researches activities, restaurants, events and holidays and delivers them as swipeable cards with sourced facts. You drag the cards into a mobile day calendar.</p>
  <div class="usp"><p><b>The conflict manager.</b> Every slot is checked against opening hours, last entry, fixed bookings, walking-time ranges and holidays. Ausflieger explains why something does not fit (<span class="quote">"Visit ends at 18:40, after Residenz München closes at 18:00"</span>) and marks uncertain facts as <b>needs checking</b> instead of guessing.</p></div>
  <div class="shots"><img src="${shot('1-swipe.png')}"><img src="${shot('2-conflict.png')}"><img src="${shot('3-detail.png')}"></div>
  <h2>How it is built</h2>
  <table>
    <tr><td>Agent 37</td><td>Runs the research agent (OpenClaw template); subagents research cards in parallel. The agent also deployed the web app.</td></tr>
    <tr><td>Context.dev</td><td>Primary scraper: official venue, hotel and event pages into structured JSON (hours, last entry, breakfast, closures).</td></tr>
    <tr><td>Monid</td><td>Tool discovery: the agent picks the best tool per task (places, events, holidays, routing, PDF parsing).</td></tr>
    <tr><td>Supabase</td><td>Trips, cards and fact-level evidence; Realtime streams new cards into the app; Storage for booking PDFs.</td></tr>
    <tr><td>InstaCloud</td><td>Hosts the web app.</td></tr>
    <tr><td>Planner</td><td>Deterministic, client-side schedule checks: the agent supplies facts, the planner decides feasibility.</td></tr>
  </table>
  <h2>Demo: Munich during Oktoberfest, 2–3 Oct 2027</h2>
  <p>108 researched facts from official sites and muenchen.de. 3 Oct is German Unity Day: a holiday triggers a check of each venue's special hours and never implies closure.</p>
</body></html>`;

const browser = await chromium.launch();
const render = async (html, path, w, h, scale = 1) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path });
  await page.close();
};
await render(screens, out('ausflieger-screens.png'), 1920, 1080);
const arch = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await arch.goto(file('video/architecture.html').href, { waitUntil: 'networkidle' });
await arch.screenshot({ path: out('ausflieger-architecture.png') });
await arch.close();
const pdf = await browser.newPage();
await pdf.setContent(onepager, { waitUntil: 'networkidle' });
await pdf.pdf({ path: out('ausflieger-onepager.pdf'), format: 'A4', printBackground: true, scale: 0.86, pageRanges: '1' });
await pdf.close();
await render(`<!doctype html><html><head>${base}<style>body{width:1200px;height:630px;display:flex;align-items:center;justify-content:center}svg{width:820px;height:auto}</style></head><body>${logo}</body></html>`,
  out('ausflieger-logo.png'), 1200, 630, 2);
await browser.close();
console.log('done');
