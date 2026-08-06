#!/usr/bin/env node
// fold-statusline CLI — install/uninstall the Fold deck line for Claude Code.
//   fold-statusline install     copy the status line to ~/.claude and enable it
//   fold-statusline uninstall   disable it and restore whatever was there before
//   fold-statusline status      show whether it is installed and enabled

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "statusline.mjs");
const CLAUDE_DIR = join(homedir(), ".claude");
const DEST = join(CLAUDE_DIR, "statusline.mjs");
const SETTINGS = join(CLAUDE_DIR, "settings.json");
const STATUS_LINE = { type: "command", command: "node ~/.claude/statusline.mjs", refreshInterval: 30 };

const ok = (s) => console.log(`\x1b[32m✓\x1b[0m ${s}`);
const warn = (s) => console.log(`\x1b[33m!\x1b[0m ${s}`);
const info = (s) => console.log(`  ${s}`);

function readSettings() {
  try { return JSON.parse(readFileSync(SETTINGS, "utf8")); } catch { return {}; }
}
function writeSettings(s) {
  writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
}
function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}
function fontInstalled() {
  if (process.platform !== "darwin") return null; // unknown elsewhere
  for (const dir of [join(homedir(), "Library", "Fonts"), "/Library/Fonts"]) {
    try {
      if (readdirSync(dir).some((f) => /nerd|maple.*nf|nf-|-nf/i.test(f))) return true;
    } catch { /* missing dir */ }
  }
  return false;
}

function install() {
  if (!existsSync(SRC)) { warn(`source not found: ${SRC}`); process.exit(1); }
  mkdirSync(CLAUDE_DIR, { recursive: true });
  if (existsSync(DEST) && readFileSync(DEST, "utf8") !== readFileSync(SRC, "utf8")) {
    const bak = `${DEST}.bak-${stamp()}`;
    copyFileSync(DEST, bak);
    ok(`existing status line backed up → ${bak.replace(homedir(), "~")}`);
  }
  copyFileSync(SRC, DEST);
  ok(`status line installed → ~/.claude/statusline.mjs`);

  const s = readSettings();
  const prev = s.statusLine;
  if (prev && prev.command !== STATUS_LINE.command) {
    s._statusLinePrevious = prev; // kept so uninstall can restore it
    info(`previous statusLine kept in settings as _statusLinePrevious`);
  }
  s.statusLine = STATUS_LINE;
  writeSettings(s);
  ok(`~/.claude/settings.json: statusLine enabled`);

  if (fontInstalled() === false) {
    warn(`no Nerd Font detected — icons will show as boxes.`);
    info(`fix: brew install --cask font-maple-mono-nf  (then set it as your terminal font)`);
  }
  info(`done — the deck line appears in Claude Code within ~30s (or next message).`);
}

function uninstall() {
  const s = readSettings();
  if (s.statusLine && s.statusLine.command === STATUS_LINE.command) {
    if (s._statusLinePrevious) {
      s.statusLine = s._statusLinePrevious;
      delete s._statusLinePrevious;
      ok(`settings.json: previous statusLine restored`);
    } else {
      delete s.statusLine;
      ok(`settings.json: statusLine removed`);
    }
    writeSettings(s);
  } else {
    info(`settings.json: statusLine is not ours — left untouched`);
  }
  const baks = existsSync(CLAUDE_DIR)
    ? readdirSync(CLAUDE_DIR).filter((f) => f.startsWith("statusline.mjs.bak-")).sort()
    : [];
  if (baks.length) {
    copyFileSync(join(CLAUDE_DIR, baks[baks.length - 1]), DEST);
    ok(`restored ~/.claude/statusline.mjs from ${baks[baks.length - 1]}`);
  } else if (existsSync(DEST)) {
    unlinkSync(DEST);
    ok(`removed ~/.claude/statusline.mjs`);
  }
  info(`done.`);
}

function status() {
  const installed = existsSync(DEST) && readFileSync(DEST, "utf8") === readFileSync(SRC, "utf8");
  const enabled = readSettings().statusLine?.command === STATUS_LINE.command;
  console.log(`script:   ${installed ? "installed (current version)" : existsSync(DEST) ? "present (different version)" : "not installed"}`);
  console.log(`settings: ${enabled ? "enabled" : "not enabled"}`);
  const font = fontInstalled();
  if (font !== null) console.log(`font:     ${font ? "Nerd Font found" : "NO Nerd Font found"}`);
}

const cmd = process.argv[2] || "install";
if (cmd === "install") install();
else if (cmd === "uninstall") uninstall();
else if (cmd === "status") status();
else {
  console.log(`fold-statusline — the Fold deck line for Claude Code
usage: fold-statusline [install|uninstall|status]   (default: install)`);
}
