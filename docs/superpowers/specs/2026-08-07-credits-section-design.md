# Credits section — design

Date: 2026-08-07
Status: approved pending user review

## Goal

Show the user's extra-usage credit money in the deck line so a subscriber who
has bought credits can see, at a glance, how much money is left. The section is
always present when there is a positive number to show — it does not wait for
the 5h window to run out — and is completely invisible otherwise.

## Placement & gating

- New meters group, rendered after the 5h group and before the week group.
- Subscription (non-enterprise) accounts only. Enterprise keeps its existing
  cost section; the two never co-exist.
- The section renders only when the display logic below produces a value.
  There is no dim `—` placeholder: no data, malformed data, $0, or
  out-of-credits all mean the section is absent and the line looks exactly as
  it does today.

## Data source

`~/.claude.json` → top-level `cachedUsageUtilization` (the script already
parses this file for `oauthAccount`; no new I/O):

- `fetchedAtMs` — cache timestamp, used for the staleness suffix.
- `utilization.extra_usage.monthly_limit` — dollars; `null` = unlimited.
- `utilization.extra_usage.used_credits` — spent this month, in minor units
  (`decimal_places`, observed `2`, i.e. cents). **Open point for the plan:**
  verify against `utilization` (integer percent) with live data once credits
  are active; if they disagree, trust `utilization × monthly_limit`.
- `utilization.extra_usage.utilization` — integer percent of the monthly
  limit, drives the color.
- `utilization.extra_usage.disabled_reason`, `spend_limit_reached` — drained
  signals (both mean: hide).
- Any non-null "remaining" dollar field (e.g. the currently-null
  `remaining_dollars` on the windows, or a future field inside `extra_usage`)
  is preferred over arithmetic when present.

This block is **undocumented** — the official statusline payload has no credit
fields (checked against current docs 2026-08-07). Every read is wrapped
best-effort in the file's existing try/catch style; a schema change must
degrade to "section hidden", never to a crash.

## Display logic (first match wins)

The section shows one thing only: money left, as `$61.50 left`.

1. A real remaining/balance dollar field is non-null and > 0
   → `$61.50 left`. When present, this field is authoritative: if it is
   ≤ 0 the section hides — no fall-through to the arithmetic in (2), which
   could show money that is not there (user ruling, 2026-08-07).
2. `monthly_limit` set and `monthly_limit − used` > 0
   → `$61.50 left`
3. Anything else (unlimited limit with no remaining field, no data, $0,
   out_of_credits, spend_limit_reached, malformed) → section hidden

## Rendering

- Icon: credit-card (`\uf09d`), distinct from the enterprise dollar icon.
- One dollar number, two decimals, trailing word `left` — always.
- Color of the amount: existing `level()` thresholds applied to
  `extra_usage.utilization` when a limit exists (green < 50, amber < 80,
  red ≥ 80); plain text color when the amount comes from a remaining field
  without a limit.
- Staleness: if `Date.now() − fetchedAtMs` > 1 hour, append a dim age suffix
  in the largest sensible unit — `(45m)`, `(3h)`, `(16d)`.

## Error handling

All parsing is best-effort. Only finite numbers are trusted; any type
mismatch, missing branch, or JSON error yields case 4 (hidden). The section
must never widen the line with garbage or throw.

## Testing

- Env override (matching `STATUSLINE_ENTERPRISE` / `STATUSLINE_COLS` style)
  pointing the `~/.claude.json` read at a fixture file.
- Fixture matrix: fresh balance, stale balance, unlimited limit (hidden),
  drained (out_of_credits), spend_limit_reached, block absent, block
  malformed, enterprise account (section suppressed).
- Manual eyeball via piped payload fixtures, as the project does today.

## Docs

README anatomy table gains the credits section row (rendered SVG bit, per the
existing convention of not embedding raw Nerd Font glyphs in the README).
