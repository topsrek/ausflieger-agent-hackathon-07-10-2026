import { describe, expect, it } from 'vitest';
import type { DaySchedule, IssueCode } from '../../shared/types';
import { scheduleDay, scheduleDayWithOrder } from '../src';
import { DAY1, DAY2, MUSEUM_HOURS, bundle, card, fact, holiday, place, prefs, travel } from './fixtures';

const codes = (s: DaySchedule, cardId?: string): IssueCode[] =>
  (cardId ? s.items.find((i) => i.card_id === cardId)!.issues : s.issues).map((i) => i.code);
const item = (s: DaySchedule, id: string) => s.items.find((i) => i.card_id === id)!;

describe('timeline basics', () => {
  it('starts at 09:00 and chains cards with travel max + buffer', () => {
    const b = bundle({
      places: [place('A', { opening_hours: MUSEUM_HOURS }), place('B', { opening_hours: MUSEUM_HOURS })],
      cards: [card('c1', { place_id: 'A', duration_minutes: 60, window_start: null }),
        card('c2', { place_id: 'B', duration_minutes: 90 })],
      travel_times: [travel('A', 'B', 15, 25)],
    });
    // c1 would start at 09:00 but waits for opening 10:00.
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'c1')).toMatchObject({ start: '10:00', end: '11:00', travel_before: null });
    // 11:00 + 25 travel + 15 buffer = 11:40
    expect(item(s, 'c2')).toMatchObject({ start: '11:40', end: '13:10', travel_before: { min_minutes: 15, max_minutes: 25, mode: 'walk' } });
    expect(s.issues).toEqual([]);
  });

  it('only includes accepted cards on that day, sorted by position', () => {
    const b = bundle({
      cards: [
        card('late', { position: 5 }),
        card('early', { position: 1 }),
        card('rejected', { position: 0, swipe_status: 'rejected' }),
        card('drawer', { position: null, day: null }),
        card('other-day', { day: DAY2, position: 0 }),
      ],
    });
    expect(scheduleDay(b, DAY1).items.map((i) => i.card_id)).toEqual(['early', 'late']);
  });

  it('uses the reverse travel direction as fallback and respects custom buffer', () => {
    const b = bundle({
      preferences: prefs({ default_buffer_minutes: 5 }),
      places: [place('A'), place('B')],
      cards: [card('c1', { place_id: 'A', type: 'hotel' }), card('c2', { place_id: 'B', type: 'hotel' })],
      travel_times: [travel('B', 'A', 10, 20)],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'c2').start).toBe('10:25'); // 09:00-10:00, +20 +5
    expect(item(s, 'c2').travel_before?.max_minutes).toBe(20);
  });

  it('no travel for same place or card without place; buffer cards keep the previous place', () => {
    const b = bundle({
      places: [place('H'), place('B')],
      cards: [
        card('checkin', { place_id: 'H', type: 'hotel', duration_minutes: 30 }),
        card('breakfast', { place_id: 'H', type: 'hotel', duration_minutes: 30 }),
        card('rest', { type: 'rest', duration_minutes: 20 }),
        card('visit', { place_id: 'B', type: 'hotel', duration_minutes: 60 }),
      ],
      travel_times: [travel('H', 'B', 10, 12)],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'breakfast')).toMatchObject({ start: '09:30', travel_before: null });
    expect(item(s, 'rest')).toMatchObject({ start: '10:00', end: '10:20', travel_before: null });
    // travel from H (not reset by the rest card): 10:20 + 12 + 15
    expect(item(s, 'visit')).toMatchObject({ start: '10:47', travel_before: { max_minutes: 12 } });
  });

  it('missing travel time: needs checking and assumes 30 min', () => {
    const b = bundle({
      places: [place('A', { name: 'Marienplatz' }), place('B', { name: 'Englischer Garten' })],
      cards: [card('c1', { place_id: 'A', type: 'hotel' }), card('c2', { place_id: 'B', type: 'hotel' })],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'c2').start).toBe('10:45'); // 10:00 + 30 + 15
    const issue = item(s, 'c2').issues[0]!;
    expect(issue).toMatchObject({ code: 'missing_travel_time', severity: 'needs_checking' });
    expect(issue.message).toBe('No travel time from Marienplatz to Englischer Garten; assuming 30 min');
  });

  it('scheduleDayWithOrder uses the explicit order and ignores unknown ids', () => {
    const b = bundle({ cards: [card('a'), card('b'), card('c')] });
    const s = scheduleDayWithOrder(b, DAY1, ['c', 'nope', 'a']);
    expect(s.items.map((i) => i.card_id)).toEqual(['c', 'a']);
    expect(s.items[0]!.start).toBe('09:00');
    expect(s.items[1]!.start).toBe('10:00');
  });

  it('flattens item issues into DaySchedule.issues', () => {
    const b = bundle({ cards: [card('a', { confirmed: false }), card('b', { research_state: 'needs_checking' })] });
    const s = scheduleDay(b, DAY1);
    expect(s.issues).toEqual([...s.items[0]!.issues, ...s.items[1]!.issues]);
    expect(s.issues).toHaveLength(2);
  });
});

describe('fixed cards', () => {
  it('converts fixed_start to local time (Europe/Berlin)', () => {
    const b = bundle({
      cards: [card('train', {
        type: 'arrival', is_fixed: true, constraint_kind: 'hard',
        fixed_start: '2027-10-02T08:32:00+02:00', fixed_end: null, duration_minutes: 15,
      })],
    });
    expect(item(scheduleDay(b, DAY1), 'train')).toMatchObject({ start: '08:32', end: '08:47' });
  });

  it('uses fixed_end when given and a UTC timestamp', () => {
    const b = bundle({
      cards: [card('show', {
        type: 'event', is_fixed: true, fixed_start: '2027-10-02T17:30:00Z', fixed_end: '2027-10-02T19:00:00Z', duration_minutes: null,
      })],
    });
    expect(item(scheduleDay(b, DAY1), 'show')).toMatchObject({ start: '19:30', end: '21:00' });
  });

  it('first fixed card defines the start of the day', () => {
    const b = bundle({
      places: [place('S'), place('M', { opening_hours: MUSEUM_HOURS })],
      cards: [
        card('arr', { type: 'arrival', place_id: 'S', is_fixed: true, fixed_start: '2027-10-02T07:10:00+02:00', duration_minutes: 20 }),
        card('m', { type: 'museum', place_id: 'M', duration_minutes: 60 }),
      ],
      travel_times: [travel('S', 'M', 10, 20)],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'arr').start).toBe('07:10');
    // arrives 08:05, waits for opening at 10:00
    expect(item(s, 'm').start).toBe('10:00');
    expect(s.issues).toEqual([]);
  });

  it("flags a flexible card that makes the next fixed card unreachable", () => {
    const b = bundle({
      places: [place('M', { name: 'Deutsches Museum', opening_hours: MUSEUM_HOURS }), place('HBF', { name: 'Hauptbahnhof' })],
      cards: [
        card('m', { type: 'museum', place_id: 'M', duration_minutes: 450 }), // 10:00-17:30? closes 17:00
        card('train', { type: 'departure', place_id: 'HBF', is_fixed: true, constraint_kind: 'hard', fixed_start: '2027-10-02T17:20:00+02:00', duration_minutes: 0 }),
      ],
      travel_times: [travel('M', 'HBF', 20, 25)],
    });
    const s = scheduleDay(b, DAY1);
    const blocker = item(s, 'm').issues.find((i) => i.code === 'fixed_overlap')!;
    expect(blocker.severity).toBe('blocker');
    expect(blocker.message).toBe("Ends at 17:30; can't reach train at 17:20 in time (40 min travel and buffer)");
    expect(item(s, 'train').start).toBe('17:20');
    expect(item(s, 'train').issues).toEqual([]);
  });

  it('flags tight reachability even without overlap (end + travel > fixed start)', () => {
    const b = bundle({
      places: [place('A'), place('HBF')],
      cards: [
        card('walk', { type: 'hotel', place_id: 'A', duration_minutes: 480 }), // 09:00-17:00
        card('train', { type: 'departure', title: 'Train to Zurich', place_id: 'HBF', is_fixed: true, fixed_start: '2027-10-02T17:20:00+02:00' }),
      ],
      travel_times: [travel('A', 'HBF', 10, 15)],
    });
    const s = scheduleDay(b, DAY1);
    expect(codes(s, 'walk')).toContain('fixed_overlap');
    expect(item(s, 'walk').issues[0]!.message).toContain("can't reach Train to Zurich at 17:20 in time");
  });

  it('a flexible card waiting for opening must not pass a fixed card', () => {
    const b = bundle({
      places: [place('M', { opening_hours: MUSEUM_HOURS })],
      cards: [
        card('m', { type: 'museum', place_id: 'M', duration_minutes: 60 }),
        card('lunch', { type: 'meal', is_fixed: true, fixed_start: '2027-10-02T10:30:00+02:00', duration_minutes: 60, title: 'Lunch reservation' }),
      ],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'm')).toMatchObject({ start: '10:00', end: '11:00' });
    expect(codes(s, 'm')).toEqual(['fixed_overlap']);
  });

  it('overlapping fixed cards are flagged on the later one', () => {
    const b = bundle({
      cards: [
        card('f1', { is_fixed: true, title: 'Tour', fixed_start: '2027-10-02T10:00:00+02:00', fixed_end: '2027-10-02T12:00:00+02:00' }),
        card('f2', { is_fixed: true, title: 'Concert', fixed_start: '2027-10-02T11:00:00+02:00', fixed_end: '2027-10-02T12:30:00+02:00' }),
      ],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'f2').issues).toEqual([
      { card_id: 'f2', severity: 'blocker', code: 'fixed_overlap', message: 'Overlaps with Tour, which ends at 12:00' },
    ]);
    expect(item(s, 'f2').start).toBe('11:00');
  });

  it('fixed cards booked for another date are flagged', () => {
    const b = bundle({ cards: [card('f', { is_fixed: true, fixed_start: '2027-10-03T09:00:00+02:00' })] });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'f').issues.map((i) => i.message)).toContain('Booked for 3 Oct, not this day');
  });
});

describe('opening hours', () => {
  const museum = () => place('M', { name: 'Deutsches Museum', opening_hours: MUSEUM_HOURS });

  it('waits for opening instead of reporting an error', () => {
    const b = bundle({ places: [museum()], cards: [card('m', { type: 'museum', place_id: 'M', duration_minutes: 120 })] });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'm')).toMatchObject({ start: '10:00', end: '12:00', issues: [] });
  });

  it('outside_opening_hours when the visit ends after closing', () => {
    const b = bundle({
      places: [museum()],
      cards: [
        card('before', { type: 'hotel', duration_minutes: 340 }), // 09:00-14:40
        card('m', { type: 'museum', place_id: 'M', duration_minutes: 180 }),
      ],
    });
    const s = scheduleDay(b, DAY1);
    // 14:40-17:40
    const issues = item(s, 'm').issues;
    expect(issues.map((i) => i.code)).toEqual(['outside_opening_hours']);
    expect(issues[0]!.severity).toBe('blocker');
    expect(issues[0]!.message).toBe('Visit ends at 17:40, after Deutsches Museum closes at 17:00');
  });

  it('after_last_entry when starting after the last entry', () => {
    const b = bundle({
      places: [museum()],
      cards: [card('before', { type: 'hotel', duration_minutes: 440 }), card('m', { type: 'museum', place_id: 'M', duration_minutes: 30 })],
    });
    // 16:20-16:50: fits closing, but last entry 16:00
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'm').issues).toEqual([
      { card_id: 'm', severity: 'blocker', code: 'after_last_entry', message: 'Last entry is 16:00; visit starts at 16:20' },
    ]);
  });

  it('starts after closing', () => {
    const b = bundle({
      places: [museum()],
      cards: [card('before', { type: 'hotel', duration_minutes: 600 }), card('m', { type: 'museum', place_id: 'M', duration_minutes: 30 })],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'm').issues[0]!.message).toBe('Visit starts at 19:00, after Deutsches Museum closes at 17:00');
  });

  it('fixed card before opening', () => {
    const b = bundle({
      places: [museum()],
      cards: [card('tour', { type: 'museum', place_id: 'M', is_fixed: true, fixed_start: '2027-10-02T09:00:00+02:00', duration_minutes: 60 })],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'tour').issues[0]).toMatchObject({
      code: 'outside_opening_hours', message: 'Visit starts at 09:00, before Deutsches Museum opens at 10:00',
    });
  });

  it('waits for the next interval after a midday break', () => {
    const p = place('R', { opening_hours: { sat: [{ open: '11:00', close: '14:00' }, { open: '17:30', close: '23:00' }] } });
    const b = bundle({
      places: [p],
      cards: [card('pre', { type: 'hotel', duration_minutes: 270 }), card('r', { type: 'activity', place_id: 'R', duration_minutes: 90 })],
    });
    // available from 13:30, does not fit 11-14 -> waits until 17:30
    expect(item(scheduleDay(b, DAY1), 'r')).toMatchObject({ start: '17:30', end: '19:00', issues: [] });
  });

  it('handles 24:00 and past-midnight closing times', () => {
    const bar = place('B', { opening_hours: { sat: [{ open: '20:00', close: '03:00' }] } });
    const club = place('C', { opening_hours: { sat: [{ open: '18:00', close: '24:00' }] } });
    const b = bundle({
      places: [bar, club],
      cards: [
        card('c', { type: 'nightlife', place_id: 'C', is_fixed: true, fixed_start: '2027-10-02T21:00:00+02:00', duration_minutes: 180 }),
        card('b', { type: 'nightlife', place_id: 'B', duration_minutes: 60 }),
      ],
      travel_times: [travel('C', 'B', 5, 5)],
    });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'c')).toMatchObject({ start: '21:00', end: '24:00' });
    expect(codes(s, 'c')).toEqual([]);
    expect(item(s, 'b')).toMatchObject({ start: '00:20', end: '01:20' });
    expect(codes(s, 'b')).toEqual(['day_overflow']); // fits bar hours, just past midnight
  });

  it('closed (regular weekly closure)', () => {
    const p = place('M', { name: 'Lenbachhaus', opening_hours: { sat: [] } });
    const s = scheduleDay(bundle({ places: [p], cards: [card('m', { place_id: 'M' })] }), DAY1);
    expect(item(s, 'm').issues).toEqual([{ card_id: 'm', severity: 'blocker', code: 'closed', message: 'Lenbachhaus is closed on Saturdays' }]);
  });

  it('closed (documented special closure on the date)', () => {
    const p = place('M', { name: 'Pinakothek', opening_hours: MUSEUM_HOURS, special_hours: [{ date: DAY2, closed: true, note: 'Closed for German Unity Day' }] });
    const b = bundle({ places: [p], holidays: [holiday(DAY2, 'German Unity Day')], cards: [card('m', { place_id: 'M', day: DAY2 })] });
    const s = scheduleDay(b, DAY2);
    expect(item(s, 'm').issues).toEqual([
      { card_id: 'm', severity: 'blocker', code: 'closed', message: 'Pinakothek is closed on 3 Oct (Closed for German Unity Day)' },
    ]);
  });

  it('unknown_hours when hours are unknown for that date', () => {
    const p = place('M', { name: 'Pinakothek', opening_hours: { mon: [{ open: '10:00', close: '18:00' }] } });
    const s = scheduleDay(bundle({ places: [p], cards: [card('m', { place_id: 'M' })] }), DAY1);
    expect(item(s, 'm').issues).toEqual([
      { card_id: 'm', severity: 'needs_checking', code: 'unknown_hours', message: 'Opening hours of Pinakothek on 2 Oct are unknown' },
    ]);
    expect(item(s, 'm').start).toBe('09:00');
  });

  it('skips opening checks for hotel / arrival / buffer types', () => {
    const p = place('H', { opening_hours: null });
    const s = scheduleDay(bundle({ places: [p], cards: [card('h', { type: 'hotel', place_id: 'H' })] }), DAY1);
    expect(s.issues).toEqual([]);
  });

  it('no unknown_hours for a card with a hard window at an unknown-hours place', () => {
    const p = place('H');
    const s = scheduleDay(bundle({
      places: [p],
      cards: [card('bf', { type: 'meal', title: 'Hotel breakfast', place_id: 'H', constraint_kind: 'hard', window_start: '07:00', window_end: '10:30', duration_minutes: 45 })],
    }), DAY1);
    expect(s.issues).toEqual([]);
    expect(item(s, 'bf').start).toBe('07:00'); // day starts at the earlier breakfast window
  });
});

describe('holidays', () => {
  const museum = (special: Parameters<typeof place>[1] = {}) =>
    place('M', { name: 'Deutsches Museum', opening_hours: MUSEUM_HOURS, ...special });

  it('holiday without special hours: needs checking, not closed', () => {
    const b = bundle({ places: [museum()], holidays: [holiday(DAY2, 'German Unity Day')], cards: [card('m', { place_id: 'M', day: DAY2 })] });
    const s = scheduleDay(b, DAY2);
    expect(item(s, 'm').issues).toEqual([
      { card_id: 'm', severity: 'needs_checking', code: 'holiday_hours_unconfirmed', message: 'Opening hours on 3 Oct (German Unity Day) are not confirmed' },
    ]);
    expect(item(s, 'm').start).toBe('10:00'); // regular hours still used
  });

  it('holiday with documented special hours: no holiday warning, special hours apply', () => {
    const b = bundle({
      places: [museum({ special_hours: [{ date: DAY2, hours: [{ open: '12:00', close: '16:00' }] }] })],
      holidays: [holiday(DAY2, 'German Unity Day')],
      cards: [card('m', { place_id: 'M', day: DAY2, duration_minutes: 120 })],
    });
    const s = scheduleDay(b, DAY2);
    expect(item(s, 'm')).toMatchObject({ start: '12:00', end: '14:00', issues: [] });
  });

  it('holiday on another day is ignored', () => {
    const b = bundle({ places: [museum()], holidays: [holiday(DAY2, 'German Unity Day')], cards: [card('m', { place_id: 'M' })] });
    expect(scheduleDay(b, DAY1).issues).toEqual([]);
  });
});

describe('card windows and preferences', () => {
  it('waits for the window start', () => {
    const b = bundle({ cards: [card('pre', { type: 'hotel', duration_minutes: 120 }), card('d', { type: 'activity', window_start: '14:00', window_end: '18:00' })] });
    expect(item(scheduleDay(b, DAY1), 'd')).toMatchObject({ start: '14:00', issues: [] });
  });

  it('hard window violation = outside_window blocker', () => {
    const b = bundle({
      cards: [
        card('pre', { type: 'hotel', duration_minutes: 100 }), // until 10:40
        card('bf', { type: 'meal', title: 'Hotel breakfast', constraint_kind: 'hard', window_start: '07:00', window_end: '10:30', duration_minutes: 45 }),
      ],
    });
    const issues = item(scheduleDay(b, DAY1), 'bf').issues;
    expect(issues).toEqual([{ card_id: 'bf', severity: 'blocker', code: 'outside_window', message: 'Starts at 10:40, outside its time window 07:00–10:30' }]);
  });

  it('hard window: ending after the window', () => {
    const b = bundle({
      cards: [card('pre', { type: 'hotel', duration_minutes: 75 }),
        card('bf', { type: 'meal', title: 'Breakfast', constraint_kind: 'hard', window_start: '07:00', window_end: '10:30', duration_minutes: 30 })],
    });
    // 10:15-10:45
    expect(item(scheduleDay(b, DAY1), 'bf').issues[0]).toMatchObject({ code: 'outside_window', message: 'Ends at 10:45, after its time window 07:00–10:30' });
  });

  it('preference window violation = preference_deviation warning', () => {
    const b = bundle({
      cards: [card('pre', { type: 'hotel', duration_minutes: 720 }), // until 21:00
        card('d', { type: 'meal', title: 'Dinner', constraint_kind: 'preference', window_start: '18:30', window_end: '20:30', duration_minutes: 60 })],
    });
    const issues = item(scheduleDay(b, DAY1), 'd').issues;
    expect(issues).toEqual([{ card_id: 'd', severity: 'warning', code: 'preference_deviation', message: 'Starts at 21:00, outside the preferred time 18:30–20:30' }]);
  });

  it('meal start deviating > 60 min from the preferred meal time', () => {
    const b = bundle({
      cards: [card('pre', { type: 'hotel', duration_minutes: 735 }), card('d', { type: 'meal', title: 'Dinner at Augustiner', duration_minutes: 60 })],
    });
    // 21:15 vs 19:00
    expect(item(scheduleDay(b, DAY1), 'd').issues).toEqual([
      { card_id: 'd', severity: 'warning', code: 'preference_deviation', message: 'Dinner starts at 21:15, 2h 15m later than your preferred 19:00' },
    ]);
  });

  it('meal within 60 min of preference is fine; metadata.meal wins over title', () => {
    const b = bundle({
      cards: [card('pre', { type: 'hotel', duration_minutes: 210 }), card('l', { type: 'meal', title: 'Viktualienmarkt', metadata: { meal: 'lunch' } })],
    });
    expect(item(scheduleDay(b, DAY1), 'l')).toMatchObject({ start: '12:30', issues: [] });
  });
});

describe('uncertainty', () => {
  it('conflicting_facts from evidence = conflicting', () => {
    const b = bundle({
      places: [place('M', { name: 'Residenz', opening_hours: MUSEUM_HOURS })],
      cards: [card('m', { place_id: 'M' })],
      facts: [fact({ place_id: 'M', field: 'last_entry', evidence: 'conflicting', value: '16:00' })],
    });
    expect(item(scheduleDay(b, DAY1), 'm').issues).toEqual([
      { card_id: 'm', severity: 'needs_checking', code: 'conflicting_facts', message: 'Sources disagree on last entry for Residenz' },
    ]);
  });

  it('conflicting_facts from two distinct non-estimated values', () => {
    const b = bundle({
      places: [place('M', { opening_hours: MUSEUM_HOURS })],
      cards: [card('m', { place_id: 'M' })],
      facts: [
        fact({ place_id: 'M', field: 'opening_hours', value: { sat: [{ open: '10:00', close: '17:00' }] }, source_type: 'official' }),
        fact({ place_id: 'M', field: 'opening_hours', value: { sat: [{ close: '18:00', open: '10:00' }] }, source_type: 'google_maps' }),
      ],
    });
    expect(codes(scheduleDay(b, DAY1), 'm')).toEqual(['conflicting_facts']);
  });

  it('no conflict for equal values (key order ignored), estimates, other fields or other dates', () => {
    const b = bundle({
      places: [place('M', { opening_hours: MUSEUM_HOURS })],
      cards: [card('m', { place_id: 'M' })],
      facts: [
        fact({ place_id: 'M', value: { sat: [{ open: '10:00', close: '17:00' }] } }),
        fact({ place_id: 'M', value: { sat: [{ close: '17:00', open: '10:00' }] }, source_type: 'google_maps' }),
        fact({ place_id: 'M', value: { sat: [] }, evidence: 'estimated', source_type: 'model' }),
        fact({ place_id: 'M', field: 'price', value: 10 }),
        fact({ place_id: 'M', field: 'price', value: 12 }),
        fact({ place_id: 'M', field: 'special_hours', value: 'a', applies_from: DAY2, applies_to: DAY2 }),
        fact({ place_id: 'M', field: 'special_hours', value: 'b', applies_from: DAY2, applies_to: DAY2 }),
      ],
    });
    expect(scheduleDay(b, DAY1).issues).toEqual([]);
  });

  it('facts attached to the card count too', () => {
    const b = bundle({
      cards: [card('m')],
      facts: [fact({ card_id: 'm', field: 'opening_hours', evidence: 'conflicting' })],
    });
    expect(codes(scheduleDay(b, DAY1), 'm')).toEqual(['conflicting_facts']);
  });

  it('unconfirmed_booking for cards extracted from uploads', () => {
    const b = bundle({ cards: [card('h', { type: 'hotel', title: 'Hotel check-in', confirmed: false })] });
    expect(item(scheduleDay(b, DAY1), 'h').issues).toEqual([
      { card_id: 'h', severity: 'needs_checking', code: 'unconfirmed_booking', message: 'Booking times for Hotel check-in are not confirmed yet' },
    ]);
  });

  it('research_state needs_checking adds an issue', () => {
    const b = bundle({ cards: [card('x', { title: 'Olympiapark', research_state: 'needs_checking' })] });
    expect(item(scheduleDay(b, DAY1), 'x').issues).toEqual([
      { card_id: 'x', severity: 'needs_checking', code: 'conflicting_facts', message: 'Some facts about Olympiapark need checking' },
    ]);
  });

  it('day_overflow when a card ends past midnight', () => {
    const b = bundle({ cards: [card('pre', { type: 'hotel', duration_minutes: 840 }), card('late', { type: 'activity', duration_minutes: 90 })] });
    const s = scheduleDay(b, DAY1);
    expect(item(s, 'late')).toMatchObject({ start: '23:00', end: '00:30' });
    expect(item(s, 'late').issues).toEqual([
      { card_id: 'late', severity: 'warning', code: 'day_overflow', message: 'Ends at 00:30, past midnight' },
    ]);
  });
});
