# Contract notes (data ↔ shared/types.ts, migration, planner, agent)

These are proposals and conventions only. `shared/types.ts` and the migration were not changed.

## Conventions used in data/demo/munich.json (worth copying in the agent)

1. **Agreeing sources use identical fact values.** `opening_hours` facts store a full `OpeningHours` object, and so do `special_hours` facts (`{date, hours}`). The planner and `fact_status` treat two different JSON values as a conflict. If one source says "daily 9–17" and another lists the same days one by one, both must still serialize to the same object.
2. **Facts that cannot conflict go in separate fields.** A partial claim (e.g. "check-in until 23:00", "beer garden from 11:00") gets its own field (`check_in_until`, `beer_garden_hours`) so it does not falsely conflict with a complete claim.
3. **Using `applies_from` / `applies_to` for year-specific claims.** A claim confirmed for 2026 (e.g. the Pinakotheken's "3 Oct open until 18:00") is stored with applies 2026-10-03, so it doesn't count as confirmation for 2027. A claim that holiday hours are not yet published is stored with evidence `unknown` for the trip date.
4. **When muenchen.de counts as the operator.** muenchen.de / oktoberfest.de get `source_type: 'official'` (and can be `operator_confirmed`) only for things the city runs itself: Oktoberfest, Viktualienmarkt, the Glockenspiel. For other venues they are `tourism_board`.
5. `card.metadata.key` is a stable short key (`res`, `glock`, `dm`, ...); scripts and tests look cards up by it. `card.metadata.image_credit` = `{source, page, license, attribution}`. `card.metadata.meal` is set on meal-like cards, including the hotel breakfast, which is `type: 'hotel'` so it gets a window check instead of an opening-hours check.
6. `place.google_place_id` is null everywhere (no Places API was used) and `google_maps_url` is a Maps search link. The unique constraint `(trip_id, google_place_id)` allows multiple nulls.

## Proposals

1. **Evidence for date-specific third-party claims.** The `Evidence` enum has no value for "a tourism board states it for the trip date, the operator does not (yet)". The demo stores this as `regular_hours` with a note. Option: add `'third_party_confirmed'` between `operator_confirmed` and `regular_hours`.
2. **Note-only `special_hours` suppresses `holiday_hours_unconfirmed`.** The demo relies on this for the Bavaria steps on 3 Oct: a public outdoor place where the Böllerschießen is documented for that date. It is intended here, but the agent should only write note-only entries when something is actually documented for the date. Option: an explicit `SpecialHours.regular_hours_confirmed?: boolean` flag.
3. **Upload storage object.** `seed.sql` inserts the `uploads` row (`storage_path = demo/<trip id>/hotel-booking-sample.pdf`) but cannot upload the file. Upload `data/demo/hotel-booking-sample.pdf` to bucket `uploads` at that path, e.g. in a deploy script. `clone_trip` copies the row and keeps the same `storage_path`, so all clones share the one object.
4. **agent_events ids.** munich.json carries ids 1..n for local use. seed.sql omits them because the column is `generated always as identity`.
5. **Fixed end times that are estimates.** `card.fixed_end` has no evidence flag. The demo marks an estimated end with `metadata.fixed_end_estimated: true` (Böllerschießen) plus an `estimated` fact. Option: let the UI show the end time as approximate when this flag is set.
