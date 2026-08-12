# Credits Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `$X left` of extra-usage credits as a new deck-line section, hidden entirely whenever there is no positive number to show.

**Architecture:** Everything lives in the single-file `statusline.mjs` (project convention). The balance is read from the undocumented `cachedUsageUtilization` block of `~/.claude.json` — a file the script already parses — so the feature adds zero I/O. Tests use Node's built-in `node:test`, running the script as a child process against fixture files selected by new `STATUSLINE_*` env overrides (the project's existing override pattern).

**Tech Stack:** Node ≥ 18, ESM, zero dependencies, `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-08-07-credits-section-design.md`

## Global Constraints

- Node `>=18`, `"type": "module"`, zero runtime dependencies.
- All feature logic in `statusline.mjs`; no new source files.
- Nerd Font PUA glyphs are written as `\u` escapes in source, never as literal characters (repo convention, see the `I` icon table).
- The statusline must NEVER crash on missing/malformed data — every read is best-effort try/catch, degrading to "section hidden".
- The credits section renders **only** `$<amount> left` (two decimals). Never a `used` display, never a dim `—` placeholder.
- Section order: after the 5h group, before the week group. Non-enterprise accounts only.

---

### Task 1: Test harness + env-overridable file reads

The script currently hardcodes three paths: `~/.claude.json`, `~/.claude/statusline-usage.cache`, `~/.claude/mcp-status.cache`. Tests need to redirect all three so they never touch (or pollute) the real user files. Also refactor so `~/.claude.json` is parsed once and shared — the credits code in Task 2 needs the same parse.

**Files:**
- Modify: `statusline.mjs` (path constants, `oauthAccount()`, `main()`)
- Create: `test/credits.test.mjs`
- Modify: `package.json` (add `scripts.test`)

**Interfaces:**
- Produces: `claudeJson()` → parsed `~/.claude.json` object (or `{}`); `oauthAccount(cj)` now takes that object. `main()` holds `const cj = claudeJson()`. Env overrides `STATUSLINE_CLAUDE_JSON`, `STATUSLINE_USAGE_CACHE`, `STATUSLINE_MCP_CACHE`. Test helper `render({claudeJson, payload, env})` → ANSI-stripped stdout string.

- [ ] **Step 1: Write the failing test**

Create `test/credits.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../statusline.mjs", import.meta.url).pathname;
const ANSI = /\x1b\[[0-9;]*m/g;

// Run statusline.mjs against fixture files in a temp dir; return plain text.
export function render({ claudeJson = {}, payload = {}, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fold-sl-"));
  const cjPath = join(dir, "claude.json");
  writeFileSync(cjPath, JSON.stringify(claudeJson));
  const mcpPath = join(dir, "mcp.cache");
  writeFileSync(mcpPath, ""); // fresh + empty: no servers, no detached refresh
  const out = execFileSync("node", [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: {
      ...process.env,
      STATUSLINE_CLAUDE_JSON: cjPath,
      STATUSLINE_USAGE_CACHE: join(dir, "usage.cache"),
      STATUSLINE_MCP_CACHE: mcpPath,
      STATUSLINE_COLS: "400",
      FOLD: "",
      STATUSLINE_ENTERPRISE: "",
    },
  });
  return out.replace(ANSI, "");
}

export const PAYLOAD = {
  session_id: "test-session",
  model: { display_name: "Fable" },
  rate_limits: {
    five_hour: { used_percentage: 4, resets_at: 1786111800 },
    seven_day: { used_percentage: 56, resets_at: 1786316400 },
  },
};

test("account name comes from the fixture file, not the real ~/.claude.json", () => {
  const out = render({
    claudeJson: { oauthAccount: { emailAddress: "tester@example.com" } },
    payload: PAYLOAD,
  });
  assert.match(out, /tester/);
});

test("no credits data -> no 'left' anywhere in the line", () => {
  const out = render({
    claudeJson: { oauthAccount: { emailAddress: "tester@example.com" } },
    payload: PAYLOAD,
  });
  assert.doesNotMatch(out, /left/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` (after Step 3's package.json edit, `node --test test/` works directly too)
Expected: FAIL — "account name comes from the fixture" asserts `/tester/` but the script reads the real `~/.claude.json` (shows the real account), because `STATUSLINE_CLAUDE_JSON` is not honored yet.

- [ ] **Step 3: Add the test script to package.json**

In `package.json`, after the `"bin"` block add:

```json
  "scripts": {
    "test": "node --test test/"
  },
```

- [ ] **Step 4: Implement the env overrides in statusline.mjs**

Replace the current `oauthAccount()` function (lines 83–87):

```js
function oauthAccount() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8")).oauthAccount || {};
  } catch { return {}; }
}
```

with:

```js
// ~/.claude.json, parsed once and shared (account identity + usage cache).
const CLAUDE_JSON = process.env.STATUSLINE_CLAUDE_JSON || join(homedir(), ".claude.json"); // test override
function claudeJson() {
  try { return JSON.parse(readFileSync(CLAUDE_JSON, "utf8")); } catch { return {}; }
}

function oauthAccount(cj) {
  return cj.oauthAccount || {};
}
```

In `main()`, replace `const oa = oauthAccount();` with:

```js
  const cj = claudeJson();
  const oa = oauthAccount(cj);
```

Change the `USAGE_CACHE` constant inside `main()` from:

```js
  const USAGE_CACHE = join(homedir(), ".claude", "statusline-usage.cache");
```

to:

```js
  const USAGE_CACHE = process.env.STATUSLINE_USAGE_CACHE || // test override
    join(homedir(), ".claude", "statusline-usage.cache");
```

Change the `MCP_CACHE` constant from:

```js
const MCP_CACHE = join(homedir(), ".claude", "mcp-status.cache");
```

to:

```js
const MCP_CACHE = process.env.STATUSLINE_MCP_CACHE || // test override
  join(homedir(), ".claude", "mcp-status.cache");
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: 2 pass, 0 fail.

- [ ] **Step 6: Sanity-check the real line still renders**

Run: `echo '{}' | node statusline.mjs | cat -v | head -5`
Expected: the boxed line renders with your real account name; no stack trace.

- [ ] **Step 7: Commit**

```bash
git add statusline.mjs test/credits.test.mjs package.json
git commit -m "test: harness with env-overridable file reads"
```

---

### Task 2: `creditsInfo()` + the credits section

**Files:**
- Modify: `statusline.mjs` (icon table, new `creditsInfo()`, `main()`, `buildGroups()`)
- Test: `test/credits.test.mjs`

**Interfaces:**
- Consumes: `claudeJson()` / `cj` from Task 1; existing `level(pct)`, `b(col, s)`, `d(s)` helpers.
- Produces: `creditsInfo(cj)` → `{ left: number, pct: number|null, age: number|null } | null`. `null` means "no section". Task 3 consumes the `age` field.

- [ ] **Step 1: Write the failing tests**

Append to `test/credits.test.mjs`:

```js
// -- credits section ---------------------------------------------------------

const OA = { emailAddress: "tester@example.com" };

function cjWith(extraUsage, fetchedAtMs = Date.now()) {
  return {
    oauthAccount: OA,
    cachedUsageUtilization: {
      fetchedAtMs,
      utilization: { extra_usage: extraUsage },
    },
  };
}

test("fresh balance: limit minus used (minor units) renders $61.50 left", () => {
  const out = render({
    claudeJson: cjWith({
      monthly_limit: 100, used_credits: 3850, utilization: 39,
      decimal_places: 2, currency: "USD",
    }),
    payload: PAYLOAD,
  });
  assert.match(out, /\$61\.50 left/);
});

test("unit cross-check: derived % far from reported % trusts the reported %", () => {
  // used_credits looks like plain dollars (50): derived 0.5% vs reported 50%
  const out = render({
    claudeJson: cjWith({
      monthly_limit: 100, used_credits: 50, utilization: 50, decimal_places: 2,
    }),
    payload: PAYLOAD,
  });
  assert.match(out, /\$50\.00 left/);
});

test("a real remaining_dollars field wins over arithmetic", () => {
  const out = render({
    claudeJson: cjWith({
      remaining_dollars: 12.34,
      monthly_limit: 100, used_credits: 0, utilization: 0, decimal_places: 2,
    }),
    payload: PAYLOAD,
  });
  assert.match(out, /\$12\.34 left/);
});

test("out_of_credits hides the section", () => {
  const out = render({
    claudeJson: cjWith({
      monthly_limit: 100, used_credits: 0, utilization: 0,
      decimal_places: 2, disabled_reason: "out_of_credits",
    }),
    payload: PAYLOAD,
  });
  assert.doesNotMatch(out, /left/);
});

test("spend_limit_reached hides the section", () => {
  const out = render({
    claudeJson: cjWith({
      monthly_limit: 100, used_credits: 2000, utilization: 20,
      decimal_places: 2, spend_limit_reached: true,
    }),
    payload: PAYLOAD,
  });
  assert.doesNotMatch(out, /left/);
});

test("zero left hides the section", () => {
  const out = render({
    claudeJson: cjWith({
      monthly_limit: 100, used_credits: 10000, utilization: 100, decimal_places: 2,
    }),
    payload: PAYLOAD,
  });
  assert.doesNotMatch(out, /left/);
});

test("unlimited limit with no remaining field hides the section", () => {
  const out = render({
    claudeJson: cjWith({
      monthly_limit: null, used_credits: 1240, utilization: 0, decimal_places: 2,
    }),
    payload: PAYLOAD,
  });
  assert.doesNotMatch(out, /left/);
});

test("malformed extra_usage neither crashes nor renders", () => {
  const out = render({
    claudeJson: cjWith("not-an-object"),
    payload: PAYLOAD,
  });
  assert.doesNotMatch(out, /left/);
  assert.match(out, /tester/); // line still rendered
});

test("enterprise seats never show credits", () => {
  const out = render({
    claudeJson: cjWith({
      monthly_limit: 100, used_credits: 3850, utilization: 39, decimal_places: 2,
    }),
    payload: PAYLOAD,
    env: { STATUSLINE_ENTERPRISE: "1" },
  });
  assert.doesNotMatch(out, /left/);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: the three positive tests (`$61.50 left`, `$50.00 left`, `$12.34 left`) FAIL — no credits section exists yet. The hide-tests pass vacuously; that's fine, they guard regressions from here on.

- [ ] **Step 3: Implement**

In the `I` icon table (after the `dollar` entry), add:

```js
  card: "\uf09d",   // credit-card = extra-usage credits
```

After the `isEnterprisePlan` function, add:

```js
// Extra-usage credits: money left, from the UNDOCUMENTED cachedUsageUtilization
// block of ~/.claude.json (no official statusline field carries a balance).
// Any surprise in shape or sign means null — section hidden, never a crash.
// used_credits units are unverified (minor units vs dollars): when the percent
// derived from it disagrees with the reported utilization, trust the percent.
function creditsInfo(cj) {
  try {
    const cu = cj.cachedUsageUtilization;
    const xu = cu?.utilization?.extra_usage;
    if (!xu || typeof xu !== "object") return null;
    if (xu.disabled_reason === "out_of_credits" || xu.spend_limit_reached === true) return null;
    const dp = Number.isFinite(xu.decimal_places) ? xu.decimal_places : 2;
    let left = null;
    if (Number.isFinite(xu.remaining_dollars)) {
      left = xu.remaining_dollars;
    } else if (Number.isFinite(xu.monthly_limit) && Number.isFinite(xu.used_credits)) {
      const used = xu.used_credits / 10 ** dp;
      left = xu.monthly_limit - used;
      if (Number.isFinite(xu.utilization) && xu.monthly_limit > 0) {
        const derived = (used / xu.monthly_limit) * 100;
        if (Math.abs(derived - xu.utilization) > 2) {
          left = xu.monthly_limit * (1 - xu.utilization / 100);
        }
      }
    }
    if (!Number.isFinite(left) || left <= 0) return null;
    const pct = Number.isFinite(xu.utilization) && Number.isFinite(xu.monthly_limit)
      ? xu.utilization : null;
    const age = Number.isFinite(cu.fetchedAtMs) ? Date.now() - cu.fetchedAtMs : null;
    return { left, pct, age };
  } catch { return null; }
}
```

In `main()`, next to `const mcp = mcpCounts();` add:

```js
  const credits = enterprise ? null : creditsInfo(cj);
```

In `buildGroups()`, between the 5h block and the week block, add:

```js
    //  credits — extra-usage money left; absent unless there is a positive number
    if (credits) {
      const col = credits.pct == null ? C.text : level(credits.pct);
      meters.push(`${C.ok}${I.card}${RS}  ${b(col, "$" + credits.left.toFixed(2))} ${d("left")}`);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (Task 1's two + these nine).

- [ ] **Step 5: Commit**

```bash
git add statusline.mjs test/credits.test.mjs
git commit -m "feat: extra-usage credits section — \$X left, hidden when 0/unknown"
```

---

### Task 3: Staleness age suffix

**Files:**
- Modify: `statusline.mjs` (new `fmtAge()`, credits group in `buildGroups()`)
- Test: `test/credits.test.mjs`

**Interfaces:**
- Consumes: `creditsInfo()`'s `age` field (ms since `fetchedAtMs`) from Task 2.
- Produces: `fmtAge(ms)` → `"45m" | "3h" | "16d"`.

- [ ] **Step 1: Write the failing tests**

Append to `test/credits.test.mjs`:

```js
// -- staleness ---------------------------------------------------------------

const FRESH_XU = { monthly_limit: 100, used_credits: 3850, utilization: 39, decimal_places: 2 };

test("fresh cache: no age suffix", () => {
  const out = render({ claudeJson: cjWith(FRESH_XU, Date.now()), payload: PAYLOAD });
  assert.match(out, /\$61\.50 left(?! \()/);
});

test("3-hour-old cache: (3h) suffix", () => {
  const out = render({
    claudeJson: cjWith(FRESH_XU, Date.now() - 3 * 3600 * 1000),
    payload: PAYLOAD,
  });
  assert.match(out, /\$61\.50 left \(3h\)/);
});

test("16-day-old cache: (16d) suffix", () => {
  const out = render({
    claudeJson: cjWith(FRESH_XU, Date.now() - 16 * 24 * 3600 * 1000),
    payload: PAYLOAD,
  });
  assert.match(out, /\$61\.50 left \(16d\)/);
});
```

- [ ] **Step 2: Run tests to verify the suffix tests fail**

Run: `npm test`
Expected: the `(3h)` and `(16d)` tests FAIL (no suffix rendered yet); the fresh test passes.

- [ ] **Step 3: Implement**

After `fmtDur` in `statusline.mjs`, add:

```js
// cache age → compact largest-unit form: 45m / 3h / 16d
function fmtAge(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
```

Replace the credits group in `buildGroups()` with:

```js
    //  credits — extra-usage money left; absent unless there is a positive number.
    // The balance is a cache Claude Code refreshes only occasionally — flag old readings.
    if (credits) {
      const col = credits.pct == null ? C.text : level(credits.pct);
      let g = `${C.ok}${I.card}${RS}  ${b(col, "$" + credits.left.toFixed(2))} ${d("left")}`;
      if (credits.age != null && credits.age > 3600 * 1000) g += ` ${d("(" + fmtAge(credits.age) + ")")}`;
      meters.push(g);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add statusline.mjs test/credits.test.mjs
git commit -m "feat: dim age suffix on stale credit balance"
```

---

### Task 4: Docs — header comment, README anatomy row, SVG bit

**Files:**
- Modify: `statusline.mjs` (header comment, lines 2–10)
- Create: `docs/bits/credits.svg`
- Modify: `README.md` (anatomy table, after the five.svg row at ~line 46)

**Interfaces:**
- Consumes: nothing from code — pure docs. The SVG reuses the embedded font subset from `docs/bits/cost.svg`, which already contains U+F09D (verified via its cmap).

- [ ] **Step 1: Update the header comment**

In the `statusline.mjs` header comment, change the row description line from:

```
// icon-led groups separated by dim │ — user · model+effort · output style ·
// context (bar + % + time-left) · 5h · week (wall-clock resets) · mcp ·
// session time.
```

to:

```
// icon-led groups separated by dim │ — user · model+effort · output style ·
// context (bar + % + time-left) · 5h · credits ($ left, when any) · week
// (wall-clock resets) · mcp · session time.
```

- [ ] **Step 2: Create `docs/bits/credits.svg`**

Copy the entire `<style>...</style>` block byte-for-byte from `docs/bits/cost.svg` (it embeds the icon-font subset including the credit-card glyph U+F09D). Build the file around it. Character cell is 7.8px, left/right padding 8px; content is `` + 2 spaces + `$61.50` + ` left` = 14 cells → width 125:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="125" height="24" viewBox="0 0 125 24"><style>[COPY THE FULL style BLOCK FROM cost.svg]</style><rect width="125" height="24" rx="6" fill="#131319"/><text y="17" xml:space="preserve"><tspan x="8.0" textLength="23.4" lengthAdjust="spacingAndGlyphs" style="fill:#9ece6a;">&#xf09d;  </tspan><tspan x="31.4" textLength="46.8" lengthAdjust="spacingAndGlyphs" style="fill:#9ece6a;font-weight:700;">$61.50</tspan><tspan x="78.2" textLength="39.0" lengthAdjust="spacingAndGlyphs" style="fill:#71718a;"> left</tspan></text></svg>
```

(The `[COPY THE FULL style BLOCK FROM cost.svg]` is the one substitution to make — everything from `<style>` to `</style>` inclusive. Use a script or careful copy; the base64 is one long line.)

Verify: open the SVG in a browser — green credit-card glyph, bold green `$61.50`, dim ` left` on the dark pill.

- [ ] **Step 3: Add the README anatomy row**

In `README.md`, directly after the five.svg row (the line containing `docs/bits/five.svg`), insert:

```markdown
| <img src="docs/bits/credits.svg" height="24"> | **Extra-usage credits**: dollars left on your credit balance. Appears only when there is money to show — no credits, $0, or unknown means the section vanishes. A dim age tag like `(16d)` marks a reading Claude Code hasn't refreshed lately |
```

- [ ] **Step 4: Run the full test suite one last time**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add statusline.mjs docs/bits/credits.svg README.md
git commit -m "docs: credits section — header comment, README anatomy row, SVG bit"
```
