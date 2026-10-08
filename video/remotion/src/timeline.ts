// Builds the video timeline from script.json + the voiceover manifest (actual TTS durations).
import script from '../../script.json';
import { FPS } from './theme';

export type VisualKind = 'intro' | 'problem' | 'clip' | 'architecture' | 'market' | 'endcard';
export interface Word { text: string; start: number; end: number }
export interface Beat { word: string; text?: string; tone?: 'red' | 'amber' | 'dark' | 'green'; key?: string }
export interface ScriptSegment {
  id: string; label: string; text: string; onScreen: string;
  targetStart: number; targetDuration: number; padAfter?: number; minDuration?: number;
  visual: { kind: VisualKind; shot?: string }; chapter?: string; beats?: Beat[];
}
export interface VoSegment { id: string; file: string; durationSec: number; speechEndSec: number; words: Word[]; placeholder?: boolean }
export interface VoManifest { segments: VoSegment[] }
export interface ClipManifest { file: string; width: number; height: number; content?: { width: number; height: number }; shots: Record<string, { start: number; end: number }> }
export interface EndcardInfo { url: string; shortlink: string; placeholder: boolean }

export interface TimedBeat extends Beat { at: number } // seconds from segment start
export interface Seg {
  id: string; label: string; kind: VisualKind; shot?: string; chapter?: string; onScreen: string; text: string;
  from: number; durationInFrames: number; audio: string | null; placeholderAudio: boolean;
  words: Word[]; beats: TimedBeat[];
}

export interface VideoProps {
  segments: Seg[];
  clip: ClipManifest | null;
  endcard: EndcardInfo;
  hasMusic: boolean;
  [key: string]: unknown;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function estimateWords(text: string, wpm: number): Word[] {
  const tokens = text.trim().split(/\s+/);
  const dur = (tokens.length / wpm) * 60;
  const total = tokens.reduce((a, t) => a + t.length + 2, 0);
  let t = 0;
  return tokens.map((tok) => {
    const d = ((tok.length + 2) / total) * dur;
    const w = { text: tok, start: t, end: t + d * 0.9 };
    t += d;
    return w;
  });
}

function timeBeats(beats: Beat[] | undefined, words: Word[], segSec: number): TimedBeat[] {
  if (!beats?.length) return [];
  let searchFrom = 0;
  return beats.map((b, i) => {
    const idx = words.findIndex((w, j) => j >= searchFrom && norm(w.text).startsWith(norm(b.word)));
    if (idx >= 0) { searchFrom = idx + 1; return { ...b, at: words[idx].start }; }
    return { ...b, at: ((i + 1) / (beats.length + 1)) * segSec };
  });
}

export function buildTimeline(vo: VoManifest | null): { segments: Seg[]; totalFrames: number; totalSec: number } {
  const segs = (script.segments as ScriptSegment[]);
  let from = 0;
  const out: Seg[] = [];
  for (const s of segs) {
    const v = vo?.segments.find((m) => m.id === s.id) ?? null;
    const words = v?.words?.length ? v.words : estimateWords(s.text, script.wpm);
    const speech = v?.durationSec ?? (words.length ? words[words.length - 1].end : 0);
    const sec = Math.max(s.minDuration ?? 0, speech + (s.padAfter ?? 0));
    const durationInFrames = Math.ceil(sec * FPS);
    out.push({
      id: s.id, label: s.label, kind: s.visual.kind, shot: s.visual.shot, chapter: s.chapter, onScreen: s.onScreen, text: s.text,
      from, durationInFrames, audio: v?.file ?? null, placeholderAudio: !!v?.placeholder,
      words, beats: timeBeats(s.beats, words, sec),
    });
    from += durationInFrames;
  }
  return { segments: out, totalFrames: from, totalSec: from / FPS };
}

export const MAX_SECONDS: number = script.maxSeconds;
