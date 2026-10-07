// Builds the multi-page submission PDF with all info, links, images and contact.
// Usage: node submission/scripts/make-pdf.mjs   (after shots.mjs and compose.mjs)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../../video/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('../../', import.meta.url);
const file = (p) => new URL(p, root);
const fsPath = (u) => decodeURIComponent(u.pathname).replace(/^\/(\w:)/, '$1');
const img = (p) => `data:image/png;base64,${readFileSync(file(p)).toString('base64')}`;
const logo = readFileSync(file('brand/logo.svg'), 'utf8');
const LIVE = 'https://prod-main-web-c3f29b-00kqxs6r2dz.compute.instacloud-edge.com';
const REPO = 'https://github.com/topsrek/ausflieger-agent-hackathon-07-10-2026';
const link = (u, t = u.replace('https://', '')) => `<a href="${u}">${t}</a>`;

const html = `<!doctype html><html lang="en"><head>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet">
<style>
  @page{size:A4;margin:0}
  *{box-sizing:border-box;margin:0}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1b1a17}
  h1,h2,h3{font-family:Fraunces,Georgia,serif;letter-spacing:-.01em}
  a{color:#0f6b5c;text-decoration:none;font-weight:600}
  .page{width:210mm;height:297mm;padding:16mm 16mm 14mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}
  .page:last-child{page-break-after:auto}
  .foot{position:absolute;left:16mm;right:16mm;bottom:9mm;display:flex;justify-content:space-between;font-size:8.5pt;color:#8a857b}
  .accent{color:#0f6b5c}
  p,li,td{font-size:10.5pt;line-height:1.55}
  h2{font-size:19pt;margin:0 0 4mm}
  h3{font-size:12.5pt;margin:5mm 0 2mm}
  ul{padding-left:5mm}
  .eyebrow{font-size:9pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#0f6b5c;margin-bottom:2mm}
  /* cover */
  .cover{background:radial-gradient(ellipse at 30% 0%,#e4f3ee,#f6f3ee 60%)}
  .cover .logo svg{height:56px;width:auto}
  .cover h1{font-size:40pt;line-height:1.05;margin:22mm 0 6mm}
  .cover .lede{font-size:14pt;line-height:1.5;color:#3d3a34;max-width:160mm}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:14mm}
  .box{background:#fff;border-radius:4mm;padding:5mm 6mm;box-shadow:0 2mm 6mm rgba(15,60,50,.08)}
  .box b{display:block;font-size:9pt;letter-spacing:.12em;text-transform:uppercase;color:#8a857b;margin-bottom:1.5mm}
  .box p{font-size:11pt}
  .contact{margin-top:10mm;display:flex;gap:6mm;align-items:center;background:#1b1a17;color:#f6f3ee;border-radius:4mm;padding:6mm 7mm}
  .contact .name{font-family:Fraunces,serif;font-size:17pt}
  .contact p{font-size:10.5pt;color:#d9d4ca}
  .contact a{color:#9fe3d2}
  .usp{padding:5mm 7mm;border-radius:4mm;background:#e8f4f0;border-left:2mm solid #0f6b5c;margin:4mm 0}
  .quote{font-weight:700;color:#b42318}
  .full{width:100%;border-radius:3mm;border:1px solid #ece7df;display:block}
  table{border-collapse:collapse;width:100%}
  td{padding:2mm 2.5mm;border-bottom:1px solid #ece7df;vertical-align:top}
  td:first-child{font-weight:700;white-space:nowrap;width:32mm}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:7mm}
</style></head><body>

<section class="page cover">
  <div class="logo">${logo}</div>
  <h1>Trip plans that<br><span class="accent">actually fit.</span></h1>
  <p class="lede">Ausflieger is an agentic trip planner focused on schedule coordination. An agent researches activities, restaurants, events and holidays, delivers them as swipeable cards with sourced facts, and a conflict manager checks every slot of your day.</p>
  <div class="cards">
    <div class="box"><b>Live demo</b><p>${link(LIVE, 'Open the app')}<br><span style="font-size:8.5pt;color:#8a857b">${LIVE.replace('https://', '')}</span></p></div>
    <div class="box"><b>Source code</b><p>${link(REPO, 'GitHub repository')}<br><span style="font-size:8.5pt;color:#8a857b">${REPO.replace('https://', '')}</span></p></div>
    <div class="box"><b>Demo trip</b><p>Munich during Oktoberfest, 2–3 Oct 2027 · 108 researched facts</p></div>
    <div class="box"><b>Built with</b><p>Agent 37 · OpenClaw · Monid · Context.dev · Supabase · InstaCloud</p></div>
  </div>
  <div class="contact">
    <div><div class="name">Peter Wimberger</div><p>Indiebuilder from Vienna, Austria<br><a href="mailto:topsrek@gmail.com">topsrek@gmail.com</a></p></div>
  </div>
  <div class="foot"><span>Ausflieger · Agent Hackathon · 07.10.2026</span><span>1</span></div>
</section>

<section class="page">
  <div class="eyebrow">What it does</div>
  <h2>Swipe, drag, and know why something doesn't fit</h2>
  <img class="full" src="${img('submission/out/ausflieger-screens.png')}">
  <div class="usp"><p><b>The conflict manager.</b> Every slot is checked against opening hours, last entry, fixed bookings, walking-time ranges and public holidays. Ausflieger explains why something does not fit — <span class="quote">"Visit ends at 18:40, after Residenz München closes at 18:00"</span> — and marks uncertain facts as <b>needs checking</b> instead of guessing.</p></div>
  <div class="cols">
    <div>
      <h3>1 · Preferences</h3><p>Destination, dates, arrival and departure, a booking PDF, meal times, interests, visit style (short / normal / long) and pace.</p>
      <h3>2 · Suggestions</h3><p>The agent researches sights, museums, restaurants, events and holidays. Cards stream in live; swipe right to keep, left to skip. "Search again" adds alternatives without touching your plan.</p>
    </div>
    <div>
      <h3>3 · Schedule</h3><p>One day at a time. Drag cards from the drawer into the day; times, walking ranges and buffers recalculate instantly in the browser. Fixed bookings are locked; research updates arrive as proposals you accept, never as silent moves.</p>
      <h3>Evidence per fact</h3><p>Operator-confirmed, regular hours, estimated, unknown or conflicting — each with source URL, retrieval date and the dates it applies to.</p>
    </div>
  </div>
  <div class="foot"><span>Ausflieger · Agent Hackathon · 07.10.2026</span><span>2</span></div>
</section>

<section class="page">
  <div class="eyebrow">How it is built</div>
  <h2>Agents research. The planner checks.</h2>
  <img class="full" src="${img('submission/out/ausflieger-architecture.png')}">
  <h3>Sponsors and tools</h3>
  <table>
    <tr><td>Agent 37</td><td>Runs the research agent (OpenClaw template). OpenClaw subagents research several cards in parallel. The agent also deployed the web app to InstaCloud itself.</td></tr>
    <tr><td>Context.dev</td><td>Primary scraper: official venue, hotel and event pages into structured JSON — opening hours, last entry, breakfast times, special closures.</td></tr>
    <tr><td>Monid</td><td>Tool discovery: for each task the agent picks the best tool (places, events, holidays, routing, PDF parsing).</td></tr>
    <tr><td>Supabase</td><td>Trips, cards, places and fact-level evidence in Postgres; Realtime streams new cards into the app; Storage holds booking PDFs; row-level security keeps the demo read-only (each visitor gets a clone).</td></tr>
    <tr><td>InstaCloud</td><td>Hosts the web app (Node server + Vite/React build).</td></tr>
    <tr><td>Planner</td><td>Deterministic TypeScript engine in the browser (62 tests). The agent supplies facts; the planner decides feasibility.</td></tr>
  </table>
  <div class="foot"><span>Ausflieger · Agent Hackathon · 07.10.2026</span><span>3</span></div>
</section>

<section class="page">
  <div class="eyebrow">Demo</div>
  <h2>Munich during Oktoberfest, 2–3 Oct 2027</h2>
  <div class="cols">
    <div>
      <h3>Saturday 2 Oct</h3>
      <ul><li>ICE arrival 09:16 · luggage at Hotel Uhland</li><li>Glockenspiel at Marienplatz 11:00 (fixed)</li><li>Frauenkirche tower · lunch at Weisses Bräuhaus</li><li>Viktualienmarkt · Residenz München (last entry 17:00)</li><li>Hotel check-in · dinner at Augustiner-Keller</li></ul>
      <h3>Sunday 3 Oct · German Unity Day</h3>
      <ul><li>Hotel breakfast · check-out</li><li>Wiesn from 09:00 · Böllerschießen at the Bavaria 12:00</li><li>Alte Pinakothek · ICE departure 18:32</li></ul>
    </div>
    <div>
      <h3>Showcase conflicts</h3>
      <ul><li>Residenz after check-in → closes at 18:00</li><li>Frauenkirche before 11:00 → Glockenspiel unreachable</li><li>Viktualienmarkt on 3 Oct → documented holiday closure</li><li>Deutsches Museum on 3 Oct → holiday hours not confirmed (needs checking)</li><li>Schumann's on Saturday → sources disagree</li></ul>
      <h3>Research rules</h3>
      <ul><li>Planning-critical facts first: fixed times, date-specific hours, closures, last entry</li><li>Authoritative, date-specific sources; a second independent source for critical facts</li><li>Holidays at national, regional and city level trigger a check — they never imply closure</li><li>Disagreements are kept and flagged; missing values are never invented</li></ul>
    </div>
  </div>
  <div class="contact" style="margin-top:12mm">
    <div><div class="name">Peter Wimberger</div><p>Indiebuilder from Vienna, Austria · <a href="mailto:topsrek@gmail.com">topsrek@gmail.com</a><br>Live: ${link(LIVE, 'open the app')} · Code: ${link(REPO, 'GitHub')}</p></div>
  </div>
  <div class="foot"><span>Ausflieger · Agent Hackathon · 07.10.2026</span><span>4</span></div>
</section>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: fsPath(file('submission/out/ausflieger-submission.pdf')), format: 'A4', printBackground: true });
await browser.close();
console.log('done');
