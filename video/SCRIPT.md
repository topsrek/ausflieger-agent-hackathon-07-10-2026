# Ausflieger: 2-minute video script

Source of truth for the voiceover and timing: [`script.json`](script.json). This file is the human-readable version; if you edit text, edit `script.json` and run `npm run check` (word count + projected runtime), then `npm run vo` (regenerates only changed segments).

- **Total: 276 words, 1:57** (rendered) with the ElevenLabs takes (voice "George", `eleven_multilingual_v2`). Segment 8b “How we'd grow” (business model, 18 words) was added and the sponsor line made explicit; see `script.json` for the exact current text, which supersedes the table below where they differ (s06 no longer states 18:40, because the recorded state shows a different end time).
- Every factual claim matches `data/demo/munich.json`: Residenz München open until 18:00 (last entry 17:00), Viktualienmarkt documented closed on 3 Oct 2027, ICE arrival 09:16 and departure 18:32, Alte Pinakothek special holiday hours 10:00–18:00 on 3 Oct.
- Times are from the current render (padding after each segment included). Segment lengths follow the real voiceover, so they move a little when the text changes.

| # | Time | Voiceover (words) | On screen |
|---|---|---|---|
| 1 Intro | 0:00–0:10 | Meet Ausflieger. That's German for the one who heads out on a trip. An agent researches your city, and the app makes sure your day actually works. **(27)** | Logo mark springs in, wordmark, pun line “Ausflug (trip) + Flieger (flyer): the one who heads out” appears on “German”, pitch on “agent”. Phone (right) slowly scrolls the planned Saturday. |
| 2 Hook | 0:10–0:19 | Because plans break on details. The palace closes at six, the market is shut on the holiday, and your train leaves at 18:32. **(23)** | Phone: Residenz München dragged after hotel check-in, slot turns red: *“Visit ends at 18:40, after Residenz München closes at 18:00”*, card snaps back. Chips pop in on the words: “Residenz closes 18:00” · “Viktualienmarkt closed on 3 Oct” · “ICE leaves 18:32”. |
| 3 Step 1 | 0:19–0:30 | Step one: Munich, October second and third. I add my train, pick museums and food, and drop in my hotel booking. The extracted times come back for me to confirm. **(30)** | Preferences: hotel PDF upload, Hotel Uhland check-in / breakfast / check-out extracted, *Confirm all*; interests, visit style Normal, *Find suggestions*. Chips: “Fixed: ICE arrives 09:16”, “Hotel PDF → check-in, breakfast, check-out”, “You confirm before it is locked”. |
| 4 Step 2 | 0:30–0:41 | Step two: an agent researches in the background. Suggestions stream in while I swipe, right to keep, left to skip, each with hours, duration and sources. **(26)** | Swipe deck: right, right, left; research badges (ready / needs checking); source chips; *Plan my days*. |
| 5 Calendar | 0:41–0:50 | Step three: the calendar. Every card knows its opening hours, last entry, duration, and the walking time to the next stop. **(21)** | Day view Sat 2 Oct with walking-range chips between cards; open Residenz München → facts, evidence, sources. Chips: Opening hours · Last entry · Duration · Walk 10–15 min. |
| 6 Conflict | 0:50–1:09 | I drag the Residenz after hotel check-in, and it tells me why that fails: the visit would end at 18:40, after the palace closes at six. Sunday is German Unity Day. That doesn't mean closed, it means check. Where hours aren't confirmed, the card says: needs checking. **(47)** | The drag with the red reason and snap-back toast. Switch to *Sun 3 Oct · Holiday*; open Alte Pinakothek: holiday hours 10:00–18:00 with source. Chips: red reason, “Sun 3 Oct · German Unity Day”, amber “Holiday → check special hours, not ‘closed’”, amber “Needs checking”. |
| 7 Search again | 1:09–1:20 | Want something indoors? Search again. My plan stays put, new cards stream into the drawer, and when I drag one in, every time recalculates instantly. **(25)** | Drawer → *Search again* → “more indoor activities” → Search; new cards stream in; drag the newest into the slot after lunch; times below shift. |
| 8 Under the hood | 1:20–1:42 | Under the hood: an OpenClaw agent on Agent 37 spawns subagents to research cards in parallel. Monid picks the best tool for each task, and Context.dev turns official pages into structured facts with evidence. Supabase Realtime streams the cards, and a deterministic planner checks your day in the browser. **(49)** | Architecture slide (`architecture.html` / `scenes/Architecture.tsx`); boxes light up on “OpenClaw”, “subagents”, “Monid”, “Supabase”, “planner”. Animated dashed arrows for Realtime. |
| 9 End card | 1:42–1:50 | Ausflieger is live on InstaCloud. Scan the code and plan your Munich weekend. **(13)** | End card: logo, pitch, pun, QR + link, “Built with” row. Held 3 s after the voiceover (8 s total, ≥ 5 s requirement met). |

Captions are burned in from the ElevenLabs character timestamps (max 7 words per line, current word highlighted).

## Sponsor claims (check before final)

The architecture line names each sponsor for what it does in this project. Before the final render, confirm each is actually in the running system, otherwise cut the clause:

- **Agent 37**: hosts the OpenClaw agent (template `agent37-openclaw`). ✔ per README / deploy/OPENCLAW_DEPLOY.md
- **OpenClaw subagents** (`sessions_spawn`) research cards in parallel. ✔ per README
- **Monid** `discover` → `run` picks a tool per task. ✔ per README
- **Context.dev** scrapes official pages into structured JSON. ✔ per agent/README.md and agent/workspace/skills/ausflieger-research/SKILL.md (confirm it ran for the demo data; otherwise drop the clause, −11 words, ~−4 s).
- **Supabase Realtime** streams cards. ✔ per README (the deployed demo currently uses built-in offline data; say “streams” only if the live agent path is shown or the claim refers to the architecture).
- **InstaCloud** hosts the web app. ✔ live at the deployment URL.

## Alternative hooks (replace segments 1–2)

Each keeps the name + one-sentence pitch inside the first 15 s.

**A. Question hook (≈ 9 s + intro)**
> “Ever planned a perfect day, and found the museum closed when you got there? Meet Ausflieger, German for the one who heads out. It plans your trip and checks that every stop actually fits.”

**B. Cold open on the conflict (≈ 12 s)**
> *(Sound of the card snapping back.)* “Visit ends at 18:40, after the Residenz closes at six. That's Ausflieger, German for the one who heads out, catching a broken plan before you're standing at a locked door.”

Current version (intro first, then the broken-plan hook) is the safest for judges who skim: the name and pitch land in the first 10 s.
