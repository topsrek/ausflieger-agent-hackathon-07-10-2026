import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../theme';

export const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: C.bg,
      backgroundImage: `radial-gradient(1200px 700px at 92% -8%, ${C.accentSoft} 0%, transparent 62%),
        radial-gradient(1000px 640px at -6% 108%, ${C.warmSoft} 0%, transparent 60%)`,
    }}
  />
);
