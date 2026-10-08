# What record-app.mjs needs from web/

Status 2026-10-07: everything required exists in web/ (thanks!). The recorder uses these test ids:

| Selector | Used for |
|---|---|
| `open-demo` | Landing → demo (only if the landing shows) |
| `step-preferences`, `step-swiping` | Stepper navigation |
| `find-suggestions` | Step 1 → 2 |
| `swipe-card-top`, `swipe-like`, `swipe-skip` | Swiping (gesture first, buttons as fallback) |
| `plan-days` | Step 2 → 3 |
| `day-tab[data-day]` | Day switch (Sat / Sun) |
| `schedule-card[data-title]` | Card to drag / open |
| `drop-slot` (rendered while dragging) | Drop target; the recorder picks the first slot below an anchor card |
| `sheet-close` | Close the card details sheet |
| `drawer-search`, `search-input`, `search-submit`, `drawer-card[data-title]` | Search again in the drawer |

Without test ids (role/text instead): the hotel file input (`input[type=file]`), **Confirm all** in “Found in your documents”, interest chips (button name), visit style **Normal** (radio name).

Nice to have (not blocking):
- `data-testid="upload-input"` on the file input and `"upload-confirm-all"` on Confirm all, so the text can change without breaking the take.
- A slightly larger offline suggestion pool for the swipe deck (5–6 cards) so the swipe shot has more motion.
