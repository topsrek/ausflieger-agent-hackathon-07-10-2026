import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AppClip } from '../components/AppClip';
import { Mark, Wordmark } from '../components/Logo';
import { PhoneFrame } from '../components/PhoneFrame';
import { C, SANS, SERIF } from '../theme';
import { ClipManifest, Seg } from '../timeline';

/** Opening: logo, name pun and pitch on the left; the planned day on the phone to the right. */
export const IntroScene: React.FC<{ seg: Seg; clip: ClipManifest | null }> = ({ seg, clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.7 } });
  const at = (sec: number) => interpolate(frame, [sec * fps, sec * fps + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Show the pun when "German" is spoken, the pitch when "agent" is spoken.
  const tOf = (w: string, fallback: number) => seg.words.find((x) => x.text.toLowerCase().startsWith(w))?.start ?? fallback;
  const pun = at(tOf('german', 1.5));
  const pitch = at(tOf('agent', 5));
  const phone = at(0.6);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 150, top: 230, width: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Mark size={170} style={{ transform: `scale(${pop}) rotate(${(1 - pop) * -20}deg)` }} />
          <div style={{ opacity: pop }}><Wordmark size={130} /></div>
        </div>
        <div style={{ opacity: pun, marginTop: 44, font: `italic 400 44px/1.3 ${SERIF}`, color: C.muted }}>
          <span style={{ color: C.ink }}>Ausflug</span> (trip) + <span style={{ color: C.ink }}>Flieger</span> (flyer):
          <br />the one who heads out.
        </div>
        <div style={{ opacity: pitch, transform: `translateY(${(1 - pitch) * 20}px)`, marginTop: 48, font: `700 52px/1.25 ${SANS}`, color: C.ink }}>
          An agent researches your city.
          <br />
          <span style={{ color: C.accent }}>The app checks your day actually works.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 170, top: 60, opacity: phone, transform: `translateY(${(1 - phone) * 40}px)` }}>
        <PhoneFrame height={960}>
          <AppClip clip={clip} shot={seg.shot} durationInFrames={seg.durationInFrames} fallbackText={seg.onScreen} />
        </PhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
