# Ausflieger web

Mobile-first frontend (Vite + React + TypeScript). Three steps per trip: preferences → swipe deck → one-day schedule
with drag & drop, checked by the shared planner (`../planner/src`).

## Run

```sh
cd web
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build        # tsc + vite build -> dist/
npm start            # node server.mjs: serves dist/ on $PORT (default 8080)
```

### Offline (LocalStore) – default when no Supabase config is present

- Everything is in memory (mirrored to localStorage, so reloads keep the trip). A simulated agent streams cards
  (~1 every 1.5 s) with `agent_events` progress lines, researches accepted cards, parses an uploaded file into hotel
  booking cards (confirmed = false) and proposes one research change (`card_change_proposal`) ~12 s after entering
  the schedule.
- **Open the Munich demo** (or `/?demo=munich`) loads `data/demo/munich.json` (prepared plan, step = scheduling).
  Its suggested cards are held back and stream in on "Search again". If the file is missing, the dev fixture
  `src/fixtures/munich-dev.ts` is used. `/?demo=dev` forces the dev fixture.
- **Start a new trip** starts at step 1 (Munich, 02.–03.10.2027) and streams suggestions from the dev fixture.
- `?store=local` forces the LocalStore even when Supabase is configured.

### Supabase

Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (build time, see `.env.example`) or `SUPABASE_URL` /
`SUPABASE_ANON_KEY` at runtime for `server.mjs` (exposed via `/config.js`; runtime wins over build time).

- Demo: calls rpc `clone_trip(<demo id>)` (default `2027a10d-0203-4000-8000-00000000c0de`, override with
  `DEMO_TRIP_ID` / `VITE_DEMO_TRIP_ID`) and redirects to `/trip/<clone>`.
- Loads the bundle, subscribes to realtime (`trip_id=eq.<id>`) on cards, places, facts, travel_times,
  research_jobs, card_change_proposals, agent_events; polls holidays/uploads while jobs run.
- Writes (optimistic): trips, preferences, swipes, day/position, durations, buffer cards, arrival/departure cards,
  research_jobs (`initial_suggestions`, `search_again` with query + optional window, `research_card`,
  `refresh_card`, `parse_upload`), storage upload to bucket `uploads` + `uploads` row, proposal accept/reject,
  booking confirmation.

## Server (InstaCloud)

`server.mjs` (node:http, no deps): static `dist/` with SPA fallback, `Cache-Control: immutable` for
`/assets/*`, `GET /api/health`, `GET /api/config` and `GET /config.js` with runtime Supabase config.

## Structure

- `src/data/` – `TripStore` interface (`store.ts`), `localStore.ts`, `supabaseStore.ts`, hooks.
- `src/lib/schedule.ts` – planner adapters: slot checks while dragging, auto-placement, proposal impact.
- `src/screens/` – Landing, PreferencesStep, SwipeStep, ScheduleStep. `src/components/` – drawer, sheet, cards.
- `src/planner-fallback/` – minimal stand-in, only used if `../planner/src/index.ts` is missing.

## Test ids (Playwright)

`open-demo`, `new-trip`, `step-preferences|swiping|scheduling`, `find-suggestions`, `swipe-card-top` (data-title),
`swipe-like`, `swipe-skip`, `swipe-undo`, `swipe-info`, `plan-days`, `open-search`, `search-input`, `search-submit`,
`search-window-toggle`, `day-tab` (data-day), `schedule-card` (data-title, data-card-id), `schedule-buffer`,
`drop-slot` (data-slot, data-severity), `drawer-handle`, `drawer-toggle`, `drawer-search`, `drawer-card`
(data-title), `drawer-quick-add`, `sheet-close`, `proposal-apply`, `proposal-keep`.

Drag & drop uses @dnd-kit: mouse needs a 6 px move to start, touch a 170 ms press. In Playwright use
`mouse.down()`, several `mouse.move()` steps, then `mouse.up()`.
