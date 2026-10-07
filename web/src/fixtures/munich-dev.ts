// Small hand-made dev fixture for the LocalStore: Munich, 02.–03.10.2027 (Oktoberfest, German Unity Day on 03.10).
// Values are plausible but illustrative; the real prepared demo lives in data/demo/munich.json.
import type { Card, Fact, Holiday, Place, TravelTime, Trip, TripBundle, OpeningHours, CardChangeProposal } from '@shared/types';

export const DEV_TRIP_ID = 'dev-munich';
const T0 = '2027-09-28T10:00:00+02:00';
const RETRIEVED = '2026-10-06T14:20:00+02:00';

const trip: Trip = {
  id: DEV_TRIP_ID,
  title: 'Munich · Oktoberfest weekend',
  city: 'Munich',
  region: 'BY',
  country_code: 'DE',
  timezone: 'Europe/Berlin',
  start_date: '2027-10-02',
  end_date: '2027-10-03',
  step: 'preferences',
  is_demo: true,
  cloned_from: null,
  created_at: T0,
  updated_at: T0,
};

const daily = (open: string, close: string, last_entry?: string): OpeningHours => {
  const iv = [{ open, close, ...(last_entry ? { last_entry } : {}) }];
  return { mon: iv, tue: iv, wed: iv, thu: iv, fri: iv, sat: iv, sun: iv };
};

function place(id: string, name: string, address: string, lat: number, lng: number, extra: Partial<Place> = {}): Place {
  const q = encodeURIComponent(`${name}, ${address}`);
  return {
    id, trip_id: DEV_TRIP_ID, name, address, lat, lng, google_place_id: null,
    website_url: null, google_maps_url: `https://www.google.com/maps/search/?api=1&query=${q}`,
    phone: null, opening_hours: null, special_hours: [], metadata: {}, created_at: T0, updated_at: T0,
    ...extra,
  };
}

function card(id: string, type: Card['type'], title: string, extra: Partial<Card> = {}): Card {
  return {
    id, trip_id: DEV_TRIP_ID, place_id: null, job_id: null, upload_id: null, type, title, summary: null,
    image_url: null, swipe_status: 'suggested', research_state: 'ready', constraint_kind: 'assumption',
    is_fixed: false, confirmed: true, fixed_start: null, fixed_end: null, duration_minutes: null,
    duration_basis: null, window_start: null, window_end: null, reservation_required: null,
    reservation_note: null, price_text: null, price_amount: null, currency: null, day: null, position: null,
    metadata: {}, created_at: T0, updated_at: T0, ...extra,
  };
}

let factN = 0;
function fact(f: Partial<Fact> & Pick<Fact, 'field' | 'evidence' | 'source_type'>): Fact {
  factN += 1;
  return {
    id: `fact-${factN}`, trip_id: DEV_TRIP_ID, card_id: null, place_id: null, holiday_id: null, value: null,
    url: null, title: null, retrieved_at: RETRIEVED, applies_from: null, applies_to: null, basis: null, note: null,
    ...f,
  };
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export const places: Record<string, Place> = {
  hbf: place('p-hbf', 'München Hauptbahnhof', 'Bayerstraße 10A, 80335 München', 48.1402, 11.5600, {
    website_url: 'https://www.bahnhof.de/muenchen-hbf', opening_hours: daily('00:00', '24:00'),
  }),
  hotel: place('p-hotel', 'Hotel Torbräu', 'Tal 41, 80331 München', 48.1355, 11.5803, {
    website_url: 'https://www.torbraeu.de', opening_hours: daily('00:00', '24:00'),
  }),
  deutsches: place('p-deutsches', 'Deutsches Museum', 'Museumsinsel 1, 80538 München', 48.1299, 11.5834, {
    website_url: 'https://www.deutsches-museum.de', opening_hours: daily('09:00', '17:00', '16:00'),
  }),
  pinakothek: place('p-pinakothek', 'Alte Pinakothek', 'Barer Straße 27, 80333 München', 48.1482, 11.5700, {
    website_url: 'https://www.pinakothek.de/alte-pinakothek',
    opening_hours: {
      mon: [], tue: [{ open: '10:00', close: '20:00' }], wed: [{ open: '10:00', close: '20:00' }],
      thu: [{ open: '10:00', close: '18:00' }], fri: [{ open: '10:00', close: '18:00' }],
      sat: [{ open: '10:00', close: '18:00', last_entry: '17:30' }], sun: [{ open: '10:00', close: '18:00', last_entry: '17:30' }],
    },
    special_hours: [{ date: '2027-10-03', hours: [{ open: '10:00', close: '18:00', last_entry: '17:30' }], note: 'Open on German Unity Day (operator holiday calendar)' }],
  }),
  marienplatz: place('p-marienplatz', 'Marienplatz & Glockenspiel', 'Marienplatz 8, 80331 München', 48.1374, 11.5755, {
    website_url: 'https://www.muenchen.de/sehenswuerdigkeiten/orte/120394.html', opening_hours: daily('00:00', '24:00'),
  }),
  viktualien: place('p-viktualien', 'Viktualienmarkt', 'Viktualienmarkt 3, 80331 München', 48.1351, 11.5763, {
    website_url: 'https://www.viktualienmarkt-muenchen.de',
    opening_hours: {
      mon: [{ open: '08:00', close: '20:00' }], tue: [{ open: '08:00', close: '20:00' }], wed: [{ open: '08:00', close: '20:00' }],
      thu: [{ open: '08:00', close: '20:00' }], fri: [{ open: '08:00', close: '20:00' }], sat: [{ open: '08:00', close: '20:00' }], sun: [],
    },
  }),
  eisbach: place('p-eisbach', 'Englischer Garten & Eisbach wave', 'Prinzregentenstraße, 80538 München', 48.1435, 11.5878, {
    website_url: 'https://www.schloesser.bayern.de/englischer-garten', opening_hours: daily('00:00', '24:00'),
  }),
  wiesn: place('p-wiesn', 'Oktoberfest (Theresienwiese)', 'Theresienwiese, 80339 München', 48.1316, 11.5499, {
    website_url: 'https://www.oktoberfest.de',
    opening_hours: { sat: [{ open: '09:00', close: '23:30' }], sun: [{ open: '09:00', close: '23:30' }] },
    special_hours: [
      { date: '2027-10-02', hours: [{ open: '09:00', close: '23:30' }], note: 'Tents serve until 22:30' },
      { date: '2027-10-03', hours: [{ open: '09:00', close: '23:30' }], note: 'Last day of the Wiesn' },
    ],
  }),
  hb: place('p-hb', 'Hofbräuhaus', 'Platzl 9, 80331 München', 48.1376, 11.5797, {
    website_url: 'https://www.hofbraeuhaus.de', opening_hours: daily('09:00', '23:30'),
  }),
  asam: place('p-asam', 'Asamkirche', 'Sendlinger Str. 32, 80331 München', 48.1351, 11.5695, {
    website_url: 'https://www.erzbistum-muenchen.de', opening_hours: daily('09:00', '18:00'),
  }),
  residenz: place('p-residenz', 'Residenz München', 'Residenzstraße 1, 80333 München', 48.1410, 11.5790, {
    website_url: 'https://www.residenz-muenchen.de', opening_hours: daily('09:00', '18:00', '17:00'),
  }),
  schumanns: place('p-schumanns', "Schumann's Bar", 'Odeonsplatz 6-7, 80539 München', 48.1430, 11.5786, {
    website_url: 'https://www.schumanns.de',
    opening_hours: {
      mon: [{ open: '17:00', close: '03:00' }], tue: [{ open: '17:00', close: '03:00' }], wed: [{ open: '17:00', close: '03:00' }],
      thu: [{ open: '17:00', close: '03:00' }], fri: [{ open: '17:00', close: '03:00' }], sat: [{ open: '18:00', close: '03:00' }], sun: [],
    },
  }),
  frischhut: place('p-frischhut', 'Café Frischhut', 'Prälat-Zistl-Straße 8, 80331 München', 48.1349, 11.5740, {
    opening_hours: { mon: [{ open: '08:00', close: '18:00' }], tue: [{ open: '08:00', close: '18:00' }], wed: [{ open: '08:00', close: '18:00' }], thu: [{ open: '08:00', close: '18:00' }], fri: [{ open: '08:00', close: '18:00' }], sat: [{ open: '08:00', close: '17:00' }] },
  }),
  klosterwirt: place('p-klosterwirt', 'Augustiner Klosterwirt', 'Augustinerstraße 1, 80331 München', 48.1384, 11.5733, {
    website_url: 'https://www.augustiner-klosterwirt.de', opening_hours: daily('10:00', '24:00'),
  }),
  lenbach: place('p-lenbach', 'Lenbachhaus', 'Luisenstraße 33, 80333 München', 48.1468, 11.5637, {
    website_url: 'https://www.lenbachhaus.de',
    opening_hours: {
      mon: [], tue: [{ open: '10:00', close: '18:00' }], wed: [{ open: '10:00', close: '18:00' }], thu: [{ open: '10:00', close: '20:00' }],
      fri: [{ open: '10:00', close: '18:00' }], sat: [{ open: '10:00', close: '18:00' }], sun: [{ open: '10:00', close: '18:00' }],
    },
  }),
  brandhorst: place('p-brandhorst', 'Museum Brandhorst', 'Theresienstraße 35a, 80333 München', 48.1482, 11.5743, {
    website_url: 'https://www.museum-brandhorst.de',
    opening_hours: { mon: [], tue: [{ open: '10:00', close: '18:00' }], wed: [{ open: '10:00', close: '18:00' }], thu: [{ open: '10:00', close: '20:00' }], fri: [{ open: '10:00', close: '18:00' }], sat: [{ open: '10:00', close: '18:00' }], sun: [{ open: '10:00', close: '18:00' }] },
  }),
  bratwurst: place('p-bratwurst', 'Bratwurstherzl', 'Dreifaltigkeitsplatz 1, 80331 München', 48.1350, 11.5758, {
    website_url: 'https://www.bratwurstherzl.de',
    opening_hours: { mon: [{ open: '10:00', close: '23:00' }], tue: [{ open: '10:00', close: '23:00' }], wed: [{ open: '10:00', close: '23:00' }], thu: [{ open: '10:00', close: '23:00' }], fri: [{ open: '10:00', close: '23:00' }], sat: [{ open: '10:00', close: '23:00' }], sun: [] },
  }),
  olympia: place('p-olympia', 'Olympiapark & Olympic Tower', 'Spiridon-Louis-Ring 7, 80809 München', 48.1731, 11.5503, {
    website_url: 'https://www.olympiapark.de', opening_hours: daily('09:00', '23:00', '22:30'),
  }),
};

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Cards present from the start: fixed arrival and departure (prefilled in step 1). */
const initialCards: Card[] = [
  card('c-arrival', 'arrival', 'ICE 1003 arrives at München Hbf', {
    place_id: places.hbf.id, swipe_status: 'accepted', constraint_kind: 'hard', is_fixed: true,
    fixed_start: '2027-10-02T09:12:00+02:00', fixed_end: '2027-10-02T09:12:00+02:00', duration_minutes: 0,
    duration_basis: 'Booked train', summary: 'From Berlin Hbf, coach 7, seat 64.', day: '2027-10-02', position: 0,
    metadata: { mode: 'train' },
  }),
  card('c-departure', 'departure', 'ICE 1006 departs München Hbf', {
    place_id: places.hbf.id, swipe_status: 'accepted', constraint_kind: 'hard', is_fixed: true,
    fixed_start: '2027-10-03T18:46:00+02:00', fixed_end: '2027-10-03T18:46:00+02:00', duration_minutes: 0,
    duration_basis: 'Booked train', summary: 'To Berlin Hbf. Be on the platform 10 min early.', day: '2027-10-03', position: 0,
    metadata: { mode: 'train' },
  }),
];

/** Suggestions the simulated agent streams in for the initial search, in order. */
const suggestionPool: Card[] = [
  card('c-deutsches', 'museum', 'Deutsches Museum', {
    place_id: places.deutsches.id, summary: 'One of the world\'s largest science and technology museums, on an island in the Isar.',
    duration_minutes: 150, duration_basis: 'Visit style normal (highlights)', price_text: '€15 entry', price_amount: 15, currency: 'EUR',
    research_state: 'needs_checking', constraint_kind: 'hard',
  }),
  card('c-wiesn', 'event', 'Oktoberfest – last weekend', {
    place_id: places.wiesn.id, summary: 'The final weekend of the 2027 Wiesn. Tents fill up by noon on weekends; go early.',
    duration_minutes: 180, duration_basis: 'Typical visit, estimate', price_text: 'Free entry · Maß ~€15', research_state: 'ready',
    reservation_required: false, reservation_note: 'Table reservations sold out; unreserved areas open from 09:00.',
  }),
  card('c-marienplatz', 'sight', 'Marienplatz & Glockenspiel', {
    place_id: places.marienplatz.id, summary: 'Munich\'s central square. The Glockenspiel plays at 11:00 and 12:00.',
    duration_minutes: 30, duration_basis: 'Visit style normal', price_text: 'Free', window_start: '10:45', window_end: '12:15',
    constraint_kind: 'preference', research_state: 'ready',
  }),
  card('c-pinakothek', 'museum', 'Alte Pinakothek', {
    place_id: places.pinakothek.id, summary: 'Old Masters from Dürer to Rubens. Sunday entry is €1.',
    duration_minutes: 120, duration_basis: 'Visit style normal', price_text: '€9 · Sun €1', price_amount: 9, currency: 'EUR',
    research_state: 'ready', constraint_kind: 'hard',
  }),
  card('c-viktualien', 'meal', 'Lunch at Viktualienmarkt', {
    place_id: places.viktualien.id, summary: 'Open-air food market with beer garden. Closed on Sundays and public holidays.',
    duration_minutes: 60, duration_basis: 'Estimate', price_text: '€10–20', window_start: '12:30', window_end: '14:00',
    constraint_kind: 'preference', research_state: 'ready',
  }),
  card('c-eisbach', 'nature', 'Englischer Garten & Eisbach surfers', {
    place_id: places.eisbach.id, summary: 'Watch surfers ride the standing wave, then walk to the Chinese Tower beer garden.',
    duration_minutes: 75, duration_basis: 'Estimate', price_text: 'Free', research_state: 'pending',
  }),
  card('c-asam', 'sight', 'Asamkirche', {
    place_id: places.asam.id, summary: 'Tiny, wildly ornate late-Baroque church squeezed into Sendlinger Straße.',
    duration_minutes: 20, duration_basis: 'Visit style normal', price_text: 'Free', research_state: 'needs_checking',
  }),
  card('c-hb', 'meal', 'Dinner at Hofbräuhaus', {
    place_id: places.hb.id, summary: 'The classic beer hall. Roast pork, brass band, long tables.',
    duration_minutes: 90, duration_basis: 'Estimate', price_text: '€20–35', window_start: '19:00', window_end: '20:30',
    constraint_kind: 'preference', reservation_required: true, reservation_note: 'Reserve a table during Wiesn season.', research_state: 'ready',
  }),
  card('c-residenz', 'museum', 'Residenz München', {
    place_id: places.residenz.id, summary: 'Former royal palace of the Wittelsbachs: 130 rooms and the Treasury.',
    duration_minutes: 120, duration_basis: 'Visit style normal', price_text: '€10', price_amount: 10, currency: 'EUR',
    research_state: 'pending', constraint_kind: 'hard',
  }),
  card('c-schumanns', 'nightlife', "Drinks at Schumann's", {
    place_id: places.schumanns.id, summary: 'Legendary cocktail bar at the Hofgarten.',
    duration_minutes: 90, duration_basis: 'Estimate', price_text: 'Cocktails ~€16', research_state: 'pending',
    metadata: { simulateResearchFailure: true },
  }),
  card('c-frischhut', 'meal', 'Schmalznudel breakfast at Café Frischhut', {
    place_id: places.frischhut.id, summary: 'Fresh fried dough since 1973, next to the Viktualienmarkt.',
    duration_minutes: 30, duration_basis: 'Estimate', price_text: '~€5', window_start: '08:30', window_end: '10:00',
    constraint_kind: 'preference', research_state: 'needs_checking',
  }),
  card('c-klosterwirt', 'meal', 'Lunch at Augustiner Klosterwirt', {
    place_id: places.klosterwirt.id, summary: 'Bavarian classics opposite the Frauenkirche.',
    duration_minutes: 75, duration_basis: 'Estimate', price_text: '€18–30', window_start: '12:30', window_end: '14:00',
    constraint_kind: 'preference', research_state: 'ready',
  }),
  card('c-olympia', 'activity', 'Olympiapark & Olympic Tower', {
    place_id: places.olympia.id, summary: '1972 Olympic grounds with a 190 m viewing platform.',
    duration_minutes: 90, duration_basis: 'Estimate', price_text: 'Tower €13', research_state: 'needs_checking',
  }),
];

/** Extra suggestions for "Search again". */
const searchAgainPool: Card[] = [
  card('c-lenbach', 'museum', 'Lenbachhaus', {
    place_id: places.lenbach.id, summary: 'Blue Rider collection in a golden-yellow villa. Indoor.',
    duration_minutes: 90, duration_basis: 'Visit style normal', price_text: '€10', research_state: 'ready', constraint_kind: 'hard',
    metadata: { tags: ['indoor'] },
  }),
  card('c-bratwurst', 'meal', 'Dinner at Bratwurstherzl', {
    place_id: places.bratwurst.id, summary: 'Cheaper option: beechwood-grilled Nürnberger sausages. Closed Sundays.',
    duration_minutes: 60, duration_basis: 'Estimate', price_text: '€12–18', window_start: '18:30', window_end: '20:30',
    constraint_kind: 'preference', research_state: 'ready', metadata: { tags: ['cheap'] },
  }),
  card('c-brandhorst', 'museum', 'Museum Brandhorst', {
    place_id: places.brandhorst.id, summary: 'Contemporary art behind a façade of 36,000 ceramic rods. Sunday €1.',
    duration_minutes: 75, duration_basis: 'Visit style normal', price_text: '€7 · Sun €1', research_state: 'ready', constraint_kind: 'hard',
    metadata: { tags: ['indoor'] },
  }),
];

/** Cards the simulated PDF parser extracts from a hotel booking upload. */
const uploadCards: Card[] = [
  card('c-checkin', 'hotel', 'Check-in Hotel Torbräu', {
    place_id: places.hotel.id, swipe_status: 'accepted', confirmed: false, constraint_kind: 'hard',
    duration_minutes: 15, duration_basis: 'Booking confirmation', window_start: '15:00', window_end: '23:59',
    summary: 'Booking #TB-48213 · Superior double · 1 night', price_text: '€289 (paid)', research_state: 'ready',
  }),
  card('c-breakfast', 'meal', 'Breakfast at Hotel Torbräu', {
    place_id: places.hotel.id, swipe_status: 'accepted', confirmed: false, constraint_kind: 'hard',
    duration_minutes: 45, duration_basis: 'Estimate', window_start: '07:00', window_end: '10:30',
    summary: 'Included in your rate. Served in the Schapeau restaurant.', research_state: 'ready',
  }),
  card('c-checkout', 'hotel', 'Check-out Hotel Torbräu', {
    place_id: places.hotel.id, swipe_status: 'accepted', confirmed: false, constraint_kind: 'hard',
    duration_minutes: 10, duration_basis: 'Booking confirmation', window_end: '11:00',
    summary: 'Luggage storage available after check-out.', research_state: 'ready',
  }),
];

// ---------------------------------------------------------------------------
// Holidays and facts
// ---------------------------------------------------------------------------

const holidays: Holiday[] = [{
  id: 'h-unity', trip_id: DEV_TRIP_ID, date: '2027-10-03', name: 'German Unity Day', level: 'national',
  region: null, note: 'Public holiday in all German states. Venue-specific hours apply; a holiday does not imply closure.', created_at: T0,
}];

const hoursFact = (p: Place, url: string | null, evidence: Fact['evidence'] = 'regular_hours', source: Fact['source_type'] = 'official', title?: string) =>
  fact({ place_id: p.id, field: 'opening_hours', value: p.opening_hours, evidence, source_type: source, url: url ?? p.website_url, title: title ?? `${p.name} – opening hours` });

const facts: Fact[] = [
  fact({ holiday_id: 'h-unity', field: 'holiday', value: { date: '2027-10-03', name: 'Tag der Deutschen Einheit' }, evidence: 'operator_confirmed', source_type: 'holiday_calendar', url: 'https://www.bmi.bund.de/DE/themen/verfassung/staatliche-symbole/nationale-feiertage/nationale-feiertage-node.html', title: 'Federal Ministry of the Interior – public holidays', applies_from: '2027-10-03', applies_to: '2027-10-03' }),
  hoursFact(places.deutsches, 'https://www.deutsches-museum.de/museumsinsel/besuch/oeffnungszeiten'),
  fact({ place_id: places.deutsches.id, field: 'last_entry', value: '16:00', evidence: 'regular_hours', source_type: 'official', url: 'https://www.deutsches-museum.de/museumsinsel/besuch/oeffnungszeiten', title: 'Deutsches Museum – visit' }),
  fact({ place_id: places.deutsches.id, field: 'special_hours', value: null, evidence: 'unknown', source_type: 'official', url: 'https://www.deutsches-museum.de/museumsinsel/besuch/oeffnungszeiten', applies_from: '2027-10-03', applies_to: '2027-10-03', note: 'Holiday hours for 2027 not yet published.' }),
  fact({ card_id: 'c-deutsches', field: 'duration', value: 150, evidence: 'estimated', source_type: 'model', basis: 'Visit style normal; museum suggests 2–3 h for highlights' }),
  fact({ card_id: 'c-deutsches', field: 'price', value: '€15', evidence: 'regular_hours', source_type: 'official', url: 'https://www.deutsches-museum.de/museumsinsel/besuch/tickets' }),
  hoursFact(places.pinakothek, 'https://www.pinakothek.de/besuch'),
  fact({ place_id: places.pinakothek.id, field: 'special_hours', value: places.pinakothek.special_hours, evidence: 'operator_confirmed', source_type: 'official', url: 'https://www.pinakothek.de/besuch', applies_from: '2027-10-03', applies_to: '2027-10-03', title: 'Pinakotheken – holiday opening' }),
  hoursFact(places.viktualien, 'https://www.viktualienmarkt-muenchen.de/oeffnungszeiten'),
  fact({ place_id: places.viktualien.id, field: 'opening_hours', value: places.viktualien.opening_hours, evidence: 'regular_hours', source_type: 'google_maps', url: places.viktualien.google_maps_url, title: 'Google Maps' }),
  hoursFact(places.wiesn, 'https://www.oktoberfest.de/en/information/opening-hours', 'operator_confirmed', 'official', 'Oktoberfest – opening hours 2027'),
  fact({ place_id: places.wiesn.id, field: 'event_dates', value: { from: '2027-09-18', to: '2027-10-03' }, evidence: 'operator_confirmed', source_type: 'event_calendar', url: 'https://www.oktoberfest.de', applies_from: '2027-09-18', applies_to: '2027-10-03' }),
  hoursFact(places.marienplatz, 'https://www.muenchen.de/sehenswuerdigkeiten/orte/120394.html', 'regular_hours', 'tourism_board'),
  fact({ card_id: 'c-marienplatz', field: 'glockenspiel_times', value: ['11:00', '12:00'], evidence: 'regular_hours', source_type: 'tourism_board', url: 'https://www.muenchen.de/sehenswuerdigkeiten/orte/120394.html', title: 'muenchen.de – Glockenspiel' }),
  fact({ place_id: places.asam.id, field: 'opening_hours', value: daily('09:00', '18:00'), evidence: 'conflicting', source_type: 'official', url: 'https://www.erzbistum-muenchen.de', title: 'Archdiocese – Asamkirche' }),
  fact({ place_id: places.asam.id, field: 'opening_hours', value: daily('09:00', '19:00'), evidence: 'conflicting', source_type: 'google_maps', url: places.asam.google_maps_url, title: 'Google Maps listing', note: 'Disagrees with the operator page on closing time.' }),
  hoursFact(places.hb, 'https://www.hofbraeuhaus.de/en/opening-hours'),
  hoursFact(places.residenz, 'https://www.residenz-muenchen.de/englisch/tourist/hours.htm'),
  fact({ place_id: places.residenz.id, field: 'last_entry', value: '17:00', evidence: 'regular_hours', source_type: 'official', url: 'https://www.residenz-muenchen.de/englisch/tourist/hours.htm' }),
  hoursFact(places.schumanns, 'https://www.schumanns.de'),
  fact({ place_id: places.frischhut.id, field: 'opening_hours', value: places.frischhut.opening_hours, evidence: 'regular_hours', source_type: 'google_maps', url: places.frischhut.google_maps_url, title: 'Google Maps' }),
  fact({ place_id: places.frischhut.id, field: 'opening_hours.sun', value: null, evidence: 'unknown', source_type: 'google_maps', url: places.frischhut.google_maps_url, note: 'Sunday hours not listed.' }),
  hoursFact(places.klosterwirt, 'https://www.augustiner-klosterwirt.de'),
  hoursFact(places.olympia, 'https://www.olympiapark.de/en/plan-your-visit/opening-hours'),
  hoursFact(places.lenbach, 'https://www.lenbachhaus.de/en/visit'),
  hoursFact(places.brandhorst, 'https://www.museum-brandhorst.de/en/visit'),
  hoursFact(places.bratwurst, 'https://www.bratwurstherzl.de'),
  fact({ card_id: 'c-arrival', field: 'fixed_start', value: '2027-10-02T09:12', evidence: 'operator_confirmed', source_type: 'booking', url: null, title: 'DB booking confirmation', note: 'Entered in step 1' }),
  fact({ card_id: 'c-wiesn', field: 'duration', value: 180, evidence: 'estimated', source_type: 'model', basis: 'Typical weekend visit incl. queueing for a tent' }),
];

// ---------------------------------------------------------------------------
// Walking-time matrix: straight-line distance × 1.3 at 4.5 km/h, range −15 %/+25 %.
// Olympiapark is left out on purpose so the planner shows "missing travel time" (needs checking).
// ---------------------------------------------------------------------------

function haversine(a: Place, b: Place): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
  const dLng = toRad((b.lng ?? 0) - (a.lng ?? 0));
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat ?? 0)) * Math.cos(toRad(b.lat ?? 0)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function matrix(list: Place[]): TravelTime[] {
  const out: TravelTime[] = [];
  for (const a of list) for (const b of list) {
    if (a.id === b.id || a.id === places.olympia.id || b.id === places.olympia.id) continue;
    const d = haversine(a, b) * 1.3;
    const mid = d / 75; // 4.5 km/h = 75 m/min
    const min = Math.max(1, Math.floor((mid * 0.85) / 5) * 5 || 1);
    const max = Math.max(min + 5, Math.ceil((mid * 1.25) / 5) * 5);
    out.push({
      trip_id: DEV_TRIP_ID, from_place_id: a.id, to_place_id: b.id, mode: 'walk', min_minutes: min, max_minutes: max,
      distance_m: Math.round(d), basis: 'straight-line × 1.3 at 4.5 km/h', computed_at: RETRIEVED,
    });
  }
  return out;
}

export const allTravelTimes = matrix(Object.values(places));

/** Refresh-research result the simulated agent proposes for a scheduled card. */
export const proposalTemplates: Record<string, Pick<CardChangeProposal, 'changes' | 'reason'>> = {
  'c-deutsches': {
    changes: { duration_minutes: 210, duration_basis: 'Official: allow 3.5 h for the highlights tour' },
    reason: 'The museum\'s visit page now recommends 3.5 h for the main exhibitions (was estimated at 2.5 h).',
  },
  'c-pinakothek': {
    changes: { duration_minutes: 150, duration_basis: 'Official: special exhibition adds ~30 min' },
    reason: 'A special exhibition opens on 01.10.2027; the operator suggests planning extra time.',
  },
};

export interface DevFixture {
  bundle: TripBundle;
  suggestionPool: Card[];
  searchAgainPool: Card[];
  uploadCards: Card[];
  allPlaces: Place[];
  allTravelTimes: TravelTime[];
}

export const devFixture: DevFixture = {
  bundle: {
    trip,
    preferences: null,
    places: [places.hbf, places.hotel],
    cards: initialCards,
    holidays,
    facts,
    travel_times: [],
  },
  suggestionPool,
  searchAgainPool,
  uploadCards,
  allPlaces: Object.values(places),
  allTravelTimes,
};
