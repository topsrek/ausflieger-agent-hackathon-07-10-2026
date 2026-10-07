# Contract notes (planner ↔ shared/types.ts)

Proposals only; `shared/types.ts` was not changed. Current workarounds in parentheses.

1. **Add `IssueCode` `'research_needs_checking'`** for `card.research_state === 'needs_checking' | 'failed'`.
   (Currently reported as `conflicting_facts` with severity `needs_checking` and message "Some facts about X need checking" / "Research for X failed; details need checking".)
2. **Add `IssueCode` `'wrong_day'`** for fixed cards whose `fixed_start` falls on another local date than the day they are placed on.
   (Currently `day_overflow` warning "Booked for 3 Oct, not this day".)
3. **Optional: `ScheduledCard.wait_before_minutes`** so the UI can render waiting time (e.g. waiting for opening) without recomputing it. (UI can derive it from previous end + travel + buffer vs. start.)
4. **Optional: `ScheduledCard.buffer_before_minutes` / `assumed_travel: boolean`**. For a missing travel time, `travel_before` is `{min: 30, max: 30, mode: 'walk'}` (the assumption) and the card carries a `missing_travel_time` issue; the buffer is not part of `travel_before`.
5. ScheduledCard `start`/`end` are wrapped HH:MM; a value past midnight is shown as e.g. `00:30` (with a `day_overflow` issue). End exactly at midnight is `24:00`.
