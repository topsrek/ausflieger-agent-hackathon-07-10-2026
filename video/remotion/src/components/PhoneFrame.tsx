import React from 'react';
import { C } from '../theme';

export const SCREEN_W = 390;
export const SCREEN_H = 844;

/** Phone bezel around a 390x844 CSS-pixel screen, scaled to the given outer height. */
export const PhoneFrame: React.FC<{ height: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ height, children, style }) => {
  const bezel = 16;
  const scale = (height - bezel * 2) / SCREEN_H;
  const w = SCREEN_W * scale + bezel * 2;
  return (
    <div
      style={{
        width: w, height, borderRadius: 66, background: '#16140f', padding: bezel, position: 'relative', flex: 'none',
        boxShadow: '0 40px 80px rgba(29,26,22,.25), 0 0 0 2px #3a352d inset', ...style,
      }}
    >
      <div style={{ width: SCREEN_W * scale, height: SCREEN_H * scale, borderRadius: 52, overflow: 'hidden', background: C.bg, position: 'relative' }}>
        {children}
      </div>
    </div>
  );
};
