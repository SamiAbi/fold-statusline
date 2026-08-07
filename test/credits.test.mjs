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
      ...env,
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
