// Time helpers. Internally everything is "minutes since local midnight of the scheduled day".
// Values >= 1440 mean "past midnight" (next calendar day).

import type { Weekday } from '../../shared/types';

export const MINUTES_PER_DAY = 24 * 60;

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays',
  fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "09:30" -> 570. Accepts "H:MM", "HH:MM" and "HH:MM:SS" (Postgres time). "24:00" -> 1440. Returns null if unparsable. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** 570 -> "09:30". Values past midnight wrap ("25:10" -> "01:10"), except exactly 1440 which is "24:00". */
export function formatHHMM(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return '24:00';
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 135 -> "2h 15m", 45 -> "45 min", 120 -> "2h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function dateToUtcMs(date: string): number {
  const { y, m, d } = parseDate(date);
  return Date.UTC(y, m - 1, d);
}

/** Calendar weekday of an ISO date (computed in UTC, the date is a calendar date). */
export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[new Date(dateToUtcMs(date)).getUTCDay()]!;
}

export function weekdayPlural(day: Weekday): string {
  return WEEKDAY_NAMES[day];
}

/** "2027-10-03" -> "3 Oct". */
export function formatShortDate(date: string): string {
  const { m, d } = parseDate(date);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateToUtcMs(b) - dateToUtcMs(a)) / 86_400_000);
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Converts an ISO timestamp with offset to the local calendar date and minutes since local midnight. */
export function toLocal(timestamp: string, timeZone: string): { date: string; minutes: number } | null {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return null;
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

/** Minutes of `timestamp` relative to local midnight of `day` (can be negative or >= 1440). */
export function minutesOnDay(timestamp: string, day: string, timeZone: string): number | null {
  const local = toLocal(timestamp, timeZone);
  if (!local) return null;
  return daysBetween(day, local.date) * MINUTES_PER_DAY + local.minutes;
}

/** Local HH:MM of a timestamp in the given zone, e.g. "2027-10-02T08:32:00+02:00" -> "08:32" in Europe/Berlin. */
export function localTime(timestamp: string, timeZone: string): string | null {
  const local = toLocal(timestamp, timeZone);
  return local ? formatHHMM(local.minutes) : null;
}
