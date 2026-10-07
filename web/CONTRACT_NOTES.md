# Contract notes (web ↔ shared/types.ts, agent)

Proposals only; shared/types.ts was not changed.

1. **Accepting a pending card inserts a `research_card` job** from the frontend (`swipe` → accepted while
   `research_state = 'pending'`). If the agent already watches accepted cards itself, drop one of the two.
2. **Retry = new job row** copying kind/query/window/card_id/upload_id (status queued), not an update of the failed row.
3. **Arrival/departure cards are created by the frontend** in step 1 (type arrival/departure, is_fixed,
   fixed_start = fixed_end, constraint hard, `metadata.mode` = train|plane|car, no place). The agent may attach a place.
4. **First placement is done client-side** when leaving the swipe step (greedy, least severe slot per card;
   cards that only fit with a blocker stay in the drawer). Upload-extracted cards may carry `metadata.preferred_day`.
5. Slots before the arrival card / after the departure card are treated as blockers in the UI (planner does not flag them).
6. Holidays, uploads and trips are not in the realtime publication; the client polls them while jobs run.
   Consider adding `uploads` to the publication so parse status streams.
7. `search_again` jobs created from the schedule drawer may include `window_day/window_start/window_end` (free gap).
