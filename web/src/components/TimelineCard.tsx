import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Lock, Minus, Plus, Hourglass } from 'lucide-react';
import type { Card, ScheduledCard } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { TYPE_META } from '../lib/cardMeta';
import { sortIssues, worst, effectiveDuration } from '../lib/schedule';
import { formatDuration } from '../lib/time';
import { haptic } from '../lib/haptics';
import { CardArt, IssueLine, ResearchBadge } from './bits';
import { ProposalBanner } from './ProposalBanner';

export interface DragData {
  cardId: string;
  from: 'day' | 'drawer';
}

/** Body of a card in the timeline / drag overlay (no drag wiring). */
export function TimelineCardBody({ card, item, state, overlay }: { card: Card; item?: ScheduledCard; state: TripState; overlay?: boolean }) {
  const issues = item ? sortIssues(item.issues) : [];
  const meta = TYPE_META[card.type] ?? TYPE_META.other;
  const dur = effectiveDuration(card, state.preferences);
  return (
    <div className="tl-card-inner">
      <CardArt card={card} size="sm" />
      <div className="tl-main">
        <div className="tl-title-row">
          <b className="tl-title">{card.title}</b>
        </div>
        <div className="tl-sub">
          <span>{meta.label}</span>
          {dur > 0 ? <span>· {formatDuration(dur)}</span> : null}
          {card.price_text && !overlay ? <span className="tl-price">· {card.price_text}</span> : null}
        </div>
        {card.research_state === 'pending' || card.research_state === 'researching' || card.research_state === 'failed' ? <ResearchBadge state={card.research_state} compact /> : null}
        {!overlay && issues.length ? (
          <div className="tl-issues">
            <IssueLine issue={issues[0]} />
            {issues.length > 1 ? <span className="tl-more">+{issues.length - 1} more</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const TimelineCard = memo(function TimelineCard({ card, item, state, session, onOpen, dimmed }: {
  card: Card; item: ScheduledCard; state: TripState; session: TripSession; onOpen: (id: string) => void; dimmed?: boolean;
}) {
  const locked = card.is_fixed;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.id}`,
    data: { cardId: card.id, from: 'day' } satisfies DragData,
    disabled: locked,
  });
  const sev = worst(item.issues);
  const proposal = state.proposals.find((p) => p.card_id === card.id && p.status === 'pending');

  if (card.type === 'buffer') {
    const dur = card.duration_minutes ?? 15;
    const set = (m: number) => { haptic(5); void session.updateCard(card.id, { duration_minutes: Math.max(5, Math.min(240, m)) }); };
    return (
      <div ref={setNodeRef} data-testid="schedule-buffer" data-card-id={card.id} className={`tl-buffer ${isDragging || dimmed ? 'is-ghost' : ''}`} {...attributes} {...listeners} aria-roledescription="draggable buffer">
        <Hourglass size={14} aria-hidden="true" />
        <span className="tl-buffer-label">Buffer</span>
        <div className="tl-buffer-ctrl" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button type="button" className="mini-btn" aria-label="5 minutes less" onClick={() => set(dur - 5)}><Minus size={13} /></button>
          <b aria-live="polite">{dur} min</b>
          <button type="button" className="mini-btn" aria-label="5 minutes more" onClick={() => set(dur + 5)}><Plus size={13} /></button>
        </div>
        <button type="button" className="tl-buffer-more" onClick={() => onOpen(card.id)} onPointerDown={(e) => e.stopPropagation()} aria-label="Buffer details">···</button>
      </div>
    );
  }

  return (
    <div className={`tl-card-wrap ${isDragging || dimmed ? 'is-ghost' : ''}`}>
      <div
        ref={setNodeRef}
        data-testid="schedule-card"
        data-card-id={card.id}
        data-title={card.title}
        className={`tl-card ${locked ? 'is-fixed' : ''} ${sev ? `sev-${sev}` : ''} rs-${card.research_state}`}
        onClick={() => onOpen(card.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(card.id); }}
        {...attributes}
        {...(locked ? {} : listeners)}
        tabIndex={0}
        role="button"
        aria-roledescription={locked ? 'fixed card' : 'draggable card'}
        aria-label={`${card.title}, ${item.start} to ${item.end}${locked ? ', fixed' : ''}${item.issues.length ? `, ${item.issues.length} issue${item.issues.length > 1 ? 's' : ''}` : ''}`}
      >
        <TimelineCardBody card={card} item={item} state={state} />
        <span className="tl-handle" aria-hidden="true">{locked ? <Lock size={15} /> : <GripVertical size={16} />}</span>
      </div>
      {proposal ? <ProposalBanner proposal={proposal} state={state} session={session} compact /> : null}
    </div>
  );
});
