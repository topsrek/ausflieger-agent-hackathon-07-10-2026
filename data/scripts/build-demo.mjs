// Builds data/demo/munich.json (a TripBundle + uploads + agent_events) from the researched facts below.
// Research was done on 2026-10-07 (see RETRIEVED); every sourced claim is one row in `facts`.
// Usage: node data/scripts/build-demo.mjs
//
// Conventions
// - Stable UUIDs: derived from a key with SHA-1 (uuid v5 layout), so re-running gives the same ids.
// - evidence 'operator_confirmed' only when the operator's own site states it for the trip date.
//   muenchen.de / oktoberfest.de count as the operator (source_type 'official') only for things the
//   City of Munich runs itself (Oktoberfest, Viktualienmarkt, Marienplatz/Glockenspiel); for other venues
//   muenchen.de is source_type 'tourism_board'.
// - Facts that the planner compares (opening_hours, special_hours, last_entry, closed, closure, holiday_hours)
//   use identical JSON values when sources agree, so only real disagreements show as conflicting.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'demo', 'munich.json');

const TRIP_ID = '2027a10d-0203-4000-8000-00000000c0de';
const CREATED = '2026-10-07T20:00:00Z';
const RETRIEVED = '2026-10-07T22:30:00Z';
const TZ = 'Europe/Berlin';
const SAT = '2027-10-02';
const SUN = '2027-10-03';

function uid(key) {
  const h = createHash('sha1').update(`ausflieger:munich-demo:${key}`).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Sources (url + title as shown on the card)
// ---------------------------------------------------------------------------
const S = {
  dm_off: ['https://www.deutsches-museum.de/en/museum-island/visit/opening-hours', 'Deutsches Museum – Opening hours (Museumsinsel)'],
  dm_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/museen/deutsches-museum-muenchen', 'muenchen.de – Deutsches Museum'],
  ap_off: ['https://www.pinakothek.de/en/visit/alte-pinakothek', 'Pinakotheken – Alte Pinakothek: hours & admission'],
  pin_visit: ['https://www.pinakothek.de/en/visit', 'Pinakotheken – Visit (holiday opening hours)'],
  ap_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/museen/alte-pinakothek', 'muenchen.de – Alte Pinakothek'],
  td3: ['https://www.muenchen.de/freizeit/aktuell/tag-der-deutschen-einheit-muenchen', 'muenchen.de – Tag der Deutschen Einheit in München: Was hat offen? (2027)'],
  pdm_off: ['https://www.pinakothek-der-moderne.de/en/', 'Pinakothek der Moderne – Visit'],
  pdm_special: ['https://www.pinakothek-der-moderne.de/en/special-opening-hours/', 'Pinakothek der Moderne – Special opening hours'],
  res_off: ['https://www.residenz-muenchen.de/englisch/tourist/opening.htm', 'Residenz München – Opening hours (Bavarian Palace Administration)'],
  res_adm: ['https://www.residenz-muenchen.de/englisch/tourist/admiss.htm', 'Residenz München – Admission fees'],
  res_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/museen/residenz', 'muenchen.de – Residenz München'],
  glock_en: ['https://www.muenchen.de/en/sights/munich-glockenspiel', 'muenchen.de – Glockenspiel in the New City Hall'],
  glock_de: ['https://www.muenchen.de/sehenswuerdigkeiten/top-sehenswuerdigkeiten/glockenspiel', 'muenchen.de – Glockenspiel: Zeiten'],
  dom_off: ['https://www.muenchner-dom.de', 'Münchner Dom (Frauenkirche) – official site'],
  frauen_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/frauenkirche', 'muenchen.de – Frauenkirche'],
  peter_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/kirchen-und-kloester/st-peter', 'muenchen.de – St. Peter (Alter Peter)'],
  vm_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/top-sehenswuerdigkeiten/viktualienmarkt', 'muenchen.de – Viktualienmarkt'],
  vm_inm: ['https://www.in-muenchen.de/orte/viktualienmarkt.html', 'in-muenchen.de – Viktualienmarkt'],
  hb_off: ['https://www.hofbraeuhaus.de/en/', 'Hofbräuhaus München – official site'],
  hb_mde: ['https://www.muenchen.de/en/sights/hofbrauhaus-am-platzl', 'muenchen.de – Hofbräuhaus am Platzl'],
  wb_off: ['https://www.weisses-brauhaus-tal.de/', 'Weisses Bräuhaus im Tal – official site'],
  ak_off: ['https://www.augustinerkeller.de/', 'Augustiner-Keller – official site'],
  ak_orte: ['https://orte.muenchen.de/121350.html', 'orte.muenchen.de – Augustiner-Keller'],
  sch_orte: ['https://orte.muenchen.de/53687.html', "orte.muenchen.de – Schumann's Bar am Hofgarten"],
  sch_to: ['https://www.timeout.com/munich/bars-and-pubs/schumanns-bar', "Time Out – Schumann's Bar"],
  sch_sa: ['https://www.schlemmer-atlas.de/restaurants/deutschland/muenchen/schumanns-bar-am-hofgarten/', "Schlemmer Atlas – Schumann's Bar am Hofgarten"],
  eg_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/orte/120242.html', 'muenchen.de – Englischer Garten'],
  ct_off: ['https://www.chinaturm.de/', 'Biergarten am Chinesischen Turm – official site'],
  olt_mde: ['https://www.muenchen.de/sehenswuerdigkeiten/olympiaturm', 'muenchen.de – Olympiaturm (bis 2027 wegen Sanierung geschlossen)'],
  olt_swm: ['https://www.swm.de/unternehmen/magazin/leben/olympiapark-modernisierung', 'SWM – Modernisierung Olympiapark'],
  wiesn_off: ['https://www.oktoberfest.de/en/information/oktoberfest-opening-times/opening-hours-munich-oktoberfest', 'oktoberfest.de – Opening hours Oktoberfest 2027'],
  boeller_off: ['https://www.oktoberfest.de/informationen/termine/traditionelles-boellerschiessen-an-der-bavaria', 'oktoberfest.de – Traditionelles Böllerschießen an der Bavaria'],
  boeller_mde: ['https://www.muenchen.de/veranstaltungen/freizeit/brauchtum/boellerschiessen', 'muenchen.de – Böllerschießen 2027'],
  wiesn_prices: ['https://www.sonntagsblatt.de/artikel/bayern/wiesn-preise-so-viel-kostet-der-besuch-2026-und-so-sparen-familien', 'Sonntagsblatt – Wiesn-Preise 2026'],
  hotel_home: ['https://hotel-uhland.de/', 'Hotel Uhland – official site'],
  hotel_bf: ['https://hotel-uhland.de/fruehstueck/', 'Hotel Uhland – Frühstück'],
  hotel_rooms: ['https://hotel-uhland.de/zimmer/', 'Hotel Uhland – Zimmer (check-in / check-out)'],
  hotel_de: ['https://www.hotel.de/de/hotel/37262', 'hotel.de – Hotel Uhland (booking listing)'],
  einigvtr: ['https://www.gesetze-im-internet.de/einigvtr/art_2.html', 'Einigungsvertrag Art. 2 (gesetze-im-internet.de)'],
  bayftg: ['https://www.gesetze-bayern.de/Content/Document/BayFTG-1', 'Bayerisches Feiertagsgesetz (FTG) Art. 1'],
  feiertage_mde: ['https://www.muenchen.de/aktuell/feiertage-bayern-2026-und-2027', 'muenchen.de – Feiertage in Bayern 2026 und 2027'],
};

// Wikimedia Commons images (thumbnails on upload.wikimedia.org, verified HTTP 200 on 2026-10-07).
const commons = (file, license) => {
  const f = file.replace(/ /g, '_');
  const h = createHash('md5').update(f, 'utf8').digest('hex');
  const enc = encodeURIComponent(f).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')');
  return {
    url: `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${enc}/960px-${enc}`,
    credit: { source: 'Wikimedia Commons', page: `https://commons.wikimedia.org/wiki/File:${enc}`, license, attribution: 'see Commons file page' },
  };
};
const IMG = {
  dm: commons('Deutsches Museum - exterior.jpg', 'CC BY-SA 4.0'),
  ap: commons('Alte Pinakothek München 2008.jpg', 'CC0'),
  res: commons('Antiquarium, Münchner Residenz.jpg', 'CC0'),
  glock: commons('Glockenspiel Neues Rathaus Munich.jpg', 'CC0'),
  vm: commons('Maibaum auf dem Viktualienmarkt, Alter Peter und Rathausturm in München.JPG', 'CC BY-SA 2.5'),
  frauen: commons('Frauenkirche Munich March 2013.JPG', 'CC BY-SA 3.0'),
  peter: commons('Alter-peter vom-rathaus.jpg', 'CC BY 2.5'),
  wiesn: commons('München – Theresienwiese, Oktoberfest 2015 (Antennen).jpg', 'CC BY 2.0 de'),
  bavaria: commons('Bavaria Statue and Ruhmeshalle Munich, April 2019 -01.jpg', 'CC BY-SA 4.0'),
  hb: commons('Munich Hofbrauhaus (1).JPG', 'CC BY-SA 4.0'),
  wb: commons('Weisses Brauhaus 19-05-24 1041.jpg', 'CC BY-SA 4.0'),
  ct: commons('Biergarten Chinesischer Turm (6028129117).jpg', 'CC BY 2.0'),
  olt: commons('Olympiaturm in Munich, 2013.JPG', 'CC BY 3.0 de'),
  pdm: commons('Pinakothek der Moderne Muenchen Rotunde-1.jpg', 'CC BY-SA 3.0'),
  hbf: commons('(DE) München Hauptbahnhof - 26.04.2014 (14018991320).jpg', 'CC BY 2.0'),
};

// ---------------------------------------------------------------------------
// Opening hours helpers
// ---------------------------------------------------------------------------
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const iv = (open, close, last_entry) => ({ open, close, ...(last_entry ? { last_entry } : {}) });
const daily = (open, close, last) => Object.fromEntries(DAYS.map((d) => [d, [iv(open, close, last)]]));
/** hours({ 'mon': [], 'tue-wed': ['10:00','20:00'], ... }) */
function hours(spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec)) {
    const [a, b] = k.split('-');
    const i0 = DAYS.indexOf(a);
    const i1 = b ? DAYS.indexOf(b) : i0;
    for (let i = i0; i <= i1; i++) out[DAYS[i]] = v.length === 0 ? [] : [iv(...v)];
  }
  return out;
}

const H = {
  dm: daily('09:00', '17:00', '16:30'),
  ap: hours({ mon: [], 'tue-wed': ['10:00', '20:00'], 'thu-sun': ['10:00', '18:00'] }),
  pdm: hours({ mon: [], 'tue-wed': ['10:00', '18:00'], thu: ['10:00', '20:00'], 'fri-sun': ['10:00', '18:00'] }),
  res: daily('09:00', '18:00', '17:00'),
  frauen: hours({ 'mon-sat': ['10:00', '17:00', '16:30'], sun: ['11:30', '17:00', '16:30'] }),
  peter: daily('09:00', '19:30', '19:00'),
  vm_official: hours({ 'mon-fri': ['10:00', '18:00'], sat: ['10:00', '15:00'], sun: [] }),
  vm_inm: hours({ 'mon-sat': ['08:00', '20:00'] }),
  hb_official: daily('11:00', '24:00'),
  hb_mde: hours({ 'mon-fri': ['11:00', '24:00'], 'sat-sun': ['10:30', '24:00'] }),
  wb: daily('09:00', '23:30'),
  ak: daily('10:00', '01:00'),
  sch_orte: hours({ 'mon-fri': ['09:00', '02:00'], 'sat-sun': ['17:00', '02:00'] }),
  sch_to: hours({ 'mon-fri': ['08:00', '03:00'], 'sat-sun': ['18:00', '03:00'] }),
  sch_sa: hours({ 'mon-fri': ['09:00', '02:00'], sun: ['17:00', '02:00'] }),
  allday: daily('00:00', '24:00'),
  wiesn: hours({ 'mon-thu': ['10:00', '23:30'], fri: ['10:00', '24:00'], sat: ['09:00', '24:00'], sun: ['09:00', '23:30'] }),
  olt_before: daily('09:00', '23:00', '22:30'),
};

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------
const gmaps = (name, address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;

const places = [];
function place(key, p) {
  const row = {
    id: uid(`place:${key}`), trip_id: TRIP_ID, name: p.name, address: p.address ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null, google_place_id: null,
    website_url: p.website ?? null, google_maps_url: p.address ? gmaps(p.name, p.address) : null,
    phone: p.phone ?? null, opening_hours: p.opening_hours ?? null, special_hours: p.special_hours ?? [],
    metadata: { key, coords_source: 'OpenStreetMap Nominatim (geocoded 2026-10-07)', ...(p.metadata ?? {}) },
    created_at: CREATED, updated_at: CREATED,
  };
  places.push(row);
  return row;
}

const P = {
  hbf: place('hbf', {
    name: 'München Hauptbahnhof', address: 'Bayerstraße 10a, 80335 München', lat: 48.1396274, lng: 11.5588288,
    website: 'https://www.bahnhof.de/muenchen-hbf',
    metadata: { note: 'Main station; arrival and departure point.' },
  }),
  hotel: place('hotel', {
    name: 'Hotel Uhland', address: 'Uhlandstraße 1, 80336 München', lat: 48.1341297, lng: 11.5550294,
    website: 'https://hotel-uhland.de/', phone: '+49 89 543350',
    // Reception hours are not visiting hours; hotel cards are checked against their own windows.
    opening_hours: null,
    metadata: {
      reception: '07:00–23:00 daily',
      check_in: 'from 15:00 (until 23:00)',
      check_out: 'until 11:00 (official site also says 12:00; see facts)',
      breakfast: { available: true, included_in_rate: true, hours: '07:30–10:00', days: 'Mon–Sun', external_price_eur: 23 },
      dinner: 'unknown (no restaurant mentioned on the official site)',
      luggage_storage: 'unknown',
      walk_to_hbf: 'about 10 min (hotel website)',
      location: 'Villa district next to the Theresienwiese (Oktoberfest grounds)',
    },
  }),
  marienplatz: place('marienplatz', {
    name: 'Marienplatz (Neues Rathaus Glockenspiel)', address: 'Marienplatz 8, 80331 München', lat: 48.137788, lng: 11.5753437,
    website: 'https://www.muenchen.de/en/sights/munich-glockenspiel',
    opening_hours: H.allday,
    metadata: { show_times: ['11:00', '12:00', '17:00 (March–October)', '21:00 Nachtspiel'], admission: 'free, watched from the square' },
  }),
  frauen: place('frauen', {
    name: 'Frauenkirche – South tower', address: 'Frauenplatz 1, 80331 München', lat: 48.1385821, lng: 11.573592,
    website: 'https://www.muenchner-dom.de',
    opening_hours: H.frauen,
    special_hours: [{ date: SUN, hours: [iv('11:30', '17:00', '16:30')], note: 'Operator hours for Sundays and public holidays: 11:30–17:00, last ascent 16:30' }],
    metadata: { church_hours: 'daily 08:00–20:00', tower_note: 'No visits during services. Narrow spiral staircase (89 steps) then lift.' },
  }),
  wb: place('wb', {
    name: 'Weisses Bräuhaus im Tal', address: 'Tal 7, 80331 München', lat: 48.1363651, lng: 11.5785247,
    website: 'https://www.weisses-brauhaus-tal.de/', phone: '+49 89 2901380',
    opening_hours: H.wb, metadata: { kitchen: 'hot food until 22:30', reservations: 'OpenTable via website' },
  }),
  vm: place('vm', {
    name: 'Viktualienmarkt', address: 'Viktualienmarkt, 80331 München', lat: 48.135518, lng: 11.5761813,
    website: 'https://www.muenchen.de/sehenswuerdigkeiten/top-sehenswuerdigkeiten/viktualienmarkt',
    opening_hours: H.vm_official,
    special_hours: [{ date: SUN, closed: true, note: 'market stalls are closed on public holidays' }],
    metadata: {
      hours_note: 'Hours are the city\'s minimum selling times (1 Apr–31 Oct); individual stalls may open longer. Beer garden and food stands have their own hours.',
    },
  }),
  res: place('res', {
    name: 'Residenz München', address: 'Residenzstraße 1, 80333 München', lat: 48.140809, lng: 11.5775546,
    website: 'https://www.residenz-muenchen.de/', opening_hours: H.res,
    metadata: { season: 'summer hours (official 2026: 28 Mar–25 Oct)', includes: 'Residence Museum; Treasury has the same hours' },
  }),
  ak: place('ak', {
    name: 'Augustiner-Keller', address: 'Arnulfstraße 52, 80335 München', lat: 48.1435031, lng: 11.5515657,
    website: 'https://www.augustinerkeller.de/', phone: '+49 89 594393', opening_hours: H.ak,
    metadata: { beer_garden: '11:00–24:00, kitchen until 22:00, weather permitting', reservations: 'online table booking on the official site' },
  }),
  wiesn: place('wiesn', {
    name: 'Oktoberfest (Theresienwiese)', address: 'Theresienwiese, 80336 München', lat: 48.135672, lng: 11.5522316,
    website: 'https://www.oktoberfest.de/', opening_hours: H.wiesn,
    special_hours: [{ date: SUN, hours: [iv('09:00', '23:30')], note: 'Last Wiesn day (Sunday/holiday hours). Grounds, tents and rides from 09:00, Oide Wiesn from 10:00' }],
    metadata: {
      season: '18 Sep – 3 Oct 2027', tents: 'large tents: last beer and music 22:30; small tents 23:00',
      admission: 'free entry to grounds and tents; Oide Wiesn charges admission',
      coords_note: 'Point at the northern end of the Theresienwiese (main entrance area)',
    },
  }),
  bavaria: place('bavaria', {
    name: 'Bavaria statue steps (Theresienhöhe)', address: 'Theresienhöhe 16, 80339 München', lat: 48.1306862, lng: 11.5456427,
    website: 'https://www.oktoberfest.de/informationen/termine/traditionelles-boellerschiessen-an-der-bavaria',
    opening_hours: H.allday,
    special_hours: [{ date: SUN, note: 'Böllerschießen at 12:00 on the steps below the Bavaria (oktoberfest.de, muenchen.de 2027)' }],
    metadata: { note: 'Outdoor steps above the Theresienwiese; the hours are an assumption for a public outdoor space (not the statue\'s viewing platform).' },
  }),
  ap: place('ap', {
    name: 'Alte Pinakothek', address: 'Barer Straße 27, 80333 München', lat: 48.1482838, lng: 11.5699796,
    website: 'https://www.pinakothek.de/en/visit/alte-pinakothek', opening_hours: H.ap,
    special_hours: [{ date: SUN, hours: [iv('10:00', '18:00')], note: 'muenchen.de lists the Pinakotheken open until 18:00 on 3 Oct 2027 (not yet on pinakothek.de)' }],
    metadata: { sunday_admission: '€1', note: 'Neue Pinakothek closed for renovation until 2029; some 19th-century works shown here' },
  }),
  dm: place('dm', {
    name: 'Deutsches Museum', address: 'Museumsinsel 1, 80538 München', lat: 48.1313796, lng: 11.5856053,
    website: 'https://www.deutsches-museum.de/', opening_hours: H.dm,
    metadata: { closures_2026: '17 Feb, 3 Apr, 1 May, 1 Nov, 11 Nov (exhibitions), 24/25/31 Dec; 3 Oct not listed' },
  }),
  sch: place('sch', {
    name: "Schumann's Bar am Hofgarten", address: 'Odeonsplatz 6-7, 80539 München', lat: 48.1441029, lng: 11.5788032,
    website: 'https://www.schumanns.de/', phone: '+49 89 229060',
    // Saturday left unknown on purpose: three sources disagree (see facts).
    opening_hours: hours({ 'mon-fri': ['09:00', '02:00'], sun: ['17:00', '02:00'] }),
  }),
  eg: place('eg', {
    name: 'Englischer Garten – Chinesischer Turm', address: 'Englischer Garten 3, 80538 München', lat: 48.1524402, lng: 11.5923606,
    website: 'https://www.chinaturm.de/', opening_hours: H.allday,
    metadata: { beer_garden: 'in dry, warm weather Mon–Fri from 11:00, Sat/Sun from 10:00; otherwise only the kiosk from 12:00', park: 'open all year, free' },
  }),
  pdm: place('pdm', {
    name: 'Pinakothek der Moderne', address: 'Barer Straße 40, 80333 München', lat: 48.1471604, lng: 11.5722272,
    website: 'https://www.pinakothek-der-moderne.de/en/', opening_hours: H.pdm,
    special_hours: [{ date: SUN, hours: [iv('10:00', '18:00')], note: 'muenchen.de lists the Pinakotheken open until 18:00 on 3 Oct 2027 (not yet on the museum site)' }],
  }),
  peter: place('peter', {
    name: 'St. Peter tower (Alter Peter)', address: 'Rindermarkt 1, 80331 München', lat: 48.1363083, lng: 11.5753244,
    website: 'https://www.muenchen.de/sehenswuerdigkeiten/kirchen-und-kloester/st-peter', opening_hours: H.peter,
    metadata: { season: 'summer hours April–October', reservations: 'not possible' },
  }),
  hb: place('hb', {
    name: 'Hofbräuhaus am Platzl', address: 'Platzl 9, 80331 München', lat: 48.137616, lng: 11.5799245,
    website: 'https://www.hofbraeuhaus.de/', phone: '+49 89 290136100', opening_hours: H.hb_official,
    metadata: { kitchen: 'until 22:00', last_drinks: '23:30', reservations: 'not for the Schwemme (main hall) or beer garden; groups of 4+ should reserve upstairs' },
  }),
  olt: place('olt', {
    name: 'Olympiaturm', address: 'Spiridon-Louis-Ring 7, 80809 München', lat: 48.1744163, lng: 11.5537405,
    website: 'https://www.olympiapark.de/', opening_hours: null,
    metadata: { status: 'closed for renovation since June 2024; reopening planned for 2027 (date not confirmed)' },
  }),
};

// ---------------------------------------------------------------------------
// Upload (hotel booking PDF) – parsed by the agent, waiting for confirmation
// ---------------------------------------------------------------------------
const UPLOAD_ID = uid('upload:hotel-booking');
const uploads = [{
  id: UPLOAD_ID, trip_id: TRIP_ID, storage_path: `demo/${TRIP_ID}/hotel-booking-sample.pdf`,
  file_name: 'hotel-booking-sample.pdf', mime_type: 'application/pdf', status: 'parsed',
  parsed: {
    kind: 'hotel_booking', demo_document: true,
    hotel: 'Hotel Uhland', address: 'Uhlandstraße 1, 80336 München',
    check_in_date: SAT, check_in_from: '15:00', check_out_date: SUN, check_out_until: '11:00',
    nights: 1, guests: 2, room: 'Double room', breakfast_included: true,
    booking_reference: 'DEMO-2027-1002',
    confidence: { check_in_from: 0.95, check_out_until: 0.9, dates: 0.98 },
  },
  created_at: '2026-10-07T20:05:00Z',
}];

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
const cards = [];
function card(key, c) {
  const row = {
    id: uid(`card:${key}`), trip_id: TRIP_ID, place_id: c.place ? P[c.place].id : null, job_id: null,
    upload_id: c.upload ? UPLOAD_ID : null, type: c.type, title: c.title, summary: c.summary ?? null,
    image_url: c.img ? IMG[c.img].url : null,
    swipe_status: c.swipe ?? 'accepted', research_state: c.state ?? 'ready',
    constraint_kind: c.kind ?? 'assumption', is_fixed: c.fixed_start != null && (c.is_fixed ?? true),
    confirmed: c.confirmed ?? true, fixed_start: c.fixed_start ?? null, fixed_end: c.fixed_end ?? null,
    duration_minutes: c.duration ?? null, duration_basis: c.basis ?? null,
    window_start: c.window?.[0] ?? null, window_end: c.window?.[1] ?? null,
    reservation_required: c.reservation ?? null, reservation_note: c.reservation_note ?? null,
    price_text: c.price_text ?? null, price_amount: c.price ?? null, currency: c.price != null ? 'EUR' : null,
    day: c.day ?? null, position: c.pos ?? null,
    metadata: { key, ...(c.img ? { image_credit: IMG[c.img].credit } : {}), ...(c.metadata ?? {}) },
    created_at: CREATED, updated_at: CREATED,
  };
  cards.push(row);
  return row;
}
const at = (date, time) => `${date}T${time}:00+02:00`; // CEST in early October

const C = {
  // ---- Saturday 2 Oct -------------------------------------------------------
  arrival: card('arrival', {
    type: 'arrival', title: 'ICE arrival at München Hbf', place: 'hbf', img: 'hbf', kind: 'hard',
    summary: 'Train from Stuttgart Hbf (demo booking). Allow 15 min to get out of the station.',
    fixed_start: at(SAT, '09:16'), duration: 15, basis: 'assumption: 15 min from platform to station exit',
    day: SAT, pos: 1, metadata: { mode: 'train', from: 'Stuttgart Hbf', demo_booking: true, note: 'Plausible ICE arrival; the October 2027 timetable is not bookable yet.' },
  }),
  luggage: card('luggage', {
    type: 'hotel', title: 'Drop luggage at Hotel Uhland', place: 'hotel', kind: 'assumption', state: 'needs_checking',
    summary: 'Leave bags before check-in. Reception is staffed 07:00–23:00; luggage storage before check-in is not documented.',
    duration: 10, basis: 'assumption: 10 min at reception', window: ['07:00', '23:00'], day: SAT, pos: 2,
  }),
  glock: card('glock', {
    type: 'sight', title: 'Glockenspiel at Marienplatz', place: 'marienplatz', img: 'glock', kind: 'hard',
    summary: 'The figures of the New City Hall carillon perform daily at 11:00 and 12:00, plus 17:00 from March to October. Free, watched from the square.',
    fixed_start: at(SAT, '11:00'), fixed_end: at(SAT, '11:15'), duration: 15,
    basis: 'estimate: show lasts about 12–15 min (travel guides; not stated on muenchen.de)',
    price_text: 'Free', price: 0, day: SAT, pos: 3,
    metadata: { alternative_show_times: ['12:00', '17:00', '21:00 (Nachtspiel)'] },
  }),
  frauen: card('frauen', {
    type: 'sight', title: 'Frauenkirche & south tower view', place: 'frauen', img: 'frauen', kind: 'assumption',
    summary: "Munich's cathedral; the south tower platform gives a view over the old town. Tower: Mon–Sat 10:00–17:00, Sun and holidays 11:30–17:00, last ascent 16:30.",
    duration: 45, basis: 'visit style normal: 45 min (stairs + lift, platform, church)',
    price_text: 'Tower €7.50 (adults); church free', price: 7.5, day: SAT, pos: 4,
  }),
  lunch_wb: card('lunch_wb', {
    type: 'meal', title: 'Lunch at Weisses Bräuhaus', place: 'wb', img: 'wb', kind: 'preference',
    summary: 'Classic Bavarian tavern of the Schneider Weisse brewery in the Tal. Open daily 09:00–23:30, hot food until 22:30.',
    duration: 75, basis: 'visit style normal: 75 min for a sit-down lunch', reservation: false,
    reservation_note: 'Optional; tables bookable via OpenTable', day: SAT, pos: 5, metadata: { meal: 'lunch', recommendation_basis: 'local institution, wheat-beer brewery tavern' },
  }),
  vm: card('vm', {
    type: 'shopping', title: 'Viktualienmarkt stroll', place: 'vm', img: 'vm', kind: 'assumption', state: 'needs_checking',
    summary: "Munich's food market. City minimum selling times: Mon–Fri 10:00–18:00, Sat 10:00–15:00; stalls closed on Sundays and public holidays.",
    duration: 40, basis: 'visit style normal: 40 min stroll', day: SAT, pos: 6,
  }),
  res: card('res', {
    type: 'museum', title: 'Residenz München', place: 'res', img: 'res', kind: 'assumption',
    summary: 'Former royal palace of the Wittelsbachs: Antiquarium, state rooms, Treasury. Summer hours daily 09:00–18:00, last entry 17:00.',
    duration: 120, basis: 'visit style normal: 2 h for the Residence Museum',
    price_text: 'Residence Museum €10 (reduced €9); with Treasury €15', price: 10, day: SAT, pos: 7,
  }),
  checkin: card('checkin', {
    type: 'hotel', title: 'Check in at Hotel Uhland', place: 'hotel', upload: true, confirmed: false, kind: 'hard',
    summary: 'From the uploaded booking: check-in from 15:00. Breakfast included.',
    duration: 15, basis: 'assumption: 15 min at reception', window: ['15:00', '23:00'], day: SAT, pos: 8,
    metadata: { extracted_from: 'hotel-booking-sample.pdf', booking_reference: 'DEMO-2027-1002' },
  }),
  dinner_ak: card('dinner_ak', {
    type: 'meal', title: 'Dinner at Augustiner-Keller', place: 'ak', kind: 'preference',
    summary: 'Traditional Augustiner beer hall and chestnut beer garden between Hbf and Hackerbrücke, ten minutes from the hotel. Beer from wooden barrels.',
    duration: 90, basis: 'visit style normal: 90 min dinner', reservation: true,
    reservation_note: 'Recommended on a Wiesn Saturday; online booking on the official site', day: SAT, pos: 9,
    metadata: { meal: 'dinner', recommendation_basis: 'muenchen.de restaurant guide; near the hotel' },
  }),

  // ---- Sunday 3 Oct (German Unity Day, last Wiesn day) ------------------------
  breakfast: card('breakfast', {
    type: 'hotel', title: 'Breakfast at Hotel Uhland', place: 'hotel', kind: 'hard',
    summary: 'Buffet breakfast, included in the room rate. Served daily 07:30–10:00.',
    duration: 45, basis: 'assumption: 45 min', window: ['07:30', '10:00'], day: SUN, pos: 1,
    metadata: { meal: 'breakfast' },
  }),
  checkout: card('checkout', {
    type: 'hotel', title: 'Check out of Hotel Uhland', place: 'hotel', upload: true, confirmed: false, kind: 'hard',
    summary: 'From the uploaded booking: check-out until 11:00. The hotel website states both 11:00 and 12:00.',
    duration: 15, basis: 'assumption: 15 min', window: ['07:00', '11:00'], day: SUN, pos: 2,
    metadata: { extracted_from: 'hotel-booking-sample.pdf', luggage_storage: 'unknown – ask at check-in' },
  }),
  wiesn: card('wiesn', {
    type: 'event', title: 'Oktoberfest – last Wiesn day', place: 'wiesn', img: 'wiesn', kind: 'assumption',
    summary: 'Final day of Oktoberfest 2027. Grounds, tents and rides open at 09:00 (Oide Wiesn 10:00). Go early: tents fill up fast on the last Sunday.',
    duration: 135, basis: 'visit style normal: 2 h 15 min walk-around and rides before the Böllerschießen',
    price_text: 'Free entry; Oide Wiesn admission extra. Beer 2026: €14.80–15.90 per litre', price: 0, day: SUN, pos: 3,
  }),
  boeller: card('boeller', {
    type: 'event', title: 'Böllerschießen at the Bavaria', place: 'bavaria', img: 'bavaria', kind: 'hard',
    summary: 'Traditional farewell to the Wiesn: about 60 marksmen fire salute shots on the steps below the Bavaria at 12:00, followed by brass music and the Bavarian anthem.',
    fixed_start: at(SUN, '12:00'), fixed_end: at(SUN, '12:30'), duration: 30,
    basis: 'start 12:00 per oktoberfest.de/muenchen.de; end time not published, 30 min estimated',
    price_text: 'Free', price: 0, day: SUN, pos: 4, metadata: { fixed_end_estimated: true },
  }),
  lunch_wiesn: card('lunch_wiesn', {
    type: 'meal', title: 'Lunch in a Wiesn tent', place: 'wiesn', kind: 'preference',
    summary: 'Roast chicken and a Maß in one of the beer tents. Without a reservation, look for unreserved tables or try the smaller tents.',
    duration: 75, basis: 'visit style normal: 75 min', reservation: false,
    reservation_note: 'Tent reservations for the last weekend are usually gone; unreserved areas exist', day: SUN, pos: 5,
    metadata: { meal: 'lunch' },
  }),
  ap: card('ap', {
    type: 'museum', title: 'Alte Pinakothek', place: 'ap', img: 'ap', kind: 'assumption',
    summary: 'Old Masters from the 14th to 18th century (Dürer, Rubens, Raphael). Open on 3 Oct 2027 until 18:00 per muenchen.de; €1 entry on Sundays.',
    duration: 120, basis: 'visit style normal: 2 h',
    price_text: '€1 on Sundays (regular price disputed: €9 official, €7 muenchen.de)', price: 1, day: SUN, pos: 6,
  }),
  departure: card('departure', {
    type: 'departure', title: 'ICE departure from München Hbf', place: 'hbf', img: 'hbf', kind: 'hard',
    summary: 'Train back to Stuttgart (demo booking). Be on the platform 15 min early.',
    fixed_start: at(SUN, '18:32'), duration: 15, basis: 'assumption: 15 min to find the platform',
    day: SUN, pos: 7, metadata: { mode: 'train', to: 'Stuttgart Hbf', demo_booking: true },
  }),

  // ---- Drawer: accepted but not scheduled -----------------------------------
  dm: card('dm', {
    type: 'museum', title: 'Deutsches Museum', place: 'dm', img: 'dm', kind: 'assumption',
    summary: "One of the world's largest science and technology museums, on an island in the Isar. Daily 09:00–17:00, last admission 16:30.",
    duration: 150, basis: 'visit style normal: 2.5 h (very large museum; pick a few halls)',
    price_text: 'Adults €16 (muenchen.de)', price: 16,
  }),
  sch: card('sch', {
    type: 'nightlife', title: "Cocktails at Schumann's", place: 'sch', kind: 'assumption', state: 'needs_checking',
    summary: 'Legendary bar at the Hofgarten. Saturday opening hours disagree between sources.',
    duration: 90, basis: 'visit style normal: 90 min',
  }),
  eg: card('eg', {
    type: 'nature', title: 'Englischer Garten & Chinese Tower', place: 'eg', img: 'ct', kind: 'assumption',
    summary: 'Walk through the English Garden to the Chinese Tower beer garden (one of the largest in Munich). Park open all year; beer garden weather-dependent.',
    duration: 90, basis: 'visit style normal: 90 min walk incl. a drink',
  }),

  // ---- Swipe deck: suggestions ----------------------------------------------
  pdm: card('pdm', {
    type: 'museum', title: 'Pinakothek der Moderne', place: 'pdm', img: 'pdm', kind: 'assumption', swipe: 'suggested',
    summary: 'Art, design, architecture and graphic art of the 20th and 21st century under one roof. Tue–Sun 10:00–18:00, Thu until 20:00.',
    duration: 120, basis: 'visit style normal: 2 h', price_text: '€10 (reduced €7), €1 on Sundays', price: 10,
  }),
  peter: card('peter', {
    type: 'sight', title: 'Climb the Alter Peter', place: 'peter', img: 'peter', kind: 'assumption', swipe: 'suggested',
    summary: "Tower of Munich's oldest parish church right next to Marienplatz. April–October 09:00–19:30, last entry 19:00.",
    duration: 40, basis: 'visit style normal: 40 min (stairs up and down, view)', price_text: 'Adults €5', price: 5,
    reservation: false, reservation_note: 'No advance booking possible',
  }),
  hb: card('hb', {
    type: 'meal', title: 'Hofbräuhaus am Platzl', place: 'hb', img: 'hb', kind: 'assumption', swipe: 'suggested', state: 'needs_checking',
    summary: 'The famous state brewery beer hall with brass band. Kitchen until 22:00. Weekend opening time differs between sources.',
    duration: 90, basis: 'visit style normal: 90 min', reservation: false,
    reservation_note: 'No reservations for the Schwemme; groups of 4+ should reserve upstairs',
  }),
  olt: card('olt', {
    type: 'sight', title: 'Olympiaturm view', place: 'olt', img: 'olt', kind: 'assumption', swipe: 'suggested', state: 'needs_checking',
    summary: 'TV tower in the Olympic Park with a 190 m viewing platform. Closed for renovation; reopening planned for 2027, date not confirmed.',
    duration: 60, basis: 'visit style normal: 1 h (based on pre-renovation operation)',
  }),
};

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------
const holidays = [{
  id: uid('holiday:unity'), trip_id: TRIP_ID, date: SUN, name: 'German Unity Day',
  level: 'national', region: null,
  note: 'Tag der Deutschen Einheit. National public holiday; in 2027 a Sunday and the last Oktoberfest day. Checked Bavaria (state) and Munich (city): no additional holiday on 2 or 3 Oct 2027. Does not imply closures; venue-specific hours are checked per card.',
  created_at: CREATED,
}];
const HOL = holidays[0].id;

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------
const facts = [];
let factN = 0;
/**
 * f(target, field, value, evidence, source_type, src, opts)
 * target: 'p:key' | 'c:key' | 'h'
 */
function f(target, field, value, evidence, source_type, src, o = {}) {
  factN++;
  const [kind, key] = target.split(':');
  facts.push({
    id: uid(`fact:${factN}:${target}:${field}`), trip_id: TRIP_ID,
    card_id: kind === 'c' ? C[key].id : null,
    place_id: kind === 'p' ? P[key].id : null,
    holiday_id: kind === 'h' ? HOL : null,
    field, value, evidence, source_type,
    url: src ? src[0] : null, title: src ? src[1] : null,
    retrieved_at: RETRIEVED, applies_from: o.from ?? null, applies_to: o.to ?? null,
    basis: o.basis ?? null, note: o.note ?? null,
  });
}
const NOT_PUBLISHED = '2027 holiday hours not yet published';

// Holiday
f('h', 'date', SUN, 'operator_confirmed', 'holiday_calendar', S.einigvtr, { from: SUN, to: SUN, note: 'Art. 2(2): 3 October is the statutory holiday "Tag der Deutschen Einheit" (every year).' });
f('h', 'regional_check', { region: 'Bavaria', additional_holidays_2027_10_02_03: [] }, 'operator_confirmed', 'holiday_calendar', S.bayftg, { from: SAT, to: SUN, note: 'Bavarian holiday law lists 3 Oct as a state-wide holiday; no other Bavarian holiday on 2–3 Oct. Page returned HTTP 503 at retrieval; content confirmed via search result summary.' });
f('h', 'regional_check', { region: 'Bavaria', additional_holidays_2027_10_02_03: [] }, 'operator_confirmed', 'holiday_calendar', S.feiertage_mde, { from: SAT, to: SUN, note: 'muenchen.de 2027 list: 3 Oct 2027 (Sunday) Tag der Deutschen Einheit; 2 Oct is not a holiday.' });
f('h', 'city_check', { city: 'Munich', city_holidays_2027_10_02_03: [] }, 'operator_confirmed', 'holiday_calendar', S.feiertage_mde, { from: SAT, to: SUN, note: 'No Munich-only holiday (Augsburger Friedensfest on 8 Aug is Augsburg only; Mariä Himmelfahrt is 15 Aug).' });
f('h', 'shops', 'Supermarkets, department stores and most shops closed; exceptions at stations, the airport, bakeries, petrol stations, florists', 'operator_confirmed', 'official', S.td3, { from: SUN, to: SUN });

// Arrival / departure (demo booking)
f('c:arrival', 'fixed_start', '09:16', 'estimated', 'model', null, { from: SAT, to: SAT, basis: 'Plausible ICE Stuttgart → München arrival for the demo booking; real 2027 timetable not yet bookable.' });
f('c:departure', 'fixed_start', '18:32', 'estimated', 'model', null, { from: SUN, to: SUN, basis: 'Plausible ICE München → Stuttgart departure for the demo booking.' });
f('c:arrival', 'timetable', null, 'unknown', 'transit', null, { note: 'DB timetable for October 2027 not published yet; replace with the real booking.' });

// Hotel
f('p:hotel', 'address', 'Uhlandstraße 1, 80336 München', 'operator_confirmed', 'official', S.hotel_home);
f('p:hotel', 'breakfast', { available: true, included_in_rate: true }, 'regular_hours', 'official', S.hotel_home);
f('p:hotel', 'breakfast_hours', { days: 'mon-sun', open: '07:30', close: '10:00' }, 'regular_hours', 'official', S.hotel_bf, { note: '"Täglich von 7.30 Uhr bis 10.00 Uhr (Montag – Sonntag)"; external guests €23' });
f('p:hotel', 'holiday_hours', null, 'unknown', 'official', S.hotel_bf, { from: SUN, to: SUN, note: 'Breakfast page says Mon–Sun; holidays not mentioned.' });
f('p:hotel', 'check_in', { from: '15:00' }, 'regular_hours', 'official', S.hotel_rooms, { note: 'Check-in "15.00 Uhr bis 23.00 Uhr".' });
f('p:hotel', 'check_in_until', '23:00', 'regular_hours', 'official', S.hotel_rooms);
f('p:hotel', 'check_out', { until: '11:00' }, 'regular_hours', 'official', S.hotel_rooms, { note: 'One section of the page says "bis 11.00 Uhr".' });
f('p:hotel', 'check_out', { until: '12:00' }, 'regular_hours', 'official', S.hotel_rooms, { note: 'Another section of the same page says "bis 12.00 Uhr".' });
f('p:hotel', 'check_out', { until: '11:00' }, 'regular_hours', 'booking', S.hotel_de, { note: 'Listing: check-out 11:00.' });
f('p:hotel', 'check_in', { from: '15:00' }, 'regular_hours', 'booking', S.hotel_de, { note: 'Listing: check-in 15:00.' });
f('p:hotel', 'reception_hours', { days: 'mon-sun', open: '07:00', close: '23:00' }, 'regular_hours', 'official', S.hotel_rooms);
f('p:hotel', 'dinner', null, 'unknown', 'official', S.hotel_home, { note: 'No restaurant or dinner mentioned on the official site.' });
f('p:hotel', 'luggage_storage', null, 'unknown', 'official', S.hotel_home, { note: 'Not mentioned on the official site.' });
f('p:hotel', 'walk_to_hbf', '≈10 min', 'regular_hours', 'official', S.hotel_home);
f('c:checkin', 'check_in', { date: SAT, from: '15:00' }, 'operator_confirmed', 'upload', null, { from: SAT, to: SAT, note: 'Extracted from hotel-booking-sample.pdf (demo document); waiting for user confirmation.' });
f('c:checkout', 'check_out', { date: SUN, until: '11:00' }, 'operator_confirmed', 'upload', null, { from: SUN, to: SUN, note: 'Extracted from hotel-booking-sample.pdf (demo document); waiting for user confirmation.' });

// Marienplatz / Glockenspiel
f('p:marienplatz', 'show_times', ['11:00', '12:00', '17:00'], 'regular_hours', 'official', S.glock_de, { note: 'Daily 11:00 and 12:00; additionally 17:00 from March to October. Silent on Good Friday.' });
f('p:marienplatz', 'show_times', ['11:00', '12:00', '17:00'], 'regular_hours', 'official', S.glock_en, { note: 'Same times on the English page; plus 21:00 night show.' });
f('p:marienplatz', 'opening_hours', H.allday, 'estimated', 'model', null, { basis: 'Public square; Glockenspiel watched for free from Marienplatz (muenchen.de).' });
f('c:glock', 'duration', 15, 'estimated', 'travel_guide', null, { basis: 'Travel guides describe the show as roughly 12–15 minutes; muenchen.de does not state a duration.' });
f('c:glock', 'holiday_hours', null, 'unknown', 'official', S.glock_de, { from: SAT, to: SAT, note: '2 Oct 2027 is a regular Saturday; no exception documented.' });

// Frauenkirche
f('p:frauen', 'opening_hours', H.frauen, 'regular_hours', 'official', S.dom_off, { note: 'South tower: Mon–Sat 10:00–17:00, Sundays and public holidays 11:30–17:00, last ascent 16:30. No visits during services.' });
f('p:frauen', 'opening_hours', H.frauen, 'regular_hours', 'tourism_board', S.frauen_mde);
f('p:frauen', 'holiday_hours', iv('11:30', '17:00', '16:30'), 'regular_hours', 'official', S.dom_off, { note: 'Operator rule for Sundays and public holidays; not a 2027-specific confirmation.' });
f('p:frauen', 'price', { adult: 7.5, child_7_16: 5.5, family: 21 }, 'regular_hours', 'official', S.dom_off);
f('p:frauen', 'church_hours', { days: 'mon-sun', open: '08:00', close: '20:00' }, 'regular_hours', 'official', S.dom_off);

// Weisses Bräuhaus
f('p:wb', 'opening_hours', H.wb, 'regular_hours', 'official', S.wb_off, { note: '"Montag – Sonntag durchgehend von 09:00 – 23:30 Uhr", warm kitchen until 22:30.' });
f('p:wb', 'holiday_hours', null, 'unknown', 'official', S.wb_off, { note: NOT_PUBLISHED });

// Viktualienmarkt
f('p:vm', 'opening_hours', H.vm_official, 'regular_hours', 'official', S.vm_mde, { note: 'City minimum selling times 1 Apr–31 Oct: Mon–Fri 10–18, Sat 10–15. Stalls set their own hours above the minimum.' });
f('p:vm', 'opening_hours', H.vm_inm, 'regular_hours', 'travel_guide', S.vm_inm, { note: '"Montag bis Samstag 8 bis 20 Uhr, Biergarten 9 bis 22 Uhr".' });
f('p:vm', 'closed', { date: SUN, closed: true }, 'operator_confirmed', 'official', S.td3, { from: SUN, to: SUN, note: 'muenchen.de 2027 holiday page: market accessible, but stalls closed on public holidays.' });

// Residenz
f('p:res', 'opening_hours', H.res, 'regular_hours', 'official', S.res_off, { note: 'Summer season daily 09:00–18:00, last entry 17:00 (2026 season: 28 Mar–25 Oct).' });
f('p:res', 'opening_hours', H.res, 'regular_hours', 'tourism_board', S.res_mde, { note: 'Season stated as 1 Apr–19 Oct: daily 9–18, last entry 17.' });
f('p:res', 'season', { summer_from: '03-28', summer_to: '10-25' }, 'regular_hours', 'official', S.res_off, { note: '2026 dates; 2027 season dates not published yet.' });
f('p:res', 'season', { summer_from: '04-01', summer_to: '10-19' }, 'regular_hours', 'tourism_board', S.res_mde, { note: 'Disagrees with the official season dates; both include 2–3 Oct.' });
f('p:res', 'closure_days', ['01-01', 'shrove_tuesday', '12-24', '12-25', '12-31'], 'regular_hours', 'official', S.res_off, { note: '3 Oct not among the closure days.' });
f('p:res', 'holiday_hours', null, 'unknown', 'official', S.res_off, { from: SUN, to: SUN, note: NOT_PUBLISHED });
f('p:res', 'price', { residence_museum: 10, reduced: 9, combined_with_treasury: 15 }, 'regular_hours', 'official', S.res_adm);

// Augustiner-Keller
f('p:ak', 'opening_hours', H.ak, 'regular_hours', 'tourism_board', S.ak_orte, { note: 'Mon–Sun 10:00–01:00; beer garden 11:00–24:00, kitchen until 22:00, weather permitting.' });
f('p:ak', 'opening_hours', null, 'unknown', 'official', S.ak_off, { note: 'Official homepage does not list opening hours.' });

// Oktoberfest
f('p:wiesn', 'season', { from: '2027-09-18', to: '2027-10-03' }, 'operator_confirmed', 'official', S.wiesn_off, { from: '2027-09-18', to: SUN });
f('p:wiesn', 'opening_hours', H.wiesn, 'operator_confirmed', 'official', S.wiesn_off, { from: '2027-09-18', to: SUN, note: 'Grounds 2027: Mon–Thu 10–23:30, Fri 10–24, Sat 9–24, Sun 9–23:30. Rides on Sundays and holidays 9–23:30.' });
f('p:wiesn', 'special_hours', { date: SUN, hours: [iv('09:00', '23:30')] }, 'operator_confirmed', 'official', S.wiesn_off, { from: SUN, to: SUN, note: 'Sunday/holiday hours apply on the last day.' });
f('p:wiesn', 'holiday_hours', { open: '09:00' }, 'operator_confirmed', 'official', S.td3, { from: SUN, to: SUN, note: '"Der 3. Oktober ist 2027 der letzte Wiesntag ... öffnen bereits um 9 Uhr, die Oide Wiesn um 10 Uhr."' });
f('p:wiesn', 'last_service', { large_tents: '22:30', small_tents: '23:00' }, 'operator_confirmed', 'official', S.wiesn_off, { from: '2027-09-18', to: SUN });
f('p:wiesn', 'price', { entry: 0, beer_litre_2026: [14.8, 15.9], oide_wiesn_adult_2026: 4 }, 'regular_hours', 'other', S.wiesn_prices, { from: '2026-09-19', to: '2026-10-04', note: '2026 prices; 2027 beer prices are announced in summer 2027.' });

// Böllerschießen
f('c:boeller', 'fixed_start', at(SUN, '12:00'), 'operator_confirmed', 'event_calendar', S.boeller_mde, { from: SUN, to: SUN, note: '"Sonntag, 3. Oktober 2027", 12 Uhr, steps below the Bavaria.' });
f('c:boeller', 'fixed_start', at(SUN, '12:00'), 'operator_confirmed', 'official', S.boeller_off, { from: SUN, to: SUN, note: 'Last festival day, 3 October, at 12 o\'clock sharp.' });
f('c:boeller', 'fixed_end', at(SUN, '12:30'), 'estimated', 'model', null, { basis: 'No end time published; salute, music and honours estimated at 30 min.' });
f('p:bavaria', 'opening_hours', H.allday, 'estimated', 'model', null, { basis: 'Public outdoor steps of the Ruhmeshalle; not the statue\'s viewing platform.' });

// Alte Pinakothek
f('p:ap', 'opening_hours', H.ap, 'regular_hours', 'official', S.ap_off, { note: 'Tue & Wed 10–20, other days 10–18, Monday closed.' });
f('p:ap', 'opening_hours', H.ap, 'regular_hours', 'tourism_board', S.ap_mde);
f('p:ap', 'special_hours', { date: SUN, hours: [iv('10:00', '18:00')] }, 'regular_hours', 'tourism_board', S.td3, { from: SUN, to: SUN, note: 'City portal lists Alte Pinakothek, Pinakothek der Moderne and Museum Brandhorst open until 18:00 on 3 Oct 2027; matches regular Sunday hours; not yet on pinakothek.de.' });
f('p:ap', 'holiday_hours', { open: '10:00', close: '18:00' }, 'operator_confirmed', 'official', S.pin_visit, { from: '2026-10-03', to: '2026-10-03', note: '2026 list: "German Unity Day (03.10.): All museums open until 6 p.m." Applies to 2026 only.' });
f('p:ap', 'holiday_hours', null, 'unknown', 'official', S.pin_visit, { from: SUN, to: SUN, note: NOT_PUBLISHED + ' on pinakothek.de' });
f('p:ap', 'price', { regular: 9, reduced: 6, sunday: 1 }, 'regular_hours', 'official', S.ap_off);
f('p:ap', 'price', { regular: 7, reduced: 5, sunday: 1 }, 'regular_hours', 'tourism_board', S.ap_mde);
f('p:ap', 'closure_days', ['shrove_tuesday', '05-01', '12-24', '12-25', '12-31'], 'regular_hours', 'official', S.pin_visit);

// Deutsches Museum
f('p:dm', 'opening_hours', H.dm, 'regular_hours', 'official', S.dm_off, { note: '"Open daily from 9:00 to 17:00. Last admission to the museum is at 16:30."' });
f('p:dm', 'opening_hours', H.dm, 'regular_hours', 'tourism_board', S.dm_mde, { note: '"Einlass bis 16:30 Uhr".' });
f('p:dm', 'closure_days', ['2026-02-17', '2026-04-03', '2026-05-01', '2026-11-01', '2026-11-11', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01'], 'operator_confirmed', 'official', S.dm_off, { from: '2026-01-01', to: '2027-01-01', note: '3 Oct 2026 not a closure day.' });
f('p:dm', 'holiday_hours', null, 'unknown', 'official', S.dm_off, { from: SUN, to: SUN, note: NOT_PUBLISHED + ' (2027 closure list not out yet)' });
f('p:dm', 'price', { adult: 16, reduced: 9, family: 33 }, 'regular_hours', 'tourism_board', S.dm_mde);

// Schumann's – three sources, three answers for Saturday
f('p:sch', 'opening_hours', H.sch_orte, 'regular_hours', 'tourism_board', S.sch_orte);
f('p:sch', 'opening_hours', H.sch_to, 'regular_hours', 'travel_guide', S.sch_to);
f('p:sch', 'opening_hours', H.sch_sa, 'regular_hours', 'restaurant_guide', S.sch_sa, { note: 'Saturday not listed.' });
f('p:sch', 'opening_hours', null, 'unknown', 'official', ['https://www.schumanns.de/', "Schumann's – official site"], { note: 'Official homepage shows no opening hours.' });

// Englischer Garten
f('p:eg', 'opening_hours', H.allday, 'regular_hours', 'tourism_board', S.eg_mde, { note: 'Park "ganzjährig geöffnet", free.' });
f('p:eg', 'beer_garden_hours', { 'mon-fri': { open: '11:00' }, 'sat-sun': { open: '10:00' }, condition: 'dry and warm weather' }, 'regular_hours', 'official', S.ct_off, { note: 'In cold or uncertain weather only the kiosk opens, daily from 12:00. Closing time not stated.' });

// Pinakothek der Moderne
f('p:pdm', 'opening_hours', H.pdm, 'regular_hours', 'official', S.pdm_off);
f('p:pdm', 'special_hours', { date: SUN, hours: [iv('10:00', '18:00')] }, 'regular_hours', 'tourism_board', S.td3, { from: SUN, to: SUN });
f('p:pdm', 'holiday_hours', null, 'unknown', 'official', S.pdm_special, { from: '2025-10-03', to: '2025-10-03', note: 'Lists "special opening hours" for 03.10.2025 without the times.' });
f('p:pdm', 'price', { regular: 10, reduced: 7, sunday: 1 }, 'regular_hours', 'official', S.pdm_off);

// Alter Peter
f('p:peter', 'opening_hours', H.peter, 'regular_hours', 'tourism_board', S.peter_mde, { note: 'Summer (April–October) 09:00–19:30, last entry 19:00. Closed Good Friday, Shrove Tuesday, 25 Dec, 1 Jan.' });
f('p:peter', 'price', { adult: 5, reduced: 3, pupils: 2 }, 'regular_hours', 'tourism_board', S.peter_mde);

// Hofbräuhaus – weekend opening time disagrees
f('p:hb', 'opening_hours', H.hb_official, 'regular_hours', 'official', S.hb_off, { note: '"daily from 11 a.m. to 12 p.m." (midnight); kitchen until 22:00, last drinks 23:30.' });
f('p:hb', 'opening_hours', H.hb_mde, 'regular_hours', 'tourism_board', S.hb_mde, { note: 'Lists Sat and Sun from 10:30.' });

// Olympiaturm
f('p:olt', 'closure', { closed_until: '2027-Q1 (expected)' }, 'regular_hours', 'tourism_board', S.olt_mde, { note: '"voraussichtlich bis zum 1. Quartal 2027 geschlossen".' });
f('p:olt', 'closure', { closed_until: '2027 (planned reopening, no date)' }, 'regular_hours', 'official', S.olt_swm, { note: '"Seine Wiedereröffnung ist für 2027 geplant." (SWM operates the Olympiapark).' });
f('p:olt', 'opening_hours', H.olt_before, 'regular_hours', 'tourism_board', S.olt_mde, { to: '2024-06-30', note: 'Hours before the renovation closure; 2027 hours unknown.' });

// Durations (assumptions shown on cards)
for (const [k, c] of Object.entries(C)) {
  if (c.duration_minutes != null && !['glock'].includes(k) && !['arrival', 'departure'].includes(c.type)) {
    f(`c:${k}`, 'duration', c.duration_minutes, 'estimated', 'model', null, { basis: c.duration_basis });
  }
}

// ---------------------------------------------------------------------------
// Travel times: walking ranges between all places with coordinates, both directions
// ---------------------------------------------------------------------------
const R = 6371000;
function haversine(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const DETOUR = 1.3;
const travel_times = [];
const located = places.filter((p) => p.lat != null && p.lng != null);
for (const a of located) {
  for (const b of located) {
    if (a.id === b.id) continue;
    const d = Math.round(haversine(a, b) * DETOUR);
    const min = Math.max(1, Math.floor(d / (5000 / 60)));
    const max = Math.max(min + 1, Math.ceil(d / (4500 / 60)));
    travel_times.push({
      trip_id: TRIP_ID, from_place_id: a.id, to_place_id: b.id, mode: 'walk',
      min_minutes: min, max_minutes: max, distance_m: d,
      basis: 'straight-line (haversine) distance × 1.3 detour factor, walking 5.0 km/h (min) – 4.5 km/h (max)',
      computed_at: RETRIEVED,
    });
  }
}

// ---------------------------------------------------------------------------
// Agent events (progress log shown in the UI)
// ---------------------------------------------------------------------------
const ev = (min, level, message, cardKey, data) => ({
  id: null, trip_id: TRIP_ID, job_id: null, card_id: cardKey ? C[cardKey].id : null, level, message,
  data: data ?? null, created_at: new Date(Date.parse('2026-10-07T20:05:00Z') + min * 60000).toISOString(),
});
const agent_events = [
  ev(0, 'info', 'Parsed hotel booking PDF: Hotel Uhland, check-in 2 Oct from 15:00, check-out 3 Oct until 11:00. Please confirm.', 'checkin'),
  ev(1, 'progress', 'Checking public holidays for 2–3 Oct 2027: national, Bavaria, Munich', null, { found: ['2027-10-03 German Unity Day (national)'] }),
  ev(2, 'progress', 'Scanning event calendars: oktoberfest.de, muenchen.de', null),
  ev(3, 'info', 'Found fixed event: Böllerschießen at the Bavaria, Sun 3 Oct 12:00 (last Wiesn day)', 'boeller'),
  ev(4, 'progress', `Researching opening hours and last entry for ${places.length - 1} places`, null),
  ev(6, 'warning', 'Hotel Uhland website states two check-out times (11:00 and 12:00); keeping both claims', 'checkout'),
  ev(7, 'warning', "Schumann's: three sources disagree on Saturday hours; marked as needs checking", 'sch'),
  ev(8, 'warning', 'Olympiaturm is closed for renovation; reopening planned for 2027 without a date', 'olt'),
  ev(9, 'info', 'Holiday hours for 3 Oct 2027 not yet published for Residenz, Deutsches Museum and most restaurants; using regular hours with a warning', null),
  ev(10, 'progress', `Computed walking-time ranges between ${located.length} places`, null, { pairs: travel_times.length }),
  ev(11, 'info', `Research finished: ${cards.length} cards, ${facts.length} sourced or estimated facts`, null),
];
agent_events.forEach((e, i) => { e.id = i + 1; });

// ---------------------------------------------------------------------------
const bundle = {
  trip: {
    id: TRIP_ID, title: 'Munich · Oktoberfest weekend', city: 'Munich', region: 'Bavaria', country_code: 'DE',
    timezone: TZ, start_date: SAT, end_date: SUN, step: 'scheduling', is_demo: true, cloned_from: null,
    created_at: CREATED, updated_at: CREATED,
  },
  preferences: {
    trip_id: TRIP_ID, breakfast_time: '08:00', lunch_time: '12:30', dinner_time: '19:00', nightlife_importance: 2,
    interests: ['museums', 'culture', 'food', 'beer'], visit_style: 'normal', pace: 'balanced', default_buffer_minutes: 15,
    free_text: 'First time at the Oktoberfest. One proper museum per day, Bavarian food, a beer garden if the weather is good.',
    updated_at: CREATED,
  },
  places,
  cards,
  holidays,
  facts,
  travel_times,
  uploads,
  agent_events,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bundle, null, 2) + '\n');
console.log(`wrote ${OUT}: ${places.length} places, ${cards.length} cards, ${facts.length} facts, ${travel_times.length} travel times`);
