import { describe, expect, it } from 'vitest';
import { effectiveDuration, formatHHMM, localTime, openingFor, parseHHMM, weekdayOf } from '../src';
import { DAY1, DAY2, MUSEUM_HOURS, card, place, prefs } from './fixtures';

describe('time helpers', () => {
  it('parses and formats HH:MM', () => {
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('9:05')).toBe(545);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('10:30:00')).toBe(630);
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(formatHHMM(570)).toBe('09:30');
    expect(formatHHMM(1440)).toBe('24:00');
    expect(formatHHMM(1500)).toBe('01:00');
  });

  it('computes weekday keys from calendar dates', () => {
    expect(weekdayOf(DAY1)).toBe('sat');
    expect(weekdayOf(DAY2)).toBe('sun');
    expect(weekdayOf('2027-10-04')).toBe('mon');
  });

  it('converts fixed timestamps to local time in the trip timezone', () => {
    expect(localTime('2027-10-02T08:32:00+02:00', 'Europe/Berlin')).toBe('08:32');
    expect(localTime('2027-10-02T06:32:00Z', 'Europe/Berlin')).toBe('08:32');
    // Winter time (CET, +01:00)
    expect(localTime('2027-12-01T07:00:00Z', 'Europe/Berlin')).toBe('08:00');
    expect(localTime('2027-10-02T08:32:00+02:00', 'Europe/London')).toBe('07:32');
  });
});

describe('effectiveDuration', () => {
  it('uses duration_minutes when set', () => {
    expect(effectiveDuration(card('a', { type: 'museum', duration_minutes: 75 }), prefs())).toBe(75);
    expect(effectiveDuration(card('a', { type: 'museum', duration_minutes: 0 }), prefs())).toBe(0);
  });

  it('derives from type and visit style', () => {
    const museum = card('m', { type: 'museum', duration_minutes: null });
    expect(effectiveDuration(museum, prefs({ visit_style: 'short' }))).toBe(60);
    expect(effectiveDuration(museum, prefs({ visit_style: 'normal' }))).toBe(120);
    expect(effectiveDuration(museum, prefs({ visit_style: 'long' }))).toBe(180);
    expect(effectiveDuration(museum, null)).toBe(120);
    expect(effectiveDuration(card('s', { type: 'sight', duration_minutes: null }), prefs({ visit_style: 'long' }))).toBe(90);
  });

  it('uses fixed_end - fixed_start for fixed cards without duration', () => {
    const train = card('t', {
      type: 'departure', is_fixed: true, duration_minutes: null,
      fixed_start: '2027-10-03T18:05:00+02:00', fixed_end: '2027-10-03T22:10:00+02:00',
    });
    expect(effectiveDuration(train, prefs())).toBe(245);
  });
});

describe('openingFor', () => {
  it('returns regular hours for the weekday', () => {
    const p = place('m', { opening_hours: MUSEUM_HOURS });
    expect(openingFor(p, DAY1)).toEqual({ status: 'open', intervals: MUSEUM_HOURS.sat, source: 'regular' });
  });

  it('missing weekday key or null hours = unknown, empty array = closed', () => {
    expect(openingFor(place('x', { opening_hours: { mon: [] } }), '2027-10-04')).toEqual({ status: 'closed', intervals: [], source: 'regular' });
    expect(openingFor(place('x', { opening_hours: { mon: [] } }), DAY1).status).toBe('unknown');
    expect(openingFor(place('x'), DAY1)).toEqual({ status: 'unknown', intervals: [], source: 'none' });
  });

  it('special hours override regular hours', () => {
    const p = place('m', {
      opening_hours: MUSEUM_HOURS,
      special_hours: [{ date: DAY2, hours: [{ open: '10:00', close: '14:00' }] }],
    });
    expect(openingFor(p, DAY2)).toEqual({ status: 'open', intervals: [{ open: '10:00', close: '14:00' }], source: 'special' });
    expect(openingFor(p, DAY1).source).toBe('regular');
  });

  it('documented special closure', () => {
    const p = place('m', { opening_hours: MUSEUM_HOURS, special_hours: [{ date: DAY2, closed: true, note: 'Holiday' }] });
    expect(openingFor(p, DAY2)).toEqual({ status: 'closed', intervals: [], source: 'special' });
  });

  it('note-only special entry falls back to regular hours', () => {
    const p = place('m', { opening_hours: MUSEUM_HOURS, special_hours: [{ date: DAY2, note: 'Regular hours confirmed' }] });
    expect(openingFor(p, DAY2).source).toBe('regular');
  });
});
