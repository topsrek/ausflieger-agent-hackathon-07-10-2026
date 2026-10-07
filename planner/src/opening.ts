import type { OpeningInterval, Place } from '../../shared/types';
import { MINUTES_PER_DAY, parseHHMM, weekdayOf } from './time';

export interface OpeningResult {
  status: 'open' | 'closed' | 'unknown';
  intervals: OpeningInterval[];
  source: 'special' | 'regular' | 'none';
}

/**
 * Opening intervals that apply to a place on a date.
 * - special_hours entries for that date override regular hours:
 *   any entry with `hours` -> open with those intervals (merged; `hours: []` = closed),
 *   otherwise an entry with `closed: true` -> closed. Note-only entries fall through to regular hours.
 * - regular hours: weekday key with intervals -> open, empty array -> closed, missing key / null -> unknown.
 */
export function openingFor(place: Place, date: string): OpeningResult {
  const special = (place.special_hours ?? []).filter((s) => s.date === date);
  const withHours = special.filter((s) => Array.isArray(s.hours));
  if (withHours.length > 0) {
    const intervals = withHours.flatMap((s) => s.hours ?? []);
    return intervals.length > 0
      ? { status: 'open', intervals, source: 'special' }
      : { status: 'closed', intervals: [], source: 'special' };
  }
  if (special.some((s) => s.closed === true)) {
    return { status: 'closed', intervals: [], source: 'special' };
  }

  const regular = place.opening_hours?.[weekdayOf(date)];
  if (regular === undefined || regular === null) {
    return { status: 'unknown', intervals: [], source: 'none' };
  }
  return regular.length > 0
    ? { status: 'open', intervals: regular, source: 'regular' }
    : { status: 'closed', intervals: [], source: 'regular' };
}

/** Opening interval in minutes since midnight; close/last_entry past midnight are shifted by +1440. */
export interface MinuteInterval {
  open: number;
  close: number;
  lastEntry: number | null;
  raw: OpeningInterval;
}

export function toMinuteIntervals(intervals: OpeningInterval[]): MinuteInterval[] {
  const out: MinuteInterval[] = [];
  for (const raw of intervals) {
    const open = parseHHMM(raw.open);
    let close = parseHHMM(raw.close);
    if (open == null || close == null) continue;
    if (close <= open) close += MINUTES_PER_DAY; // past midnight ("20:00"-"02:00"), or "00:00" close
    let lastEntry = parseHHMM(raw.last_entry);
    if (lastEntry != null && lastEntry < open) lastEntry += MINUTES_PER_DAY;
    out.push({ open, close, lastEntry, raw });
  }
  return out.sort((a, b) => a.open - b.open);
}
