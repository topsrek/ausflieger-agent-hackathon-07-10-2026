import React from 'react';
import { AbsoluteFill, Freeze, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { C, FPS, SANS } from '../theme';
import { ClipManifest } from '../timeline';
import { Mark } from './Logo';

/**
 * Plays one shot (time range) of the recorded app video, fitted to the segment length:
 * playback rate is adjusted within 0.75x..2.2x, and the last frame is held if the clip is still shorter.
 * Without a recording, shows a labelled placeholder screen (animatic mode).
 */
export const AppClip: React.FC<{ clip: ClipManifest | null; shot?: string; durationInFrames: number; fallbackText: string }> = ({
  clip, shot, durationInFrames, fallbackText,
}) => {
  const range = shot ? clip?.shots?.[shot] : undefined;
  if (!clip || !range) return <PlaceholderScreen shot={shot} text={fallbackText} />;
  const clipSec = Math.max(0.5, range.end - range.start);
  const segSec = durationInFrames / FPS;
  const rate = Math.min(2.2, Math.max(0.75, clipSec / segSec));
  const playFrames = Math.min(durationInFrames, Math.floor((clipSec / rate) * FPS));
  // Older takes were padded (content in the top-left of a larger frame): scale so the content fills the screen.
  const kx = clip.content ? clip.width / clip.content.width : 1;
  const ky = clip.content ? clip.height / clip.content.height : 1;
  const video = (
    <OffthreadVideo
      src={staticFile(clip.file)}
      trimBefore={Math.round(range.start * FPS)}
      trimAfter={Math.round(range.end * FPS)}
      playbackRate={rate}
      muted
      style={{ position: 'absolute', left: 0, top: 0, width: `${kx * 100}%`, height: `${ky * 100}%`, objectFit: 'fill' }}
    />
  );
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={playFrames}>{video}</Sequence>
      {playFrames < durationInFrames && (
        <Sequence from={playFrames}>
          <Freeze frame={Math.max(0, playFrames - 1)}>{video}</Freeze>
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const PlaceholderScreen: React.FC<{ shot?: string; text: string }> = ({ shot, text }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: SANS, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 30 }}>
      <Mark size={34} />
      <span style={{ fontWeight: 700, fontSize: 20, color: C.ink }}>Ausflieger</span>
    </div>
    <div style={{ marginTop: 10, padding: '8px 12px', alignSelf: 'flex-start', borderRadius: 999, background: C.redSoft, color: C.red, fontWeight: 800, fontSize: 16, letterSpacing: '.06em' }}>
      TODO: RECORD SHOT {shot ?? ''}
    </div>
    <div style={{ fontSize: 19, lineHeight: 1.4, color: C.ink }}>{text}</div>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ height: 84, borderRadius: 18, background: C.card, border: `2px solid ${C.line}`, opacity: 0.8 - i * 0.2 }} />
    ))}
  </AbsoluteFill>
);
