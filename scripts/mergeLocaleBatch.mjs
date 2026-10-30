#!/usr/bin/env node
/**
 * Merges one batch of translations into a locale bundle.
 *
 * A new language is 2,906 strings, which is more than fits in one sitting. The
 * risk that comes with batching is a later batch silently dropping an earlier
 * one — the shape that has already cost this repo a day, when parallel workers
 * shared a tree and one of them reverted the others. So this merges rather
 * than writes: it reads what is there, adds the batch, and refuses to change a
 * key that already has a different value unless --overwrite says so.
 *
 * Reads a flat `{"a.b.c": "値"}` map on stdin or from a file, writes nested
 * JSON in the same shape as the other bundles.
 *
 * Usage:
 *   node scripts/mergeLocaleBatch.mjs ja batch.json
 *   node scripts/mergeLocaleBatch.mjs ja batch.json --overwrite
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , locale, batchPath, ...flags] = process.argv;
if (!locale || !batchPath) {
  console.error('usage: mergeLocaleBatch.mjs <locale> <batch.json> [--overwrite]');
  process.exit(2);
}

const overwrite = flags.includes('--overwrite');
const ROOT = new URL('..', import.meta.url).pathname;
const target = join(ROOT, 'i18n', 'locales', `${locale}.json`);

const bundle = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
const batch = JSON.parse(readFileSync(batchPath, 'utf8'));

const get = (root, path) =>
  path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), root);

const set = (root, path, value) => {
  const parts = path.split('.');
  const last = parts.pop();
  let node = root;
  for (const part of parts) {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
    node = node[part];
  }
  node[last] = value;
};

let added = 0;
let unchanged = 0;
const conflicts = [];

for (const [key, value] of Object.entries(batch)) {
  const existing = get(bundle, key);
  if (existing === undefined) {
    set(bundle, key, value);
    added += 1;
  } else if (existing === value) {
    unchanged += 1;
  } else if (overwrite) {
    set(bundle, key, value);
    added += 1;
  } else {
    conflicts.push(`${key}\n  have: ${JSON.stringify(existing)}\n  batch: ${JSON.stringify(value)}`);
  }
}

if (conflicts.length) {
  console.error(`refusing to change ${conflicts.length} existing key(s); pass --overwrite if that is intended:\n${conflicts.join('\n')}`);
  process.exit(1);
}

writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`);

const count = (node) =>
  typeof node === 'object' && node !== null
    ? Object.values(node).reduce((sum, child) => sum + count(child), 0)
    : 1;

console.log(`${locale}.json  +${added} added, ${unchanged} already present, ${count(bundle)} keys total`);
