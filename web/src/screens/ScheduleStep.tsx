import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDroppable,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AlertOctagon, HelpCircle, AlertTriangle, CheckCircle2, Plus, Sparkles, Search, PartyPopper } from 'lucide-react';
import type { Card, IssueSeverity, ScheduleIssue, ScheduledCard } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { TRAVEL_ICON, TRAVEL_LABEL } from '../lib/cardMeta';
import {
  dayCards, placementsForMove, scheduleDay, scheduleDayWithOrder, slotChecks, sortIssues, toBundle, tripDays,
} from '../lib/schedule';
import { formatDayShort, formatDuration, fromMin, toMin, formatDayLong } from '../lib/time';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import { CardDetail } from '../components/CardDetail';
import { Drawer, type DrawerSize } from '../components/Drawer';
import { Sheet } from '../components/Sheet';
import { TimelineCard, TimelineCardBody, type DragData } from '../components/TimelineCard';
import { IssueLine, SeverityPill } from '../components/bits';
import type { SearchWindow } from '../components/SearchAgain';

interface SlotCheck {
  severity: IssueSeverity | null;
  issues: ScheduleIssue[];
}

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function ScheduleStep({ state, session }: { state: TripState; session: TripSession }) {
  const days = tripDays(state);
  const [day, setDay] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`ausflieger.day.${state.trip.id}`);
      if (saved && days.includes(saved)) return saved;
    } catch { /* ignore */ }
    return days[0];
  });
  useEffect(() => {
    try { sessionStorage.setItem(`ausflieger.day.${state.trip.id}`, day); } catch { /* ignore */ }
  }, [day, state.trip.id]);
  useEffect(() => {
    if (!days.includes(day)) setDay(days[0]);
  }, [days, day]);

  const [drawer, setDrawer] = useState<DrawerSize>('peek');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [active, setActive] = useState<DragData | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [checks, setChecks] = useState<SlotCheck[]>([]);
  const [searchWindow, setSearchWindow] = useState<SearchWindow | null>(null);

  const bundle = useMemo(() => toBundle(state), [state]);
  const schedule = useMemo(() => scheduleDay(bundle, day), [bundle, day]);
  const cardsById = useMemo(() => new Map(state.cards.map((c) => [c.id, c])), [state.cards]);
  const daySchedules = useMemo(() => days.map((d) => (d === day ? schedule : scheduleDay(bundle, d))), [days, day, schedule, bundle]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 170, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const items = schedule.items;
  const draggedIndex = active ? items.findIndex((i) => i.card_id === active.cardId) : -1;
  const restIds = items.map((i) => i.card_id).filter((id) => id !== active?.cardId);

  /** Slot checks with arrival/departure boundaries added (nothing before arriving or after leaving). */
  const computeChecks = useCallback((cardId: string): SlotCheck[] => {
    const raw = slotChecks(bundle, cardId, day);
    const rest = dayCards(bundle, day).filter((c) => c.id !== cardId);
    const arrivalIdx = rest.findIndex((c) => c.type === 'arrival');
    const departureIdx = rest.findIndex((c) => c.type === 'departure');
    return raw.map((r, slot) => {
      if (arrivalIdx >= 0 && slot <= arrivalIdx) {
        return { severity: 'blocker', issues: [{ card_id: cardId, severity: 'blocker', code: 'fixed_overlap', message: 'You haven’t arrived yet at this point' }, ...r.issues] };
      }
      if (departureIdx >= 0 && slot > departureIdx) {
        return { severity: 'blocker', issues: [{ card_id: cardId, severity: 'blocker', code: 'fixed_overlap', message: 'You’ve already left the city by then' }, ...r.issues] };
      }
      return r;
    });
  }, [bundle, day]);

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    if (!data) return;
    haptic(12);
    setActive(data);
    setChecks(computeChecks(data.cardId));
  };
  const onDragOver = (e: DragOverEvent) => {
    const id = e.over ? String(e.over.id) : null;
    if (id !== overId) {
      setOverId(id);
      if (id?.startsWith('slot:')) {
        const c = checks[Number(id.slice(5))];
        haptic(c?.severity === 'blocker' ? [4, 20, 4] : 4);
      }
    }
  };
  const reset = () => {
    setActive(null);
    setOverId(null);
    setChecks([]);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const data = active;
    const target = e.over ? String(e.over.id) : null;
    const slotChecksNow = checks;
    reset();
    if (!data || !target) return;
    const card = cardsById.get(data.cardId);
    if (!card) return;
    if (target === 'drawer') {
      if (data.from === 'day') {
        haptic(8);
        void session.setPlacements(placementsForMove(state, card.id, null, 0));
        toast('Moved to the drawer', { detail: card.title });
      }
      return;
    }
    if (target.startsWith('slot:')) {
      const slot = Number(target.slice(5));
      const check = slotChecksNow[slot];
      if (check?.severity === 'blocker') {
        haptic([30, 40, 30]);
        toast('Can’t place it there', { tone: 'error', detail: check.issues[0]?.message });
        return;
      }
      if (data.from === 'day' && draggedIndex === slot && card.day === day) return; // unchanged
      // Keep the drawer collapsed after pulling a card in, so the placed card stays visible.
      if (data.from === 'drawer') setDrawer('peek');
      place(card, slot, check);
    }
  };

  const place = (card: Card, slot: number, check: SlotCheck | undefined) => {
    const run = async () => {
      if (card.swipe_status !== 'accepted') await session.swipe(card.id, 'accepted');
      await session.setPlacements(placementsForMove(state, card.id, day, slot));
    };
    void run();
    haptic(check?.severity ? [8, 30, 8] : 10);
    if (check?.severity === 'warning' || check?.severity === 'needs_checking') {
      toast(check.severity === 'warning' ? 'Placed with a preference warning' : 'Placed – needs checking', {
        tone: 'warning', detail: check.issues[0]?.message,
      });
    }
  };

  /** "+" in the drawer: put the card into the least problematic slot of the current day. */
  const quickAdd = (cardId: string) => {
    const card = cardsById.get(cardId);
    if (!card) return;
    const cs = computeChecks(cardId);
    const rank = (c: SlotCheck) => (c.severity === 'blocker' ? 3 : c.severity === 'warning' ? 2 : c.severity === 'needs_checking' ? 1 : 0);
    let best = -1;
    cs.forEach((c, i) => { if (best < 0 || rank(c) < rank(cs[best])) best = i; });
    if (best < 0 || cs[best].severity === 'blocker') {
      toast(`No slot on ${formatDayShort(day).weekday} without a conflict`, { tone: 'error', detail: cs[best]?.issues[0]?.message });
      haptic([30, 40, 30]);
      return;
    }
    place(card, best, cs[best]);
    toast(`Added to ${formatDayShort(day).weekday}`, { tone: 'success', detail: card.title });
  };

  const addBuffer = (position: number) => {
    haptic(8);
    void session.addBuffer(day, position, state.preferences?.default_buffer_minutes ?? 15);
  };

  // Preview time for the hovered slot.
  const hoverSlot = overId?.startsWith('slot:') ? Number(overId.slice(5)) : null;
  const preview = useMemo(() => {
    if (!active || hoverSlot == null) return null;
    const order = [...restIds];
    order.splice(hoverSlot, 0, active.cardId);
    const prepared = { ...bundle, cards: bundle.cards.map((c) => (c.id === active.cardId ? { ...c, swipe_status: 'accepted' as const } : c)) };
    return scheduleDayWithOrder(prepared, day, order).items.find((i) => i.card_id === active.cardId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hoverSlot, bundle, day, restIds.join(',')]);

  const counts = countIssues(schedule.issues);
  const detailCard = detailId ? cardsById.get(detailId) ?? null : null;
  const detailItem = detailId ? items.find((i) => i.card_id === detailId) ?? null : null;
  const activeCard = active ? cardsById.get(active.cardId) : null;
  const holiday = state.holidays.find((h) => h.date === day);

  // Slot index for each gap position in the rendered list.
  const slotForGap = (gap: number): number | null => {
    if (!active) return null;
    if (draggedIndex < 0) return gap;
    if (gap === draggedIndex + 1) return null; // same as the card's own spot
    return gap <= draggedIndex ? gap : gap - 1;
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={reset}>
      <div className={`schedule ${active ? 'is-dragging' : ''}`}>
        <div className="day-tabs" role="tablist" aria-label="Days">
          {days.map((d, i) => {
            const f = formatDayShort(d);
            const c = countIssues(daySchedules[i].issues);
            const hol = state.holidays.find((h) => h.date === d);
            return (
              <button key={d} type="button" role="tab" data-testid="day-tab" data-day={d} aria-selected={d === day} className={`day-tab ${d === day ? 'on' : ''}`} onClick={() => { haptic(5); setDay(d); }}>
                <span className="day-tab-wd">{f.weekday}</span>
                <span className="day-tab-d">{f.day}</span>
                <span className="day-tab-m">{f.month}</span>
                {c.blocker ? <span className="day-dot sev-blocker" aria-label={`${c.blocker} conflicts`} /> : c.warning || c.needs_checking ? <span className="day-dot sev-warning" /> : null}
                {hol ? <span className="day-hol" title={hol.name}>Holiday</span> : null}
              </button>
            );
          })}
        </div>

        <div className="day-summary">
          <div>
            <h2 className="day-title">{formatDayLong(day)}</h2>
            <p className="muted small">
              {items.length ? `${items[0].start} – ${items[items.length - 1].end} · ${items.filter((i) => cardsById.get(i.card_id)?.type !== 'buffer').length} stops` : 'Nothing planned yet'}
            </p>
          </div>
          <div className="day-counts">
            {counts.blocker ? <SeverityPill severity="blocker">{counts.blocker}</SeverityPill> : null}
            {counts.warning ? <SeverityPill severity="warning">{counts.warning}</SeverityPill> : null}
            {counts.needs_checking ? <SeverityPill severity="needs_checking">{counts.needs_checking}</SeverityPill> : null}
            {!counts.blocker && !counts.warning && !counts.needs_checking && items.length ? <span className="ok-pill"><CheckCircle2 size={13} /> Fits</span> : null}
          </div>
        </div>
        {holiday ? (
          <div className="holiday-note"><PartyPopper size={15} /> <span><b>{holiday.name}</b> · venue-specific hours are checked; a holiday alone doesn’t mean closed.</span></div>
        ) : null}

        <ol className="timeline" aria-label={`Schedule for ${formatDayLong(day)}`}>
          {items.length === 0 ? (
            <EmptyDay active={!!active} slot={slotForGap(0)} check={checks[0]} isOver={hoverSlot === 0} onOpenDrawer={() => setDrawer('half')} />
          ) : null}
          {items.map((item, idx) => {
            const card = cardsById.get(item.card_id);
            if (!card) return null;
            const prev = idx > 0 ? items[idx - 1] : null;
            const gapSlot = slotForGap(idx);
            return (
              <Fragment key={item.card_id}>
                {active ? (
                  gapSlot != null ? <DropSlot slot={gapSlot} check={checks[gapSlot]} isOver={hoverSlot === gapSlot} preview={hoverSlot === gapSlot ? preview : null} current={draggedIndex === idx} /> : null
                ) : (
                  <Gap prev={prev} item={item} prevCard={prev ? cardsById.get(prev.card_id) : undefined} card={card} buffer={state.preferences?.default_buffer_minutes ?? 15}
                    onAddBuffer={() => addBuffer(idx)}
                    onFindForGap={(start, end) => { setSearchWindow({ day, start, end }); haptic(6); }} />
                )}
                <li className="tl-row">
                  <div className="tl-time">
                    <span className="tl-start">{item.start}</span>
                    {item.end !== item.start ? <span className="tl-end">{item.end}</span> : null}
                  </div>
                  <TimelineCard card={card} item={item} state={state} session={session} onOpen={setDetailId} />
                </li>
              </Fragment>
            );
          })}
          {active && items.length ? (() => {
            const s = slotForGap(items.length);
            return s != null ? <DropSlot slot={s} check={checks[s]} isOver={hoverSlot === s} preview={hoverSlot === s ? preview : null} last /> : null;
          })() : null}
          {!active && items.length ? (
            <li className="tl-end-row">
              <button type="button" className="ghost-add" onClick={() => addBuffer(items.length)}><Plus size={14} /> Buffer</button>
              <button type="button" className="ghost-add" onClick={() => setDrawer('half')}><Sparkles size={14} /> Add from drawer</button>
            </li>
          ) : null}
        </ol>
        <div className="drawer-spacer" />

        <Drawer
          state={state}
          session={session}
          size={drawer}
          setSize={setDrawer}
          dragging={!!active}
          draggingFrom={active?.from ?? null}
          days={days}
          onOpen={setDetailId}
          onQuickAdd={quickAdd}
          searchWindow={searchWindow}
          onSearchWindowUsed={() => setSearchWindow(null)}
        />
      </div>

      {active && hoverSlot != null && checks[hoverSlot] ? (
        <div className={`drag-hint sev-${checks[hoverSlot].severity ?? 'ok'}`} role="status">
          {checks[hoverSlot].severity === 'blocker' ? <AlertOctagon size={16} /> : checks[hoverSlot].severity === 'warning' ? <AlertTriangle size={16} /> : checks[hoverSlot].severity === 'needs_checking' ? <HelpCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>
            {checks[hoverSlot].severity === 'blocker' ? <b>Can’t go here. </b> : preview ? <b>{preview.start}–{preview.end} </b> : null}
            {checks[hoverSlot].issues[0]?.message ?? 'Fits with all known constraints'}
          </span>
        </div>
      ) : null}
      {active && overId === 'drawer' && active.from === 'day' ? <div className="drag-hint sev-ok" role="status"><span>Release to move it back to the drawer</span></div> : null}

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {activeCard ? (
          <div className={`tl-card drag-overlay ${hoverSlot != null && checks[hoverSlot]?.severity ? `sev-${checks[hoverSlot].severity}` : ''}`}>
            <TimelineCardBody card={activeCard} state={state} overlay />
          </div>
        ) : null}
      </DragOverlay>

      <Sheet open={!!detailCard} onClose={() => setDetailId(null)} labelledBy="detail-title">
        {detailCard ? (
          <CardDetail card={detailCard} state={state} session={session} scheduled={detailItem} onClose={() => setDetailId(null)} inDrawer={!detailCard.day} />
        ) : null}
        {detailCard && !detailCard.day ? (
          <div className="sheet-cta">
            <button type="button" className="btn btn-primary btn-block" onClick={() => { quickAdd(detailCard.id); setDetailId(null); }}>
              <Plus size={16} /> Add to {formatDayShort(day).weekday} {formatDayShort(day).day}
            </button>
          </div>
        ) : null}
      </Sheet>
    </DndContext>
  );
}

function countIssues(issues: ScheduleIssue[]): Record<IssueSeverity, number> {
  const out: Record<IssueSeverity, number> = { blocker: 0, warning: 0, needs_checking: 0 };
  for (const i of issues) out[i.severity] += 1;
  return out;
}

function Gap({ prev, item, prevCard, card, buffer, onAddBuffer, onFindForGap }: {
  prev: ScheduledCard | null; item: ScheduledCard; prevCard?: Card; card: Card; buffer: number;
  onAddBuffer: () => void; onFindForGap: (start: string, end: string) => void;
}) {
  if (!prev) return null;
  const tr = item.travel_before;
  const missing = item.issues.some((i) => i.code === 'missing_travel_time');
  const prevEnd = toMin(prev.end) ?? 0;
  const start = toMin(item.start) ?? 0;
  const travelMax = tr ? tr.max_minutes + (prevCard?.place_id && card.place_id ? buffer : 0) : 0;
  const free = start - prevEnd - travelMax;
  const Icon = tr ? TRAVEL_ICON[tr.mode] : null;
  const hasTravel = !!tr;
  if (!hasTravel && free < 20 && !missing) {
    return (
      <li className="tl-gap tight">
        <span className="gap-line" />
        <button type="button" className="gap-add" onClick={onAddBuffer} aria-label="Add buffer here"><Plus size={12} /></button>
      </li>
    );
  }
  return (
    <li className={`tl-gap ${missing ? 'is-missing' : ''}`}>
      <span className="gap-line" />
      <div className="gap-content">
        {hasTravel && Icon ? (
          <span className="gap-travel">
            <Icon size={13} aria-hidden="true" />
            {missing ? <>Travel time unknown · assuming {tr!.max_minutes} min</> : <>{TRAVEL_LABEL[tr!.mode]} {tr!.min_minutes}–{tr!.max_minutes} min</>}
            {!missing && prevCard?.place_id && card.place_id ? <span className="gap-buf">+{buffer} min buffer</span> : null}
          </span>
        ) : null}
        {free >= 20 ? (
          <button type="button" className="gap-free" onClick={() => onFindForGap(fromMin(prevEnd + travelMax), item.start)}>
            {formatDuration(free)} free · <Search size={11} /> find something
          </button>
        ) : null}
        <button type="button" className="gap-add" onClick={onAddBuffer} aria-label="Add buffer here"><Plus size={12} /></button>
      </div>
    </li>
  );
}

const SLOT_ICON = { blocker: AlertOctagon, warning: AlertTriangle, needs_checking: HelpCircle } as const;

function DropSlot({ slot, check, isOver, preview, current, last }: {
  slot: number; check: SlotCheck | undefined; isOver: boolean; preview: ScheduledCard | null; current?: boolean; last?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `slot:${slot}` });
  const sev = check?.severity ?? null;
  const Icon = sev ? SLOT_ICON[sev] : CheckCircle2;
  const reason = check?.issues[0]?.message;
  return (
    <li ref={setNodeRef} data-testid="drop-slot" data-slot={slot} data-severity={sev ?? 'ok'} className={`drop-slot ${sev ? `sev-${sev}` : 'sev-ok'} ${isOver ? 'is-over' : ''} ${current ? 'is-current' : ''} ${last ? 'is-last' : ''}`}>
      <div className="drop-slot-inner">
        <Icon size={14} aria-hidden="true" />
        <span className="drop-slot-text">
          {isOver
            ? sev === 'blocker'
              ? reason
              : <>{preview ? <b>{preview.start}–{preview.end}</b> : null} {sev ? reason : current ? 'Keep here' : 'Fits here'}</>
            : current ? 'Current spot' : sev === 'blocker' ? 'Blocked' : sev === 'warning' ? 'Preference' : sev === 'needs_checking' ? 'Needs checking' : 'Fits'}
        </span>
      </div>
      {isOver && check && check.issues.length > 1 ? (
        <div className="drop-slot-more">
          {sortIssues(check.issues).slice(1, 3).map((i, n) => <IssueLine key={n} issue={i} />)}
        </div>
      ) : null}
    </li>
  );
}

function EmptyDay({ active, slot, check, isOver, onOpenDrawer }: { active: boolean; slot: number | null; check?: SlotCheck; isOver: boolean; onOpenDrawer: () => void }) {
  if (active && slot != null) return <DropSlot slot={slot} check={check} isOver={isOver} preview={null} last />;
  return (
    <li className="empty-day">
      <Sparkles size={22} />
      <p>No cards on this day yet.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenDrawer}>Open the drawer</button>
    </li>
  );
}

