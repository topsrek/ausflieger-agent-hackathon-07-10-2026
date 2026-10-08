import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Mark } from '../components/Logo';
import { C, FPS, SANS, SERIF } from '../theme';
import { Seg } from '../timeline';

// Port of video/architecture.html (1920x1080 layout). Boxes light up on the voiceover beats
// (script.json s08-architecture.beats: agent, subagents, tools, supabase, planner). Keep both in sync.

type Key = 'agent' | 'subagents' | 'tools' | 'supabase' | 'planner';

const Box: React.FC<{ k?: Key; active: Key | null; style: React.CSSProperties; children: React.ReactNode }> = ({ k, active, style, children }) => {
  const on = !!k && active === k;
  const dim = active !== null && !on;
  return (
    <div
      style={{
        position: 'absolute', background: C.card, border: `2px solid ${on ? C.accent : C.line}`, borderRadius: 22, padding: '22px 26px',
        boxShadow: on ? '0 0 0 8px rgba(15,107,92,.18), 0 14px 34px rgba(29,26,22,.14)' : '0 8px 24px rgba(29,26,22,.06)',
        opacity: dim ? 0.38 : 1, transition: 'none', ...style,
      }}
    >
      {children}
    </div>
  );
};

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ font: `700 32px/1.15 ${SANS}`, color: C.ink }}>{children}</div>;
const P: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ font: `400 23px/1.35 ${SANS}`, color: C.muted, marginTop: 8, ...style }}>{children}</div>
);
const Tag: React.FC<{ bg: string; fg: string; children: React.ReactNode }> = ({ bg, fg, children }) => (
  <span style={{ display: 'inline-block', marginTop: 10, padding: '6px 14px', borderRadius: 999, background: bg, color: fg, font: `700 21px/1.2 ${SANS}` }}>{children}</span>
);
const Mini: React.FC<{ bg: string; fg?: string; title: string; sub: string; mt?: number; pad?: number }> = ({ bg, fg = C.ink, title, sub, mt = 26, pad = 18 }) => (
  <div style={{ background: bg, color: fg, borderRadius: 14, padding: `${pad}px 18px`, marginTop: mt, font: `600 22px/1.25 ${SANS}` }}>
    {title}
    <div style={{ fontWeight: 400, color: C.muted, fontSize: 19, marginTop: 4 }}>{sub}</div>
  </div>
);
const Pill: React.FC<{ left: number; active: Key | null; label: string }> = ({ left, active, label }) => {
  const on = active === 'subagents';
  return (
    <div style={{
      position: 'absolute', left, top: 462, width: 140, height: 64, borderRadius: 16, background: C.violetSoft,
      border: `2px solid ${on ? C.violet : '#cfcaf2'}`, display: 'grid', placeItems: 'center', textAlign: 'center',
      font: `600 22px/1.15 ${SANS}`, color: C.violet, opacity: active !== null && !on ? 0.38 : 1,
      boxShadow: on ? '0 0 0 6px rgba(91,75,196,.18)' : 'none',
    }}>
      <div>subagent<br />{label}</div>
    </div>
  );
};
const Label: React.FC<{ left: number; top: number; color?: string; children: React.ReactNode }> = ({ left, top, color = C.ink, children }) => (
  <div style={{ position: 'absolute', left, top, font: `700 22px/1.2 ${SANS}`, color, background: C.bg, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>{children}</div>
);

export const ArchitectureLayout: React.FC<{ active: Key | null; flow: number }> = ({ active, flow }) => (
  <div style={{ position: 'relative', width: 1920, height: 1080 }}>
    <div style={{ position: 'absolute', left: 96, top: 64, font: `700 24px/1 ${SANS}`, letterSpacing: '.18em', color: C.accent }}>UNDER THE HOOD</div>
    <div style={{ position: 'absolute', right: 96, top: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
      <Mark size={64} />
      <span style={{ font: `700 40px/1 ${SERIF}`, color: C.ink }}>Ausflieger</span>
    </div>
    <div style={{ position: 'absolute', left: 96, top: 104, font: `700 56px/1.1 ${SERIF}`, color: C.ink, letterSpacing: '-.01em' }}>
      Agents research. The planner checks.
    </div>

    <Box k="planner" active={active} style={{ left: 96, top: 250, width: 470, height: 110 }}>
      <H2>You</H2>
      <P style={{ marginTop: 4 }}>Phone or laptop browser</P>
    </Box>
    <Box k="planner" active={active} style={{ left: 96, top: 440, width: 470, height: 460 }}>
      <H2>Web app</H2>
      <Tag bg={C.warmSoft} fg={C.warm}>hosted on InstaCloud</Tag>
      <P>Swipe deck · day calendar · drawer · Search again</P>
      <div style={{ marginTop: 18, borderRadius: 16, background: C.accentSoft, padding: '16px 18px' }}>
        <div style={{ font: `700 25px/1.2 ${SANS}`, color: C.accent }}>Deterministic planner</div>
        <div style={{ font: `400 21px/1.35 ${SANS}`, color: C.ink, marginTop: 6 }}>
          Runs in the browser, instantly on every drag: opening hours, last entry, fixed times, walking range (upper bound)
        </div>
        <div style={{ font: `600 21px/1.35 ${SANS}`, color: C.accent, marginTop: 6 }}>→ a reason, or “needs checking”</div>
      </div>
    </Box>

    <Box k="supabase" active={active} style={{ left: 715, top: 250, width: 470, height: 650 }}>
      <H2>Supabase</H2>
      <Tag bg={C.accentSoft} fg={C.accent}>shared state</Tag>
      <Mini bg="#f3f0ea" title="Postgres" sub="trips · cards · facts + evidence · research_jobs · travel times" />
      <Mini bg={C.accentSoft} fg={C.accent} title="Realtime" sub="streams each new card to the app as it lands" />
      <Mini bg="#f3f0ea" title="Storage" sub="hotel booking PDFs, tickets" />
    </Box>

    <div style={{ position: 'absolute', left: 1320, top: 250, width: 504, height: 650, border: '3px dashed #b9b0a1', borderRadius: 28 }}>
      <div style={{ position: 'absolute', top: -20, left: 28, background: C.bg, padding: '0 12px', font: `800 26px/40px ${SANS}`, color: C.ink }}>
        Agent 37 · cloud runtime
      </div>
    </div>
    <Box k="agent" active={active} style={{ left: 1348, top: 290, width: 448, height: 132 }}>
      <H2>OpenClaw agent</H2>
      <P>Research prompt: planning-critical facts first</P>
    </Box>
    <Pill left={1348} active={active} label="card A" />
    <Pill left={1502} active={active} label="card B" />
    <Pill left={1656} active={active} label="card C" />
    <Box k="tools" active={active} style={{ left: 1348, top: 562, width: 448, height: 324, padding: '16px 18px' }}>
      <div style={{ font: `700 22px/1 ${SANS}`, color: C.muted, letterSpacing: '.08em' }}>TOOLS PER TASK</div>
      <Mini bg={C.violetSoft} fg={C.violet} title="Monid" sub="discover → run: best tool per task" mt={14} pad={12} />
      <Mini bg={C.warmSoft} fg={C.warm} title="Context.dev" sub="official pages → structured JSON" mt={10} pad={12} />
      <Mini bg="#f3f0ea" title="Web & browser" sub="search, JS-heavy pages, event calendars" mt={10} pad={12} />
    </Box>

    <svg style={{ position: 'absolute', inset: 0 }} width={1920} height={1080} viewBox="0 0 1920 1080">
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.ink} />
        </marker>
        <marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.accent} />
        </marker>
      </defs>
      <line x1="331" y1="364" x2="331" y2="434" stroke={C.ink} strokeWidth="4" markerStart="url(#ah)" markerEnd="url(#ah)" />
      <line x1="570" y1="560" x2="708" y2="560" stroke={C.ink} strokeWidth="4" markerEnd="url(#ah)" />
      <line x1="708" y1="760" x2="572" y2="760" stroke={C.accent} strokeWidth="5" markerEnd="url(#ahg)" strokeDasharray="14 8" strokeDashoffset={-flow} />
      <line x1="1190" y1="356" x2="1340" y2="356" stroke={C.ink} strokeWidth="4" markerEnd="url(#ah)" />
      <line x1="1340" y1="720" x2="1192" y2="720" stroke={C.accent} strokeWidth="5" markerEnd="url(#ahg)" strokeDasharray="14 8" strokeDashoffset={-flow} />
      <g stroke={C.violet} strokeWidth="4">
        <line x1="1572" y1="424" x2="1572" y2="456" />
        <line x1="1418" y1="440" x2="1726" y2="440" />
        <line x1="1418" y1="440" x2="1418" y2="458" />
        <line x1="1726" y1="440" x2="1726" y2="458" />
        <line x1="1572" y1="528" x2="1572" y2="560" />
      </g>
    </svg>
    <Label left={580} top={516}>jobs</Label>
    <Label left={576} top={776} color={C.accent}>cards, live</Label>
    <Label left={1196} top={312}>picks up</Label>
    <Label left={1200} top={676} color={C.accent}>writes</Label>

    <div style={{
      position: 'absolute', left: 96, right: 96, top: 940, height: 92, borderRadius: 20, background: C.ink, color: '#fff',
      display: 'flex', alignItems: 'center', gap: 28, padding: '0 32px', font: `500 24px/1.3 ${SANS}`,
    }}>
      <b style={{ color: C.mint, whiteSpace: 'nowrap' }}>Every card →</b>
      {['opening hours & last entry', 'duration', 'walk 10–15 min', 'source + evidence'].map((t) => (
        <span key={t} style={{ background: '#2f2a24', borderRadius: 999, padding: '8px 16px', whiteSpace: 'nowrap' }}>{t}</span>
      ))}
      <span style={{ background: C.amberSoft, color: C.amber, fontWeight: 700, borderRadius: 999, padding: '8px 16px', whiteSpace: 'nowrap' }}>
        unknown → needs checking
      </span>
    </div>
  </div>
);

export const ArchitectureScene: React.FC<{ seg: Seg }> = ({ seg }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  let active: Key | null = null;
  for (const b of seg.beats) if (b.key && t >= b.at) active = b.key as Key;
  const enter = interpolate(frame, [0, 15], [0.96, 0.9], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${enter})`, transformOrigin: '50% 0%' }}>
        <ArchitectureLayout active={active} flow={frame * 1.5} />
      </div>
    </AbsoluteFill>
  );
};
