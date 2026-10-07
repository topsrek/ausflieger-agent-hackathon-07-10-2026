# Ausflieger research agent

The research agent runs on **Agent 37** using the `agent37-openclaw` template. **Monid** and **Context.dev** are already configured on the instance. The agent works through queued `research_jobs` and writes validated cards, places, facts, holidays and walking times to Supabase. The web app picks these up through Realtime.

```
web app ──insert──▶ research_jobs ──DB webhook──▶ Edge Function trigger-agent ──▶ Agent 37 /v1/responses
                                                                                      │
             cards / places / facts / travel_times / agent_events ◀── ausflieger CLI ◀┘ OpenClaw agent
                                                                         (Context.dev, Monid, browser, subagents)
```

| Path | What |
|---|---|
| `workspace/AGENTS.md` | Role and the full **research system prompt** (sources, evidence, holidays, budgets, tool routing, hard write rules). OpenClaw injects it into every session, including subagents (subagents get *only* AGENTS.md). It is about 13 KB; OpenClaw truncates bootstrap files at 20,000 chars. |
| `workspace/skills/ausflieger-research/SKILL.md` | The procedure for each job kind, the duration defaults and the Context.dev extraction schemas. |
| `workspace/HEARTBEAT.md` | Fallback polling checklist (`jobs requeue-stale` and `jobs next`). |
| `tools/` | The `ausflieger` CLI (Node, zod, supabase-js). Every database write is validated against the schema. |
| `install.sh` | Copies the workspace and installs the CLI on the instance. |
| `../supabase/functions/trigger-agent/` | Edge Function: a research job is inserted, the function sends the agent a message. |
| `CONTRACT_NOTES.md` | Proposed schema and contract changes (I did not apply them). |

## 1. Install on the Agent 37 instance

How to open a shell on the instance:
- the Agent 37 dashboard terminal or SSH, or
- the Platform exec API: `POST https://api.agent37.com/v1/instances/{id}/exec` with `{"command": "..."}` and `Authorization: Bearer <platform key>`. Each command runs through `sh -c`, and the home directory is `/home/node`.

```sh
cd ~ && git clone https://github.com/topsrek/ausflieger-agent-hackathon-07-10-2026.git ausflieger
cd ausflieger && sh agent/install.sh
cp agent/tools/.env.example agent/tools/.env   # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY with an editor
ausflieger jobs list                            # smoke test: prints [] or queued jobs
```

What `install.sh` does:
- copies `workspace/AGENTS.md`, `HEARTBEAT.md` and `skills/ausflieger-research/` into `${OPENCLAW_WORKSPACE_DIR:-~/.openclaw/workspace}`. If an AGENTS.md already exists, a backup is kept once as `*.pre-ausflieger`;
- runs `npm install` and installs `ausflieger` globally, or falls back to a link in `~/.local/bin`.

Start a new session or restart the gateway afterwards.

**Environment.** The CLI reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the process environment. If they are not set there, it reads `agent/tools/.env` or the file named by `AUSFLIEGER_ENV_FILE`.
- On Agent 37, instance env vars can only be set when the instance is created, so the `.env` file is the practical option.
- The service role key bypasses RLS. Keep it on the instance only. It never goes in the frontend or the repo.

The agent's `exec` tool has to be allowed to run `ausflieger`. If exec security is in `allowlist` mode, add `ausflieger`, `monid` and `node` to the allowlist.

**Updating:** `cd ~/ausflieger && git pull && sh agent/install.sh`.

## 2. Triggering

### Primary: Database Webhook to Edge Function to Agent 37

1. Deploy the function and set its secrets. Values are never committed.
   ```sh
   supabase functions deploy trigger-agent --no-verify-jwt
   supabase secrets set AGENT37_URL=https://<instance-id>.agent37.app AGENT37_TOKEN=<agent37 api key> WEBHOOK_SECRET=<random string>
   # optional: AGENT37_MODE=openclaw-hooks (see below)
   ```
2. Create the Database Webhook. In the dashboard: **Database > Webhooks > Create**, table `research_jobs`, event `INSERT`, type *Supabase Edge Functions*, function `trigger-agent`, HTTP header `x-webhook-secret: <same random string>`. The equivalent SQL (this is what the dashboard generates; it belongs in a migration owned by the schema owner):
   ```sql
   create trigger research_jobs_trigger_agent
     after insert on public.research_jobs
     for each row execute function supabase_functions.http_request(
       'https://<project-ref>.supabase.co/functions/v1/trigger-agent',
       'POST',
       '{"Content-Type":"application/json","x-webhook-secret":"<random string>"}',
       '{}',
       '5000'
     );
   ```
3. The function sends `POST {AGENT37_URL}/v1/responses` with the header `X-Agent37-Key: {AGENT37_TOKEN}` and the body `{"input": "Process research job <id> for trip <trip_id> (kind ..., card ...). Use the ausflieger-research skill ...", "stream": true, "metadata": {...}}`.
   - Every job starts a new session, because `session_id` is omitted. One session can only run one turn at a time, so a shared session would return `409 session_busy`.
   - The `/v1/responses` call blocks until the turn finishes unless `stream` is true. So the function streams, reads only until the response id appears (at most 8 s), and then detaches.
4. **Alternative, `AGENT37_MODE=openclaw-hooks`**: the function calls OpenClaw's own webhook instead, `POST {AGENT37_URL}/hooks/agent` with `Authorization: Bearer <hooks token>` and `Idempotency-Key: job-<id>`. That endpoint returns `{ok, runId}` immediately. For this you need:
   - `hooks.enabled: true` and a `hooks.token` in `openclaw.json`;
   - `AGENT37_URL` set to the gateway's public URL, for example `https://<instance-id>-18789.agent37.app`. It is not confirmed that Agent 37 routes `/hooks/*` there; see the open questions.

Duplicate deliveries are harmless, because the agent claims jobs atomically (`jobs claim <id>`; a second claim returns `claimed: false`). If the trigger fails, the job stays `queued` and the fallback picks it up.

### Fallback: OpenClaw cron or heartbeat

Polling every minute, as an isolated cron job:
```sh
openclaw cron add --name "ausflieger-poll" --every 1m --session isolated --no-deliver \
  --message "Run: ausflieger jobs requeue-stale --minutes 20; then ausflieger jobs next. If a job was claimed, process it with the ausflieger-research skill and repeat jobs next until none is left. If none, reply NO_REPLY."
```
(`openclaw cron` is an alias of `openclaw automations`. Check the exact flags with `openclaw cron add --help` on the instance's version: some versions take the prompt as a positional argument instead of `--message`.)

Heartbeat alternative: `workspace/HEARTBEAT.md` holds the same checklist. Newer OpenClaw versions take it with `openclaw cron scratch <jobId> --set "..."` instead of HEARTBEAT.md. Set the heartbeat interval in `openclaw.json` (default 30m; 1m makes sense only during the demo).

Each poll costs one model turn. During the hackathon, either turn polling on only for the demo or use `--every 2m`.

## 3. How the agent researches

This is all set out in AGENTS.md and the skill. In short:
- **Order**: planning-critical facts first (fixed times, date-specific hours, closures, last entry), then location, duration, reservation and price, then descriptive details. Each tier is written as soon as it is done, and every step has a tool-call budget.
- **Sources**: the operator's official page for the trip date comes first. Critical facts get a second independent source (usually Google Maps through Monid). When sources disagree, both claims are stored as separate facts and the database view derives `conflicting`. Missing values become `estimated` (with a basis) or `unknown`; nothing is invented.
- **Holidays**: national, regional and city holidays are checked from authoritative calendars. A holiday triggers a check of each venue's special hours; it never implies closure.
- **Context.dev** is the preferred way to read official venue, hotel, tourism-board and event-calendar pages. It returns rendered HTML for JS-heavy pages, and its JSON-schema extraction suits opening hours, last entry and breakfast times (the schemas are in the skill).
- **Monid** handles every other task (`monid discover -q "<task>" --json` → `monid inspect -p <provider> -e <endpoint>` → `monid run -p ... -e ... -i '<json>' --wait -o out.json`). Uses: places and coordinates, opening hours from Google Maps, web search, event search, holiday APIs, PDF parsing, trains and flights, and optional routing. Provider/endpoint pairs that worked are saved in `memory/` and reused.
- **Browser automation** is the last resort, for pages that need clicks: calendar pagination, date pickers, cookie walls.
- **Subagents** (`sessions_spawn`): at most 5 children, one accepted card each, for parallel `research_card` work.
- **Walking times**: `ausflieger travel fill <trip_id>` estimates every missing pair between the places of accepted cards. Method: haversine distance × 1.3 detour factor, walked at 4.5–5 km/h. The result is a min/max range with a basis string; the planner uses the upper bound.
- **Rules the CLI enforces**:
  - no `day`, `position` or `swipe_status` writes, and no flipping of `confirmed`;
  - on a scheduled card, changes to duration, times, windows or place become `card_change_proposals`;
  - durations need a basis; timestamps need an offset;
  - sourced facts need a URL, estimates need a basis, and `operator_confirmed` needs an operator-type source;
  - a fact belongs to exactly one target, and no references may cross trips.

## 4. The ausflieger CLI

```sh
ausflieger help          # full command list
ausflieger enums         # allowed enum values
ausflieger travel estimate 48.1374 11.5755 48.1299 11.5834   # {"min_minutes":16,"max_minutes":18,...}
```
Main commands:
- jobs: `jobs claim|next|done|fail|list|requeue-stale`
- reading: `trip get|summary`, `card get`
- writing: `ingest` (place + card + facts in one call), `card upsert|state`, `place upsert`, `fact add`, `holiday add`, `travel set|fill`, `proposal add`, `event log`
- uploads: `upload get|status|parsed`

Output is one JSON line. Exit code 2 means a validation error, with a message for each field.

Development (Node 20+; `npm` only inside `agent/tools`):
```sh
cd agent/tools && npm install && npm test
```
The tests cover:
- the schema validation and the walking estimate;
- an integration suite that runs the real migration in **PGlite** (same stubs as `scripts/test-schema.mjs`) and drives the CLI commands through the same code path as production: job claiming, ingest, proposals for scheduled cards, holidays, travel fill, uploads and cross-trip guards.

## 5. First integration milestone, end to end

Goal: research one real card → validate → store → show it live → explain a conflict when it is moved.

1. **Prepare** a trip in Supabase. Use the web app, or SQL in the dashboard as the service role:
   ```sql
   insert into trips (city, region, country_code, timezone, start_date, end_date, step)
   values ('Munich', 'Bavaria', 'DE', 'Europe/Berlin', '2027-10-02', '2027-10-03', 'scheduling') returning id;
   insert into preferences (trip_id, visit_style, interests) values ('<trip_id>', 'normal', '{museums}');
   insert into cards (trip_id, type, title, swipe_status) values ('<trip_id>', 'museum', 'Deutsches Museum', 'accepted') returning id;
   ```
2. **Dry-run the CLI** on the instance, without the agent:
   ```sh
   ausflieger trip summary <trip_id>
   ausflieger event log <trip_id> "CLI smoke test" --level info
   ```
   The event should show up in the app's progress log through Realtime on `agent_events`.
3. **Queue the job**: `insert into research_jobs (trip_id, kind, card_id) values ('<trip_id>', 'research_card', '<card_id>');`
   - With the webhook set up, the agent starts on its own; check the Edge Function logs for `agent triggered`.
   - Without it, send the message by hand. Either use the Agent 37 chat UI, or run `curl https://<instance-id>.agent37.app/v1/responses -H "X-Agent37-Key: $KEY" -H 'Content-Type: application/json' -d '{"input":"Process research job <job_id> for trip <trip_id>"}'`.
4. **Watch it live**: `agent_events` progress lines appear, the card goes `researching` → `ready`/`needs_checking`, and the place gets opening hours, special hours for 3 Oct (German Unity Day) and coordinates. Facts arrive with URLs, retrieval times and applicable dates.
5. **Validate**: run `ausflieger card get <card_id>`, then check:
   - every fact has a URL, or a basis if it is an estimate;
   - the hours for 2 and 3 Oct are `operator_confirmed`, or else the card is `needs_checking` with a stated gap;
   - `select * from fact_status where place_id = '<place_id>'` shows the status derived for each field.
6. **Show the conflict**: in the calendar, drag the card to a slot that ends after closing time. The planner reports, for example, "Visit ends after the museum closes at 17:00", using the sourced hours.
7. **Refresh path**: insert a `refresh_card` job for the scheduled card. Any duration or time change must show up as a `card_change_proposals` row, and the card's day and position must stay unchanged.

## Open questions (Agent 37 / OpenClaw)

- Does Agent 37 keep the `/v1/responses` turn running after the streaming client detaches? The docs suggest so, since a run can be re-attached via `GET /v1/responses/{id}/stream`, but I have not tested it. If not, switch to `AGENT37_MODE=openclaw-hooks` or rely on the cron fallback.
- Are OpenClaw's `/hooks/agent` and `/v1/chat/completions` reachable on Agent 37 through `https://<id>-18789.agent37.app`, and with which auth? The Agent 37 docs only describe hooks for its Hermes template.
- Which OpenClaw version does the template ship? It decides whether TOOLS.md/HEARTBEAT.md are still bootstrap files and the exact `openclaw cron add` flags.
- How is Context.dev exposed on the instance: a skill, an MCP server or a CLI? AGENTS.md describes it by capability only. Add the exact invocation to AGENTS.md's Tools section once confirmed.
- Monid on the instance: is it the CLI (`monid ...` via exec) or the remote MCP (`https://mcp.monid.ai/v1`)? The prompt describes the CLI flow; the MCP tools follow the same discover → inspect → run steps.
