#!/usr/bin/env node
// Silent placeholder voiceover so the Remotion timeline and captions work before ElevenLabs is set up.
// Duration per segment = words / script.wpm; word timings are spread by word length.
//   node scripts/placeholder-audio.mjs           # fills only segments without real TTS
//   node scripts/placeholder-audio.mjs --force   # replaces everything with placeholders
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const script = JSON.parse(readFileSync(path.join(root, 'script.json'), 'utf8'));
const voDir = path.join(root, 'remotion', 'public', 'vo');
mkdirSync(voDir, { recursive: true });
const manifestPath = path.join(voDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { segments: [] };

function silentWav(seconds, rate = 22050) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

for (const seg of script.segments) {
  const existing = manifest.segments.find((m) => m.id === seg.id);
  if (existing && !existing.placeholder && !force) { console.log(`= ${seg.id} keeps real TTS`); continue; }
  const tokens = seg.text.trim().split(/\s+/);
  const dur = (tokens.length / script.wpm) * 60;
  const weights = tokens.map((t) => t.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  const words = tokens.map((text, i) => {
    const d = (weights[i] / total) * dur;
    const w = { text, start: +t.toFixed(3), end: +(t + d * 0.9).toFixed(3) };
    t += d;
    return w;
  });
  const file = `${seg.id}.wav`;
  writeFileSync(path.join(voDir, file), silentWav(dur));
  manifest.segments = manifest.segments.filter((m) => m.id !== seg.id).concat({
    id: seg.id, file: `vo/${file}`, placeholder: true, durationSec: +dur.toFixed(3), speechEndSec: +dur.toFixed(3), words,
  });
  console.log(`~ ${seg.id} placeholder ${dur.toFixed(1)} s`);
}
manifest.segments.sort((a, b) => script.segments.findIndex((s) => s.id === a.id) - script.segments.findIndex((s) => s.id === b.id));
manifest.generatedAt = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
