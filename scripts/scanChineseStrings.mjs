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
 *              Whole files are listed below; a single line says so for itself
 *              with `// i18n-data: <reason>`, because an otherwise finished
 *              screen can still hold one stored default or one anchored regex,
 *              and a count that cannot reach zero is a count nobody reads.
 *   COMMENT  — documentation for whoever reads the code next. Stays.
 *   PROMPT   — model instructions. Changing these changes what the AI answers.
 *              Settled: prompt language is independent of interface language,
 *              because `services/aiOutputLanguage.ts` decides what language the
 *              model replies in, so an English screen is served fine by a
 *              Chinese prompt. A line says so for itself with
 *              `// i18n-prompt: <reason>`; whole-file entries below cover the
 *              prompts that are template literals, where a marker on the line
 *              would be sent to the model as part of the instruction.
 *   DEVTOOL  — developer diagnostic overlays, reachable only by typing a query
 *              parameter (`?fold=1`, `?overflow=1`). No traveller can open
 *              them, so they are out of translation scope. `i18n-data` was the
 *              wrong marker for these — they are not stored data and saying so
 *              would have been a false statement — hence a kind of their own:
 *              `// i18n-devtool: <reason>`.
 *
 *    TRANSLATED — a string that already IS a translation, in a language whose
 *              script overlaps Chinese. Japanese display labels are the case:
 *              航空券 for the stored 機票 is finished work, not missing work,
 *              and only a line saying so can tell them apart. Marked with
 *              `// i18n-translated: <reason>`.
 *
 * COPY is the only kind that is work. The other five are each a decision that
 * has been made, which is what lets this reach `COPY: 0` and makes "done"
 * distinguishable from "nearly done".
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
  // Every Chinese string left in here is a `names:` entry on the voltage
  // table — the words a stored destination is matched against, in the same
  // array as their English spellings. Its one piece of copy, the Japan note,
  // moved to `plan.power.noteJp` and the row carries a `noteKey` instead. A
  // per-line marker on forty rows of a lookup table is noise; the file is
  // the unit, which is what this list is for.
  "powerAndPlugs.ts",
  // The country values and the `keywords` / `COUNTRY_ALIASES` rows a stored
  // destination and a generated task name are matched against. Its nine real
  // labels moved to `plan.official.*` and the two brand names (Visit Japan
  // Web, SG Arrival Card) are ASCII, so nothing displayed is left in here.
  "officialTravelLinks.ts",
  // Comparison tables and regexes only: the simplified-to-traditional map, the
  // praise-word classes, and the sentence-splitting punctuation. Every Chinese
  // character in this file is something scraped text is tested against, and
  // none of it is ever rendered — the module decides which note is worth
  // keeping, it does not write any.
  "itineraryImageSlices.ts",
]);
/*
  Files whose Chinese is addressed to the model, not to a traveller.

  These cannot be exempted line by line. The prompts are template literals, so
  a `// i18n-data:` comment inside one would be sent to the model as part of the
  instruction — the marker would change the thing it was describing. The file is
  the only honest unit here.

  Adding a file to this list hides any real copy it holds, so each one is only
  added once its copy has been moved out and checked: `expenseIntake.ts` was
  audited string by string and everything that remains is prompt text.
*/
const PROMPT_FILES = new Set([
  "server.ts",
  "expenseIntake.ts",
  // `flightLines`, `stayLines` and `anchorsBrief` are addressed to the planner
  // model, not to a traveller — 「不要當成完整的一天來排」, 「請以住宿地點為中心
  // 安排」. Its two real labels moved to `plan.anchor.*`, and the fallbacks
  // 目的地 / 機場 are inside those same instructions. Template literals again,
  // so a marker inside one would be sent to the model as part of the prompt.
  "planningAnchors.ts",
  // `stayPrompt` tells the model how to read a photo of a booking, and the
  // Chinese in it is the example phrasing it matches on — 「你能給我你日本家的
  // 地址嗎」, 「ハーモニーレジデンス浅草」, 「朋友家」. Template literal, so a
  // per-line marker would be sent to the model as part of the instruction.
  "stayIntake.ts",
  // The visa and shopping prompts: 「落地簽」 as an example answer, and the two
  // lines that ask the model to reply in Traditional Chinese. Same literal
  // problem, and what the model answers in is `aiOutputLanguage.ts`'s call.
  "geminiService.ts",
  // `flightPrompt` tells the model to return the weekday exactly as the ticket
  // prints it, and has to show it what that looks like — 「二」 from
  // 「10 月 20 日（二）」. Template literal again, so a marker inside one would be
  // sent to the model as part of the instruction it describes. Audited string
  // by string for batch-AD: the file's only other Chinese in code is the
  // `WEEKDAY_INDEX` lookup, which carries its own `i18n-data` marker, and it
  // holds no traveller-visible copy.
  "flightIntake.ts",
]);

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
};

const classify = (file, line, inBlockComment, previousLine = "") => {
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
  /*
    A line that says for itself which decision covers it. Checked before the
    whole-file lists below, because a marker written on the line is the more
    specific statement: `stayIntake.ts` is a prompt file and still holds five
    lines already marked `i18n-data`, and reporting those as PROMPT would lose
    what somebody had already established about them.
  */
  if (EXEMPT.test(line) || EXEMPT.test(previousLine)) return "DATA";
  if (DEVTOOL.test(line) || DEVTOOL.test(previousLine)) return "DEVTOOL";
  if (PROMPT_LINE.test(line) || PROMPT_LINE.test(previousLine)) return "PROMPT";
  if (TRANSLATED.test(line) || TRANSLATED.test(previousLine)) return "TRANSLATED";
  const base = file.split("/").pop();
  if (TRANSLATED_FILES.has(base)) return "TRANSLATED";
  if (PROMPT_FILES.has(base)) return "PROMPT";
  if (DATA_FILES.has(base)) return "DATA";
  /*
    A single line of Chinese that is a stored value, a matching key or a
    structural marker rather than text a traveller reads.

    Whole-file classification is not enough: a screen otherwise fully
    translated can still hold one `Category` default or one anchored regex that
    must keep its Chinese, and with nowhere to say so the remaining count never
    reaches zero. A count that cannot reach zero is a count nobody reads, and
    「翻完了嗎」 then has no answer but a guess.

    The reason is required, not decoration — `i18n-data` on its own is how a
    string a traveller does read gets quietly exempted. Write it on the line or
    the line above:

      // i18n-data: stored on every expense; translating orphans history
      return localStorage.getItem('trippie_origin_country') || '台灣';
  */
  return "COPY";
};

/** `i18n-data:` plus a reason of real words. */
const EXEMPT = /i18n-data:\s*\S+\s+\S+/;
/**
 * The same shape for the other two decisions, each needing its own reason.
 *
 * A marker with no reason is how a string a traveller does read gets quietly
 * exempted, so all three demand real words after the colon.
 */
const DEVTOOL = /i18n-devtool:\s*\S+\s+\S+/;
const PROMPT_LINE = /i18n-prompt:\s*\S+\s+\S+/;
/*
  A string that IS a translation, written in a language whose script this
  scanner cannot tell apart from Chinese.

  Japanese is the case that forced this: 航空券 and 宿泊 are correct Japanese
  display labels for the stored values 機票 and 住宿, and every character in
  them is in the same Unicode block the Han test looks for. Reported as COPY
  they read as seventeen strings somebody forgot to translate, which is the
  exact opposite of what they are. `i18n-data` would have been a lie — these
  are not stored values — and leaving them in COPY makes the count unable to
  reach zero, which is how a count stops being read at all.
*/
const TRANSLATED = /i18n-translated:\s*\S+\s+\S+/;

/**
 * Files whose CJK is finished translation rather than unfinished Chinese.
 *
 * Whole-file, because the alternative is a marker comment above all twenty-four
 * entries of a lookup table — noise that would be skimmed, and skimmed markers
 * are how a real string gets exempted by accident. `categoryDisplay` holds
 * nothing but display labels: English, Japanese, and the stored value itself,
 * which types.ts owns and this file only reads.
 */
const TRANSLATED_FILES = new Set(["categoryDisplay.ts"]);

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  let inBlock = false;
  const lines = readFileSync(file, "utf8").split("\n");
  lines
    .forEach((line, index) => {
      let kind = classify(rel, line, inBlock, index === 0 ? "" : lines[index - 1]);
      /*
        A line of code whose only Chinese sits in a comment on the same line.
        JSX writes these inline — `{placeWhereLabel(...)}{/* 「每個收藏給個標籤」
        *\/}{item.category && ...}` — and the line is not translatable text, it
        is a line carrying a note. Classified by the code that remains once the
        comment is removed, so documentation is never counted as copy.
      */
      if (kind === "COPY" && !HAN.test(line.replace(/\/\*[\s\S]*?\*\//g, " "))) kind = "COMMENT";
      // Update block state after classifying, so the opening `/**` counts as a
      // comment rather than the line after it.
      // Whichever marker comes last on the line decides the state the next
      // line starts in. Testing `includes` both ways got this wrong for the
      // one shape JSX produces constantly — a line that closes one comment
      // and opens another, `*/}{feed.map(...)=> ... {/*` — and the opened
      // comment was then read as code, reporting four lines of documentation
      // in `CommunityHome` and `SavedTravelDestinationDetail` as untranslated
      // copy. Copy that does not exist cannot be moved, so the count could
      // never reach zero.
      if (line.lastIndexOf("/*") > line.lastIndexOf("*/")) inBlock = true;
      else if (line.includes("*/")) inBlock = false;
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
