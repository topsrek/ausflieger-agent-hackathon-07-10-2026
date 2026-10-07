// Minimal stand-in for planner/src (same API). Used only when ../planner/src/index.ts does not exist,
// so the web app builds and runs while the real planner is in progress. Keep it simple and conservative.
import type {
  Card, DaySchedule, OpeningInterval, Place, Preferences, ScheduleIssue, ScheduledCard, TravelMode, TripBundle,
  IssueSeverity, Weekday,
} from '../../../shared/types';

const WD: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmt = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const weekday = (date: string): Weekday => {
  const [y, m, d] = date.split('-').map(Number);
  return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

function localOf(iso: string, tz: string): { date: string; min: number } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

const STYLE_FACTOR = { short: 0.65, normal: 1, long: 1.5 } as const;
const BASE_DURATION: Partial<Record<Card['type'], number>> = {
  museum: 120, sight: 60, activity: 90, event: 120, nightlife: 120, meal: 75, shopping: 60, nature: 90,
  hotel: 15, arrival: 0, departure: 0, buffer: 15, rest: 30, other: 60,
};

export function effectiveDuration(card: Card, prefs: Preferences | null): number {
  if (card.duration_minutes != null) return card.duration_minutes;
  const base = BASE_DURATION[card.type] ?? 60;
  const scaled = card.type === 'museum' || card.type === 'sight' ? base * STYLE_FACTOR[prefs?.visit_style ?? 'normal'] : base;
  return Math.round(scaled / 5) * 5;
}

export function openingFor(place: Place, date: string): {
  status: 'open' | 'closed' | 'unknown'; intervals: OpeningInterval[]; source: 'special' | 'regular' | 'none';
} {
  const special = (place.special_hours ?? []).find((s) => s.date === date);
  if (special) {
    if (special.closed) return { status: 'closed', intervals: [], source: 'special' };
    if (special.hours) return { status: special.hours.length ? 'open' : 'closed', intervals: special.hours, source: 'special' };
  }
  const reg = place.opening_hours?.[weekday(date)];
  if (!reg) return { status: 'unknown', intervals: [], source: 'none' };
  return { status: reg.length ? 'open' : 'closed', intervals: reg, source: 'regular' };
}

function travel(bundle: TripBundle, from: string | null, to: string | null) {
  if (!from || !to || from === to) return null;
  const t = bundle.travel_times.find((x) => x.from_place_id === from && x.to_place_id === to)
    ?? bundle.travel_times.find((x) => x.from_place_id === to && x.to_place_id === from);
  return t ? { min_minutes: t.min_minutes, max_minutes: t.max_minutes, mode: t.mode as TravelMode } : undefined;
}

export function scheduleDayWithOrder(bundle: TripBundle, day: string, orderedCardIds: string[]): DaySchedule {
  const byId = new Map(bundle.cards.map((c) => [c.id, c]));
  const places = new Map(bundle.places.map((p) => [p.id, p]));
  const prefs = bundle.preferences;
  const tz = bundle.trip.timezone;
  const holiday = bundle.holidays.find((h) => h.date === day);
  const items: ScheduledCard[] = [];
  const dayIssues: ScheduleIssue[] = [];
  let t = 9 * 60;
  let prevPlace: string | null = null;
  let first = true;

  for (const id of orderedCardIds) {
    const card = byId.get(id);
    if (!card) continue;
    const issues: ScheduleIssue[] = [];
    const add = (severity: IssueSeverity, code: ScheduleIssue['code'], message: string) =>
      issues.push({ card_id: id, severity, code, message });
    const dur = effectiveDuration(card, prefs);
    let travelBefore: ScheduledCard['travel_before'] = null;
    if (!first && card.place_id && prevPlace) {
      const tr = travel(bundle, prevPlace, card.place_id);
      if (tr) {
        travelBefore = tr;
        t += tr.max_minutes + (prefs?.default_buffer_minutes ?? 10);
      } else if (tr === undefined) {
        add('needs_checking', 'missing_travel_time', 'No travel-time estimate to this place yet');
        t += 20;
      }
    }
    let start = t;
    if (card.is_fixed && card.fixed_start) {
      const fs = localOf(card.fixed_start, tz);
      const fixedStart = fs.date === day ? fs.min : start;
      if (!first && start > fixedStart) {
        add('blocker', 'fixed_overlap', `Can't make the fixed time ${fmt(fixedStart)}: earlier plans run until ${fmt(start)}`);
      }
      start = first ? fixedStart : Math.max(fixedStart, start);
      if (first) start = fixedStart;
    }
    const ws = toMin(card.window_start);
    const we = toMin(card.window_end);
    if (ws != null && start < ws && card.constraint_kind !== 'preference') start = ws;
    const place = card.place_id ? places.get(card.place_id) : undefined;
    if (place && !card.is_fixed && card.type !== 'buffer') {
      const o = openingFor(place, day);
      if (o.status === 'closed') add('blocker', 'closed', `${place.name} is closed on this day`);
      else if (o.status === 'unknown') add('needs_checking', 'unknown_hours', 'Opening hours for this date are unknown');
      else {
        const iv = o.intervals.find((i) => (toMin(i.close) ?? 1440) > start) ?? o.intervals[o.intervals.length - 1];
        const open = toMin(iv.open) ?? 0;
        const close = toMin(iv.close) ?? 1440;
        if (start < open) start = open;
        const le = toMin(iv.last_entry);
        if (le != null && start > le) add('blocker', 'after_last_entry', `Arrives after last entry at ${fmt(le)}`);
        else if (start + dur > close) add('blocker', 'outside_opening_hours', `Visit ends after ${place.name} closes at ${fmt(close)}`);
        if (holiday && o.source === 'regular') {
          add('needs_checking', 'holiday_hours_unconfirmed', `${holiday.name}: holiday hours not confirmed`);
        }
      }
    }
    if (we != null && start + dur > we && card.constraint_kind === 'hard') {
      add('blocker', 'outside_window', `Ends after the window closes at ${fmt(we)}`);
    } else if (we != null && start > we) {
      add(card.constraint_kind === 'preference' ? 'warning' : 'blocker', 'outside_window', `Starts after ${fmt(we)}`);
    }
    if (card.type === 'meal' && card.constraint_kind === 'preference' && ws != null) {
      const diff = Math.abs(start - ws);
      if (diff > 60) add('warning', 'preference_deviation', `${diff} min from your preferred time ${fmt(ws)}`);
    }
    const conflicting = bundle.facts.some((f) => f.evidence === 'conflicting'
      && (f.card_id === card.id || (card.place_id && f.place_id === card.place_id)));
    if (conflicting) add('needs_checking', 'conflicting_facts', 'Sources disagree on a planning-critical fact');
    if (!card.confirmed) add('warning', 'unconfirmed_booking', 'Booking extracted from upload: please confirm');
    const end = start + dur;
    if (end > 24 * 60) add('warning', 'day_overflow', 'Runs past midnight');
    items.push({ card_id: id, start: fmt(start), end: fmt(end), travel_before: travelBefore, issues });
    t = end;
    if (card.place_id) prevPlace = card.place_id;
    first = false;
  }
  return { day, items, issues: [...dayIssues, ...items.flatMap((i) => i.issues)] };
}

export function scheduleDay(bundle: TripBundle, day: string): DaySchedule {
  const ids = bundle.cards
    .filter((c) => c.day === day && c.swipe_status === 'accepted')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => c.id);
  return scheduleDayWithOrder(bundle, day, ids);
}

export function checkPlacement(bundle: TripBundle, cardId: string, day: string, position: number): ScheduleIssue[] {
  const ids = bundle.cards
    .filter((c) => c.day === day && c.swipe_status === 'accepted' && c.id !== cardId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => c.id);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, cardId);
  return scheduleDayWithOrder(bundle, day, ids).issues;
}
