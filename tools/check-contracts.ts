/**
 * check-contracts — DIP sözleşmesi denetimi (B kuralı, K10).
 *
 * Kural B (DIP): scope dizinlerindeki (hub domain/application) sınıf
 * constructor parametreleri yalnız I- prefixed interface olabilir. Somut sınıf
 * veya 3. parti tip enjeksiyonu REDDEDİLİR. Metotsuz interface'ler data şekli
 * sayılır (config/DTO — muaf). `.d.ts` kaynaklılar (builtin) kapsam dışıdır.
 *
 * Kullanım: bun tools/check-contracts.ts [--scopes <dir>...]
 */
import ts from "typescript";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__test-helpers__") continue;
      out.push(...tsFiles(full));
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".spec.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function parseScopes(): string[] {
  const args = process.argv.slice(2);
  const scopesIdx = args.indexOf("--scopes");
  if (scopesIdx >= 0) {
    const dirs = args
      .slice(scopesIdx + 1)
      .filter((arg) => !arg.startsWith("--"))
      .map((dir) => resolve(root, dir));
    if (dirs.length > 0) return dirs;
  }
  return [
    join(root, "hub/src/domain"),
    join(root, "hub/src/application"),
  ];
}

const scopeDirs = parseScopes();
const scopeFiles = scopeDirs.flatMap((dir) => tsFiles(dir));
if (scopeFiles.length === 0) {
  console.error("[B] scope dizinlerinde .ts bulunamadı — kontrol boş geçti");
  process.exit(2);
}

const program = ts.createProgram({
  rootNames: scopeFiles,
  options: {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    baseUrl: join(root, "hub"),
    paths: {
      "zero-trust-application-channel": [join(root, "lib/src/index.ts")],
    },
  },
});
const checker = program.getTypeChecker();
const scopeSet = new Set(scopeFiles.map((file) => resolve(file)));
const violations: string[] = [];

/** Metotsuz interface = data şekli (config/DTO) — DI bağımlılığı değildir. */
function isDataShape(iface: ts.InterfaceDeclaration): boolean {
  return !iface.members.some((member) => ts.isMethodSignature(member));
}

function checkParam(
  typeNode: ts.TypeNode,
  where: string,
  sourceFile: ts.SourceFile,
): void {
  const type = checker.getTypeAtLocation(typeNode);
  const parts = type.isUnion() ? type.types : [type];
  for (const part of parts) {
    const symbol = part.getSymbol() ?? part.aliasSymbol;
    if (!symbol) continue; // primitive/literal/fonksiyon — kapsam dışı
    for (const decl of symbol.getDeclarations() ?? []) {
      if (decl.getSourceFile().isDeclarationFile) continue; // builtin — DIP kapsamı dışı
      if (ts.isInterfaceDeclaration(decl)) {
        if (!isDataShape(decl) && !decl.name.text.startsWith("I")) {
          violations.push(
            `[B] ${relative(root, sourceFile.fileName)} ${where} → interface "I" ile başlamalı: ${decl.name.text}`,
          );
        }
      } else if (ts.isClassDeclaration(decl)) {
        violations.push(
          `[B] ${relative(root, sourceFile.fileName)} ${where} → somut sınıf enjekte edilemez: ${decl.name?.text ?? "(anonim)"} (yalnız I- kontratları)`,
        );
      }
    }
  }
}

for (const sourceFile of program.getSourceFiles()) {
  if (sourceFile.isDeclarationFile) continue;
  if (!scopeSet.has(resolve(sourceFile.fileName))) continue;
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        if (!ts.isConstructorDeclaration(member)) continue;
        for (const param of member.parameters) {
          if (!param.type) continue; // tiplenmemiş parametre — kontrol dışı
          checkParam(
            param.type,
            `${node.name.text}.constructor(${param.name.getText()})`,
            sourceFile,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`contract violation: ${violation}`);
  }
  console.error(`check-contracts: ${violations.length} ihlal`);
  process.exit(1);
}
console.log(
  `check-contracts: temiz (scope: ${scopeFiles.length} dosya)`,
);
