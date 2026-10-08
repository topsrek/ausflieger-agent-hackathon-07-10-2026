import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FPS, SANS } from '../theme';
import { Word } from '../timeline';

interface Chunk { words: Word[]; start: number; end: number }

/** Groups words into short caption lines: max 7 words, break after punctuation once >= 3 words. */
export function chunkWords(words: Word[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 7 || (cur.length >= 3 && /[.,:;!?]$/.test(w.text))) flush();
  }
  flush();
  return chunks;
}

/** Burned-in captions. "panel" = right column next to the phone, "bottom" = full-width bottom. */
export const Captions: React.FC<{ words: Word[]; placement: 'panel' | 'bottom' | 'left' }> = ({ words, placement }) => {
  const t = useCurrentFrame() / FPS;
  const chunks = chunkWords(words);
  const idx = chunks.findIndex((c, i) =>
    t >= c.start - 0.05 && (i === chunks.length - 1 ? t <= c.end + 0.6 : t < chunks[i + 1].start - 0.05));
  if (idx < 0) return null;
  const chunk = chunks[idx];
  const pos: React.CSSProperties = placement === 'left'
    ? { left: 150, width: 960, bottom: 84, justifyContent: 'flex-start' }
    : placement === 'panel'
    ? { left: 1000, right: 80, bottom: 84, justifyContent: 'flex-start' }
    : { left: 160, right: 160, bottom: 30, justifyContent: 'center' };
  return (
    <div style={{ position: 'absolute', display: 'flex', ...pos }}>
      <div style={{ background: 'rgba(29,26,22,.92)', color: '#fff', borderRadius: 18, padding: '14px 26px', font: `600 40px/1.3 ${SANS}`, maxWidth: '100%' }}>
        {chunk.words.map((w, i) => {
          const active = t >= w.start && t < (chunk.words[i + 1]?.start ?? w.end + 0.3);
          return (
            <span key={i} style={{ color: active ? C.mint : '#fff' }}>
              {w.text}{i < chunk.words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
};
