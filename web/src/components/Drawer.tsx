import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, GripVertical, Plus, Search, X, Inbox, CalendarPlus } from 'lucide-react';
import type { Card } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { TYPE_META } from '../lib/cardMeta';
import { effectiveDuration } from '../lib/schedule';
import { formatDuration, formatDayShort } from '../lib/time';
import { haptic } from '../lib/haptics';
import { AgentStatus } from './AgentStatus';
import { CardArt, ResearchBadge } from './bits';
import { SearchAgain, type SearchWindow } from './SearchAgain';
import type { DragData } from './TimelineCard';

export type DrawerSize = 'peek' | 'half' | 'full';

const NEW_MS = 90_000;

export function Drawer({ state, session, size, setSize, dragging, draggingFrom, days, onOpen, onQuickAdd, searchWindow, onSearchWindowUsed }: {
  state: TripState; session: TripSession; size: DrawerSize; setSize: (s: DrawerSize) => void;
  dragging: boolean; draggingFrom: 'day' | 'drawer' | null; days: string[]; onOpen: (id: string) => void;
  onQuickAdd: (id: string) => void; searchWindow: SearchWindow | null; onSearchWindowUsed: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'drawer' });
  const [showSearch, setShowSearch] = useState(false);
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (searchWindow) {
      setShowSearch(true);
      setSize('half');
    }
  }, [searchWindow, setSize]);
  useEffect(() => {
    if (size !== 'peek') setSeenAt(Date.now());
  }, [size, state.cards.length]);

  const unscheduled = useMemo(() => state.cards.filter((c) => c.swipe_status === 'accepted' && c.day == null).sort(byNewest), [state.cards]);
  const suggested = useMemo(() => state.cards.filter((c) => c.swipe_status === 'suggested').sort(byNewest), [state.cards]);
  const events = suggested.filter((c) => c.type === 'event');
  const alternatives = suggested.filter((c) => c.type !== 'event');
  const fresh = suggested.filter((c) => new Date(c.created_at).getTime() > seenAt && now - new Date(c.created_at).getTime() < NEW_MS);
  const total = unscheduled.length + suggested.length;
  const searching = state.jobs.some((j) => j.kind === 'search_again' && (j.status === 'running' || j.status === 'queued'));

  // Handle drag on the grip to resize.
  const startY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const onHandleDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (startY.current != null) setDy(e.clientY - startY.current);
  };
  const onHandleUp = () => {
    if (startY.current == null) return;
    const d = dy;
    startY.current = null;
    setDy(0);
    haptic(5);
    if (Math.abs(d) < 6) {
      setSize(size === 'peek' ? 'half' : 'peek');
      return;
    }
    if (d < -60) setSize(size === 'peek' ? 'half' : 'full');
    else if (d > 60) setSize(size === 'full' ? 'half' : 'peek');
  };

  const effSize: DrawerSize = dragging && draggingFrom === 'drawer' ? 'peek' : size;

  return (
    <>
      {effSize !== 'peek' && !dragging ? <div className="drawer-scrim" onClick={() => setSize('peek')} /> : null}
      <section
        ref={setNodeRef}
        className={`drawer size-${effSize} ${dragging ? 'is-dragging' : ''} ${isOver ? 'is-over' : ''} ${draggingFrom === 'day' ? 'is-target' : ''}`}
        style={dy ? { transform: `translate(-50%, ${Math.max(-300, Math.min(300, dy))}px)`, transition: 'none' } : undefined}
        aria-label="More cards"
      >
        <div className="drawer-head" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={() => { startY.current = null; setDy(0); }}>
          <span className="sheet-handle" />
          <div className="drawer-head-row">
            {draggingFrom === 'day' ? (
              <span className="drawer-drop-hint"><Inbox size={16} /> Drop here to move back to the drawer</span>
            ) : (
              <>
                <button type="button" className="drawer-title" onClick={() => setSize(size === 'peek' ? 'half' : 'peek')} aria-expanded={size !== 'peek'}>
                  <b>More cards</b>
                  <span className="count-badge">{total}</span>
                  {fresh.length ? <span className="new-badge" key={fresh.length}>{fresh.length} new</span> : null}
                  {searching ? <span className="live-dot" title="Agent is searching" /> : null}
                </button>
                <button type="button" className="chip-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setShowSearch((s) => !s); if (size === 'peek') setSize('half'); }}>
                  <Search size={14} /> Search again
                </button>
              </>
            )}
          </div>
        </div>
        <div className="drawer-body">
          {showSearch ? (
            <div className="drawer-search">
              <SearchAgain
                key={searchWindow ? `${searchWindow.day}${searchWindow.start}` : 'plain'}
                days={days}
                allowWindow
                busy={searching}
                initialWindow={searchWindow}
                onSearch={(q, w) => {
                  void session.createJob({ kind: 'search_again', query: q || null, window_day: w?.day, window_start: w?.start, window_end: w?.end });
                  setShowSearch(false);
                  onSearchWindowUsed();
                }}
              />
            </div>
          ) : null}
          <AgentStatus state={state} session={session} kinds={['search_again', 'initial_suggestions', 'research_card', 'refresh_card']} idleText="Drag cards into your day, or back here" />

          <DrawerSection title="Ready to plan" hint="Accepted, not yet in a day" cards={unscheduled} state={state} session={session} onOpen={onOpen} onQuickAdd={onQuickAdd} empty="Everything you kept is planned." />
          <DrawerSection title="New & alternatives" cards={alternatives} state={state} session={session} onOpen={onOpen} onQuickAdd={onQuickAdd} suggested freshIds={fresh.map((c) => c.id)} empty={searching ? 'Searching…' : 'Use “Search again” for more ideas.'} />
          {events.length ? <DrawerSection title="Events" cards={events} state={state} session={session} onOpen={onOpen} onQuickAdd={onQuickAdd} suggested freshIds={fresh.map((c) => c.id)} /> : null}
        </div>
      </section>
    </>
  );
}

function byNewest(a: Card, b: Card) {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

function DrawerSection({ title, hint, cards, state, session, onOpen, onQuickAdd, suggested, freshIds = [], empty }: {
  title: string; hint?: string; cards: Card[]; state: TripState; session: TripSession; onOpen: (id: string) => void;
  onQuickAdd: (id: string) => void; suggested?: boolean; freshIds?: string[]; empty?: string;
}) {
  return (
    <div className="drawer-section">
      <h3>{title} <span className="muted">{cards.length}</span>{hint ? <span className="drawer-hint">{hint}</span> : null}</h3>
      {cards.length === 0 && empty ? <p className="muted small drawer-empty">{empty}</p> : null}
      <ul className="drawer-list">
        {cards.map((c) => (
          <DrawerRow key={c.id} card={c} state={state} session={session} onOpen={onOpen} onQuickAdd={onQuickAdd} suggested={suggested} fresh={freshIds.includes(c.id)} />
        ))}
      </ul>
    </div>
  );
}

function DrawerRow({ card, state, session, onOpen, onQuickAdd, suggested, fresh }: {
  card: Card; state: TripState; session: TripSession; onOpen: (id: string) => void; onQuickAdd: (id: string) => void; suggested?: boolean; fresh?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.id}`,
    data: { cardId: card.id, from: 'drawer' } satisfies DragData,
  });
  const meta = TYPE_META[card.type] ?? TYPE_META.other;
  const dur = effectiveDuration(card, state.preferences);
  const windowDay = card.metadata?.preferred_day as string | undefined;
  return (
    <li className={`drawer-row ${isDragging ? 'is-ghost' : ''} ${fresh ? 'is-fresh' : ''}`}>
      <div ref={setNodeRef} className="drawer-row-main" {...attributes} {...listeners} role="button" tabIndex={0}
        onClick={() => onOpen(card.id)} aria-roledescription="draggable card" aria-label={`${card.title}. Drag into the day or tap for details.`}>
        <CardArt card={card} size="sm" />
        <div className="drawer-row-text">
          <b>{card.title}</b>
          <span className="muted small">{meta.label}{dur ? ` · ${formatDuration(dur)}` : ''}{card.price_text ? ` · ${card.price_text}` : ''}{windowDay ? ` · ${formatDayShort(windowDay).weekday}` : ''}</span>
          {card.research_state !== 'ready' ? <ResearchBadge state={card.research_state} compact onRetry={() => void session.createJob({ kind: 'research_card', card_id: card.id })} /> : null}
        </div>
        <GripVertical size={16} className="drawer-grip" aria-hidden="true" />
      </div>
      <div className="drawer-row-actions">
        {suggested ? (
          <>
            <button type="button" className="mini-btn" aria-label={`Skip ${card.title}`} onClick={() => { haptic(6); void session.swipe(card.id, 'rejected'); }}><X size={14} /></button>
            <button type="button" className="mini-btn accent" aria-label={`Keep ${card.title}`} onClick={() => { haptic(8); void session.swipe(card.id, 'accepted'); }}><Check size={14} /></button>
          </>
        ) : null}
        <button type="button" className="mini-btn" aria-label={`Add ${card.title} to this day`} title="Add to the best slot of this day" onClick={() => onQuickAdd(card.id)}>
          {suggested ? <Plus size={14} /> : <CalendarPlus size={14} />}
        </button>
      </div>
    </li>
  );
}
