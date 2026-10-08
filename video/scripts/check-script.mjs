#!/usr/bin/env node
// Prints words per segment, estimated speaking time at script.wpm, and the projected total.
// Usage: node scripts/check-script.mjs   (from video/)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(readFileSync(path.join(root, 'script.json'), 'utf8'));
const manifestPath = path.join(root, 'remotion/public/vo/manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;

export const countWords = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

let t = 0, words = 0;
const rows = [];
for (const seg of script.segments) {
  const w = countWords(seg.text);
  words += w;
  const est = (w / script.wpm) * 60;
  const actual = manifest?.segments.find((m) => m.id === seg.id && !m.placeholder)?.durationSec;
  const speech = actual ?? est;
  const dur = Math.max(seg.minDuration ?? 0, speech + (seg.padAfter ?? 0));
  rows.push({ id: seg.id, start: fmt(t), words: w, speech: speech.toFixed(1) + (actual ? ' (TTS)' : ' (est)'), segment: dur.toFixed(1), target: seg.targetDuration });
  t += dur;
}
console.table(rows);
console.log(`Words: ${words}  ·  Projected runtime: ${fmt(t)} (${t.toFixed(1)} s)  ·  Limit: ${script.maxSeconds} s`);
if (t > script.maxSeconds) { console.error('Over the limit: shorten text or padding.'); process.exitCode = 1; }
