# fold-statusline

The **Fold deck line** — a boxed, icon-rich status line for [Claude Code](https://claude.com/claude-code), in the visual language of the [Fold](https://github.com/SamiAbi/fold) terminal IDE.

![The deck line](docs/preview.svg)

One line inside a rounded frame. When your pane gets narrow, it doesn't truncate or shrink — it **folds** the same content onto two, then three balanced rows, like paper:

![Folding to two and three rows](docs/folding.svg)

## Install

```sh
npx github:SamiAbi/fold-statusline
```

or clone and run `node bin/cli.mjs install`. The CLI copies `statusline.mjs` to `~/.claude/`, enables it in `~/.claude/settings.json`, and backs up whatever status line you had before — `fold-statusline uninstall` restores it exactly.

**Requirements:** Claude Code · Node ≥ 18 · a [Nerd Font](https://www.nerdfonts.com/) as your terminal font — [Maple Mono NF](https://github.com/subframe7536/maple-font) recommended (`brew install --cask font-maple-mono-nf`) · a truecolor terminal.

```sh
fold-statusline status      # is it installed + enabled?
fold-statusline uninstall   # put everything back the way it was
```

## Anatomy — every section, left to right

### The title: where you are

| Piece | Meaning |
|---|---|
| ` fold` | The paper plane, then the **repo name** (or the folder name outside git) |
| `· main` | Current **branch**, in Fold's accent blue — accent always means *location* |
| `✱3` | **Dirty count** — number of changed files in the working tree; hidden when clean |

### The row: who, what, and how much is left

| Section | Example | Meaning |
|---|---|---|
|  user | ` samyabab` | The Claude **account** signed in (email local part) |
|  model | ` Fable 5  high` | **Model** and **reasoning effort** — the bolt is dim/green/amber/red for low/medium/high/max, and `FAST` appears bold red in fast mode |
|  context | ` ███░░░░░░░ 34% ~52m` | **Context window**: 10-cell bar + percent used, then **time-to-empty** predicted from your live burn rate (token samples across renders). Before enough samples exist it shows tokens left (`165k`). At ≥ 80 % the section turns red and a  fire replaces the calm estimate |
|  5-hour | ` 12%  14:32` | The rolling **5-hour rate-limit window**: percent used and — instead of a countdown you'd have to do math on — the **wall-clock time it resets** |
|  week | ` 61%  Fri` | The **7-day window**, same treatment; beyond 24 h the reset shows as a weekday |
|  mcp | ` 4` | **MCP servers** connected (cached, refreshed every 2 min in the background). If one that was up goes down, it turns red as ` 3/4` |
|  session | ` 38m` | How long this Claude Code **session** has been running |

**Color rules** (Fold's design system): meters are green under 50 %, amber to 80 %, red above; the empty bar track and separators stay near-invisible; **bold** marks only the numbers your eye should land on; the accent blue is reserved for *where you are*.

### States you'll see

- **Fresh session** — sections whose data hasn't arrived yet hold their slot with a dim `—`, so the layout never jumps when numbers land.
- **Enterprise / usage-billed seats** — these have no 5-hour window, so that slot collapses and a green ** cost** section takes its place (`$4.20`). Set `CLAUDE_COST_BUDGET=25` in your environment to turn it into a budget bar (`$4.20 of $25`).
- **Narrow panes** — the line measures your terminal (`stty size` against the controlling tty) and re-lays the same sections onto 2 or 3 balanced, edge-justified rows divided by `├───┤` rules. Nothing is ever dropped or abbreviated; when the width can't be detected it assumes wide.

## How it works

A single dependency-free Node script that Claude Code invokes with its status JSON on stdin. It adds: a per-session cache so values never flicker between renders, account-wide reuse of rate-limit data (a brand-new session shows your windows immediately), burn-rate sampling for the time-to-empty estimate, and a detached, throttled `claude mcp list` refresh so the MCP count never slows a render.

## Design

The palette and grammar come from Fold's design system (Tokyo-Night-adjacent): `#7aa2f7` accent for location, `#9ece6a` / `#e0af68` / `#f7768e` meter thresholds, and the editor's cyan/purple/orange/teal as icon keys. The deck line was chosen from a 25-design exploration; the full spec lives with the Fold project.

## License

MIT
