#!/usr/bin/env node
/**
 * Every piece of Chinese a traveller can still see.
 *
 * The product was written Chinese-first and is being moved into `i18n/locales`
 * a screen at a time. "Most of it is done" is not a measurement, so this is:
 * it walks the source, classifies every line holding Han characters, and
 * prints what is left to move.
 *
 * Classification matters more than the count. Three kinds of Chinese live in
 * this repo and only one of them is translatable:
 *
 *   COPY     — text a traveller reads. Must move into the locale bundles.
 *   DATA     — enum values and lookup keys (`Category.FLIGHT = '機票'`), which
 *              are written to localStorage and Supabase. Translating these
 *              orphans every expense ever recorded. Display-only mapping.
 *   COMMENT  — documentation for whoever reads the code next. Stays.
 *   PROMPT   — model instructions in server.ts. Changing these changes what
 *              the AI answers, which is a separate decision.
 *
 * Usage:
 *   node scripts/scanChineseStrings.mjs            # summary by file
 *   node scripts/scanChineseStrings.mjs --list     # every line
 *   node scripts/scanChineseStrings.mjs --json     # machine readable
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
/*
  Han characters and the CJK punctuation that only appears beside them — 「」、
  ・ and the rest. Fullwidth ASCII (U+FF01–FF5E) is deliberately excluded: a
  lone ＋ on a button is a symbol, not text to translate, and counting it
  reported a finished screen as unfinished.
*/
const HAN = /[㐀-䶿一-鿿、-〿｟-･]/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "ios",
  "android",
  "scripts",
]);

/**
 * Files whose Chinese is data, not copy.
 *
 * Two sorts. `types.ts` holds enum values that are written to storage, so the
 * Chinese literal IS the stored value. The rest are lookup tables keyed by
 * Chinese — place names, brand names, product nouns — and the Founder's
 * instruction is explicit that place and brand names keep their own spelling.
 * Translating a matching key does not localise anything; it breaks the match.
 */
const DATA_FILES = new Set([
  "types.ts",
  "productNouns.ts",
  "brandNames.ts",
  "cityNames.ts",
  "countryIdentity.ts",
  "airportDirectory.ts",
  "destinationFromTripName.ts",
]);
const PROMPT_FILES = new Set(["server.ts"]);

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
};

const classify = (file, line, inBlockComment) => {
  const trimmed = line.trim();
  if (
    inBlockComment ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    // A one-line JSX comment is documentation like any other. Counting it as
    // copy makes a finished screen look unfinished, which is the sort of
    // inaccuracy that gets a progress number ignored.
    // Either the whole comment on one line, or the line that opens a
    // multi-line one — the block tracking below handles the rest of it.
    /^\{\s*\/\*/.test(trimmed)
  ) {
    return "COMMENT";
  }
  const base = file.split("/").pop();
  if (PROMPT_FILES.has(base)) return "PROMPT";
  if (DATA_FILES.has(base)) return "DATA";
  return "COPY";
};

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  let inBlock = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const kind = classify(rel, line, inBlock);
      // Update block state after classifying, so the opening `/**` counts as a
      // comment rather than the line after it.
      if (line.includes("/*") && !line.includes("*/")) inBlock = true;
      if (line.includes("*/")) inBlock = false;
      if (!HAN.test(line)) return;
      findings.push({ file: rel, line: index + 1, kind, text: line.trim() });
    });
}

const byKind = findings.reduce((acc, f) => {
  acc[f.kind] = (acc[f.kind] || 0) + 1;
  return acc;
}, {});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ byKind, findings }, null, 2));
} else if (process.argv.includes("--list")) {
  for (const f of findings.filter((f) => f.kind === "COPY")) {
    console.log(`${f.file}:${f.line}  ${f.text.slice(0, 120)}`);
  }
} else {
  const perFile = new Map();
  for (const f of findings) {
    if (f.kind !== "COPY") continue;
    perFile.set(f.file, (perFile.get(f.file) || 0) + 1);
  }
  console.log("by kind:", byKind);
  console.log(`\nfiles holding untranslated copy: ${perFile.size}\n`);
  [...perFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([file, n]) => console.log(`${String(n).padStart(5)}  ${file}`));
}
