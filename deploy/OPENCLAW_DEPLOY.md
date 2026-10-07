# Deploy Ausflieger to InstaCloud (instructions for the OpenClaw agent on Agent 37)

Paste this into the OpenClaw chat, or tell the agent: "Follow deploy/OPENCLAW_DEPLOY.md from https://github.com/topsrek/ausflieger-agent-hackathon-07-10-2026".

## 1. Get the code

```bash
git clone https://github.com/topsrek/ausflieger-agent-hackathon-07-10-2026.git ausflieger
cd ausflieger
```

If the folder already exists: `git -C ausflieger pull`.

## 2. InstaCloud setup

Fetch https://instacloud.com/prompt.md and follow it, with these project-specific answers:

- What to deploy: **only the `web/` folder**. It is a Vite + React app with a small Node server (`web/server.mjs`) that serves the built app and `/api/health`, and reads runtime config from env.
- Build: `npm ci && npm run build` inside `web/`. Start: `npm start`. The server listens on `$PORT` (default 8080).
- No InstaCloud database needed: data lives in Supabase.
- No volumes, no workers.
- Project name: `ausflieger`.

## 3. Secrets

Bind these to the web compute service (values come from the Supabase project settings → API; ask the user if they are not already stored as protected secrets):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key |

Never bind the service role key to the web app. The service role key is only for the research agent's CLI (`agent/`).

## 4. Deploy and verify

```bash
cd web
insta deploy .
insta status
insta agent manifest   # prints the public URL
```

Check:
- `GET <url>/api/health` returns OK
- `<url>/` loads the landing page
- `<url>/?demo=munich` opens the Munich demo

Report the public URL back to the user. The video's QR code and short link point to it.

## Redeploy after changes

```bash
cd ausflieger && git pull && cd web && insta deploy .
```
