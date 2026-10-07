import type { Card, Fact, Holiday, Place, Preferences, TravelTime, Trip, TripBundle } from '../../shared/types';

export const TRIP_ID = 'trip-1';
export const DAY1 = '2027-10-02'; // Saturday
export const DAY2 = '2027-10-03'; // Sunday, German Unity Day

const TS = '2027-09-01T00:00:00Z';

export function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID, title: 'Munich', city: 'Munich', region: 'BY', country_code: 'DE',
    timezone: 'Europe/Berlin', start_date: DAY1, end_date: DAY2, step: 'scheduling',
    is_demo: true, cloned_from: null, created_at: TS, updated_at: TS, ...over,
  };
}

export function prefs(over: Partial<Preferences> = {}): Preferences {
  return {
    trip_id: TRIP_ID, breakfast_time: '08:00', lunch_time: '12:30', dinner_time: '19:00',
    nightlife_importance: 1, interests: [], visit_style: 'normal', pace: 'balanced',
    default_buffer_minutes: 15, free_text: null, updated_at: TS, ...over,
  };
}

export function place(id: string, over: Partial<Place> = {}): Place {
  return {
    id, trip_id: TRIP_ID, name: id, address: null, lat: null, lng: null, google_place_id: null,
    website_url: null, google_maps_url: null, phone: null, opening_hours: null, special_hours: [],
    metadata: {}, created_at: TS, updated_at: TS, ...over,
  };
}

let pos = 0;
export function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id, trip_id: TRIP_ID, place_id: null, job_id: null, upload_id: null, type: 'sight', title: id,
    summary: null, image_url: null, swipe_status: 'accepted', research_state: 'ready',
    constraint_kind: 'assumption', is_fixed: false, confirmed: true, fixed_start: null, fixed_end: null,
    duration_minutes: 60, duration_basis: null, window_start: null, window_end: null,
    reservation_required: null, reservation_note: null, price_text: null, price_amount: null, currency: null,
    day: DAY1, position: pos++, metadata: {}, created_at: TS, updated_at: TS, ...over,
  };
}

export function travel(from: string, to: string, min: number, max: number, over: Partial<TravelTime> = {}): TravelTime {
  return {
    trip_id: TRIP_ID, from_place_id: from, to_place_id: to, mode: 'walk', min_minutes: min,
    max_minutes: max, distance_m: null, basis: 'test', computed_at: TS, ...over,
  };
}

export function holiday(date: string, name: string): Holiday {
  return { id: `h-${date}`, trip_id: TRIP_ID, date, name, level: 'national', region: null, note: null, created_at: TS };
}

let factN = 0;
export function fact(over: Partial<Fact>): Fact {
  return {
    id: `f${factN++}`, trip_id: TRIP_ID, card_id: null, place_id: null, holiday_id: null,
    field: 'opening_hours', value: null, evidence: 'regular_hours', source_type: 'official',
    url: 'https://example.org', title: null, retrieved_at: TS, applies_from: null, applies_to: null,
    basis: null, note: null, ...over,
  };
}

/** Every weekday 10:00-17:00, last entry 16:00. */
export const MUSEUM_HOURS = {
  mon: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
  tue: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
  wed: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
  thu: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
  fri: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
  sat: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
  sun: [{ open: '10:00', close: '17:00', last_entry: '16:00' }],
};

export function bundle(over: Partial<TripBundle> = {}): TripBundle {
  return {
    trip: trip(), preferences: prefs(), places: [], cards: [], holidays: [], facts: [], travel_times: [], ...over,
  };
}
