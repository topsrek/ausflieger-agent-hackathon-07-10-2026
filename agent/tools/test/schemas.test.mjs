import { describe, it, expect } from 'vitest';
import {
  cardInsert, cardPatch, placeInput, factInput, holidayInput, travelInput, proposalInput, eventInput,
  openingHours, specialHours, parse, ValidationError,
} from '../src/schemas.mjs';

const trip = '11111111-1111-4111-8111-111111111111';
const card = '22222222-2222-4222-8222-222222222222';
const place = '33333333-3333-4333-8333-333333333333';
const ok = (schema, v) => expect(schema.safeParse(v).success).toBe(true);
const bad = (schema, v, re) => {
  const r = schema.safeParse(v);
  expect(r.success).toBe(false);
  if (re) expect(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')).toMatch(re);
};

describe('opening hours', () => {
  it('accepts weekday intervals, closed days and last entry', () => {
    ok(openingHours, { mon: [], tue: [{ open: '09:00', close: '17:00', last_entry: '16:30' }], sat: [{ open: '18:00', close: '02:00' }] });
    ok(openingHours, { sun: [{ open: '00:00', close: '24:00' }] });
  });
  it('strips seconds', () => {
    expect(openingHours.parse({ mon: [{ open: '09:00:00', close: '17:00:00' }] })).toEqual({ mon: [{ open: '09:00', close: '17:00' }] });
  });
  it('rejects bad keys and times', () => {
    bad(openingHours, { monday: [] });
    bad(openingHours, { mon: [{ open: '9:00', close: '17:00' }] });
    bad(openingHours, { mon: [{ open: '25:00', close: '17:00' }] });
  });
  it('special hours need closed, hours or note, not closed+hours', () => {
    ok(specialHours, { date: '2027-10-03', closed: true, note: 'German Unity Day' });
    ok(specialHours, { date: '2027-10-03', hours: [{ open: '10:00', close: '14:00' }] });
    bad(specialHours, { date: '2027-10-03' });
    bad(specialHours, { date: '2027-10-03', closed: true, hours: [{ open: '10:00', close: '14:00' }] });
  });
});

describe('cards', () => {
  const base = { trip_id: trip, type: 'museum', title: 'Deutsches Museum' };
  it('accepts a minimal suggestion', () => ok(cardInsert, base));
  it('rejects user-owned fields', () => {
    bad(cardInsert, { ...base, day: '2027-10-02' }, /day is owned by the user/);
    bad(cardInsert, { ...base, swipe_status: 'accepted' }, /swipe_status/);
    bad(cardPatch, { id: card, position: 3 }, /position/);
  });
  it('enforces migration checks', () => {
    bad(cardInsert, { ...base, is_fixed: true }, /fixed_start/);
    bad(cardInsert, { trip_id: trip, type: 'buffer', title: 'Buffer' }, /duration_minutes/);
    bad(cardInsert, { ...base, fixed_start: '2027-10-02T10:00:00+02:00', fixed_end: '2027-10-02T09:00:00+02:00' }, /fixed_end/);
  });
  it('requires a basis for durations and offsets for timestamps', () => {
    bad(cardInsert, { ...base, duration_minutes: 120 }, /duration_basis/);
    ok(cardInsert, { ...base, duration_minutes: 120, duration_basis: 'visit style normal' });
    bad(cardInsert, { ...base, type: 'arrival', is_fixed: true, fixed_start: '2027-10-02T08:32:00' }, /offset/);
    ok(cardInsert, { ...base, type: 'arrival', is_fixed: true, constraint_kind: 'hard', fixed_start: '2027-10-02T08:32:00+02:00' });
  });
  it('validates enums, currency and windows', () => {
    bad(cardInsert, { ...base, type: 'zoo' });
    bad(cardInsert, { ...base, price_amount: 15 }, /currency/);
    bad(cardInsert, { ...base, price_amount: 15, currency: 'eur' });
    bad(cardInsert, { ...base, window_start: '07:00' }, /window/);
    ok(cardInsert, { ...base, type: 'hotel', window_start: '07:00', window_end: '10:30', price_amount: 15, currency: 'EUR' });
  });
  it('rejects unknown columns', () => bad(cardInsert, { ...base, opening_hours: {} }));
});

describe('places', () => {
  it('needs lat and lng together and valid URLs', () => {
    ok(placeInput, { trip_id: trip, name: 'X', lat: 48.1, lng: 11.5, website_url: 'https://x.de' });
    bad(placeInput, { trip_id: trip, name: 'X', lat: 48.1 }, /together/);
    bad(placeInput, { trip_id: trip, name: 'X', lat: 91, lng: 0 });
    bad(placeInput, { trip_id: trip, name: 'X', website_url: 'x.de' });
  });
});

describe('facts', () => {
  const f = { trip_id: trip, place_id: place, field: 'opening_hours', value: { mon: [] }, evidence: 'operator_confirmed',
    source_type: 'official', url: 'https://www.deutsches-museum.de/besuch', applies_from: '2027-10-02', applies_to: '2027-10-03' };
  it('accepts a sourced fact', () => ok(factInput, f));
  it('needs exactly one target', () => {
    bad(factInput, { ...f, place_id: undefined }, /exactly one/);
    bad(factInput, { ...f, card_id: card }, /exactly one/);
  });
  it('needs a url for sourced claims', () => {
    bad(factInput, { ...f, url: undefined }, /url/);
    ok(factInput, { ...f, url: undefined, evidence: 'unknown', source_type: 'other', value: null });
  });
  it('needs a basis for estimates', () => {
    bad(factInput, { ...f, field: 'duration', value: 120, evidence: 'estimated', source_type: 'model', url: undefined }, /basis/);
    ok(factInput, { ...f, field: 'duration', value: 120, evidence: 'estimated', source_type: 'model', url: undefined, basis: 'visit style normal' });
  });
  it('operator_confirmed needs an operator source', () => {
    bad(factInput, { ...f, source_type: 'travel_guide' }, /operator_confirmed/);
  });
  it('checks date order and field naming', () => {
    bad(factInput, { ...f, applies_from: '2027-10-03', applies_to: '2027-10-02' }, /applies_to/);
    bad(factInput, { ...f, field: 'Opening Hours' });
  });
});

describe('holidays, travel, proposals, events', () => {
  it('holiday with source', () => {
    ok(holidayInput, { trip_id: trip, date: '2027-10-03', name: 'German Unity Day', level: 'national',
      source: { url: 'https://www.bmi.bund.de/x' } });
    bad(holidayInput, { trip_id: trip, date: '2027-10-03', name: 'X', level: 'state' });
  });
  it('travel range must be ordered and need a basis', () => {
    const t = { trip_id: trip, from_place_id: place, to_place_id: card, min_minutes: 15, max_minutes: 25, basis: 'estimate' };
    ok(travelInput, t);
    bad(travelInput, { ...t, max_minutes: 10 }, /max_minutes/);
    bad(travelInput, { ...t, to_place_id: place }, /differ/);
    bad(travelInput, { ...t, basis: undefined });
  });
  it('proposal changes are validated like card columns', () => {
    ok(proposalInput, { trip_id: trip, card_id: card, changes: { duration_minutes: 150, duration_basis: 'official' }, reason: 'r' });
    bad(proposalInput, { trip_id: trip, card_id: card, changes: {}, reason: 'r' });
    bad(proposalInput, { trip_id: trip, card_id: card, changes: { swipe_status: 'rejected' }, reason: 'r' });
    bad(proposalInput, { trip_id: trip, card_id: card, changes: { window_start: 'morning' }, reason: 'r' });
    bad(proposalInput, { trip_id: trip, card_id: card, changes: { duration_minutes: 1 } });
  });
  it('events default to info', () => {
    expect(eventInput.parse({ trip_id: trip, message: 'Checking holidays' }).level).toBe('info');
    bad(eventInput, { trip_id: trip, message: '' });
  });
});

describe('parse', () => {
  it('throws a readable ValidationError', () => {
    try {
      parse(cardInsert, { trip_id: trip, type: 'museum' }, 'card');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect(e.message).toMatch(/invalid card:\ntitle: /);
    }
  });
});
