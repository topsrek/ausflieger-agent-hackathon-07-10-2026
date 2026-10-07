# Contract notes from agent/

These are proposals for `shared/types.ts` and the migration. **None of them are applied.** The agent code works with the schema as it is today.

## Assumptions agent/ makes (please keep these stable)

- The frontend inserts `research_jobs` with `status = 'queued'`. The agent claims a job with `update ... set status='running', started_at=now() where id=$1 and status='queued' returning *` (optimistic). It finishes the job with `done` or `failed` plus `error`.
- New agent cards always have `day = null` and `position = null`.
  - The agent never writes `day`, `position` or `swipe_status` on existing cards, and never sets `confirmed = true`.
  - Cards extracted from an upload are inserted with `is_fixed = true`, `confirmed = false` and `constraint_kind = 'hard'`.
- On a scheduled card (`day is not null`), the agent puts any change to `duration_minutes`, `fixed_start`, `fixed_end`, `is_fixed`, `window_start`, `window_end` or `place_id` into a `card_change_proposals` row; it does not apply them.
  - `changes` holds new values for card columns. It may also contain `duration_basis` alongside `duration_minutes`.
  - When the user accepts, **the web app applies `changes`** and sets `status = 'accepted'` and `resolved_at`.
- Facts are append-only evidence. A refresh adds new rows and never deletes old ones. Readers that want the current state should prefer the newest `retrieved_at` per (target, field, source_type).
- Place-level facts (`opening_hours`, `special_hours`, `last_entry`, `address`, …) are attached to `place_id`; card-level facts (`duration`, `price`, `reservation`, `fixed_time`, `check_in`, …) to `card_id`.
- `cards.metadata` keys the agent writes:
  - `why`: the reason it was suggested;
  - `search_query`;
  - `window`: `{day, start, end}` for search_again results.
- `travel_times` holds walk rows in both directions, with the basis `estimate: straight-line X km x detour 1.3 = Y km walked at 4.5-5 km/h`.

## Proposals

1. **Webhook trigger in a migration.** The `research_jobs` INSERT trigger that calls `supabase_functions.http_request(...)` (SQL in `agent/README.md`) should live in a migration owned by the schema owner. The project URL and secret differ per environment, so it may be simpler to create it in the dashboard.
2. **Atomic claim RPC.** Add `create function public.claim_next_job() returns research_jobs` using `for update skip locked`. That gives a single round trip with no retry loop. The CLI would use it if present. The current optimistic claim is correct but needs up to two requests.
3. **Job robustness columns.** Add to `research_jobs`:
   - `attempts int default 0`
   - `heartbeat_at timestamptz`, which the agent would update during long jobs
   - `progress jsonb`, e.g. `{"cards_added": 7}` for the UI

   `jobs requeue-stale` currently uses `started_at`.
4. **`facts.job_id`** (FK to research_jobs, on delete set null). This would let us trace which run produced a claim and support a "what changed in this refresh" view.
5. **Place-level change proposals.** A refresh that changes opening hours or special hours of a place used by a scheduled card cannot be written as a card-column proposal today. The agent updates the place, adds facts, and logs a `warning` agent_event with the impact; the planner then shows the conflict. Two options:
   - allow `card_change_proposals.changes` to carry `{"place": {"opening_hours": ...}}`; or
   - add `place_change_proposals`.

   This only matters if the team wants opening-hours changes to need user acceptance as well.
6. **`uploads.error text`**, so a failed parse can say why. Today only `status = 'failed'` is set, and the reason goes to `agent_events` and `research_jobs.error`.
7. **`trips.region_code`** (ISO 3166-2, e.g. `DE-BY`), in addition to the free-text `region`. Holiday APIs key by subdivision code.
8. **`Fact.value` typing in shared/types.ts.** Document the value shape for each common field so the planner and the agent agree:
   - `opening_hours`: an `OpeningHours`
   - `special_hours`: a `SpecialHours[]`
   - `last_entry`: `"HH:MM"`
   - `duration`: minutes as a number
   - `fixed_time`: `{start, end}` ISO strings
   - `price`: `{text, amount, currency}`
9. **Events with several sessions.** An event repeated during the day (tours at 11:00, 14:00 and 16:00) does not fit `fixed_start`. Proposal: `metadata.sessions: [{start, end}]` on a flexible `event` card, with `window_start`/`window_end` covering them. The planner would treat the start as one of the sessions.
