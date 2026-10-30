/**
 * The server must never pull the browser's i18n into its runtime.
 *
 * `i18n/config.ts` imports react-i18next and `i18next-browser-languagedetector`.
 * Neither belongs in `server.ts`'s process, and a module-level import drags
 * them in whether the server ever calls the translated code or not.
 *
 * This is not hypothetical. During the English migration the edge appeared for
 * real — `server.ts → itineraryPlanningService → tripInspirationSelection →
 * placeCategory → i18n/config` — because a translator added `i18n` to a
 * lookup module that happened to sit on a chain the server used. It was
 * noticed by a reviewer reading import graphs by hand, and it was undone by
 * accident when an unrelated function moved out of the chain. Nothing stopped
 * it, and nothing would have stopped it coming back.
 *
 * So the rule that three service files were refused translation under is now
 * the rule this test enforces, instead of a convention everybody has to
 * remember. When it fails, the fix is never to translate less — it is to move
 * the wordless half of the offending module out, the way `enumerateTripDates`
 * went to `services/tripDates.ts`, so the words can live where only the
 * browser looks.
 *
 * `import type` edges are deliberately ignored: they are erased at build and
 * cost the server nothing. `services/aiOutputLanguage.ts` has one on purpose.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';

const ROOT = process.cwd();
const ENTRY = 'server.ts';
const FORBIDDEN = normalize('i18n/config.ts');

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?([\s\S]*?)from\s+['"]([^'"]+)['"]/gm;

const resolveSpec = (spec: string, from: string): string | undefined => {
  if (!spec.startsWith('.')) return undefined;
  const base = normalize(join(dirname(from), spec));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(resolve(ROOT, candidate))) return normalize(candidate);
  }
  return undefined;
};

/** Only the edges that survive to runtime: `import type` is erased. */
const runtimeImports = (file: string): string[] => {
  let source: string;
  try {
    source = readFileSync(resolve(ROOT, file), 'utf8');
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const [, typeKeyword, clause, spec] = match;
    const inlineTypeOnly = clause.includes('{')
      && clause
        .trim()
        .replace(/^.*?\{/s, '')
        .replace(/\}.*$/s, '')
        .split(',')
        .filter(part => part.trim())
        .every(part => part.trim().startsWith('type '));
    if (typeKeyword || inlineTypeOnly) continue;
    const target = resolveSpec(spec, file);
    if (target) out.push(target);
  }
  return out;
};

/** Every module the server loads at runtime, and how it got there. */
const walk = (): { reached: Set<string>; via: Map<string, string> } => {
  const reached = new Set<string>();
  const via = new Map<string, string>();
  const stack = [ENTRY];
  while (stack.length) {
    const current = stack.pop() as string;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of runtimeImports(current)) {
      if (!via.has(next)) via.set(next, current);
      stack.push(next);
    }
  }
  return { reached, via };
};

const chainTo = (target: string, via: Map<string, string>): string => {
  const chain = [target];
  let node = target;
  while (via.has(node)) {
    node = via.get(node) as string;
    chain.push(node);
    if (node === ENTRY) break;
  }
  return chain.reverse().join(' -> ');
};

describe('the server and the browser keep their own i18n', () => {
  const { reached, via } = walk();

  it('reaches server.ts itself, so the walk is actually walking', () => {
    expect(reached.has(ENTRY)).toBe(true);
    expect(reached.size).toBeGreaterThan(10);
  });

  it('never reaches i18n/config at runtime', () => {
    const message = reached.has(FORBIDDEN) ? chainTo(FORBIDDEN, via) : '';
    expect(message, `server.ts loads the browser i18n via:\n  ${message}`).toBe('');
  });

  it('never reaches react-i18next or the browser language detector', () => {
    const guilty: string[] = [];
    for (const file of reached) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      for (const match of source.matchAll(IMPORT)) {
        const [, typeKeyword, , spec] = match;
        if (typeKeyword) continue;
        if (spec === 'react-i18next' || spec === 'i18next-browser-languagedetector') {
          guilty.push(`${file} imports ${spec}`);
        }
      }
    }
    expect(guilty).toEqual([]);
  });
});
