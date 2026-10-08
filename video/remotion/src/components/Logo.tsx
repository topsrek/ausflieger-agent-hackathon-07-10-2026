import React from 'react';
import { C, SERIF } from '../theme';

/** Brand mark (same geometry as brand/logo-mark.svg). */
export const Mark: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block', ...style }}>
    <rect width="64" height="64" rx="15" fill={C.accent} />
    <path d="M33 31 C 27 36, 21 39, 15 47" fill="none" stroke={C.mint} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.1 5.2" />
    <rect x="24.5" y="33" width="9" height="7" rx="2" fill={C.bg} />
    <rect x="9" y="44" width="11" height="9" rx="2.4" fill={C.orange} />
    <path d="M55 9 L21 22 L33 27 Z" fill={C.bg} />
    <path d="M55 9 L33 27 L39 41 Z" fill="#cdeee5" />
    <path d="M33 27 L35 34 L39 41 Z" fill="#0a4f44" opacity=".55" />
  </svg>
);

export const Wordmark: React.FC<{ size: number; color?: string }> = ({ size, color = C.ink }) => (
  <span style={{ font: `700 ${size}px/1 ${SERIF}`, letterSpacing: '-0.02em', color }}>Ausflieger</span>
);

export const Lockup: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3 }}>
    <Mark size={size} />
    <Wordmark size={size * 0.62} />
  </div>
);
