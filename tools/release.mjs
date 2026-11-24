#!/usr/bin/env node
/**
 * release — one-command release: gates → bump → sync READMEs → commit → tag → push.
 *
 * Usage: bun run release <patch|minor|major>
 *
 * Preflight is strict: clean tree, `main` branch, HEAD == origin/main.
 * The tag push triggers .github/workflows/release.yml:
 *   npm (lib) + Docker Hub (hub/agent) + GitHub Release agent binaries.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const LIB_PACKAGE = join(root, "lib/package.json");
const BUMP_TYPES = ["patch", "minor", "major"];
const README_FILES = ["README.md", "hub/README.md", "agent/README.md"];

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** Run a command with inherited stdio; abort the release on failure. */
function step(label, command, args) {
  console.log(`→ ${label}`);
  try {
    execFileSync(command, args, { cwd: root, stdio: "inherit" });
  } catch {
    fail(`${label} failed — release aborted`);
  }
}

/** Run a command and capture trimmed stdout. */
function read(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

function nextVersion(current, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (match === null) fail(`unexpected version in lib/package.json: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Rewrite `:X.Y.Z` (docker tags) and `vX.Y.Z` (release URLs) in the READMEs. */
function syncReadmeVersions(current, version) {
  for (const relative of README_FILES) {
    const file = join(root, relative);
    const before = readFileSync(file, "utf8");
    const after = before
      .replaceAll(`:${current}`, `:${version}`)
      .replaceAll(`v${current}`, `v${version}`);
    if (after === before) {
      console.log(`→ ${relative}: no ${current} reference (skipped)`);
      continue;
    }
    writeFileSync(file, after);
    console.log(`→ ${relative}: ${current} → ${version}`);
  }
  for (const relative of README_FILES) {
    const content = readFileSync(join(root, relative), "utf8");
    if (content.includes(`:${current}`) || content.includes(`v${current}`)) {
      fail(`${relative} still references ${current} after the bump`);
    }
  }
}

const bump = process.argv[2];
if (!BUMP_TYPES.includes(bump)) {
  fail(`usage: bun run release <${BUMP_TYPES.join("|")}>`);
}

// --- preflight (strict) ---
const branch = read("git", ["branch", "--show-current"]);
if (branch !== "main") fail(`must be on main (current: ${branch})`);

const dirty = read("git", ["status", "--porcelain"]);
if (dirty.length > 0) {
  fail(`working tree is not clean — commit or stash first:\n${dirty}`);
}

step("fetch origin", "git", ["fetch", "origin"]);

const ahead = Number(read("git", ["rev-list", "--count", "origin/main..HEAD"]));
if (ahead > 0) fail(`main has ${ahead} unpushed commit(s) — push them first`);

const behind = Number(read("git", ["rev-list", "--count", "HEAD..origin/main"]));
if (behind > 0) fail(`main is ${behind} commit(s) behind origin/main — pull first`);

const current = JSON.parse(readFileSync(LIB_PACKAGE, "utf8")).version;
const version = nextVersion(current, bump);
const tag = `v${version}`;

if (read("git", ["tag", "--list", tag]).length > 0) {
  fail(`tag ${tag} already exists`);
}

// --- gates (never tag a red tree) ---
step("typecheck", "bun", ["run", "typecheck"]);
step("architecture checks", "bun", ["run", "check"]);
step("tests", "bun", ["run", "test"]);

// --- bump (plain JSON write — `npm version` breaks in this bun workspace) ---
const pkg = JSON.parse(readFileSync(LIB_PACKAGE, "utf8"));
pkg.version = version;
writeFileSync(LIB_PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`→ bump lib ${current} → ${version}`);

syncReadmeVersions(current, version);

// --- commit + tag + push ---
step("stage release files", "git", [
  "add",
  "lib/package.json",
  ...README_FILES,
]);
step(`commit chore(release): lib ${version}`, "git", [
  "commit",
  "-m",
  `chore(release): lib ${version}`,
]);
step(`tag ${tag}`, "git", ["tag", tag]);
step("push main", "git", ["push", "origin", "main"]);
step(`push ${tag}`, "git", ["push", "origin", tag]);

console.log(
  `\n✔ ${tag} pushed — release.yml is running:\n` +
    `  • npm      zero-trust-application-channel@${version}\n` +
    `  • docker   zero-trust-application-channel-{hub,agent}:${version} + :latest\n` +
    `  • release  agent-arm64 + agent-x64 binaries\n`,
);
