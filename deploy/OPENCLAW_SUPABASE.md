# Connect Supabase (instructions for the OpenClaw agent on Agent 37)

Prerequisite: the user created a Supabase project and ran `supabase/setup.sql` (schema + Munich demo seed) in the Supabase SQL Editor.

Never print, log or commit any key. Ask the user for keys via protected secrets only.

## 1. Update the checkout

```bash
cd ausflieger && git pull
```

## 2. Web app on InstaCloud

Ask the user for `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Supabase → Project Settings → API) as protected secrets. Bind both to the web compute service, plus `DEMO_TRIP_ID=2027a10d-0203-4000-8000-00000000c0de`, then redeploy from the repo root:

```bash
insta deploy .
```

Verify `<url>/api/config` returns the Supabase URL (not the key in logs) and `<url>/` loads.

## 3. Research agent

```bash
sh agent/install.sh
```

Create `agent/tools/.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (ask the user for the service role key as a protected secret; it must never go to the web app). Check:

```bash
ausflieger trip summary 2027a10d-0203-4000-8000-00000000c0de
```

## 4. Demo PDF in storage

Upload `data/demo/hotel-booking-sample.pdf` to the `uploads` bucket at `demo/2027a10d-0203-4000-8000-00000000c0de/hotel-booking-sample.pdf` (supabase-js storage upload with the service role key from `agent/tools/.env`).

## 5. Job polling

Add a cron job that runs every minute in an isolated session (check flags with `openclaw cron add --help`):

> Run `ausflieger jobs next`. If a job was claimed, process it following AGENTS.md and the ausflieger-research skill, then mark it done or failed. If none, stop.

## 6. First live test

Create a non-demo test trip and a job, then watch it get processed:

```bash
ausflieger jobs list
```

Report to the user: web URL works with Supabase, the cron is active, and the result of the first job.
