import type { Card, CardType, Preferences, VisitStyle } from '../../shared/types';

/** Default durations in minutes per card type for visit style short / normal / long. */
export const DEFAULT_DURATIONS: Record<CardType, [short: number, normal: number, long: number]> = {
  museum: [60, 120, 180],
  sight: [30, 60, 90],
  activity: [60, 120, 180],
  event: [90, 120, 180],
  nightlife: [90, 120, 180],
  shopping: [45, 90, 120],
  nature: [60, 120, 180],
  meal: [45, 60, 90],
  hotel: [30, 30, 30],     // check-in / check-out
  arrival: [15, 15, 15],   // getting out of the station / airport
  departure: [15, 15, 15],
  buffer: [15, 15, 15],
  rest: [30, 30, 30],
  other: [60, 60, 60],
};

const STYLE_INDEX: Record<VisitStyle, 0 | 1 | 2> = { short: 0, normal: 1, long: 2 };

/**
 * Duration in minutes: card.duration_minutes if set, else fixed_end - fixed_start for cards with both
 * timestamps, else the type default for preferences.visit_style (normal if no preferences).
 */
export function effectiveDuration(card: Card, prefs: Preferences | null): number {
  if (card.duration_minutes != null && card.duration_minutes >= 0) return card.duration_minutes;
  if (card.fixed_start && card.fixed_end) {
    const diff = (Date.parse(card.fixed_end) - Date.parse(card.fixed_start)) / 60_000;
    if (Number.isFinite(diff) && diff >= 0) return Math.round(diff);
  }
  const style = prefs?.visit_style ?? 'normal';
  const row = DEFAULT_DURATIONS[card.type] ?? DEFAULT_DURATIONS.other;
  return row[STYLE_INDEX[style] ?? 1];
}
