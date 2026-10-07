# Ausflieger

**Agentic trip planning focused on schedule coordination.**
Agent Hackathon, 07.10.2026.

> Status: building.

## Idea

The user describes a trip: upload travel documents (tickets, hotel bookings, PDFs) or just enter times and key facts, by train or plane. An agent researches everything needed and builds a small mobile web app made of **cards** (UI cards, not maps). Each card is one item in the plan: arrival, hotel, breakfast, museum, restaurant, bar, departure, …

The core value is **schedule coordination**: every card knows its own metadata (opening hours, duration, estimated travel time, fixed times). The user can reorder cards in a calendar view, and the app checks whether the order fits the known constraints and estimates. If a spot doesn't work, the app says why ("Museum closes at 17:00"). Unknown or conflicting facts are shown as **needs checking**, rather than presented as definitely possible or impossible.

**Mobile-first, English only.** The demo runs on a laptop in mobile view.

## Flow (multi-step)

### Step 1: City and preferences
- Destination, dates, arrival and departure (train / plane / car)
- Uploads: PDFs, tickets, booking confirmations, screenshots
- Extracted booking dates and times are shown for confirmation before becoming locked appointments
- Preferences, asked as quick questions or captured from free text:
  - Approximate meal times (breakfast, lunch, dinner)
  - Nightlife: important or not
  - Interests: museums, culture, nature, shopping, food, …
  - **Visit style: short / normal / long (thorough).** This sets the default duration for museums and sights.
  - Pace (relaxed vs. packed)

### Step 2: Activity suggestions (swipe)
- The agent searches broadly: sights, museums, restaurants, bars, **event calendars and event planners** for the trip dates
- Suggestions appear as cards the user **swipes Tinder-style** (right = want, left = skip)
- New suggestions **stream in live** while the agent keeps researching

### Step 3: Schedule (calendar of cards)
- Accepted cards receive planning-critical research (metadata below) and are placed into a day-by-day calendar; missing or conflicting facts remain visible
- The user fine-tunes the plan with drag & drop

### User-triggered search
- A **Search again** action is available in the suggestions view and the calendar drawer
- The user can refine the request, e.g. "more indoor activities", "a cheaper dinner", or "something near the hotel tomorrow afternoon"
- The agent searches using the current trip, preferences and, when relevant, the available time window
- New suggestions stream into the swipe deck or drawer; existing selections and the user's schedule are preserved
- Refreshing an existing card's research is explicit. Changes affecting scheduled cards are shown with their impact for the user to accept; the agent does not silently move cards
- Search progress, completion and failure are visible; failed searches can be retried

## Cards and their metadata

Each card carries the facts needed for planning and reordering. Research planning-critical facts first; optional details can follow. Unknown values stay explicit.

| Field | Example |
|---|---|
| Type | arrival, hotel, meal, sight, museum, activity, event, nightlife, departure |
| Location / address / coordinates | Bahnhofstrasse 1, 8001 Zürich |
| Opening hours (per weekday, incl. exceptions) | Tue–Sun 10:00–18:00, closed Mon |
| Duration | editable estimate based on visit style (short/normal/long), refined by sourced information when available |
| Fixed or flexible | train 08:32 = **fixed**; museum visit = flexible |
| Time window | hotel breakfast 07:00–10:30 |
| Constraint kind | hard: booked train; preference: dinner around 19:00; assumption: estimated visit duration |
| Estimated travel time | walk 15–25 min; planning uses the upper bound |
| Hotel-specific | breakfast yes/no + hours, dinner yes/no, check-in/check-out |
| Reservation needed? | yes, table from 19:00 |
| Price | CHF 25 entry |
| **Sources** | official website **and/or** Google Maps, shown on the card with links |
| Evidence per fact | operator-confirmed for the trip date / supported by regular hours / estimated / unknown / conflicting; source URL, retrieval time and applicable dates |
| Research state | suggestion / researching / ready / needs checking / failed |

## Planning rules

- **Hard constraints**: confirmed bookings, fixed event times, known opening windows and documented closures. A visit must fit entirely within an opening window, including any last-entry restriction
- **Preferences**: approximate meal times, pace and interests. Deviations are explained but do not automatically block a slot
- **Assumptions**: estimated visit durations and travel-time ranges. These are labelled, editable and used conservatively for planning
- Missing or conflicting critical facts produce **needs checking**. A slot without a known conflict is not automatically verified; users can keep provisional cards with a visible warning
- The research agent supplies structured facts and evidence. Deterministic client-side logic checks the schedule using those facts and assumptions

## Research rules (system prompt)

The system prompt is critical for research and gets most of the research tuning effort. It defines source priorities, structured output, uncertainty handling and research limits; schedule feasibility is checked separately by the planning logic.

- **Prioritize by planning impact**: fixed times, date-specific opening hours, closures and last-entry restrictions come before prices or descriptive details. Bound optional research by a time/tool-call budget so usable cards arrive early
- **Prefer authoritative, date-specific sources**: operator or venue information for the actual trip date takes precedence over generic listings. Use a second independent source for critical facts where available, rather than requiring two sources for every fact
- If sources disagree, retain both claims and flag the affected fact. Source count alone does not establish confidence; record authority, freshness and date applicability
- **Always check applicable public holidays** for the trip dates at national, regional/canton/state and city levels, using authoritative calendars where available. A holiday triggers a check for venue-specific special hours; it does **not** imply closure. Only documented exceptions override regular hours. If holiday hours cannot be confirmed, mark them as needing checking
- **Scrape event calendars** (city tourism sites, venue calendars, event planners) for the trip dates.
- Check seasonal hours and special closures.
- **Restaurants**: start with venue information and a small set of relevant local recommendations. Comprehensive restaurant-guide, magazine, blog and influencer research is deferred beyond the MVP
- **Recommendations** in general: use local tourism boards and relevant travel guides. Model knowledge can suggest candidates, but current planning facts require research
- Store the source URL, retrieval time and applicable dates for every sourced fact. Label estimates and their basis explicitly; never invent missing values

## Calendar view and reordering

- On mobile, show **one day at a time** with a day selector: start, arrival, cards in order, **estimated travel-time ranges and buffers** between them
- Travel gaps use the upper bound of the cached travel-time estimate plus a default buffer. Rest breaks are separate cards
- **Buffers are cards too**: editable in minutes in the MVP; pinch and drag-to-resize gestures are deferred
- **Fixed cards** (booked trains, flights, reservations) are locked
- **Flexible cards** can be dragged. Known hard conflicts are blocked or highlighted with the reason; preference deviations and uncertain facts receive distinct warnings. Holiday handling uses venue-specific exceptions, not a blanket closure rule
- After reordering, all times are recalculated instantly in the browser

### Bottom drawer
- Swipe-up drawer with **more cards**: accepted but unscheduled cards, alternatives, events
- Cards are dragged **from the drawer into the calendar** and back
- **Live**: while the agent works, new cards keep arriving in the drawer
- **Search again**: request more alternatives or a search for a selected free time window without replacing the current plan

## Travel time matrix

For now, travel times are **estimated ranges**, not exact routing promises: e.g. walking 15–25 minutes. Store the mode, estimation basis and range, display the range, and use its upper bound for schedule checks plus any separate buffer.

Precompute/cache estimates between selected places, extending the matrix as cards become ready. Reordering between cached places needs no new API calls, so checks run instantly on the client. Missing estimates are marked as needing checking. The MVP uses walking estimates only; exact, departure-time-dependent public transport routing and multiple transport modes are deferred.

## Architecture (planned)

- **[Agent 37](https://agent37.com)**: cloud platform where the agent runs, using the **`agent37-openclaw`** template with Monid set up. OpenClaw brings browser automation (for JS-heavy pages like Google Maps and event calendars) and **subagents** (`sessions_spawn`) to research many cards in parallel. The agent picks up queued `research_jobs` and writes cards, places, facts and travel times to Supabase.
- **[Monid](https://monid.ai)**: tool library with 1900+ tools/APIs. For each research task the agent calls `discover` to find the best tool and `run` to execute it. Examples:
  - Train connection → transit/timetable tool
  - Flight → flight tool
  - Opening hours, typical visit duration → Google Maps / Places tool + website scraping
  - Hotel breakfast, dinner, check-in → search / scraping tool
  - Public holidays, events → search / scraping tools
  - Travel times → estimated ranges, optionally informed by a routing tool (cached matrix)
  - PDF uploads → PDF parsing tool
- **[Supabase](https://supabase.com)** (sponsor):
  - Postgres: trips, preferences, cards, fact-level evidence, research jobs, estimated travel matrix, schedule
  - **Realtime**: streams new cards from the agent to the frontend (swipe deck, drawer)
  - Storage: uploaded PDFs and tickets
- **[InstaCloud](https://www.instacloud.com)** (sponsor): hosts the web app. Two entry points: the **demo app with prepared data** (Munich) and **real requests** that trigger the agent.
- **Frontend**: mobile-first web app. Swipe deck, one-day calendar of cards, bottom drawer, drag & drop, user-triggered search, client-side constraint checks and uncertainty warnings.

## Hackathon MVP

- **One city: Munich**, two days, about eight activities plus fixed arrival/departure cards
- One PDF upload (hotel booking), with extracted dates/times confirmed by the user
- Preferences → streamed suggestions → swipe → schedule → reorder with clear conflict explanations
- Walking-time ranges, editable visit durations, default buffers and a one-day mobile calendar
- User-triggered searches add alternatives while preserving the user's plan
- Prepared data and the live agent use the same card schema and planning logic
- First integration milestone: research one real card → validate its structured facts → store it in Supabase → show it live → explain a conflict when it is moved

## Hackathon demo

- **Prepared demo: Munich, 02.–03.10.2027**, within Oktoberfest 2027 (18.09.–03.10.2027), two days, about eight activities. Shows the metadata and constraint checks. 03.10. is German Unity Day and the last day of the Wiesn: check each venue's actual holiday hours rather than assuming closure. Future hours that are not yet published remain marked as needing checking
- **Live demo: the same Munich trip**, train arrival and one hotel PDF. Run preferences → swipe → schedule and request new alternatives from the drawer
- Demonstrate a sourced closing-time or fixed-appointment conflict. Use a holiday-closure example only if the venue's closure for that exact date is documented
- Keep a saved research run as a **clearly labelled fallback** if live research is slow or unavailable; it uses the same UI and planning logic

### Video (2 minutes)

| Time | Content |
|---|---|
| 0:00–0:15 | Problem: trip plans break on opening hours, holidays and travel times |
| 0:15–0:35 | Step 1: Munich, Oktoberfest dates, preferences, upload hotel PDF |
| 0:35–0:55 | Step 2: swipe suggestions while new cards stream in |
| 0:55–1:30 | Step 3: calendar, drag a card to an invalid slot ("Visit ends after the museum closes at 17:00"), pull a card from the drawer, request new alternatives |
| 1:30–1:50 | Under the hood: research system prompt, agent on Agent 37 picks tools via Monid, prioritized sources and fact-level evidence, cards stored in Supabase, deterministic schedule checks |
| 1:50–2:00 | Live on InstaCloud, try Munich yourself. End card: **QR code + short link** to the demo, visible for at least 5 seconds |

The QR code and short link are created once the InstaCloud URL is final. Use a short link we control, so it can be redirected if the deployment URL changes.

## Out of scope (for now)

- Showing cost of tool calls in the frontend
- Pinch-to-resize and drag-to-resize buffers
- Comprehensive restaurant-guide, magazine, blog and influencer research
- Exact public transport routing and multiple transport modes
- Additional demo cities and longer trips
