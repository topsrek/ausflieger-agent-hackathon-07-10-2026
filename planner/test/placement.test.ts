import { describe, expect, it } from 'vitest';
import { checkPlacement, scheduleDay } from '../src';
import { DAY1, MUSEUM_HOURS, bundle, card, place, travel } from './fixtures';

function demo() {
  return bundle({
    places: [
      place('H', { name: 'Hotel' }),
      place('M', { name: 'Deutsches Museum', opening_hours: MUSEUM_HOURS }),
      place('E', { name: 'Englischer Garten', opening_hours: { sat: [{ open: '00:00', close: '24:00' }] } }),
      place('S', { name: 'Hauptbahnhof' }),
    ],
    cards: [
      card('hotel', { type: 'hotel', place_id: 'H', position: 0, duration_minutes: 60 }),        // 09:00-10:00
      card('garden', { type: 'nature', place_id: 'E', position: 1, duration_minutes: 180 }),     // 10:35-13:35
      card('train', {
        type: 'departure', title: 'train', place_id: 'S', position: 2, is_fixed: true, constraint_kind: 'hard',
        fixed_start: '2027-10-02T18:05:00+02:00', duration_minutes: 0,
      }),
      card('museum', { type: 'museum', place_id: 'M', position: null, day: null, duration_minutes: 180 }), // in drawer
    ],
    travel_times: [
      travel('H', 'E', 15, 20), travel('H', 'M', 10, 15), travel('E', 'M', 20, 25),
      travel('E', 'S', 25, 30), travel('M', 'S', 15, 20),
    ],
  });
}

describe('checkPlacement', () => {
  it('baseline schedule is clean', () => {
    expect(scheduleDay(demo(), DAY1).issues).toEqual([]);
  });

  it('returns [] for a slot that fits', () => {
    // after hotel: 10:00 + 15 + 15 = 10:30, museum 10:30-13:30
    expect(checkPlacement(demo(), 'museum', DAY1, 1)).toEqual([]);
  });

  it('reports only the closing-time conflict', () => {
    // after garden (13:35): 13:35 + 25 + 15 = 14:15, 14:15-17:15 > 17:00; train still reachable (17:50)
    expect(checkPlacement(demo(), 'museum', DAY1, 2)).toEqual([
      { card_id: 'museum', severity: 'blocker', code: 'outside_opening_hours', message: 'Visit ends at 17:15, after Deutsches Museum closes at 17:00' },
    ]);
  });

  it('reports the closing-time conflict for a late slot', () => {
    const b = demo();
    b.cards.find((c) => c.id === 'museum')!.duration_minutes = 240;
    // 14:15-18:15 > 17:00
    const issues = checkPlacement(b, 'museum', DAY1, 2);
    expect(issues.map((i) => i.code)).toContain('outside_opening_hours');
    expect(issues.find((i) => i.code === 'outside_opening_hours')!.message).toBe('Visit ends at 18:15, after Deutsches Museum closes at 17:00');
    // also too late for the train at 18:05 (18:15 + 20 + 15)
    expect(issues.find((i) => i.code === 'fixed_overlap')!.message).toBe("Ends at 18:15; can't reach train at 18:05 in time (35 min travel and buffer)");
    expect(issues.every((i) => i.card_id === 'museum')).toBe(true);
  });

  it('reports issues the insertion causes on other cards', () => {
    const b = demo();
    b.cards.find((c) => c.id === 'garden')!.duration_minutes = 300; // 10:35-15:35, fine alone
    expect(scheduleDay(b, DAY1).issues).toEqual([]);
    // museum first: 10:30-13:30, garden 14:10-19:10 -> can't reach train
    const issues = checkPlacement(b, 'museum', DAY1, 1);
    expect(issues).toEqual([
      { card_id: 'garden', severity: 'blocker', code: 'fixed_overlap', message: "Ends at 19:10; can't reach train at 18:05 in time (45 min travel and buffer)" },
    ]);
  });

  it('missing travel time for the new neighbour shows as needs checking', () => {
    const b = demo();
    b.travel_times = b.travel_times.filter((t) => !(t.from_place_id === 'H' && t.to_place_id === 'M'));
    b.cards.find((c) => c.id === 'garden')!.duration_minutes = 120; // keep the train reachable with the assumed 30 min
    const issues = checkPlacement(b, 'museum', DAY1, 1);
    expect(issues.map((i) => [i.card_id, i.code])).toEqual([['museum', 'missing_travel_time']]);
  });

  it('moving a card that is already scheduled uses the order without it', () => {
    // move garden to after the train -> starts after 18:05, garden 18:05 + 30 + 15 = 18:50
    const issues = checkPlacement(demo(), 'garden', DAY1, 2);
    expect(issues).toEqual([]);
    // to the start: fine too
    expect(checkPlacement(demo(), 'garden', DAY1, 0)).toEqual([]);
  });

  it('clamps out-of-range positions and does not mutate the bundle', () => {
    const b = demo();
    const snapshot = JSON.stringify(b);
    expect(checkPlacement(b, 'museum', DAY1, 99)).toEqual(checkPlacement(b, 'museum', DAY1, 3));
    expect(checkPlacement(b, 'museum', DAY1, -5)).toEqual(checkPlacement(b, 'museum', DAY1, 0));
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});
