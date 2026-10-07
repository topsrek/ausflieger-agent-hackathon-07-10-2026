import type {
  Card, CardType, DaySchedule, Fact, Place, Preferences, ScheduleIssue, ScheduledCard,
  TravelMode, TravelTime, TripBundle,
} from '../../shared/types';
import { effectiveDuration } from './duration';
import { openingFor, toMinuteIntervals, type MinuteInterval } from './opening';
import {
  MINUTES_PER_DAY, formatDuration, formatHHMM as hhmm, formatShortDate, minutesOnDay, parseHHMM,
  toLocal, weekdayOf, weekdayPlural,
} from './time';

/** Day starts here unless the first card is fixed or has an earlier window (e.g. breakfast 07:00–10:30). */
export const DEFAULT_DAY_START = 9 * 60;
export const DEFAULT_BUFFER_MINUTES = 15;
/** Assumed travel time when no estimate is cached for a pair of places. */
export const MISSING_TRAVEL_MINUTES = 30;
/** Meal start may deviate this much from the preferred meal time before a warning. */
export const MEAL_TOLERANCE_MINUTES = 60;

/** Types where the venue's opening hours are not checked (window / fixed times matter instead). */
const NO_OPENING_CHECK: ReadonlySet<CardType> = new Set<CardType>(['arrival', 'departure', 'hotel', 'buffer', 'rest']);

/** Fact fields relevant for schedule checks (conflicts on other fields, e.g. price, are ignored here). */
const SCHEDULE_FACT_FIELDS: ReadonlySet<string> = new Set([
  'opening_hours', 'special_hours', 'last_entry', 'closed', 'closure', 'holiday_hours',
]);

interface Ctx {
  bundle: TripBundle;
  day: string;
  tz: string;
  prefs: Preferences | null;
  buffer: number;
  places: Map<string, Place>;
  cards: Map<string, Card>;
}

function makeCtx(bundle: TripBundle, day: string): Ctx {
  return {
    bundle,
    day,
    tz: bundle.trip.timezone || 'UTC',
    prefs: bundle.preferences,
    buffer: bundle.preferences?.default_buffer_minutes ?? DEFAULT_BUFFER_MINUTES,
    places: new Map(bundle.places.map((p) => [p.id, p])),
    cards: new Map(bundle.cards.map((c) => [c.id, c])),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Ids of the accepted cards on `day`, ordered by position (nulls last, then fixed start, then id). */
export function dayOrder(bundle: TripBundle, day: string): string[] {
  return bundle.cards
    .filter((c) => c.day === day && c.swipe_status === 'accepted')
    .sort((a, b) => {
      const pa = a.position ?? Number.POSITIVE_INFINITY;
      const pb = b.position ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      const fa = a.fixed_start ? Date.parse(a.fixed_start) : Number.POSITIVE_INFINITY;
      const fb = b.fixed_start ? Date.parse(b.fixed_start) : Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((c) => c.id);
}

export function scheduleDay(bundle: TripBundle, day: string): DaySchedule {
  return scheduleDayWithOrder(bundle, day, dayOrder(bundle, day));
}

/** Schedules the given card ids in this order on `day`. Unknown ids are ignored; the bundle is not mutated. */
export function scheduleDayWithOrder(bundle: TripBundle, day: string, orderedCardIds: string[]): DaySchedule {
  const ctx = makeCtx(bundle, day);
  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const id of orderedCardIds) {
    const card = ctx.cards.get(id);
    if (card && !seen.has(id)) {
      cards.push(card);
      seen.add(id);
    }
  }

  const items: ScheduledCard[] = [];
  let prevEnd: number | null = null;
  let prevPlaceId: string | null = null;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const issues: ScheduleIssue[] = [];
    const add = (severity: ScheduleIssue['severity'], code: ScheduleIssue['code'], message: string) =>
      issues.push({ card_id: card.id, severity, code, message });

    // Travel gap from the previous place (cards without place do not reset it).
    let travelBefore: ScheduledCard['travel_before'] = null;
    let gap = 0;
    if (card.place_id && prevPlaceId && card.place_id !== prevPlaceId) {
      const tt = lookupTravel(bundle.travel_times, prevPlaceId, card.place_id);
      if (tt) {
        travelBefore = { min_minutes: tt.min_minutes, max_minutes: tt.max_minutes, mode: tt.mode };
        gap = tt.max_minutes + ctx.buffer;
      } else {
        travelBefore = { min_minutes: MISSING_TRAVEL_MINUTES, max_minutes: MISSING_TRAVEL_MINUTES, mode: 'walk' as TravelMode };
        gap = MISSING_TRAVEL_MINUTES + ctx.buffer;
        add('needs_checking', 'missing_travel_time',
          `No travel time from ${placeName(ctx, prevPlaceId)} to ${placeName(ctx, card.place_id)}; assuming ${MISSING_TRAVEL_MINUTES} min`);
      }
    }

    const duration = effectiveDuration(card, ctx.prefs);
    const fixedStart = card.is_fixed && card.fixed_start ? minutesOnDay(card.fixed_start, day, ctx.tz) : null;
    const opening = openingCheckApplies(ctx, card) ? openingFor(ctx.places.get(card.place_id!)!, day) : null;
    const intervals = opening?.status === 'open' ? toMinuteIntervals(opening.intervals) : [];
    const win = cardWindow(card);

    let start: number;
    let end: number;
    if (fixedStart != null) {
      start = fixedStart;
      const fixedEnd = card.fixed_end ? minutesOnDay(card.fixed_end, day, ctx.tz) : null;
      end = fixedEnd != null && fixedEnd >= start ? fixedEnd : start + duration;

      const localDate = toLocal(card.fixed_start!, ctx.tz)?.date;
      if (localDate && localDate !== day) {
        add('warning', 'day_overflow', `Booked for ${formatShortDate(localDate)}, not this day`);
      }

      // Reachability of the fixed appointment from the previous card.
      if (prevEnd != null && prevEnd + gap > start) {
        const prevItem = items[i - 1]!;
        const prevCard = cards[i - 1]!;
        const travelNote = gap > 0 ? ` (${formatDuration(gap)} travel and buffer)` : '';
        if (!isFixed(prevCard)) {
          prevItem.issues.push({
            card_id: prevCard.id, severity: 'blocker', code: 'fixed_overlap',
            message: `Ends at ${hhmm(prevEnd)}; can't reach ${card.title} at ${hhmm(start)} in time${travelNote}`,
          });
        } else if (prevEnd > start) {
          add('blocker', 'fixed_overlap', `Overlaps with ${prevCard.title}, which ends at ${hhmm(prevEnd)}`);
        } else {
          add('blocker', 'fixed_overlap',
            `Can't reach ${card.title} at ${hhmm(start)} in time after ${prevCard.title} ends at ${hhmm(prevEnd)}${travelNote}`);
        }
      }
    } else {
      // Flexible: earliest possible arrival, then wait for the window / opening if needed.
      let earliest: number;
      if (prevEnd == null) {
        earliest = DEFAULT_DAY_START;
        if (win.start != null && win.start < earliest) earliest = win.start;
      } else {
        earliest = prevEnd + gap;
      }
      start = earliestFeasibleStart(earliest, duration, win, intervals);
      end = start + duration;
    }

    // --- Checks ---------------------------------------------------------
    if (opening) checkOpening(ctx, card, opening, intervals, start, end, win, add);
    if (fixedStart == null) checkWindow(card, win, start, end, add);
    if (fixedStart == null && card.type === 'meal' && win.start == null && win.end == null) {
      checkMealTime(ctx, card, start, add);
    }
    checkFacts(ctx, card, add);
    if (card.confirmed === false) {
      add('needs_checking', 'unconfirmed_booking', `Booking times for ${card.title} are not confirmed yet`);
    }
    if (card.research_state === 'needs_checking' && !issues.some((x) => x.code === 'conflicting_facts')) {
      add('needs_checking', 'conflicting_facts', `Some facts about ${card.title} need checking`);
    } else if (card.research_state === 'failed') {
      add('needs_checking', 'conflicting_facts', `Research for ${card.title} failed; details need checking`);
    }
    if (end > MINUTES_PER_DAY && !issues.some((x) => x.code === 'day_overflow')) {
      add('warning', 'day_overflow', start >= MINUTES_PER_DAY
        ? `Starts at ${hhmm(start)}, after midnight`
        : `Ends at ${hhmm(end)}, past midnight`);
    }

    items.push({ card_id: card.id, start: hhmm(start), end: hhmm(end), travel_before: travelBefore, issues });
    prevEnd = prevEnd == null || fixedStart == null ? end : Math.max(prevEnd, end);
    if (card.place_id) prevPlaceId = card.place_id;
  }

  return { day, items, issues: items.flatMap((it) => it.issues) };
}

/**
 * Issues if `cardId` were inserted at index `position` of the day's current order (the order without
 * that card, so the index matches drop targets). Returns the card's own issues plus issues it newly
 * causes on other cards of the day (e.g. pushing a later visit past closing or making a train unreachable).
 * [] means the slot is fine.
 */
export function checkPlacement(bundle: TripBundle, cardId: string, day: string, position: number): ScheduleIssue[] {
  const base = dayOrder(bundle, day).filter((id) => id !== cardId);
  const idx = Math.max(0, Math.min(Math.trunc(position), base.length));
  const order = [...base.slice(0, idx), cardId, ...base.slice(idx)];

  const before = scheduleDayWithOrder(bundle, day, base);
  const after = scheduleDayWithOrder(bundle, day, order);
  const existing = new Set(before.issues.map((x) => `${x.card_id}|${x.code}`));
  return after.issues.filter((x) => x.card_id === cardId || !existing.has(`${x.card_id}|${x.code}`));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Add = (severity: ScheduleIssue['severity'], code: ScheduleIssue['code'], message: string) => void;

function isFixed(card: Card): boolean {
  return card.is_fixed && !!card.fixed_start;
}

function placeName(ctx: Ctx, placeId: string): string {
  return ctx.places.get(placeId)?.name ?? 'previous place';
}

/** max_minutes for from->to, falling back to to->from. Prefers walking estimates when several modes exist. */
function lookupTravel(times: TravelTime[], from: string, to: string): TravelTime | null {
  const pick = (a: string, b: string) => {
    const matches = times.filter((t) => t.from_place_id === a && t.to_place_id === b);
    return matches.find((t) => t.mode === 'walk') ?? matches[0] ?? null;
  };
  return pick(from, to) ?? pick(to, from);
}

function openingCheckApplies(ctx: Ctx, card: Card): boolean {
  return !!card.place_id && ctx.places.has(card.place_id) && !NO_OPENING_CHECK.has(card.type);
}

interface Window { start: number | null; end: number | null }

function cardWindow(card: Card): Window {
  const start = parseHHMM(card.window_start);
  let end = parseHHMM(card.window_end);
  if (start != null && end != null && end <= start) end += MINUTES_PER_DAY;
  return { start, end };
}

/**
 * First start >= earliest that fits the window (if any) and an opening interval (if known).
 * Falls back to fitting the opening only, then to the next opening, then to `earliest`;
 * the checks afterwards explain what does not fit.
 */
function earliestFeasibleStart(earliest: number, duration: number, win: Window, intervals: MinuteInterval[]): number {
  const lower = win.start != null ? Math.max(earliest, win.start) : earliest;
  const fitsWindow = (s: number) => win.end == null || s + duration <= win.end;
  if (intervals.length === 0) return lower;

  const candidates = intervals
    .map((iv) => ({ iv, s: Math.max(lower, iv.open) }))
    .filter(({ iv, s }) => s + duration <= iv.close && (iv.lastEntry == null || s <= iv.lastEntry));
  const both = candidates.find(({ s }) => fitsWindow(s));
  if (both) return both.s;
  if (candidates[0]) return candidates[0].s;
  const next = intervals.find((iv) => iv.close > lower);
  return next ? Math.max(lower, next.open) : lower;
}

function checkOpening(
  ctx: Ctx, card: Card, opening: ReturnType<typeof openingFor>, intervals: MinuteInterval[],
  start: number, end: number, win: Window, add: Add,
): void {
  const place = ctx.places.get(card.place_id!)!;
  const name = place.name;
  const dateLabel = formatShortDate(ctx.day);
  const holidays = ctx.bundle.holidays.filter((h) => h.date === ctx.day);

  if (opening.status === 'closed') {
    const note = (place.special_hours ?? []).find((s) => s.date === ctx.day && s.note)?.note;
    add('blocker', 'closed', opening.source === 'special'
      ? `${name} is closed on ${dateLabel}${note ? ` (${note})` : ''}`
      : `${name} is closed on ${weekdayPlural(weekdayOf(ctx.day))}`);
  } else if (opening.status === 'unknown') {
    // A hard window (e.g. hotel breakfast 07:00–10:30) already defines when the card is possible.
    const hardWindow = card.constraint_kind === 'hard' && win.start != null && win.end != null;
    if (!hardWindow) add('needs_checking', 'unknown_hours', `Opening hours of ${name} on ${dateLabel} are unknown`);
  } else {
    checkFit(name, intervals, start, end, add);
  }

  if (holidays.length > 0 && !(place.special_hours ?? []).some((s) => s.date === ctx.day)) {
    add('needs_checking', 'holiday_hours_unconfirmed',
      `Opening hours on ${dateLabel} (${holidays.map((h) => h.name).join(', ')}) are not confirmed`);
  }
}

function checkFit(name: string, intervals: MinuteInterval[], start: number, end: number, add: Add): void {
  const containing = intervals.find((iv) => iv.open <= start && start < iv.close);
  if (containing) {
    if (end > containing.close) {
      add('blocker', 'outside_opening_hours', `Visit ends at ${hhmm(end)}, after ${name} closes at ${hhmm(containing.close)}`);
    }
    if (containing.lastEntry != null && start > containing.lastEntry) {
      add('blocker', 'after_last_entry', `Last entry is ${hhmm(containing.lastEntry)}; visit starts at ${hhmm(start)}`);
    }
    return;
  }
  const next = intervals.find((iv) => iv.open > start);
  if (next) {
    add('blocker', 'outside_opening_hours', `Visit starts at ${hhmm(start)}, before ${name} opens at ${hhmm(next.open)}`);
  } else {
    const last = intervals[intervals.length - 1]!;
    add('blocker', 'outside_opening_hours', `Visit starts at ${hhmm(start)}, after ${name} closes at ${hhmm(last.close)}`);
  }
}

function checkWindow(card: Card, win: Window, start: number, end: number, add: Add): void {
  if (win.start == null && win.end == null) return;
  const hard = card.constraint_kind === 'hard';
  const label = win.start != null && win.end != null
    ? `${hhmm(win.start)}–${hhmm(win.end)}`
    : win.start != null ? `from ${hhmm(win.start)}` : `until ${hhmm(win.end!)}`;
  const what = hard ? 'its time window' : 'the preferred time';
  let message: string | null = null;
  if ((win.start != null && start < win.start) || (win.end != null && start >= win.end)) {
    message = `Starts at ${hhmm(start)}, outside ${what} ${label}`;
  } else if (win.end != null && end > win.end) {
    message = `Ends at ${hhmm(end)}, after ${what} ${label}`;
  }
  if (message) add(hard ? 'blocker' : 'warning', hard ? 'outside_window' : 'preference_deviation', message);
}

type Meal = 'breakfast' | 'lunch' | 'dinner';

function mealKind(card: Card, start: number, prefs: Preferences): Meal | null {
  const meta = card.metadata?.['meal'];
  if (meta === 'breakfast' || meta === 'lunch' || meta === 'dinner') return meta;
  const t = card.title.toLowerCase();
  if (/breakfast|brunch|fr(ü|ue)hst(ü|ue)ck/.test(t)) return 'breakfast';
  if (/lunch|mittag/.test(t)) return 'lunch';
  if (/dinner|supper|abendessen/.test(t)) return 'dinner';
  // Otherwise: the preferred meal time closest to the start.
  let best: Meal | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
    const pref = parseHHMM(prefs[`${meal}_time`]);
    if (pref != null && Math.abs(start - pref) < bestDiff) {
      best = meal;
      bestDiff = Math.abs(start - pref);
    }
  }
  return best;
}

function checkMealTime(ctx: Ctx, card: Card, start: number, add: Add): void {
  if (!ctx.prefs) return;
  const meal = mealKind(card, start, ctx.prefs);
  if (!meal) return;
  const pref = parseHHMM(ctx.prefs[`${meal}_time`]);
  if (pref == null) return;
  const diff = start - pref;
  if (Math.abs(diff) > MEAL_TOLERANCE_MINUTES) {
    const label = meal[0]!.toUpperCase() + meal.slice(1);
    add('warning', 'preference_deviation',
      `${label} starts at ${hhmm(start)}, ${formatDuration(Math.abs(diff))} ${diff > 0 ? 'later' : 'earlier'} than your preferred ${hhmm(pref)}`);
  }
}

function factApplies(f: Fact, day: string): boolean {
  if (f.applies_from && day < f.applies_from.slice(0, 10)) return false;
  if (f.applies_to && day > f.applies_to.slice(0, 10)) return false;
  return true;
}

/** Stable JSON for value comparison (object key order does not matter). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function checkFacts(ctx: Ctx, card: Card, add: Add): void {
  const relevant = ctx.bundle.facts.filter((f) =>
    ((card.place_id && f.place_id === card.place_id) || f.card_id === card.id)
    && SCHEDULE_FACT_FIELDS.has(f.field) && factApplies(f, ctx.day));
  const byField = new Map<string, Fact[]>();
  for (const f of relevant) byField.set(f.field, [...(byField.get(f.field) ?? []), f]);

  const conflicting: string[] = [];
  for (const [field, facts] of byField) {
    const values = new Set(facts.filter((f) => f.evidence !== 'unknown' && f.evidence !== 'estimated').map((f) => stableJson(f.value)));
    if (values.size > 1 || facts.some((f) => f.evidence === 'conflicting')) conflicting.push(field.replace(/_/g, ' '));
  }
  if (conflicting.length > 0) {
    const name = card.place_id ? ctx.places.get(card.place_id)?.name ?? card.title : card.title;
    add('needs_checking', 'conflicting_facts', `Sources disagree on ${conflicting.join(', ')} for ${name}`);
  }
}
