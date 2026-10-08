# Manual recording guide (fallback)

The primary pipeline is programmatic (`npm run record` → `npm run vo` → `npm run render`, see README.md). Use this guide only if the automated take or Remotion doesn't work out, e.g. you want a hand-driven take or your own voice.

## 1. Screen capture with OBS Studio (Windows)

1. Install OBS Studio (obsproject.com, free).
2. **Settings → Video**: Base (canvas) 1920×1080, Output 1920×1080, FPS 30 (60 if you have smooth drags and a fast machine; 30 is fine for UI).
3. **Settings → Output** (Advanced): Recording format `mkv` (crash-safe; remux to mp4 via File → Remux), encoder NVENC/QuickSync H.264 if available, else x264; Rate control CQP/CRF 18; Keyframe interval 2 s.
4. **Settings → Audio**: Desktop audio off (no notification sounds in the take).
5. Scene “Ausflieger”:
   - **Image** source: branded background. Easiest: render a frame from Remotion (`npm run still`, then paint over the phone area) or screenshot `architecture.html` without boxes. Colours: background `#f6f3ee`, accent `#0f6b5c`.
   - **Window Capture** of the Chrome window in device mode 390×844 (see SHOTLIST pre-flight). Right-click → Transform → Edit Transform; **Crop** to exactly the device viewport (no DevTools chrome); scale to ~960 px high (≈ 1.14×) and place left of centre (x ≈ 230, y ≈ 60).
   - Optional: an Image source with a phone bezel PNG above the capture.
6. Record each shot separately (start/stop per row in SHOTLIST.md); it makes editing much easier.

## 2. Voiceover by hand (if not using ElevenLabs)

- Quiet small room, soft furnishings; phone or USB mic 15–20 cm from mouth, slightly off-axis (no plosives).
- Record in Audacity (free): 48 kHz mono, peaks around −6 dB. One file per segment, named like `s03-step1.wav`.
- Read slightly slower than feels natural (~150 wpm). Leave 1 s of room tone at the start (for noise reduction).
- Clean-up: Effect → Noise Reduction (profile from room tone), Compressor (ratio 3:1), Normalize to −1 dB, Loudness Normalization to −16 LUFS.
- To keep the Remotion pipeline: export as mp3 into `remotion/public/vo/`, then update `manifest.json` durations (or drop in WAVs and run `npm run vo:placeholder` to rebuild timings; captions then use estimated word timing).

## 3. Editing (DaVinci Resolve or CapCut, both free)

- Timeline 1920×1080, 30 fps. Lay down the voiceover segments first, then cut picture to it (target ≤ 2:00; we aim for ~1:50).
- Insert `architecture.html` and `endcard.html` as stills: open in Chrome at 1920×1080 (F11), screenshot, or use `npm run still -- --frame=<n>`.
- End card ≥ 5 s, QR code at least ~400 px tall on the 1080p frame. Test it by scanning the screen with a phone.
- Light zoom-ins (110–120 %) on the reason text in the conflict shot help on small screens.

## 4. Captions (burned in)

- Resolve: Workspace → Transcribe / Subtitles → “Create subtitles from audio”, fix names (Ausflieger, Monid, OpenClaw, Agent 37, Context.dev), style: Semibold 40–44 px, white on 90 % dark box, max 2 lines, bottom-centre or beside the phone; Deliver with “Burn into video”.
- CapCut: Text → Auto captions → English; same style; export burns them in.

## 5. Music

- Only use tracks with a licence that allows online publication: YouTube Audio Library (check “attribution required”), Pixabay Music (Pixabay licence), or your own. Avoid commercial tracks (Content ID claims can block the video).
- Keep it at about −24 to −28 LUFS under the voice (≈ 10–15 % volume); duck under speech.
- Remotion pipeline: drop the file as `remotion/public/music.mp3` and it is mixed automatically at 12 % with fades.

## 6. Export for hackathon platforms

- MP4, H.264 (High profile), AAC 48 kHz 192 kbps, 1920×1080, 30 fps, CRF 18–20 or ~10–12 Mbit/s; length ≤ 2:00 (hard limit: check the platform; Devpost/YouTube accept this).
- File size typically 80–150 MB at that bitrate; if a platform limits uploads, re-encode at CRF 23.
- Upload as unlisted YouTube video as well (many forms want a link), and check that captions are readable on a phone.
