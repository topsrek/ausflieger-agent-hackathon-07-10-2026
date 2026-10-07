---
name: ausflieger-research
description: Process Ausflieger research jobs (initial_suggestions, search_again, research_card, refresh_card, parse_upload) and write validated cards, places, facts, holidays and walking times to Supabase via the ausflieger CLI. Use whenever a message mentions a research job, a trip id, or asks to poll the Ausflieger queue.
---

# Ausflieger research jobs

The research rules in `AGENTS.md` always apply (priorities, budgets, sources, evidence, holidays, never invent values, never move cards). This skill is the procedure per job kind.

## Start of every job

```bash
ausflieger jobs claim <job_id>                 # or: ausflieger jobs next
ausflieger trip summary <trip_id>              # trip, preferences, holidays, existing cards, open jobs
ausflieger event log <trip_id> "Started: <what you are doing>" --job <job_id> --level progress
```
If `claimed` is false: stop. Read `trip.city`, `region`, `country_code`, `timezone`, `start_date..end_date`, and `preferences` (meal times, `nightlife_importance` 0-3, `interests`, `visit_style`, `pace`, `free_text`).

**Holidays first, once per trip**: if `holidays` in the summary is empty, run the holiday check (below) before or in parallel with the first cards. It is cheap and decides which venue hours need a special check.

## initial_suggestions

Goal: 10-15 suggestion cards in the deck within the first minutes, then deepen.

1. **Candidates (fast)**: from your knowledge plus 1-2 quick lookups (city tourism board highlights page via Context.dev Markdown; one event-calendar lookup for the trip dates), choose ~15 candidates matching interests and pace: a mix of sights/museums, 2-4 meals (breakfast/lunch/dinner places fitting meal times), nightlife only if `nightlife_importance >= 2` (1 option if 1), events on the trip dates, nature/shopping if in interests. Skip titles already in the trip.
2. **Stream cards one by one**: for each candidate, one `ingest` with:
   - `card`: `type`, `title`, one-sentence `summary`, `research_state: "pending"`, `duration_minutes` + `duration_basis` from the table below, `metadata: {"why": "<matches interest X>"}`.
   - `place`: name and, when cheaply available, address, lat/lng, google_place_id, website_url, google_maps_url (one batched Monid places search for several candidates is ideal).
   - `facts`: whatever you actually sourced (e.g. regular hours from Google Maps as `regular_hours`), plus the duration as `estimated` (`source_type: "model"`, basis).
   Log `event log ... "Added <title>"` every few cards, not for every one.
3. **Events**: events with fixed times on trip dates become `event` cards with `is_fixed: true`, `fixed_start`/`fixed_end` (with offset), `constraint_kind: "hard"`, fact for the time from the event calendar (`event_calendar` or `official`, `operator_confirmed`, applies to that date).
4. **Deepen** (only after all cards are streamed, within budget): for each suggestion add coordinates and regular opening hours if missing, `image_url` from the official site or place data (only real image URLs you saw), price if trivially available. Keep `research_state: "pending"`: full research happens after the user accepts (research_card).
5. `jobs done <job_id>`.

## search_again

The user asked for more options; `query` (e.g. "more indoor activities", "a cheaper dinner") and an optional window `window_day` + `window_start`..`window_end`.

1. Interpret `query` against preferences. If a window is given, look at cards scheduled on `window_day` (summary: `day`, `position`, `place`) to know where the user will be; prefer places near those and **open during the whole window** (visit must fit, incl. last entry, on that date; check holidays on that day).
2. Produce 4-8 new suggestion cards (same streaming as initial_suggestions), `metadata: {"search_query": "<query>", "window": {"day": "...", "start": "...", "end": "..."}, "why": "..."}`. For window searches research hours for `window_day` right away (tiers 1-3) and set `ready`/`needs_checking` accordingly; for open searches leave `pending`.
3. **Never modify, move or reject existing cards.** No duplicates of existing titles.
4. `jobs done`.

## research_card

Planning-critical research for one accepted card (`card_id`).

1. `ausflieger card get <card_id>`; `ausflieger card state <card_id> researching`.
2. Tier 1-3 (must): fixed times; opening hours for **each trip date** incl. last entry; documented special hours / closures on trip dates (check every holiday on trip dates explicitly); seasonal hours; address + coordinates. Sources: official site via Context.dev JSON extraction (schema below), then a second independent source for the critical facts (Google Maps via Monid). Hotels: check-in/check-out times, breakfast yes/no + hours (as a `window_start/window_end` on a breakfast card if one exists), dinner yes/no.
3. Tier 4-6 within budget: typical duration (official "plan X hours" beats the visit-style default), reservation/timed ticket (`reservation_required`, `reservation_note`), price (`price_text`, `price_amount` + `currency`), short summary.
4. Write with one `ingest` (card `id` = the card) containing the place update (opening_hours, special_hours for trip dates) and one fact per claim. Conflicting sources: one fact each.
5. Decide state: `ready` if hours for every trip date are known (operator_confirmed, or regular_hours with no holiday/season risk on those dates) and fixed times are sourced; otherwise `needs_checking` (log a warning event naming the gap: "Holiday hours on 3 Oct not published").
6. `ausflieger travel fill <trip_id>`; `jobs done`.

**Parallel mode**: if `jobs list --status queued --trip <trip_id>` shows several `research_card` jobs, claim up to 5 and spawn one subagent per job (`sessions_spawn`, see AGENTS.md); each child does steps 1-5 and calls `jobs done/fail` for its own job id. After children report, run `travel fill` once.

## refresh_card

Re-check an existing card; the user asked explicitly.

1. `card get` to see current values, facts and pending proposals. Do the research_card research.
2. Write new facts (facts are append-only evidence; older claims stay for history).
3. Update the card via `ingest` with `card.id` and `--reason "<source-based explanation>"`. If the card is scheduled (`day` set), the CLI applies safe fields (summary, price, reservation, research_state) and turns changes of `duration_minutes`, `fixed_start/end`, `is_fixed`, `window_start/end`, `place_id` into a `card_change_proposals` row. Never try to bypass this.
4. If new opening hours or closures make the current slot impossible (e.g. closes earlier on that day), update the place hours, set `needs_checking` if uncertain, and log a `warning` event with the impact ("Museum now closes 16:00 on 2 Oct; your visit ends 16:30"). The planner shows the conflict; you do not move the card.
5. `jobs done`.

## parse_upload

Extract bookings from an uploaded document (`upload_id`).

1. `ausflieger upload status <upload_id> parsing`; `ausflieger upload get <upload_id> --out /tmp/ausflieger-uploads` (prints `local_path`).
2. Extract text: PDF -> Monid PDF/document parsing tool (or Context.dev file input); image/screenshot -> read it yourself. Extract every booking: train/flight (number, from/to, departure/arrival with date and time), hotel (name, address, check-in/out dates and times, breakfast included + hours), reservations (restaurant, tickets, time slot).
3. `ausflieger upload parsed <upload_id>` with `{"bookings":[...]}` (raw extracted values, incl. page/line hints).
4. Cards per booking (via `ingest`, `card.upload_id` = upload id): `is_fixed: true`, `fixed_start`/`fixed_end` with trip-timezone offset, `confirmed: false` (the user confirms in the UI), `constraint_kind: "hard"`, `research_state: "ready"`. Arrival train -> `arrival` card (place = arrival station); departure -> `departure`; hotel -> `hotel` card "Check-in <hotel>" (and "Check-out <hotel>"), place with address (+ coordinates via Monid places); breakfast included -> `meal` card "Breakfast at <hotel>" with `window_start/end` (not fixed), `confirmed: false`. Facts: `source_type: "upload"`, `evidence: "operator_confirmed"`, `note` with page reference, no url needed.
5. Never guess a missing time: leave it out, add a fact with `evidence: "unknown"` and set `needs_checking`. A booking without any time cannot be `is_fixed`.
6. If parsing fails: `upload status <id> failed`, `jobs fail --error "..."`. Otherwise `jobs done`.

## Holiday check

1. Discover via Monid ("public holidays api") or search; confirm on an authoritative calendar (federal/state government, official city site).
2. Cover national, regional (`trip.region`) and city-level holidays (some cities have local holidays, e.g. Augsburg Peace Festival). Only dates within the trip.
3. `ausflieger holiday add` (array ok) with `source: {url, title}`; region set for regional/city holidays.
4. Log: "Holiday on 3 Oct (German Unity Day): checking venue hours". No holidays: log "No public holidays on trip dates".

## Duration defaults (evidence `estimated`, basis "visit style <style>: <type> default")

| type | short | normal | long |
|---|---|---|---|
| museum | 60 | 120 | 180 |
| sight | 20 | 45 | 75 |
| activity | 60 | 90 | 150 |
| nature | 45 | 90 | 150 |
| shopping | 30 | 60 | 120 |
| meal: breakfast / lunch / dinner | 30 / 45 / 60 | 45 / 60 / 90 | 60 / 90 / 120 |
| nightlife | 60 | 90 | 150 |
| event | official duration, else 120 | | |
| hotel check-in / check-out | 15 | 15 | 15 |

## Context.dev extraction schemas

Opening hours (venue page):
```json
{"type":"object","properties":{
  "regular_hours":{"type":"array","items":{"type":"object","properties":{
    "weekday":{"type":"string","enum":["mon","tue","wed","thu","fri","sat","sun"]},
    "open":{"type":"string","description":"HH:MM 24h"},"close":{"type":"string"},"last_entry":{"type":"string"},
    "closed":{"type":"boolean"}}}},
  "special_dates":{"type":"array","items":{"type":"object","properties":{
    "date":{"type":"string","description":"YYYY-MM-DD"},"closed":{"type":"boolean"},
    "open":{"type":"string"},"close":{"type":"string"},"note":{"type":"string"}}}},
  "seasonal_note":{"type":"string"},"valid_from":{"type":"string"},"valid_to":{"type":"string"},
  "recommended_visit_duration":{"type":"string"},"ticket_or_reservation":{"type":"string"},"price":{"type":"string"}}}
```
Hotel page: `check_in_from`, `check_out_until`, `breakfast_included`, `breakfast_hours` (open/close), `restaurant_dinner` (bool + hours).
Event calendar: array of `{title, date, start, end, venue, address, url, price}` filtered to the trip dates.

Convert extracted values to the CLI format (weekday arrays, `HH:MM`, ISO with offset). If the page has no hours for the trip dates (e.g. only "summer season"), use `applies_from/applies_to` from the page's validity and evidence `regular_hours`, not `operator_confirmed`.
