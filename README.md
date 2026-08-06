# fold-statusline

The **Fold deck line** — a boxed, icon-rich status line for [Claude Code](https://claude.com/claude-code), in the visual language of the [Fold](https://github.com/SamiAbi/fold) terminal IDE. One line when it fits; folds to two or three balanced rows when your pane gets narrow — like paper.

```
╭─  fold · main ✱3 ──────────────────────────────────────────────────────────╮
│   samyabab  │   Fable 5  high  │   ███░░░░░░░ 34% ~52m  │   12%  14:32 │ … │
╰─────────────────────────────────────────────────────────────────────────────╯
```

What it shows: **where you are** ( repo ·  branch · ✱ dirty count in the title), **who/what** ( account ·  model ·  effort), and **your budgets** —  context (bar + % + time-to-empty at your current burn rate) ·  5-hour window ·  weekly window (resets as wall-clock times, not countdowns) ·  MCP servers ·  session time. Meters are green under 50%, amber to 80%, red above;  fire when context is nearly spent.

- **Folds, never breaks** — measures your terminal and re-lays the same facts on 1, 2, or 3 balanced rows with `├───┤` dividers. Nothing is dropped or abbreviated.
- **Enterprise-aware** — usage-billed seats have no 5h window; the  cost takes that slot (add `CLAUDE_COST_BUDGET=25` to get a budget bar).
- **State-honest** — fresh sessions show `—` placeholders (no layout jumps), a down MCP server turns the count red, `FAST` mode shouts.

## Install

```sh
npx github:SamiAbi/fold-statusline
```

or clone and run `node bin/cli.mjs install`. The CLI copies `statusline.mjs` to `~/.claude/`, enables it in `~/.claude/settings.json`, and backs up whatever status line you had (`uninstall` restores it).

**Requirements:** Claude Code, Node ≥ 18, and a [Nerd Font](https://www.nerdfonts.com/) as your terminal font — [Maple Mono NF](https://github.com/subframe7536/maple-font) recommended (`brew install --cask font-maple-mono-nf`). Truecolor terminal assumed.

```sh
fold-statusline status      # is it installed + enabled?
fold-statusline uninstall   # put everything back
```

## Design

The palette and grammar come from Fold's design system (Tokyo-Night-adjacent: `#7aa2f7` accent means *location*, `#9ece6a`/`#e0af68`/`#f7768e` meter thresholds, editor cyan/purple/orange for icon keys). Full design spec and the 25-design exploration that led here live in the Fold project.

## License

MIT
