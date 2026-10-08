# Ausflieger brand

“Ausflug” (trip, excursion) + “Flieger” (flyer): the one who heads out.

## Logo

| File | Use |
|---|---|
| `logo-mark.svg` | Square app icon / favicon (64×64 viewBox, readable at 16–32 px). A paper plane taking off; its dotted trail is a timeline with two plan cards (one cream, one orange). No text. |
| `logo.svg` | Mark + wordmark, wordmark colour switches to cream in dark mode (`prefers-color-scheme`). |
| `logo-dark.svg` | Mark + cream wordmark for dark backgrounds (no media query). |

The mark has its own teal tile, so it works on light and dark backgrounds unchanged. The wordmark is live SVG text in Fraunces (falls back to Georgia); convert the text to outlines in Figma/Inkscape for print or anywhere fonts can't load.

Favicon: `<link rel="icon" type="image/svg+xml" href="/logo-mark.svg">`. For a PNG app icon, export `logo-mark.svg` at 192 and 512 px.

## Colours

| Token | Hex | Use |
|---|---|---|
| Ink | `#1d1a16` | Text, wordmark (light mode) |
| Paper | `#f6f3ee` | Background, plane, wordmark (dark mode) |
| Teal (accent) | `#0f6b5c` | Mark tile, primary actions, “OK” |
| Mint | `#9fe3d2` | Trail, highlights on dark |
| Plane shade | `#cdeee5` | Mark only |
| Orange | `#ff9f5a` | Mark card; warm accents (use `#e8590c` for text) |
| Red | `#c92a2a` | Blocking conflicts (“Visit ends after … closes”) |
| Amber | `#a8650b` on `#fbf0d9` | Needs checking |
| Muted | `#6b645a` | Secondary text |

## Type

- Display / wordmark: **Fraunces** 600–700 (Google Fonts), fallback Georgia.
- UI / body: **Plus Jakarta Sans** 400–800 (Google Fonts), fallback Segoe UI / system-ui.

Both are already loaded by `web/index.html`. The video renders use the same stacks with system fallbacks so they render offline.
