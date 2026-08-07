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
