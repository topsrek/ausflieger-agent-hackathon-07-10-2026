import React from 'react';
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Mark, Wordmark } from '../components/Logo';
import { C, SANS, SERIF } from '../theme';
import { EndcardInfo } from '../timeline';

// Port of video/endcard.html. QR comes from remotion/public/qr.svg (scripts/make-qr.mjs).
// Long links (raw deployment URLs) shrink to fit; a short link renders at up to 76px.
const linkSize = (s: string) => Math.max(24, Math.min(76, Math.floor(980 / (Math.max(1, s.length) * 0.56))));
export const EndCardScene: React.FC<{ info: EndcardInfo }> = ({ info }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  const q = spring({ frame: frame - 8, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ fontFamily: SANS, color: C.ink }}>
      <div style={{ position: 'absolute', left: 140, top: 200, width: 980, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Mark size={140} />
          <Wordmark size={128} />
        </div>
        <div style={{ marginTop: 44, font: `600 50px/1.2 ${SANS}` }}>
          Trip planning that <span style={{ color: C.accent }}>checks your schedule</span>.
        </div>
        <div style={{ marginTop: 18, font: `italic 400 30px/1.3 ${SERIF}`, color: C.muted }}>
          “Ausflug” (trip) + “Flieger” (flyer): the one who heads out.
        </div>
        <div style={{ marginTop: 22, font: `400 32px/1.4 ${SANS}`, color: C.muted }}>
          Opening hours, last entry, holidays and walking times, with sources. Try the Munich Oktoberfest weekend.
        </div>
        <div style={{ marginTop: 40, display: 'inline-flex', alignItems: 'center', gap: 20, padding: '22px 36px', borderRadius: 22, background: C.ink, color: '#fff', font: `700 ${linkSize(info.shortlink)}px/1 ${SANS}`, whiteSpace: 'nowrap' }}>
          <span style={{ color: C.mint }}>→</span>
          <span>{info.shortlink}</span>
        </div>
      </div>
      <div style={{
        position: 'absolute', right: 140, top: 190, width: 560, height: 640, background: '#fff', borderRadius: 36,
        boxShadow: '0 20px 50px rgba(29,26,22,.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 50,
        opacity: q, transform: `scale(${0.92 + q * 0.08})`,
      }}>
        <Img src={staticFile('qr.svg')} style={{ width: 460, height: 460, imageRendering: 'pixelated' }} />
        <div style={{ marginTop: 30, font: `700 34px/1.2 ${SANS}` }}>Scan to try it</div>
      </div>
      {/* Founder row. Photo: remotion/public/founder.jpg (swap the file to change it). */}
      <div style={{ position: 'absolute', left: 140, top: 836, display: 'flex', alignItems: 'center', gap: 22, opacity: s }}>
        <div style={{ width: 92, height: 92, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${C.card}`, boxShadow: '0 6px 18px rgba(29,26,22,.18)', background: C.accent, flex: 'none' }}>
          <Img src={staticFile('founder.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%', transform: 'scale(1.35)', transformOrigin: '50% 45%' }} />
        </div>
        <div>
          <div style={{ font: `700 30px/1.25 ${SANS}`, color: C.ink }}>Built by Peter Wimberger</div>
          <div style={{ font: `400 26px/1.3 ${SANS}`, color: C.muted }}>Indie builder from Vienna, Austria · topsrek@gmail.com</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 140, right: 140, bottom: 54, display: 'flex', alignItems: 'center', gap: 18, font: `600 26px/1 ${SANS}`, color: C.muted }}>
        <span>Built with</span>
        {['Agent 37', 'OpenClaw', 'Monid', 'Context.dev', 'Supabase', 'InstaCloud'].map((n) => (
          <span key={n} style={{ padding: '12px 20px', border: `2px solid ${C.line}`, borderRadius: 999, color: C.ink, background: 'rgba(255,255,255,.6)' }}>{n}</span>
        ))}
      </div>
      {info.placeholder && (
        <div style={{
          position: 'absolute', top: 40, right: -90, transform: 'rotate(35deg)', background: C.red, color: '#fff',
          font: `800 28px/1 ${SANS}`, padding: '14px 120px', letterSpacing: '.1em',
        }}>
          PLACEHOLDER URL
        </div>
      )}
    </AbsoluteFill>
  );
};
