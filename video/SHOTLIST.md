# Shot list

All app shots are recorded automatically by `scripts/record-app.mjs` (Playwright, one continuous take, shot markers in `remotion/public/clips/manifest.json`). The manual steps below are the same actions, for re-recording by hand with OBS (see RECORDING.md) or for checking what the script does.

Data: the Munich demo, `data/demo/munich.json` (offline, opens on the schedule step via `/?demo=munich`). Each run clones the demo, so every take starts from the same seeded state; reload the page to reset.

## Pre-flight checklist

- [ ] App: own dev server on a free port (`cd web && npx vite --port 5174`) or the InstaCloud URL. Do not reuse someone else's 5173 server.
- [ ] Demo reset: fresh page load of `/?demo=munich` (clones the seeded trip). For manual takes, use a new incognito window per take.
- [ ] Browser (manual takes): Chrome, clean profile (`chrome --user-data-dir=%TEMP%\ausflieger-rec --no-first-run`), DevTools device mode **390 × 844**, DPR 2, zoom 100 %, “Show device frame” off (Remotion adds the phone frame).
- [ ] Hide bookmarks bar (Ctrl+Shift+B), close other tabs, no extensions.
- [ ] Windows: Focus assist / Do not disturb on, hide taskbar clock notifications, mute system sounds.
- [ ] Language English, timezone Europe/Berlin (the script sets both).
- [ ] Hotel PDF available: `data/demo/hotel-booking-sample.pdf`.
- [ ] QR target final: `node scripts/make-qr.mjs <url> <shortlink>`.

## Shots (video order; recording order is S03, S04, S05, S06, S01, S02, S07)

| Shot | Segment | Actions (exact) | Must show | Data |
|---|---|---|---|---|
| **S01** | 1 Intro (b-roll) | On Sat 2 Oct day view: slow scroll down ~480 px, back up. | A full, plausible day of cards with times and walk chips. | Sat cards: ICE arrival at München Hbf (09:16) → Drop luggage at Hotel Uhland → Glockenspiel at Marienplatz → Frauenkirche & south tower view → Lunch at Weisses Bräuhaus → Viktualienmarkt stroll → Residenz München → Check in at Hotel Uhland → Dinner at Augustiner-Keller |
| **S02** | 2 Hook | Mouse down on **Residenz München**, move > 6 px, drag to the drop slot below **Check in at Hotel Uhland**, hold 2.4 s, release. | Red slot with *“Visit ends at 18:40, after Residenz München closes at 18:00”*, card snaps back, toast. | Residenz: Sat 09:00–18:00, last entry 17:00 |
| **S03** | 3 Step 1 | Tap stepper **1 Preferences** (`step-preferences`). Scroll down; upload `hotel-booking-sample.pdf` to the file input; wait for “Found in your documents”; tap **Confirm all**; scroll; tap **Museums**, **Food**, **Beer gardens**; visit style **Normal**; tap **Find suggestions** (`find-suggestions`). | Prefilled Munich, 2–3 Oct 2027, train; extracted hotel times being confirmed. | Hotel Uhland check-in / breakfast / check-out from the PDF |
| **S04** | 4 Step 2 | Swipe the top card right, right, left (gesture; falls back to `swipe-like` / `swipe-skip`). Tap **Plan my days** (`plan-days`). | Cards with research badges (ready / needs checking), hours line, source chips; deck counter changing. | Suggested: Pinakothek der Moderne, Climb the Alter Peter, Hofbräuhaus am Platzl, Olympiaturm view |
| **S05** | 5 Calendar | Tap day tab **Sat 2 Oct**; scroll down and back; tap **Residenz München** card; read 2 s; close sheet (`sheet-close`). | Travel chips between cards; the card sheet with facts, evidence and source links. | Residenz facts |
| **S06** | 6 Conflict | Repeat the S02 drag (hold 2.2 s). Then tap day tab **Sun 3 Oct · Holiday**; scroll; tap **Alte Pinakothek**; read 2 s; close; back to Sat. | Reason text; holiday tab marker; Pinakothek special hours 10:00–18:00 for 3 Oct with source; any needs-checking badges. | Alte Pinakothek special_hours 2027-10-03 (muenchen.de); Viktualienmarkt closed 2027-10-03 |
| **S07** | 7 Search again | In the drawer tap **Search again** (`drawer-search`); type “more indoor activities” in `search-input`; tap **Search** (`search-submit`); wait until new `drawer-card`s appear; drag the newest card to the slot after **Lunch at Weisses Bräuhaus**. | Progress, cards streaming in, drop, times shifting. | Offline “Search again” pool from munich.json |

## Known gaps in the automated take (first run, local dev server)

- S04: the demo deck holds only a few suggestions; swipes 4–5 found no card (skipped, harmless).
- S07: which cards stream in, and whether the drop after lunch is valid, depends on the offline search pool. Check the take; change `slotAfter('Lunch at Weisses Bräuhaus')` in record-app.mjs if needed.
- Long shots are sped up to fit the voiceover (max 2.2×, see `AppClip.tsx`). If a shot looks rushed, shorten the pauses in record-app.mjs or lengthen the segment's `padAfter`.
