#!/usr/bin/env node
// Generates the end-card QR code.
//   node scripts/make-qr.mjs <url> <shortlink>
//   node scripts/make-qr.mjs                      (placeholder, clearly marked on the card)
// Writes:
//   video/endcard.html                 (QR + short link between the marker comments)
//   video/remotion/public/qr.svg       (used by the Remotion end card)
//   video/remotion/public/endcard.json ({ url, shortlink, placeholder })
// Point the QR at a short link the team controls (Dub.co, Bitly, own domain redirect),
// not at the raw InstaCloud URL, so the video stays valid if the deployment moves.
import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER_URL = 'https://PLACEHOLDER.invalid/ausflieger?demo=munich';
const PLACEHOLDER_LINK = 'PLACEHOLDER.link/ausflieger';

const [urlArg, linkArg] = process.argv.slice(2);
const url = urlArg || PLACEHOLDER_URL;
const shortlink = linkArg || (urlArg ? urlArg.replace(/^https?:\/\//, '').replace(/\/$/, '') : PLACEHOLDER_LINK);
const placeholder = !urlArg || /placeholder/i.test(url);

if (urlArg && !/^https?:\/\//.test(urlArg)) {
  console.error('The URL must start with http:// or https://');
  process.exit(1);
}

const svg = await QRCode.toString(url, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 0,
  color: { dark: '#1d1a16', light: '#ffffff' },
});
// Inline-friendly: drop the XML prologue if present, keep the viewBox so CSS can size it.
const cleanSvg = svg.replace(/<\?xml[^>]*>\s*/, '').replace(/^<svg (?![^>]*shape-rendering)/, '<svg shape-rendering="crispEdges" ');

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const endcardPath = path.join(root, 'endcard.html');
let html = readFileSync(endcardPath, 'utf8');
const replaceBetween = (src, name, value) => {
  const re = new RegExp(`(<!--${name}:START-->)[\\s\\S]*?(<!--${name}:END-->)`);
  if (!re.test(src)) throw new Error(`Marker ${name} not found in endcard.html`);
  return src.replace(re, `$1${value}$2`);
};
html = replaceBetween(html, 'QR', cleanSvg);
html = replaceBetween(html, 'LINK', escapeHtml(shortlink));
html = replaceBetween(html, 'PLACEHOLDER', `<div id="stage" data-placeholder="${placeholder}">`);
writeFileSync(endcardPath, html);

const pub = path.join(root, 'remotion', 'public');
mkdirSync(pub, { recursive: true });
writeFileSync(path.join(pub, 'qr.svg'), cleanSvg);
writeFileSync(path.join(pub, 'endcard.json'), JSON.stringify({ url, shortlink, placeholder }, null, 2) + '\n');

console.log(`QR -> ${url}`);
console.log(`Short link text -> ${shortlink}`);
if (placeholder) console.warn('PLACEHOLDER in use: rerun with the real short link before the final render.');
