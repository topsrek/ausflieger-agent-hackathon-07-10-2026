// Walking-time estimates between places (MVP: walk only).
// Straight-line (haversine) distance x detour factor, walked at 4.5-5 km/h, gives a range.
// Planning uses the upper bound; the basis string is stored with the estimate.

export const EARTH_RADIUS_M = 6_371_000;
export const DETOUR_FACTOR = 1.3;
export const WALK_KMH_FAST = 5.0;
export const WALK_KMH_SLOW = 4.5;

const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a, b) {
  for (const p of [a, b]) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) throw new Error('haversineMeters: lat/lng required');
  }
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Walking estimate between two points.
 * min = route distance at 5 km/h (rounded), max = at 4.5 km/h (rounded up), max >= min + 1 for any real distance.
 * @returns {{mode:'walk', min_minutes:number, max_minutes:number, distance_m:number, basis:string}}
 */
export function estimateWalk(a, b, opts = {}) {
  const detour = opts.detour ?? DETOUR_FACTOR;
  const fast = opts.fastKmh ?? WALK_KMH_FAST;
  const slow = opts.slowKmh ?? WALK_KMH_SLOW;
  const straight = haversineMeters(a, b);
  const route = straight * detour;
  const minutesAt = (kmh) => (route / 1000 / kmh) * 60;
  const min = Math.max(0, Math.round(minutesAt(fast)));
  let max = Math.ceil(minutesAt(slow));
  if (route > 0 && max <= min) max = min + 1;
  return {
    mode: 'walk',
    min_minutes: min,
    max_minutes: max,
    distance_m: Math.round(route),
    basis: `estimate: straight-line ${(straight / 1000).toFixed(2)} km x detour ${detour} = ${(route / 1000).toFixed(2)} km walked at ${slow}-${fast} km/h`,
  };
}

/**
 * Missing walking pairs among places (both directions).
 * @param {Array<{id:string,lat:number|null,lng:number|null,name?:string}>} places
 * @param {Array<{from_place_id:string,to_place_id:string,mode:string}>} existing
 * @returns {{rows:Array<object>, skipped:Array<{id:string,name?:string,reason:string}>}}
 */
export function missingWalkPairs(tripId, places, existing) {
  const have = new Set(existing.filter((t) => t.mode === 'walk').map((t) => `${t.from_place_id}>${t.to_place_id}`));
  const located = [];
  const skipped = [];
  const seen = new Set();
  for (const p of places) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) located.push(p);
    else skipped.push({ id: p.id, name: p.name, reason: 'no coordinates' });
  }
  const rows = [];
  for (const a of located) {
    for (const b of located) {
      if (a.id === b.id || have.has(`${a.id}>${b.id}`)) continue;
      rows.push({ trip_id: tripId, from_place_id: a.id, to_place_id: b.id, ...estimateWalk(a, b) });
    }
  }
  return { rows, skipped };
}
