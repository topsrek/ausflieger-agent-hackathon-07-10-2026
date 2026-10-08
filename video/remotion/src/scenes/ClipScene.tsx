import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { AppClip } from '../components/AppClip';
import { Beats } from '../components/Beats';
import { Lockup } from '../components/Logo';
import { PhoneFrame } from '../components/PhoneFrame';
import { C, SANS } from '../theme';
import { ClipManifest, Seg } from '../timeline';

// The phone is drawn much larger than the frame so the app text is legible at 1080p; it bleeds off
// the top/bottom and each shot frames the part of the screen where the action happens.
const PHONE_H = 1650;
// Vertical focus per shot: 0 = top of the phone screen, 1 = bottom. [start, end] pans slowly.
const FOCUS: Record<string, [number, number]> = {
  S02: [0.3, 0.45], // conflict banner at the top, slots in the middle
  S03: [0.25, 0.6], // preferences form, scrolls down
  S04: [0.42, 0.55], // swipe card + buttons
  S05: [0.25, 0.45], // day timeline
  S06: [0.3, 0.5], // drag + red slot
  S07: [0.55, 0.8], // drawer + search
};

/** Big phone on the left with the recorded app shot, chapter + fact chips on the right, captions below them. */
export const ClipScene: React.FC<{ seg: Seg; clip: ClipManifest | null }> = ({ seg, clip }) => {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [0, 14], [30, 0], { extrapolateRight: 'clamp' });
  const isHook = seg.kind === 'problem';
  const [f0, f1] = FOCUS[seg.shot ?? ''] ?? [0.4, 0.5];
  const focus = interpolate(frame, [0, seg.durationInFrames], [f0, f1], { extrapolateRight: 'clamp' });
  const top = Math.min(40, Math.max(1080 - PHONE_H - 40, 540 - focus * PHONE_H));
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 110, top, transform: `translateY(${slide}px)` }}>
        <PhoneFrame height={PHONE_H}>
          <AppClip clip={clip} shot={seg.shot} durationInFrames={seg.durationInFrames} fallbackText={seg.onScreen} />
        </PhoneFrame>
      </div>
      <div style={{ position: 'absolute', left: 1000, top: 84, right: 80 }}>
        <Lockup size={60} />
        {seg.chapter && (
          <div style={{ marginTop: 64, font: `800 30px/1 ${SANS}`, letterSpacing: '.14em', color: C.accent, textTransform: 'uppercase' }}>
            {seg.chapter}
          </div>
        )}
        {isHook && (
          <div style={{ marginTop: 64, font: `800 30px/1 ${SANS}`, letterSpacing: '.14em', color: C.red, textTransform: 'uppercase' }}>
            Where plans break
          </div>
        )}
        <div style={{ marginTop: 36 }}>
          <Beats beats={seg.beats} big={isHook} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
