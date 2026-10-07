import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Heart, Info, Search, Undo2, X, Sparkles } from 'lucide-react';
import type { Card } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { AgentStatus, latestJob } from '../components/AgentStatus';
import { CardArt, KeyFacts, ResearchBadge, SourceChips, TypeTag, sourcesFor } from '../components/bits';
import { CardDetail } from '../components/CardDetail';
import { SearchAgain } from '../components/SearchAgain';
import { Sheet } from '../components/Sheet';
import { autoPlace, tripDays } from '../lib/schedule';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';

const THRESHOLD = 110;

export function SwipeStep({ state, session }: { state: TripState; session: TripSession }) {
  const days = tripDays(state);
  const deck = useMemo(
    () => state.cards.filter((c) => c.swipe_status === 'suggested').sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)),
    [state.cards],
  );
  const liked = state.cards.filter((c) => c.swipe_status === 'accepted' && !['arrival', 'departure', 'buffer', 'hotel'].includes(c.type) && c.confirmed && !c.upload_id);
  const [history, setHistory] = useState<string[]>([]);
  const [detail, setDetail] = useState<Card | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [leaving, setLeaving] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const job = latestJob(state);
  const searching = state.jobs.some((j) => (j.kind === 'initial_suggestions' || j.kind === 'search_again') && (j.status === 'running' || j.status === 'queued'));

  // "+N new" pulse when cards stream in.
  const prevCount = useRef(deck.length);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (deck.length > prevCount.current) setPulse((p) => p + 1);
    prevCount.current = deck.length;
  }, [deck.length]);

  const swipe = useCallback((card: Card, dir: 1 | -1) => {
    haptic(dir > 0 ? [6, 30, 12] : 8);
    setLeaving({ id: card.id, dir });
    setTimeout(() => {
      void session.swipe(card.id, dir > 0 ? 'accepted' : 'rejected');
      setHistory((h) => [...h.slice(-19), card.id]);
      setLeaving(null);
    }, 260);
  }, [session]);

  const undo = () => {
    const id = history[history.length - 1];
    if (!id) return;
    haptic(6);
    setHistory((h) => h.slice(0, -1));
    void session.updateCard(id, { swipe_status: 'suggested', day: null, position: null });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail || searchOpen || !deck[0] || leaving) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') swipe(deck[0], 1);
      if (e.key === 'ArrowLeft') swipe(deck[0], -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck, detail, searchOpen, leaving, swipe]);

  const goSchedule = async () => {
    haptic([8, 40, 8]);
    const placements = autoPlace(state);
    if (placements.length) await session.setPlacements(placements);
    await session.updateTrip({ step: 'scheduling' });
    const placed = new Set(placements.filter((p) => p.day).map((p) => p.id));
    const unplaced = state.cards.filter((c) => c.swipe_status === 'accepted' && c.day == null && !placed.has(c.id)).length;
    if (unplaced > 0) toast(`${unplaced} card${unplaced > 1 ? 's' : ''} waiting in the drawer`, { detail: 'They didn’t fit without a conflict. Drag them in if you like.' });
  };

  const visible = deck.slice(0, 3);

  return (
    <div className="swipe-step">
      <AgentStatus state={state} session={session} idleText="Swipe right to keep, left to skip" />
      <div className="deck-meta">
        <span key={pulse} className={`deck-count ${pulse ? 'pulse' : ''}`}><b>{deck.length}</b> to swipe</span>
        <span className="deck-liked"><Heart size={13} fill="currentColor" /> <b>{liked.length}</b> kept</span>
      </div>

      <div className="deck" aria-live="polite">
        {visible.length === 0 ? (
          searching || (!job && state.jobs.length === 0) ? (
            <div className="deck-empty">
              <div className="skeleton-card" aria-hidden="true">
                <div className="sk sk-art" />
                <div className="sk sk-line w70" />
                <div className="sk sk-line w90" />
                <div className="sk sk-line w50" />
              </div>
              <p className="muted">The agent is researching ideas for your dates…</p>
            </div>
          ) : (
            <div className="deck-empty done">
              <Sparkles size={28} />
              <h3>You’re through the deck</h3>
              <p className="muted">Ask for more ideas, or plan your days with the {liked.length} you kept.</p>
              <button type="button" className="btn btn-ghost" onClick={() => setSearchOpen(true)}><Search size={16} /> Search again</button>
            </div>
          )
        ) : null}
        {visible.slice().reverse().map((card) => {
          const depth = visible.indexOf(card);
          return (
            <SwipeCard
              key={card.id}
              card={card}
              state={state}
              days={days}
              depth={depth}
              leaving={leaving?.id === card.id ? leaving.dir : 0}
              onSwipe={(dir) => swipe(card, dir)}
              onOpen={() => setDetail(card)}
              onRetry={() => void session.createJob({ kind: 'research_card', card_id: card.id })}
            />
          );
        })}
      </div>

      <div className="swipe-controls">
        <button type="button" className="round-btn sm" data-testid="swipe-undo" onClick={undo} disabled={!history.length} aria-label="Undo last swipe"><Undo2 size={18} /></button>
        <button type="button" data-testid="swipe-skip" className="round-btn lg skip" onClick={() => deck[0] && swipe(deck[0], -1)} disabled={!deck[0] || !!leaving} aria-label="Skip"><X size={28} strokeWidth={2.6} /></button>
        <button type="button" data-testid="swipe-like" className="round-btn lg like" onClick={() => deck[0] && swipe(deck[0], 1)} disabled={!deck[0] || !!leaving} aria-label="Keep"><Heart size={26} strokeWidth={2.4} fill="currentColor" /></button>
        <button type="button" className="round-btn sm" onClick={() => deck[0] && setDetail(deck[0])} disabled={!deck[0]} data-testid="swipe-info" aria-label="Details"><Info size={18} /></button>
      </div>

      <div className="swipe-footer">
        <button type="button" data-testid="open-search" className="btn btn-ghost btn-sm" onClick={() => setSearchOpen(true)}><Search size={15} /> Search again</button>
        <button type="button" className="btn btn-primary" data-testid="plan-days" onClick={() => void goSchedule()} disabled={liked.length === 0 && !state.cards.some((c) => c.day)}>
          Plan my days <ArrowRight size={17} />
        </button>
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} labelledBy="detail-title">
        {detail ? (
          <>
            <CardDetail card={state.cards.find((c) => c.id === detail.id) ?? detail} state={state} session={session} onClose={() => setDetail(null)} />
            {(state.cards.find((c) => c.id === detail.id) ?? detail).swipe_status === 'suggested' ? (
              <div className="sheet-cta">
                <button type="button" className="btn btn-ghost" onClick={() => { const c = detail; setDetail(null); swipe(c, -1); }}><X size={16} /> Skip</button>
                <button type="button" className="btn btn-primary" onClick={() => { const c = detail; setDetail(null); swipe(c, 1); }}><Heart size={16} /> Keep</button>
              </div>
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Sheet open={searchOpen} onClose={() => setSearchOpen(false)} title={<h2 className="sheet-h">Search again</h2>}>
        <p className="muted small">The agent searches with your trip and preferences. New ideas stream into the deck; your picks stay as they are.</p>
        <SearchAgain days={days} busy={searching} onSearch={(q, w) => {
          void session.createJob({ kind: 'search_again', query: q || null, window_day: w?.day, window_start: w?.start, window_end: w?.end });
          setSearchOpen(false);
          toast('Searching…', { detail: q || 'More alternatives' });
        }} />
      </Sheet>
    </div>
  );
}

function SwipeCard({ card, state, days, depth, leaving, onSwipe, onOpen, onRetry }: {
  card: Card; state: TripState; days: string[]; depth: number; leaving: 0 | 1 | -1;
  onSwipe: (dir: 1 | -1) => void; onOpen: () => void; onRetry: () => void;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const moved = useRef(false);
  const top = depth === 0;
  const sources = useMemo(() => sourcesFor(card, state), [card, state]);

  const onDown = (e: React.PointerEvent) => {
    if (!top || leaving) return;
    if ((e.target as HTMLElement).closest('a,button')) return;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setDrag({ x: dx, y: dy });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dt = performance.now() - start.current.t;
    const v = Math.abs(dx) / Math.max(dt, 1);
    start.current = null;
    if (!moved.current) {
      setDrag(null);
      onOpen();
      return;
    }
    if (Math.abs(dx) > THRESHOLD || (v > 0.6 && Math.abs(dx) > 40)) {
      onSwipe(dx > 0 ? 1 : -1);
    }
    setDrag(null);
  };

  const dx = drag?.x ?? 0;
  const dy = drag?.y ?? 0;
  let transform: string;
  if (leaving) transform = `translate(${leaving * 520}px, ${dy - 30}px) rotate(${leaving * 22}deg)`;
  else if (drag) transform = `translate(${dx}px, ${dy * 0.4}px) rotate(${dx / 18}deg)`;
  else transform = `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`;
  const likeOpacity = leaving === 1 ? 1 : Math.max(0, Math.min(1, dx / THRESHOLD));
  const skipOpacity = leaving === -1 ? 1 : Math.max(0, Math.min(1, -dx / THRESHOLD));

  return (
    <div
      data-testid={top ? 'swipe-card-top' : 'swipe-card'}
      data-title={card.title}
      className={`swipe-card ${top ? 'is-top' : ''} ${drag ? 'dragging' : ''} ${leaving ? 'leaving' : ''}`}
      style={{ transform, zIndex: 10 - depth, opacity: depth > 2 ? 0 : 1 }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { start.current = null; setDrag(null); }}
      role={top ? 'group' : undefined}
      aria-label={top ? `${card.title}. Swipe right to keep, left to skip, tap for details.` : undefined}
      aria-hidden={!top}
    >
      <div className="swipe-art-wrap">
        <CardArt card={card} size="lg" />
        <div className="swipe-art-tags">
          <TypeTag card={card} />
          <ResearchBadge state={card.research_state} onRetry={onRetry} />
        </div>
        <span className="stamp stamp-like" style={{ opacity: likeOpacity }}>Keep</span>
        <span className="stamp stamp-skip" style={{ opacity: skipOpacity }}>Skip</span>
      </div>
      <div className="swipe-body">
        <h3 className="swipe-title">{card.title}</h3>
        {card.summary ? <p className="swipe-summary">{card.summary}</p> : null}
        <KeyFacts card={card} state={state} days={days} />
        <SourceChips sources={sources} />
      </div>
    </div>
  );
}
