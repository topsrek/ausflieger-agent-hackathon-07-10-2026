#!/usr/bin/env node
// ElevenLabs voiceover, one request per script.json segment, with character timestamps for captions.
//
//   node scripts/voiceover.mjs                 # generate missing / changed segments
//   node scripts/voiceover.mjs --force         # regenerate all
//   node scripts/voiceover.mjs --only s06-conflict,s07-search
//   node scripts/voiceover.mjs --dry-run       # show what would be generated, no API calls
//
// Env (set locally in video/.env, see .env.example; never commit or print it):
//   ELEVENLABS_API_KEY   required
//   ELEVENLABS_VOICE_ID  optional, default below
//   ELEVENLABS_MODEL_ID  optional, overrides script.json voice.model_id
//
// API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps
//      -> { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds }, normalized_alignment }
// Output: remotion/public/vo/<segment>.mp3 + remotion/public/vo/manifest.json (durations + word timings)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile); // values stay in process.env, never logged

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;

// Default: "George" (warm, clear narration voice from the ElevenLabs default library). Swap via ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const OUTPUT_FORMAT = 'mp3_44100_128';
const BITRATE = 128_000;

const script = JSON.parse(readFileSync(path.join(root, 'script.json'), 'utf8'));
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
const modelId = process.env.ELEVENLABS_MODEL_ID || script.voice?.model_id || 'eleven_multilingual_v2';
const voiceSettings = script.voice?.voice_settings;

const voDir = path.join(root, 'remotion', 'public', 'vo');
mkdirSync(voDir, { recursive: true });
const manifestPath = path.join(voDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { segments: [] };

const hashOf = (seg) =>
  createHash('sha256').update(JSON.stringify([seg.text, voiceId, modelId, voiceSettings])).digest('hex').slice(0, 16);

/** Character alignment -> word timings. */
export function wordsFromAlignment(al) {
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    const s = al.character_start_times_seconds[i];
    const e = al.character_end_times_seconds[i];
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { text: '', start: s, end: e };
    cur.text += ch;
    cur.end = e;
  });
  if (cur) words.push(cur);
  return words.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}

async function tts(seg, prev, next) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`;
  const body = {
    text: seg.text,
    model_id: modelId,
    ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
    // Context for natural prosody across separately generated segments.
    ...(prev ? { previous_text: prev.text } : {}),
    ...(next ? { next_text: next.text } : {}),
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const detail = (await res.text()).slice(0, 400);
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      console.warn(`  ${seg.id}: HTTP ${res.status}, retrying in ${attempt * 3}s`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
      continue;
    }
    throw new Error(`ElevenLabs HTTP ${res.status} for ${seg.id}: ${detail}`);
  }
}

if (!apiKey && !dryRun) {
  console.error('ELEVENLABS_API_KEY is not set. Put it in video/.env (see .env.example) or run with --dry-run.');
  console.error('For a silent animatic without a key: npm run vo:placeholder');
  process.exit(1);
}

console.log(`Model ${modelId} · voice ${voiceId === DEFAULT_VOICE_ID ? 'default (George)' : 'from ELEVENLABS_VOICE_ID'}`);
const segs = script.segments;
for (let i = 0; i < segs.length; i++) {
  const seg = segs[i];
  if (only && !only.has(seg.id)) continue;
  const h = hashOf(seg);
  const existing = manifest.segments.find((m) => m.id === seg.id);
  const file = `${seg.id}.mp3`;
  if (!force && existing && !existing.placeholder && existing.hash === h && existsSync(path.join(voDir, file))) {
    console.log(`= ${seg.id} unchanged (${existing.durationSec.toFixed(2)} s)`);
    continue;
  }
  if (dryRun) { console.log(`~ ${seg.id} would be generated (${seg.text.length} chars)`); continue; }
  process.stdout.write(`+ ${seg.id} ... `);
  const out = await tts(seg, segs[i - 1], segs[i + 1]);
  const audio = Buffer.from(out.audio_base64, 'base64');
  writeFileSync(path.join(voDir, file), audio);
  const al = out.alignment ?? out.normalized_alignment;
  const words = al ? wordsFromAlignment(al) : [];
  const speechEndSec = words.length ? words[words.length - 1].end : 0;
  const cbrSec = (audio.length * 8) / BITRATE; // CBR 128 kbps
  const entry = {
    id: seg.id, file: `vo/${file}`, hash: h, placeholder: false,
    durationSec: +Math.max(cbrSec, speechEndSec).toFixed(3), speechEndSec: +speechEndSec.toFixed(3), words,
  };
  manifest.segments = manifest.segments.filter((m) => m.id !== seg.id).concat(entry);
  console.log(`${entry.durationSec.toFixed(2)} s, ${words.length} words`);
}

manifest.segments.sort((a, b) => segs.findIndex((s) => s.id === a.id) - segs.findIndex((s) => s.id === b.id));
manifest.generatedAt = new Date().toISOString();
manifest.model = modelId;
if (!dryRun) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Run "npm run check" to see the new projected runtime.');
