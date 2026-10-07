# data/ – prepared demo dataset

**Munich, Sat 2 – Sun 3 Oct 2027.** That is the last weekend of Oktoberfest 2027 (18 Sep – 3 Oct). Sun 3 Oct is German Unity Day and also the last Wiesn day.
The research was done on **2026-10-07**. It follows the README research rules: official sources first, a second independent source for critical hours, one fact row per claim per source, and estimates labelled with their basis.

## Files

| File | What |
|---|---|
| `demo/munich.json` | `TripBundle` (shared/types.ts) plus `uploads` and `agent_events`. **Generated**, do not edit by hand. |
| `demo/hotel-booking-sample.pdf` | One-page plain "Booking summary (demo)" for Hotel Uhland. It is clearly marked as a demo, has no hotel branding and no payment data. |
| `../supabase/seed.sql` | Inserts in FK order. **Generated** from munich.json. Idempotent: it deletes the demo trip first. |
| `scripts/build-demo.mjs` | **Source of truth**: all researched facts, sources, cards and the schedule. Computes the travel matrix and stable UUIDs. |
| `scripts/build-seed.mjs` | munich.json → seed.sql |
| `scripts/build-pdf.mjs` | Generates the PDF with pdf-lib |
| `scripts/typecheck.mjs` | Type-checks munich.json against `shared/types.ts` (`satisfies TripBundle & {uploads, agent_events}`) |
| `scripts/plan-check.mjs` | Runs the real `planner/src` on the bundle. It asserts that the prepared plan has no blockers and that each demo move below produces its conflict. |
| `scripts/verify.mjs` | Runs the migration in PGlite, applies seed.sql twice, checks counts and expected conflicting facts, and runs `clone_trip` as anon |
| `CONTRACT_NOTES.md` | Proposals and conventions for web/ agent/ planner/ |

```sh
cd data && npm install
npm run build   # munich.json -> seed.sql -> pdf
npm run check   # typecheck + plan-check + verify   (verify uses @electric-sql/pglite from the repo root: run `npm install` there once)
```

Demo trip id: **`2027a10d-0203-4000-8000-00000000c0de`** (use it as `VITE_DEMO_TRIP_ID`).

## Itinerary (times computed by planner/, walk upper bound + 15 min buffer)

**Sat 2 Oct 2027**

| Time | Card | Notes |
|---|---|---|
| 09:16 | ICE arrival at München Hbf | fixed, *estimated* demo booking |
| 09:58–10:08 | Drop luggage at Hotel Uhland | luggage storage before check-in is undocumented → needs checking |
| 11:00–11:15 | Glockenspiel at Marienplatz | **fixed show time** 11:00 (also 12:00, 17:00) |
| 11:33–12:18 | Frauenkirche & south tower | tower Mon–Sat 10–17, last ascent 16:30 |
| 12:41–13:56 | Lunch at Weisses Bräuhaus | daily 09:00–23:30 |
| 14:15–14:55 | Viktualienmarkt stroll | Sat stalls 10–15 (city minimum); sources disagree → needs checking |
| 15:21–17:21 | Residenz München | daily 9–18, **last entry 17:00** (official + muenchen.de agree) |
| 18:08–18:23 | Check in at Hotel Uhland | **from upload, confirmed=false** (from 15:00) |
| 18:57–20:27 | Dinner at Augustiner-Keller | |

**Sun 3 Oct 2027 – German Unity Day, last Wiesn day**

| Time | Card | Notes |
|---|---|---|
| 07:30–08:15 | Breakfast at Hotel Uhland | window 07:30–10:00 (hotel site) |
| 08:15–08:30 | Check out of Hotel Uhland | **from upload, confirmed=false** (until 11:00; the hotel site also says 12:00) |
| 09:00–11:15 | Oktoberfest – last Wiesn day | opens 09:00 on 3 Oct 2027 (oktoberfest.de, muenchen.de) |
| 12:00–12:30 | Böllerschießen at the Bavaria | **fixed 12:00**, confirmed for 3 Oct 2027 by two sources; end estimated |
| 12:58–14:13 | Lunch in a Wiesn tent | |
| 15:02–17:02 | Alte Pinakothek | open until 18:00 on 3 Oct 2027 per muenchen.de; €1 on Sundays |
| 18:32 | ICE departure from München Hbf | fixed, *estimated* demo booking |

**Drawer (accepted, unscheduled):** Deutsches Museum, Schumann's (cocktails), Englischer Garten & Chinese Tower.
**Swipe deck (suggested):** Pinakothek der Moderne, Alter Peter tower, Hofbräuhaus, Olympiaturm (needs checking, closed for renovation).

The prepared plan has **no blockers**. Its needs-checking items are intended: two unconfirmed hotel booking cards, undocumented luggage storage, and conflicting Viktualienmarkt hours.

## Demo conflicts (all asserted in `plan-check.mjs`)

| # | Move | Planner says | Source |
|---|---|---|---|
| A | Residenz after the hotel check-in | "Visit ends at 18:40, after Residenz München closes at 18:00" | residenz-muenchen.de + muenchen.de |
| B | Residenz after dinner | "Visit starts at 18:46, after Residenz München closes at 18:00" | same |
| C | Frauenkirche before the Glockenspiel | "Ends at 11:34; can't reach Glockenspiel at Marienplatz at 11:00 in time" | muenchen.de show times |
| D | Viktualienmarkt after the Residenz | "Visit starts at 16:46, after Viktualienmarkt closes at 15:00" (+ conflicting hours) | muenchen.de vs in-muenchen.de |
| E | Viktualienmarkt onto Sun 3 Oct | "Viktualienmarkt is closed on 3 Oct (market stalls are closed on public holidays)" | muenchen.de 2027 holiday page (**documented** holiday closure) |
| F | Frauenkirche tower onto Sunday morning | tower opens 11:30 on Sundays/holidays, so the Wiesn ends at 15:14 and the 12:00 Böllerschießen is unreachable | muenchner-dom.de + muenchen.de |
| G | Deutsches Museum (drawer) after the Residenz | "Visit starts at 17:57, after Deutsches Museum closes at 17:00" | deutsches-museum.de + muenchen.de |
| H | Schumann's after dinner on Saturday | unknown Saturday hours + "Sources disagree on opening hours" | orte.muenchen.de vs Time Out vs Schlemmer Atlas |
| I | Deutsches Museum onto Sun 3 Oct | "Opening hours on 3 Oct (German Unity Day) are not confirmed" | 2027 holiday hours not published |

**Best for the video:** use A, or drag the Deutsches Museum from the drawer (G). Both are sourced closing times. For a fixed-appointment conflict use C.

## Evidence summary (108 facts)

- **operator_confirmed (18)**: confirmed by the operator for the trip date or a period that includes it.
  - Oktoberfest 2027 dates, grounds/tent hours and last service (oktoberfest.de shows 2027).
  - Wiesn opening at 09:00 on 3 Oct 2027 and the market-stall closure on 3 Oct 2027 (muenchen.de, run by the city).
  - Böllerschießen at 12:00 on 3 Oct 2027 (oktoberfest.de + muenchen.de).
  - German Unity Day: Einigungsvertrag Art. 2. Bavaria and Munich were checked; there is no other holiday on 2–3 Oct.
  - Deutsches Museum closure list 2026/27.
  - Pinakotheken "German Unity Day: open until 6 p.m." (marked for **2026 only**).
  - Booking times extracted from the upload.
- **regular_hours (52)**: regular weekly hours from the operator and/or muenchen.de and guides. muenchen.de's 3 Oct 2027 listing for the Pinakotheken ("open until 18:00") is stored here because it matches regular Sunday hours and is not yet on the operator site.
- **estimated (26)**: all visit durations (visit style normal, basis on each card), the demo train times, the Böllerschießen end time, the Glockenspiel length (12–15 min per travel guides), and 24h access for public outdoor spaces (Marienplatz, Bavaria steps).
- **unknown (12)**: 2027 holiday hours (Residenz, Deutsches Museum, Weisses Bräuhaus, hotel breakfast, Pinakotheken on the operator site), Augustiner-Keller and Schumann's official hours (not on their sites), hotel dinner, hotel luggage storage, Pinakothek der Moderne 3 Oct 2025 "special hours" without times, and the DB 2027 timetable.
- **conflicting** (derived by the `fact_status` view):

  | Place | Field | Claims |
  |---|---|---|
  | Viktualienmarkt | opening hours | 10–18 / Sat 10–15 vs Mon–Sat 8–20 |
  | Hofbräuhaus | opening hours | official daily 11:00 vs muenchen.de Sat/Sun 10:30 |
  | Schumann's | opening hours | Sat 17–02 vs Sat 18–03 vs Sat not listed |
  | Hotel Uhland | check-out | the same official page says 11:00 and 12:00; hotel.de says 11:00 |
  | Residenz | summer season | 28 Mar–25 Oct vs 1 Apr–19 Oct (both include the trip) |
  | Alte Pinakothek | price | €9 official vs €7 muenchen.de |
  | Olympiaturm | reopening | "expected Q1 2027" vs "planned 2027" |

**Holiday handling.** 3 Oct 2027 is a Sunday, so most venues would have Sunday hours anyway. `special_hours` for 2027-10-03 is set only where it is documented:
- Oktoberfest (09:00–23:30)
- Alte Pinakothek and Pinakothek der Moderne (10–18, muenchen.de)
- Viktualienmarkt (closed)
- Frauenkirche tower (the operator's Sunday/holiday rule, 11:30–17:00)
- Bavaria steps (note-only: the Böllerschießen is documented)

Every other venue keeps regular hours plus an `unknown` holiday-hours fact, so the planner shows `holiday_hours_unconfirmed`.

## Could not find / not verified

- **Real 2027 train times**: the DB timetable is not bookable yet. Arrival 09:16 and departure 18:32 are plausible demo values (evidence `estimated`).
- **2027 holiday hours** for the Residenz and Deutsches Museum are not published, and neither are the 2027 closure lists. The Residenz 2027 season dates are not published either.
- **Google Maps**: no Google Maps facts were scraped, so `google_place_id` is null. `google_maps_url` is a Maps search link (name + address). The second sources are muenchen.de, orte.muenchen.de, travel guides and hotel.de.
- **Augustiner-Keller and Schumann's**: their official sites list no hours. Augustiner-Keller hours come from orte.muenchen.de only.
- **Hotel Uhland**: luggage storage and dinner are not documented. Breakfast is documented (included, 07:30–10:00 daily). The booking.com page returned no content.
- **Glockenspiel** show length is not on muenchen.de. 12–15 min is an estimate from travel guides.
- **Böllerschießen** end time is not published (30 min estimated).
- **Bayerisches Feiertagsgesetz** page returned HTTP 503 at retrieval. The content was confirmed via a search summary plus the muenchen.de 2027 holiday list.
- **2027 Wiesn beer prices** are not out yet. The 2026 prices are stored with applies 2026.
- **Coordinates** come from OpenStreetMap Nominatim. The Oktoberfest point is the northern end of the Theresienwiese.

## Images

All `image_url`s are Wikimedia Commons thumbnails on `upload.wikimedia.org` (960px). Each one was checked for HTTP 200 on 2026-10-07. The license and Commons page are in `card.metadata.image_credit`; author attribution is on the Commons page. There are no images for the hotel, Augustiner-Keller or Schumann's, to avoid branding and unverified photos.

## Sources

Official / operator:
- [oktoberfest.de opening hours 2027](https://www.oktoberfest.de/en/information/oktoberfest-opening-times/opening-hours-munich-oktoberfest)
- [oktoberfest.de Böllerschießen](https://www.oktoberfest.de/informationen/termine/traditionelles-boellerschiessen-an-der-bavaria)
- [deutsches-museum.de opening hours](https://www.deutsches-museum.de/en/museum-island/visit/opening-hours)
- [pinakothek.de Alte Pinakothek](https://www.pinakothek.de/en/visit/alte-pinakothek)
- [pinakothek.de visit/holidays](https://www.pinakothek.de/en/visit)
- [pinakothek-der-moderne.de](https://www.pinakothek-der-moderne.de/en/)
- [special hours](https://www.pinakothek-der-moderne.de/en/special-opening-hours/)
- [residenz-muenchen.de opening](https://www.residenz-muenchen.de/englisch/tourist/opening.htm)
- [admission](https://www.residenz-muenchen.de/englisch/tourist/admiss.htm)
- [muenchner-dom.de](https://www.muenchner-dom.de)
- [hofbraeuhaus.de](https://www.hofbraeuhaus.de/en/)
- [weisses-brauhaus-tal.de](https://www.weisses-brauhaus-tal.de/)
- [augustinerkeller.de](https://www.augustinerkeller.de/)
- [chinaturm.de](https://www.chinaturm.de/)
- [swm.de Olympiapark modernisation](https://www.swm.de/unternehmen/magazin/leben/olympiapark-modernisierung)
- [hotel-uhland.de](https://hotel-uhland.de/)
- [breakfast](https://hotel-uhland.de/fruehstueck/)
- [rooms/check-in](https://hotel-uhland.de/zimmer/)

City portal (official for city-run events/markets, tourism board otherwise):
- [3 Oct 2027 – what's open](https://www.muenchen.de/freizeit/aktuell/tag-der-deutschen-einheit-muenchen)
- [Böllerschießen 2027](https://www.muenchen.de/veranstaltungen/freizeit/brauchtum/boellerschiessen)
- [Glockenspiel (de)](https://www.muenchen.de/sehenswuerdigkeiten/top-sehenswuerdigkeiten/glockenspiel)
- [Glockenspiel (en)](https://www.muenchen.de/en/sights/munich-glockenspiel)
- [Viktualienmarkt](https://www.muenchen.de/sehenswuerdigkeiten/top-sehenswuerdigkeiten/viktualienmarkt)
- [Residenz](https://www.muenchen.de/sehenswuerdigkeiten/museen/residenz)
- [Deutsches Museum](https://www.muenchen.de/sehenswuerdigkeiten/museen/deutsches-museum-muenchen)
- [Alte Pinakothek](https://www.muenchen.de/sehenswuerdigkeiten/museen/alte-pinakothek)
- [Frauenkirche](https://www.muenchen.de/sehenswuerdigkeiten/frauenkirche)
- [St. Peter](https://www.muenchen.de/sehenswuerdigkeiten/kirchen-und-kloester/st-peter)
- [Hofbräuhaus](https://www.muenchen.de/en/sights/hofbrauhaus-am-platzl)
- [Englischer Garten](https://www.muenchen.de/sehenswuerdigkeiten/orte/120242.html)
- [Olympiaturm](https://www.muenchen.de/sehenswuerdigkeiten/olympiaturm)
- [Feiertage 2026/2027](https://www.muenchen.de/aktuell/feiertage-bayern-2026-und-2027)
- [orte: Augustiner-Keller](https://orte.muenchen.de/121350.html)
- [orte: Schumann's](https://orte.muenchen.de/53687.html)

Holidays:
- [Einigungsvertrag Art. 2](https://www.gesetze-im-internet.de/einigvtr/art_2.html)
- [BayFTG Art. 1](https://www.gesetze-bayern.de/Content/Document/BayFTG-1)

Guides / listings:
- [in-muenchen.de Viktualienmarkt](https://www.in-muenchen.de/orte/viktualienmarkt.html)
- [Time Out Schumann's](https://www.timeout.com/munich/bars-and-pubs/schumanns-bar)
- [Schlemmer Atlas Schumann's](https://www.schlemmer-atlas.de/restaurants/deutschland/muenchen/schumanns-bar-am-hofgarten/)
- [hotel.de Hotel Uhland](https://www.hotel.de/de/hotel/37262)
- [Sonntagsblatt Wiesn prices 2026](https://www.sonntagsblatt.de/artikel/bayern/wiesn-preise-so-viel-kostet-der-besuch-2026-und-so-sparen-familien)
