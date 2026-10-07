// UI-side helpers around the shared planner (planner/src). All schedule maths lives in the planner;
// this file only adapts it for drag previews, auto-placement and proposal impact.
import { checkPlacement, scheduleDay, scheduleDayWithOrder } from '@planner';
import type { Card, CardChangeProposal, DaySchedule, IssueSeverity, ScheduleIssue, TripBundle } from '@shared/types';
import type { Placement, TripState } from '../data/store';
import { daysBetween } from './time';

export { scheduleDay, scheduleDayWithOrder, checkPlacement };
export { effectiveDuration, openingFor } from '@planner';

export const SEVERITY_RANK: Record<IssueSeverity, number> = { needs_checking: 1, warning: 2, blocker: 3 };

export function worst(issues: ScheduleIssue[]): IssueSeverity | null {
  let best: IssueSeverity | null = null;
  for (const i of issues) if (!best || SEVERITY_RANK[i.severity] > SEVERITY_RANK[best]) best = i.severity;
  return best;
}

export function sortIssues(issues: ScheduleIssue[]): ScheduleIssue[] {
  return issues.slice().sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

export function toBundle(s: TripState): TripBundle {
  return {
    trip: s.trip, preferences: s.preferences, places: s.places, cards: s.cards, holidays: s.holidays,
    facts: s.facts, travel_times: s.travel_times,
  };
}

export function tripDays(s: TripState): string[] {
  return daysBetween(s.trip.start_date, s.trip.end_date);
}

export function dayCards(s: TripState | TripBundle, day: string): Card[] {
  return s.cards
    .filter((c) => c.day === day && c.swipe_status === 'accepted')
    .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
}

const issueKey = (i: ScheduleIssue) => `${i.card_id}|${i.code}`;

/**
 * Severity of dropping `cardId` into each slot 0..n of `day` (n = cards on the day without it).
 * Issues the day already had before the move are ignored, so unrelated warnings don't colour every slot.
 */
export function slotChecks(bundle: TripBundle, cardId: string, day: string): { severity: IssueSeverity | null; issues: ScheduleIssue[] }[] {
  const prepared: TripBundle = {
    ...bundle,
    // A suggested card dragged from the drawer is treated as accepted for the check.
    cards: bundle.cards.map((c) => (c.id === cardId && c.swipe_status !== 'accepted' ? { ...c, swipe_status: 'accepted', day: null, position: null } : c)),
  };
  const base = dayCards(prepared, day).filter((c) => c.id !== cardId).map((c) => c.id);
  const baseline = new Set(scheduleDayWithOrder(prepared, day, base).issues.map(issueKey));
  const out: { severity: IssueSeverity | null; issues: ScheduleIssue[] }[] = [];
  for (let pos = 0; pos <= base.length; pos++) {
    const issues = checkPlacement(prepared, cardId, day, pos).filter((i) => i.card_id === cardId || !baseline.has(issueKey(i)));
    out.push({ severity: worst(issues), issues: sortIssues(issues) });
  }
  return out;
}

/** Placements for moving `cardId` into `day` at `position` (index without the card), renumbering the day. */
export function placementsForMove(s: TripState, cardId: string, day: string | null, position: number): Placement[] {
  const card = s.cards.find((c) => c.id === cardId);
  const out: Placement[] = [];
  if (card?.day && card.day !== day) {
    dayCards(s, card.day).filter((c) => c.id !== cardId).forEach((c, i) => {
      if (c.position !== i) out.push({ id: c.id, day: c.day, position: i });
    });
  }
  if (day == null) {
    out.push({ id: cardId, day: null, position: null });
    return out;
  }
  const ids = dayCards(s, day).filter((c) => c.id !== cardId).map((c) => c.id);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, cardId);
  ids.forEach((id, i) => {
    const c = s.cards.find((x) => x.id === id);
    if (!c || c.day !== day || c.position !== i) out.push({ id, day, position: i });
  });
  return out;
}

/**
 * Greedy first placement when entering the schedule step: every accepted, unscheduled card goes into the
 * slot with the least severe issues (fixed cards on their booked day). Cards that only fit with blockers stay in the drawer.
 */
export function autoPlace(s: TripState): Placement[] {
  const days = tripDays(s);
  let bundle = toBundle(s);
  const unplaced = bundle.cards.filter((c) => c.swipe_status === 'accepted' && c.day == null);
  if (!unplaced.length || !days.length) return [];
  const placements: Placement[] = [];
  const tz = s.trip.timezone;
  const fixedDay = (c: Card) => (c.fixed_start ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(c.fixed_start)) : null);
  // Fixed first, then by start-of-window so breakfasts land early; long visits before short ones.
  const ordered = unplaced.slice().sort((a, b) => {
    const fa = a.is_fixed ? 0 : 1;
    const fb = b.is_fixed ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (b.duration_minutes ?? 60) - (a.duration_minutes ?? 60);
  });
  for (const card of ordered) {
    const preferred = (card.metadata?.preferred_day as string | undefined) ?? fixedDay(card);
    const candidateDays = preferred && days.includes(preferred) ? [preferred] : days;
    let best: { day: string; pos: number; score: number } | null = null;
    for (const day of candidateDays) {
      const checks = slotChecks(bundle, card.id, day);
      const load = dayCards(bundle, day).length;
      checks.forEach((c, pos) => {
        const sev = c.severity ? SEVERITY_RANK[c.severity] : 0;
        const score = sev * 100 + c.issues.length * 5 + load;
        if (!best || score < best.score) best = { day, pos, score };
      });
    }
    const chosen = best as { day: string; pos: number; score: number } | null;
    if (!chosen || chosen.score >= 300) continue; // only blockers: leave in drawer
    const sMoved: TripState = { ...s, ...bundle } as TripState;
    const moves = placementsForMove(sMoved, card.id, chosen.day, chosen.pos);
    const map = new Map(moves.map((m) => [m.id, m]));
    bundle = { ...bundle, cards: bundle.cards.map((c) => { const m = map.get(c.id); return m ? { ...c, day: m.day, position: m.position } : c; }) };
    for (const m of moves) {
      const i = placements.findIndex((p) => p.id === m.id);
      if (i >= 0) placements[i] = m;
      else placements.push(m);
    }
  }
  return placements;
}

export interface ProposalImpact {
  before: DaySchedule | null;
  after: DaySchedule | null;
  newIssues: ScheduleIssue[];
  resolvedIssues: ScheduleIssue[];
  shifted: { card_id: string; from: string; to: string }[];
}

/** Recompute the affected day with the proposed change applied and diff it against the current plan. */
export function proposalImpact(s: TripState, p: CardChangeProposal): ProposalImpact {
  const card = s.cards.find((c) => c.id === p.card_id);
  const empty: ProposalImpact = { before: null, after: null, newIssues: [], resolvedIssues: [], shifted: [] };
  if (!card) return empty;
  const changed = { ...card, ...p.changes };
  const bundle = toBundle(s);
  const afterBundle: TripBundle = { ...bundle, cards: bundle.cards.map((c) => (c.id === card.id ? changed : c)) };
  const day = changed.day ?? card.day;
  if (!day) return empty;
  const before = scheduleDay(bundle, day);
  const after = scheduleDay(afterBundle, day);
  const beforeKeys = new Set(before.issues.map(issueKey));
  const afterKeys = new Set(after.issues.map(issueKey));
  const shifted = after.items.flatMap((a) => {
    const b = before.items.find((x) => x.card_id === a.card_id);
    return b && (b.start !== a.start || b.end !== a.end) ? [{ card_id: a.card_id, from: `${b.start}–${b.end}`, to: `${a.start}–${a.end}` }] : [];
  });
  return {
    before, after, shifted,
    newIssues: sortIssues(after.issues.filter((i) => !beforeKeys.has(issueKey(i)))),
    resolvedIssues: before.issues.filter((i) => !afterKeys.has(issueKey(i))),
  };
}
