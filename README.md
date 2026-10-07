# Ausflieger

**Agentic trip planning focused on schedule coordination.**
Agent Hackathon, 07.10.2026.

> Status: concept. No code yet.

## Idea

The user describes a trip: upload travel documents (tickets, hotel bookings, PDFs) or just enter times and key facts, by train or plane. An agent researches everything needed and builds a small mobile web app made of **cards** (UI cards, not maps). Each card is one item in the plan: arrival, hotel, breakfast, museum, restaurant, bar, departure, …

The core value is **schedule coordination**: every card knows its own metadata (opening hours, duration, travel time, fixed times). The user can reorder cards in a calendar view, and the app only allows orders that actually work. If a spot doesn't work, the app says why ("Museum closes at 17:00").

**Mobile-first, English only.** The demo runs on a laptop in mobile view.

## Flow (multi-step)

### Step 1: City and preferences
- Destination, dates, arrival and departure (train / plane / car)
- Uploads: PDFs, tickets, booking confirmations, screenshots
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
- Accepted cards are fully researched (metadata below) and placed into a day-by-day calendar
- The user fine-tunes the plan with drag & drop

## Cards and their metadata

Each card carries everything needed for planning and reordering. Principle: **more information rather than less.**

| Field | Example |
|---|---|
| Type | arrival, hotel, meal, sight, museum, activity, event, nightlife, departure |
| Location / address / coordinates | Bahnhofstrasse 1, 8001 Zürich |
| Opening hours (per weekday, incl. exceptions) | Tue–Sun 10:00–18:00, closed Mon |
| Duration | based on visit style (short/normal/long) plus Google Maps typical visit time |
| Fixed or flexible | train 08:32 = **fixed**; museum visit = flexible |
| Time window | hotel breakfast 07:00–10:30 |
| Hotel-specific | breakfast yes/no + hours, dinner yes/no, check-in/check-out |
| Reservation needed? | yes, table from 19:00 |
| Price | CHF 25 entry |
| **Sources** | official website **and/or** Google Maps, shown on the card with links |
| Confidence | verified (2+ sources agree) vs. single source vs. estimated |

## Research rules (system prompt)

The system prompt is critical and gets most of the tuning effort.

- **Two sources per fact whenever possible**, e.g. official website + Google Maps for opening hours. If they disagree, flag the card.
- **Always check public holidays** for the trip dates on several sites, at all levels: **national, regional/canton/state, city**. Holidays override regular opening hours.
- **Scrape event calendars** (city tourism sites, venue calendars, event planners) for the trip dates.
- Check seasonal hours and special closures.
- **Restaurants**: check current restaurant guides (Michelin, Gambero Rosso, local guides), magazines, food blogs and influencers, not just ratings.
- **Recommendations** in general: the model's own knowledge plus travel guides (Lonely Planet, Rick Steves, local tourism boards, …).
- Store the source URL and retrieval time for every fact.

## Calendar view and reordering

- One column per day: start, arrival, cards in order, **travel time and buffers** between them
- **Breaks follow from travel time** between cards (from the precomputed travel matrix) plus a default buffer
- **Buffers are cards too**: the user can drag them and resize them (**pinch** / drag handle)
- **Fixed cards** (booked trains, flights, reservations) are locked
- **Flexible cards** can be dragged, but only to slots where opening hours, travel times, holidays and fixed appointments fit. Invalid slots are blocked or highlighted, with the reason.
- After reordering, all times are recalculated instantly in the browser

### Bottom drawer
- Swipe-up drawer with **more cards**: accepted but unscheduled cards, alternatives, events
- Cards are dragged **from the drawer into the calendar** and back
- **Live**: while the agent works, new cards keep arriving in the drawer

## Travel time matrix

When the cards are researched, the agent precomputes a **travel time matrix between all places** (walking / public transport). Reordering then needs no new API calls, so constraint checks run instantly on the client.

## Architecture (planned)

- **[Agent 37](https://agent37.com)**: cloud platform where the agent runs, using the **`agent37-claude-code`** template (Claude Agent SDK): native MCP for Monid and Supabase, built-in web search/fetch (HTTP, no browser needed) as a second source, and subagents to research many cards in parallel. The template has **no browser**: JS-heavy pages (Google Maps, event calendars) go through Monid's hosted scraping/Places tools. Fallback: a custom Docker image with Playwright on Agent 37, or the `agent37-openclaw` template (browser automation built in).
- **[Monid](https://monid.ai)**: tool library with 1900+ tools/APIs. For each research task the agent calls `discover` to find the best tool and `run` to execute it. Examples:
  - Train connection → transit/timetable tool
  - Flight → flight tool
  - Opening hours, typical visit duration → Google Maps / Places tool + website scraping
  - Hotel breakfast, dinner, check-in → search / scraping tool
  - Public holidays, events → search / scraping tools
  - Travel times → routing tool (for the matrix)
  - PDF uploads → PDF parsing tool
- **[Supabase](https://supabase.com)** (sponsor):
  - Postgres: trips, preferences, cards, travel matrix, schedule
  - **Realtime**: streams new cards from the agent to the frontend (swipe deck, drawer)
  - Storage: uploaded PDFs and tickets
- **[InstaCloud](https://www.instacloud.com)** (sponsor): hosts the web app. Two entry points: the **demo app with prepared data** (Munich) and **real requests** that trigger the agent.
- **Frontend**: mobile-first web app. Swipe deck, calendar of cards, bottom drawer, drag & drop, pinch-to-resize buffers, client-side constraint checks.

## Hackathon demo

- **Big demo (prepared in advance): Munich during Oktoberfest 2027** (18.09.–03.10.2027), multi-day, fully researched. Shows the depth of the metadata and the constraint checks. Built-in edge case: 03.10. is German Unity Day (national holiday) and the last day of the Wiesn.
- **Small live demo: Urbino (Italy)**, 1–2 days, train arrival, one PDF upload (hotel booking), about 8 cards. The whole flow runs live: preferences → swipe → schedule.

### Video (2 minutes)

| Time | Content |
|---|---|
| 0:00–0:15 | Problem: trip plans break on opening hours, holidays and travel times |
| 0:15–0:35 | Step 1: Munich, Oktoberfest dates, preferences, upload hotel PDF |
| 0:35–0:55 | Step 2: swipe suggestions while new cards stream in |
| 0:55–1:30 | Step 3: calendar, drag a card to an invalid slot ("closed on 03.10., German Unity Day"), pinch a buffer, pull a card from the drawer |
| 1:30–1:50 | Under the hood: agent on Agent 37 picks tools via Monid, two sources per fact, cards stored in Supabase |
| 1:50–2:00 | Live on InstaCloud, try Urbino yourself. End card: **QR code + short link** to the demo, visible for at least 5 seconds |

The QR code and short link are created once the InstaCloud URL is final. Use a short link we control, so it can be redirected if the deployment URL changes.

## Out of scope (for now)

- Showing cost of tool calls in the frontend
