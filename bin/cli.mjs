#!/usr/bin/env node
// fold-statusline CLI — install/uninstall the Fold deck line for Claude Code.
//   fold-statusline install     copy the status line to ~/.claude and enable it
//                               (installs Maple Mono NF when no Nerd Font is found)
//   fold-statusline font        install the font + show how to enable it in your terminal
//
// Icons: inside Fold the statusline uses Fold Icons, which ships INSIDE the
// Fold app (color bitmap glyphs; nothing to install here). Everywhere else it
// uses Nerd Font glyphs, which is what the Maple Mono NF install is for.
//   fold-statusline uninstall   disable it and restore whatever was there before
//   fold-statusline status      show whether it is installed and enabled

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, unlinkSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(PKG, "statusline.mjs");
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
function fontDirs() {
  if (process.platform === "darwin") return [join(homedir(), "Library", "Fonts"), "/Library/Fonts"];
  if (process.platform === "linux") return [join(homedir(), ".local", "share", "fonts"), "/usr/share/fonts"];
  return [];
}
function fontInstalled() {
  const dirs = fontDirs();
  if (dirs.length === 0) return null; // unknown platform
  for (const dir of dirs) {
    try {
      if (readdirSync(dir).some((f) => /nerd|maple.*nf|nf-|-nf/i.test(f))) return true;
    } catch { /* missing dir */ }
  }
  return false;
}
function hasCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: "ignore", shell: "/bin/sh" }); return true; }
  catch { return false; }
}

const FONT_ZIP = "https://github.com/subframe7536/maple-font/releases/latest/download/MapleMono-NF.zip";

// Install Maple Mono NF: Homebrew when available, otherwise direct download
// into the user font dir (no admin needed). Returns true when a Nerd Font is
// present afterwards.
function installFont() {
  if (fontInstalled()) { ok(`Nerd Font already installed`); return true; }
  if (process.platform === "darwin" && hasCmd("brew")) {
    info(`installing Maple Mono NF (brew cask)…`);
    try {
      execSync("brew install --cask font-maple-mono-nf", { stdio: "inherit" });
      ok(`Maple Mono NF installed`);
      return true;
    } catch { warn(`brew install failed — falling back to direct download`); }
  }
  const dir = fontDirs()[0];
  if (!dir) { warn(`automatic font install isn't supported on this OS — get one at nerdfonts.com`); return false; }
  try {
    info(`downloading Maple Mono NF…`);
    const zip = join(tmpdir(), "MapleMono-NF.zip");
    execSync(`curl -fsSL -o "${zip}" "${FONT_ZIP}"`, { stdio: "inherit" });
    mkdirSync(dir, { recursive: true });
    execSync(`unzip -o -q "${zip}" "*.ttf" -d "${dir}"`, { stdio: "inherit" });
    if (process.platform === "linux" && hasCmd("fc-cache")) execSync("fc-cache -f", { stdio: "ignore" });
    ok(`Maple Mono NF installed → ${dir.replace(homedir(), "~")}`);
    return true;
  } catch {
    warn(`font download failed — install manually: https://github.com/subframe7536/maple-font/releases`);
    return false;
  }
}

// The font must also be SELECTED in the terminal — per-app config we mostly
// can't write for the user. Ghostty's plain config file is the exception;
// for everything else, print the exact place to change it.
function fontEnableHint() {
  const tp = process.env.TERM_PROGRAM ?? "";
  if (tp === "ghostty" || process.env.GHOSTTY_RESOURCES_DIR) {
    const cfg = join(homedir(), ".config", "ghostty", "config");
    try {
      const cur = existsSync(cfg) ? readFileSync(cfg, "utf8") : "";
      if (/^\s*font-family\s*=/m.test(cur)) {
        info(`Ghostty: set  font-family = Maple Mono NF  in ~/.config/ghostty/config`);
      } else {
        mkdirSync(dirname(cfg), { recursive: true });
        appendFileSync(cfg, `${cur.endsWith("\n") || cur === "" ? "" : "\n"}font-family = Maple Mono NF\n`);
        ok(`Ghostty config updated (font-family = Maple Mono NF) - reload with cmd+shift+,`);
      }
    } catch { info(`Ghostty: add  font-family = Maple Mono NF  to ~/.config/ghostty/config`); }
    return;
  }
  if (tp === "Apple_Terminal") info(`enable it: Terminal ▸ Settings… ▸ Profiles ▸ Text ▸ Font → "Maple Mono NF"`);
  else if (tp === "iTerm.app") info(`enable it: iTerm2 ▸ Settings ▸ Profiles ▸ Text ▸ Font → "Maple Mono NF"`);
  else if (tp === "vscode") info(`enable it: VS Code settings → "terminal.integrated.fontFamily": "Maple Mono NF"`);
  else if (tp === "WezTerm") info(`enable it: wezterm.lua → font = wezterm.font("Maple Mono NF")`);
  else info(`enable it: set your terminal's font to "Maple Mono NF"`);
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
    warn(`no Nerd Font detected — icons would show as boxes. Installing one:`);
    if (installFont()) fontEnableHint();
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
else if (cmd === "font") { installFont(); fontEnableHint(); }
else {
  console.log(`fold-statusline — the Fold deck line for Claude Code
usage: fold-statusline [install|font|uninstall|status]   (default: install)`);
}
