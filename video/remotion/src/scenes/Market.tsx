import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Lockup } from '../components/Logo';
import { C, FPS, SANS, SERIF } from '../theme';
import { Seg } from '../timeline';

const CARDS = [
  { who: 'Travelers', what: 'Freemium', sub: 'Free planner, premium for longer trips and live re-checks', bg: C.accentSoft, fg: C.accent },
  { who: 'Tourism boards, hotels, city cards', what: 'White-label', sub: 'Their guests plan with verified local hours', bg: C.violetSoft, fg: C.violet },
  { who: 'Bookable activities', what: 'Affiliate', sub: 'Commission on tickets and tables booked from a card', bg: C.warmSoft, fg: C.warm },
];

/** "How we'd grow": three cards popping in on the spoken keywords. */
export const MarketScene: React.FC<{ seg: Seg }> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: 140, top: 90 }}><Lockup size={60} /></div>
      <div style={{ position: 'absolute', left: 140, top: 220, font: `700 72px/1.1 ${SERIF}`, color: C.ink }}>How we’d grow</div>
      <div style={{ position: 'absolute', left: 140, right: 140, top: 380, display: 'flex', gap: 40 }}>
        {CARDS.map((c, i) => {
          const at = seg.beats[i]?.at ?? i * 2;
          const s = spring({ frame: frame - Math.round(at * FPS) + 6, fps, config: { damping: 14 } });
          return (
            <div key={c.what} style={{
              flex: 1, background: C.card, borderRadius: 28, padding: 40, border: `3px solid ${C.line}`,
              boxShadow: '0 14px 34px rgba(29,26,22,.08)', opacity: s, transform: `translateY(${(1 - s) * 40}px)`,
            }}>
              <div style={{ display: 'inline-block', background: c.bg, color: c.fg, borderRadius: 999, padding: '10px 20px', font: `800 28px/1 ${SANS}` }}>{c.what}</div>
              <div style={{ marginTop: 28, font: `700 40px/1.2 ${SANS}`, color: C.ink }}>{c.who}</div>
              <div style={{ marginTop: 16, font: `400 30px/1.35 ${SANS}`, color: C.muted }}>{c.sub}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
