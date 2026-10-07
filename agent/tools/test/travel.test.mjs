import { describe, it, expect } from 'vitest';
import { haversineMeters, estimateWalk, missingWalkPairs } from '../src/travel.mjs';

// Munich: Marienplatz and Deutsches Museum, roughly 1.0 km apart in a straight line.
const marienplatz = { lat: 48.13743, lng: 11.57549 };
const deutschesMuseum = { lat: 48.12990, lng: 11.58340 };

describe('haversineMeters', () => {
  it('is 0 for the same point and symmetric', () => {
    expect(haversineMeters(marienplatz, marienplatz)).toBe(0);
    expect(haversineMeters(marienplatz, deutschesMuseum)).toBeCloseTo(haversineMeters(deutschesMuseum, marienplatz), 6);
  });
  it('matches a known distance', () => {
    // 1 degree of latitude is about 111.2 km
    expect(haversineMeters({ lat: 48, lng: 11 }, { lat: 49, lng: 11 })).toBeGreaterThan(111_000);
    expect(haversineMeters({ lat: 48, lng: 11 }, { lat: 49, lng: 11 })).toBeLessThan(111_400);
    const d = haversineMeters(marienplatz, deutschesMuseum);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1100);
  });
  it('rejects missing coordinates', () => {
    expect(() => haversineMeters({ lat: null, lng: 1 }, marienplatz)).toThrow();
  });
});

describe('estimateWalk', () => {
  it('uses detour 1.3 at 4.5-5 km/h', () => {
    // 1 km straight -> 1.3 km route -> 15.6 min at 5 km/h, 17.33 min at 4.5 km/h
    const a = { lat: 48, lng: 11 };
    const b = { lat: 48 + 1000 / 111_195, lng: 11 };
    const e = estimateWalk(a, b);
    expect(e.mode).toBe('walk');
    expect(e.distance_m).toBeGreaterThanOrEqual(1299);
    expect(e.distance_m).toBeLessThanOrEqual(1301);
    expect(e.min_minutes).toBe(16);
    expect(e.max_minutes).toBe(18);
    expect(e.basis).toMatch(/detour 1.3/);
    expect(e.basis).toMatch(/4.5-5 km\/h/);
  });
  it('always gives a non-empty range for real distances and 0 for the same point', () => {
    const near = estimateWalk({ lat: 48, lng: 11 }, { lat: 48.0001, lng: 11 });
    expect(near.max_minutes).toBeGreaterThan(near.min_minutes);
    const same = estimateWalk(marienplatz, marienplatz);
    expect(same).toMatchObject({ min_minutes: 0, max_minutes: 0, distance_m: 0 });
  });
  it('max is the planning upper bound', () => {
    const e = estimateWalk(marienplatz, deutschesMuseum);
    expect(e.max_minutes).toBeGreaterThanOrEqual(e.min_minutes);
    expect(e.min_minutes).toBeGreaterThanOrEqual(14);
    expect(e.max_minutes).toBeLessThanOrEqual(20);
  });
});

describe('missingWalkPairs', () => {
  const places = [
    { id: 'a', name: 'A', ...marienplatz },
    { id: 'b', name: 'B', ...deutschesMuseum },
    { id: 'c', name: 'C', lat: null, lng: null },
    { id: 'a', name: 'A again', ...marienplatz },
  ];
  it('builds both directions, skips unlocated places and dedupes', () => {
    const { rows, skipped } = missingWalkPairs('t', places, []);
    expect(rows.map((r) => `${r.from_place_id}>${r.to_place_id}`).sort()).toEqual(['a>b', 'b>a']);
    expect(rows[0]).toMatchObject({ trip_id: 't', mode: 'walk' });
    expect(skipped).toEqual([{ id: 'c', name: 'C', reason: 'no coordinates' }]);
  });
  it('skips pairs that already exist for walk only', () => {
    const existing = [
      { from_place_id: 'a', to_place_id: 'b', mode: 'walk' },
      { from_place_id: 'b', to_place_id: 'a', mode: 'transit' },
    ];
    const { rows } = missingWalkPairs('t', places, existing);
    expect(rows.map((r) => `${r.from_place_id}>${r.to_place_id}`)).toEqual(['b>a']);
  });
});
