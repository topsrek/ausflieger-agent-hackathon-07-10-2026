import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FPS, SANS } from '../theme';
import { TimedBeat } from '../timeline';

const TONES: Record<string, { bg: string; fg: string; border: string }> = {
  red: { bg: C.redSoft, fg: C.red, border: '#f3b9b9' },
  amber: { bg: C.amberSoft, fg: C.amber, border: '#ecd29c' },
  dark: { bg: C.ink, fg: '#fff', border: C.ink },
  green: { bg: C.accentSoft, fg: C.accent, border: '#b9dfd5' },
};

/** Fact chips that pop in on their trigger word. */
export const Beats: React.FC<{ beats: TimedBeat[]; big?: boolean }> = ({ beats, big }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: big ? 22 : 18, alignItems: 'flex-start' }}>
      {beats.filter((b) => b.text).map((b, i) => {
        const startF = Math.round(b.at * FPS);
        const s = spring({ frame: frame - startF, fps, config: { damping: 14, mass: 0.6 } });
        const tone = TONES[b.tone ?? 'green'];
        return (
          <div
            key={i}
            style={{
              opacity: s, transform: `translateX(${(1 - s) * 40}px) scale(${0.9 + s * 0.1})`,
              background: tone.bg, color: tone.fg, border: `3px solid ${tone.border}`, borderRadius: 20,
              padding: big ? '20px 30px' : '16px 26px', font: `700 ${big ? 46 : 38}px/1.2 ${SANS}`, maxWidth: 920,
            }}
          >
            {b.text}
          </div>
        );
      })}
    </div>
  );
};
