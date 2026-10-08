# Ausflieger submission video

A 2-minute video (1:57), produced programmatically:

```
script.json ──► scripts/voiceover.mjs (ElevenLabs, per segment, with timestamps) ──► remotion/public/vo/*.mp3 + manifest.json
web app ─────► scripts/record-app.mjs (Playwright, 390×844) ─────────────────────► remotion/public/clips/app.webm + manifest.json
make-qr.mjs ─► remotion/public/qr.svg + endcard.json (+ endcard.html)
                         └──► Remotion (remotion/src) ──► out/ausflieger.mp4 (1920×1080, 30 fps, H.264, burned-in captions)
```

Segment lengths come from the real voiceover durations, so the picture always fits the narration and the total stays under 2:00 (`npm run check` prints the projected runtime).

## Files

| File | What |
|---|---|
| `script.json` | Source of truth: segments with voiceover text, on-screen action, visual type, shot id, beat chips |
| `SCRIPT.md` | Readable timed script, word counts, sponsor-claim checklist, 2 alternative hooks |
| `SHOTLIST.md` | Every app shot with exact actions, demo data, pre-flight checklist |
| `RECORDING.md` | Manual fallback: OBS, own voiceover, Resolve/CapCut, captions, music licensing, export |
| `NEEDS_FROM_WEB.md` | Test ids the recorder relies on (all present) |
| `architecture.html`, `endcard.html` | Standalone 1920×1080 slides (open in a browser, F11). Remotion ports: `remotion/src/scenes/` |
| `scripts/` | `voiceover.mjs`, `placeholder-audio.mjs`, `record-app.mjs`, `make-qr.mjs`, `check-script.mjs` |
| `remotion/` | Composition (`Root.tsx`, `Main.tsx`, scenes, components); `public/` holds generated media |
| `../brand/` | Logo (mark, lockup), colours, fonts |

## Run it

```sh
cd video
npm install                     # once; also: npx playwright install chromium
cp .env.example .env            # then put ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID) in .env yourself
npm run check                   # words + projected runtime
npm run vo                      # ElevenLabs takes for new/changed segments (cached by text hash)
#   no key yet? npm run vo:placeholder   (silent audio with estimated timing, for an animatic)
cd ../web && npx vite --port 5174   # own dev server (in a second terminal)
cd ../video && npm run record -- http://localhost:5174     # or the InstaCloud URL
node scripts/make-qr.mjs <url> <shortlink>                 # QR + link text on the end card
npm run studio                  # optional: preview/scrub in the browser
npm run render                  # -> out/ausflieger.mp4
```

Without a recording the clip scenes show a labelled “TODO: record shot Sxx” phone screen, so the whole video can be rendered as an animatic at any time.

- **Secrets**: `.env` is gitignored (`video/.gitignore`). The scripts read it with `process.loadEnvFile` and never print the key.
- **ElevenLabs**: `POST /v1/text-to-speech/{voice_id}/with-timestamps`, model `eleven_multilingual_v2` (ElevenLabs' documented default; set `ELEVENLABS_MODEL_ID=eleven_v3` to try the newer expressive model). Default voice “George” (`JBFqnCBsd6RMkjVDRZzb`); set `ELEVENLABS_VOICE_ID` to change. `previous_text`/`next_text` are sent for consistent prosody across segments.
- **Remotion licence**: free for individuals, for-profit organisations with up to 3 employees, non-profits, and evaluation (remotion-dev/remotion LICENSE.md). A hackathon team of individuals fits; a company with 4+ employees using it commercially would need a company licence. Remotion bundles its own ffmpeg and downloads Chrome Headless Shell on first render.
- **Short link**: point the QR at a short link the team controls (Dub.co, Bitly, or a redirect on your own domain), not at the raw deployment URL, so the video stays valid if the InstaCloud URL changes. The QR and link now point at `https://tinyurl.com/ausflieger` (redirects to the live InstaCloud app).
- The 404 lines during render (`music.mp3`, sometimes `clips/manifest.json`) are optional files being probed; harmless.

## Open decisions for the user

1. **Hook**: current = intro (name + pun + pitch) then the broken-plan hook. Alternatives A (question) and B (cold open on the conflict) in SCRIPT.md.
2. **Voice**: ElevenLabs default voice “George” (British male) used for the first cut. Pick a voice from your library (`ELEVENLABS_VOICE_ID`) or record your own (RECORDING.md §2). Try `eleven_v3` if you want more expressive delivery.
3. **Music**: none yet. Drop a licensed `remotion/public/music.mp3` (YouTube Audio Library / Pixabay) and re-render; it is mixed at 12 % with fades.
4. **Conflict to show**: Residenz München after hotel check-in (“Visit ends at 18:40, after Residenz München closes at 18:00”), as the web team suggested. Alternatives: departure train 18:32 overlap (fixed-time conflict), or the Viktualienmarkt documented holiday closure on 3 Oct.
5. **Live agent vs. saved run**: the recorded take uses the offline Munich demo data. If the video says the agent “researches in the background”, either record a live agent run for S04/S07 or add a small on-screen label “Prepared research run” (README: fallback must be clearly labelled).
6. **Short link**: done (tinyurl.com/ausflieger). Make sure the team controls that TinyURL alias so it can be redirected later.
7. **Sponsor line**: confirm Context.dev was actually used for the demo data (SCRIPT.md checklist), otherwise cut that clause.
8. **Pacing**: S04 (swipe) and S07 (search) recordings are ~2× longer than their voiceover and get sped up to max 2.2×; trim pauses in `record-app.mjs` or accept the faster motion.
