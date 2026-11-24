#!/usr/bin/env node
/**
 * Hub hexagonal architecture boundary checks (dependency direction).
 *
 * Rules:
 * - domain: no frameworks/drivers, no env access, no application or
 *   infrastructure imports (the bottom layer; ports may reference lib types).
 * - application: no frameworks/drivers, no env access, no infrastructure
 *   imports (domain ports are allowed — the dependency arrow points inward).
 * - infrastructure/outbound: adapters must not reach into the inbound
 *   (delivery) layer nor import the WS framework.
 *
 * Usage: bun tools/hub-arch-checks.mjs
 * Exit code: 1 when violations are found, 0 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HUB = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'hub');
const SRC = path.join(HUB, 'src');

/** Runtime-e özgü paketler — core katmanlarda import EDİLEMEZ (kural 8). */
const FRAMEWORK_PACKAGES = ['fastify', '@fastify/', 'ws', 'bun:sqlite', 'node:sqlite'];

const ENV_PATTERN = /\b(?:process\.env|Bun\.env|import\.meta\.env)\b/;

const RULES = {
  domain: {
    dir: 'domain',
    forbiddenPackages: FRAMEWORK_PACKAGES,
    forbiddenPaths: [
      '../application',
      '../infrastructure',
      '../config',
      'src/application',
      'src/infrastructure',
      'src/config',
    ],
    envAccess: true,
  },
  application: {
    dir: 'application',
    forbiddenPackages: FRAMEWORK_PACKAGES,
    forbiddenPaths: [
      '../infrastructure',
      '../config',
      'src/infrastructure',
      'src/config',
    ],
    envAccess: true,
  },
  'infrastructure/outbound': {
    dir: 'infrastructure/outbound',
    forbiddenPackages: ['fastify', '@fastify/', 'ws'],
    forbiddenPaths: ['../inbound', 'src/infrastructure/inbound'],
    envAccess: false,
  },
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__test-helpers__') return [];
      return walk(full);
    }
    if (!entry.name.endsWith('.ts')) return [];
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [full];
  });
}

function importsOf(source) {
  const results = [];
  // `import type ... from 'x'` derlemede silinir: type-only import bir adapter'ı
  // isimlendirebilir ama runtime bağımlılığı kurmaz. Yön kuralları bunu sayar.
  const regex =
    /import\s+(type\s+)?[^;]*?\bfrom\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const line = source.slice(0, match.index).split('\n').length;
    results.push({
      specifier: match[2] ?? match[3] ?? match[4],
      line,
      typeOnly: Boolean(match[1]),
    });
  }
  return results;
}

function violationMatches(specifier, rule) {
  const pkg = rule.forbiddenPackages.find(
    (forbidden) =>
      specifier === forbidden ||
      specifier.startsWith(`${forbidden}`) ||
      specifier === forbidden.replace(/\/$/, ''),
  );
  if (pkg) return { kind: 'package', value: pkg };

  const relative = rule.forbiddenPaths.find(
    (forbidden) =>
      specifier.startsWith(`${forbidden}/`) ||
      specifier === forbidden ||
      specifier.includes(forbidden),
  );
  if (relative) return { kind: 'path', value: relative };

  return null;
}

const violations = [];

for (const [layer, rule] of Object.entries(RULES)) {
  const dir = path.join(SRC, rule.dir);
  for (const file of walk(dir)) {
    const normalized = path.relative(HUB, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    for (const imp of importsOf(source)) {
      const violation = violationMatches(imp.specifier, rule);
      if (violation) {
        violations.push({
          file: normalized,
          line: imp.line,
          specifier: imp.specifier,
          layer,
          rule: violation.kind,
          matched: violation.value,
        });
      }
    }
    if (rule.envAccess) {
      const envMatch = ENV_PATTERN.exec(source);
      if (envMatch) {
        violations.push({
          file: normalized,
          line: source.slice(0, envMatch.index).split('\n').length,
          specifier: envMatch[0],
          layer,
          rule: 'env',
          matched: 'env access outside infrastructure',
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    '✔ Hub architecture checks passed (domain / application / infrastructure)',
  );
  process.exit(0);
}

console.error(`✖ ${violations.length} architecture violation(s):\n`);
for (const v of violations) {
  const action = v.rule === 'env' ? 'accesses' : 'imports';
  console.error(
    `  ${v.file}:${v.line}  [${v.layer}] ${action} "${v.specifier}" (${v.rule}: ${v.matched})`,
  );
}
process.exit(1);
