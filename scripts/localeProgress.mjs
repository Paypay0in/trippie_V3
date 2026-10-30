#!/usr/bin/env node
/**
 * How far a locale bundle has got, by section.
 *
 * "Mostly done" is not a measurement and this project has already paid for
 * that once today. Compares a bundle against en.json, which is the complete
 * one, and prints what is missing per top-level section so the next batch is
 * chosen from evidence rather than memory.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const locale = process.argv[2] || 'ja';
const ROOT = new URL('..', import.meta.url).pathname;
const read = (name) => JSON.parse(readFileSync(join(ROOT, 'i18n', 'locales', name), 'utf8'));

const flat = (node, prefix = '') =>
  node && typeof node === 'object'
    ? Object.entries(node).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (keys) => new Set(keys.map((k) => k.replace(PLURAL, '')));

const target = join(ROOT, 'i18n', 'locales', `${locale}.json`);
const have = existsSync(target) ? base(flat(read(`${locale}.json`))) : new Set();
const want = base(flat(read('en.json')));

const missingBySection = {};
let missing = 0;
for (const key of want) {
  if (have.has(key)) continue;
  missing += 1;
  const section = key.split('.')[0];
  missingBySection[section] = (missingBySection[section] || 0) + 1;
}

const done = want.size - missing;
const pct = ((done / want.size) * 100).toFixed(1);
console.log(`${locale}: ${done}/${want.size} keys (${pct}%), ${missing} to go\n`);
Object.entries(missingBySection)
  .sort((a, b) => b[1] - a[1])
  .forEach(([section, n]) => console.log(String(n).padStart(5) + '  ' + section));
