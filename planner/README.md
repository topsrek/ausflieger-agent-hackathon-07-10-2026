# planner

Deterministic schedule checks for Ausflieger. Pure TypeScript, no runtime dependencies, no I/O.
Used by `web/` via `import { ... } from '../planner/src'`. Types come from `shared/types.ts`.

```sh
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit, strict
```

## API

| Function | Purpose |
|---|---|
| `scheduleDay(bundle, day)` | Timeline for the accepted cards with `card.day === day`, ordered by `position` (nulls last). |
| `scheduleDayWithOrder(bundle, day, ids)` | Same with an explicit order (drag previews). Unknown ids are ignored. Never mutates the bundle. |
| `checkPlacement(bundle, cardId, day, position)` | Issues if `cardId` were dropped at index `position` of the day's order *without that card*. Returns the card's own issues plus issues it newly causes on other cards (e.g. pushes a later visit past closing, makes a train unreachable). `[]` = slot is fine. |
| `effectiveDuration(card, prefs)` | `duration_minutes`, else `fixed_end - fixed_start`, else type default for `visit_style` (museum 60/120/180, sight 30/60/90, meal 45/60/90, ... see `DEFAULT_DURATIONS`). |
| `openingFor(place, date)` | `special_hours` for the date override regular `opening_hours`. Missing weekday key = `unknown`, `[]` = `closed`. Note-only special entries fall back to regular hours. |

Also exported: `dayOrder`, `DEFAULT_DURATIONS`, `localTime`, `weekdayOf`, `parseHHMM`, `formatHHMM`, `formatDuration`.

## Rules

- All times are minutes since local midnight of the day (trip timezone). `fixed_start`/`fixed_end` are converted with `Intl` using `trip.timezone`. Close `24:00` and closes before open (past midnight) are supported. Times past midnight are shown wrapped (`00:30`) with a `day_overflow` warning.
- **Day start**: the first card's fixed start if it is fixed, else 09:00, or the first card's `window_start` if earlier (hotel breakfast 07:00–10:30 starts the day at 07:00).
- **Next card** starts at `previous end + travel gap`. Flexible cards **wait** for their window start and for an opening interval they fit into (including a later interval after a midday break). Waiting is not an issue.
- **Travel gap** (only between different places): `max_minutes` of `travel_times` (from→to, else to→from; walk preferred) + `preferences.default_buffer_minutes` (15). Missing pair: assume 30 min + buffer and `missing_travel_time`. Cards without a place (buffer, rest) add no travel and don't reset the previous place.
- **Fixed cards** start at their fixed time. If the previous card's end + travel gap is after it: `fixed_overlap` blocker on the previous card if it is flexible ("Ends at 18:15; can't reach train at 18:05 in time"), otherwise on the fixed card itself.
- **Opening hours** (not checked for arrival, departure, hotel, buffer, rest): visit must fit entirely in one interval (`outside_opening_hours`), start no later than `last_entry` (`after_last_entry`); `closed` only for documented closures (special closure or `[]` for the weekday); `unknown_hours` when unknown (skipped if the card has a hard window).
- **Holidays**: a holiday on the day without a `special_hours` entry for that date → `holiday_hours_unconfirmed`. Regular hours still apply; a holiday never implies closure.
- **Window** (`window_start`/`window_end`, flexible cards): hard → `outside_window` blocker, preference/assumption → `preference_deviation` warning. Meal cards without a window: start > 60 min from the preferred meal time → `preference_deviation`. Meal kind from `metadata.meal`, else the title (breakfast/lunch/dinner), else the closest preferred time.
- **Facts** for the card or its place, applicable on the date (`applies_from`/`applies_to`), fields `opening_hours`, `special_hours`, `last_entry`, `closed`, `closure`, `holiday_hours`: evidence `conflicting` or ≥ 2 distinct values among non-estimated, non-unknown claims → `conflicting_facts`.
- `confirmed === false` → `unconfirmed_booking`. `research_state` `needs_checking` / `failed` → `conflicting_facts` (see CONTRACT_NOTES.md).
- Severity: `blocker` (hard constraints), `warning` (preferences, day overflow), `needs_checking` (unknown / conflicting / unconfirmed).
