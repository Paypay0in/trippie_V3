# Translator batch brief — APP-IN-ENGLISH

Read this before touching anything. Read `i18n/locales/pending/README.md` too.

## What you are doing

Moving hardcoded Traditional Chinese **traveller-visible copy** out of the
files you were assigned and into the locale bundles, so the same screen can
render in English. Chinese stays available — it is the fallback language.

## The convention, copied from an already-migrated file

`components/ShoppingListPanel.tsx` is the reference. It does:

```tsx
import { useTranslation } from 'react-i18next';
// inside the component:
const { t } = useTranslation();
// then:
{t('shopping.blurb')}
{t('shopping.boughtOfTotal', { bought, total })}
placeholder={t('shopping.searchPlaceholder')}
```

Interpolation uses `{{name}}` in the JSON value, never string concatenation.
Top-level sections that already exist in the bundles:
`account common expense history home itinerary language ledger nav phase plan
settle shopping summary trips app planner`.
Reuse an existing section when the screen belongs to it. Add a new top-level
section only when the screen genuinely is a new area; name it in lowerCamelCase
after the screen, e.g. `recap`, `marketplace`.

Key names describe the **role**, not the Chinese: `searchPlaceholder`,
`emptyState`, `confirmDelete`. Never `label1`, never a romanised Chinese word.

## Where your output goes

**Do not edit `i18n/locales/en.json` or `i18n/locales/zh-Hant.json`.** Not one
key, not even to make `parity.test.ts` pass. Every write to those files is a
read-modify-write of the whole document, so when two of us write them the last
writer silently wins and the other's keys are gone. This has already happened
once: a batch added 88 keys to the real bundles, a merge landed on top, and all
88 were lost while the suite stayed green. `parity.test.ts` reads the real
bundles and therefore cannot see your keys until the Builder merges them —
that is expected, and it is not a reason to touch the bundles.

Write exactly two files:

    i18n/locales/pending/<batch>.zh-Hant.json
    i18n/locales/pending/<batch>.en.json

`<batch>` is the batch name you were given. Both files hold the **same key
tree** — every key in one exists in the other. The Builder merges them into the
real bundles and deletes your two files.

## Rules that are not negotiable

0. **Run no git command that writes.** Not `stash`, not `reset`, not `checkout
   --`, not `restore`, not `add`, not `commit`, not `clean`. Several translators
   and the Builder share this one working tree, and all of today's work is
   uncommitted — a single `git stash` reverts everybody at once. One batch did
   exactly that on 2026-10-29 and wiped 300+ migrated strings out of the tree;
   they were recovered from `stash@{0}`, but only because somebody noticed the
   string count jump back up. `git diff`, `git status` and `git log` are fine.
   If your edit went wrong, fix it by editing the file forward.

1. **zh-Hant values are the existing string copied byte-exact.** If you also
   reword the Chinese, you have made two changes wearing one commit. Copy it.
2. **Never translate a stored value, a matching key or a regex anchor.** If the
   Chinese string is written to localStorage or Supabase, compared with `===`,
   used as an object key, or matched against scraped/model text, it is DATA.
   Leave it exactly where it is and put a comment on the line:
   `// i18n-data: <one-line reason>`. When in doubt, it is DATA — leave it.
   Known DATA shapes in this repo: `Category.*`, `PaymentMethod.*`,
   `brandNames`, `cityNames`, `countryIdentity`, `airportDirectory`,
   `productNouns`, passport/visa option values, anything in a `const` lookup
   whose keys are Chinese.
3. **No product logic or data-format changes.** No renamed props, no reordered
   conditions, no "while I was here" refactors. If you find a bug, write it in
   your final report; do not fix it.
4. **Comments and model prompts are not copy.** Chinese in a `//` or `/* */`
   comment stays. Chinese inside an AI prompt string stays — prompt language is
   a separate decision that has not been made.
5. **Place names, brand names and traveller-written text stay.** You are
   translating the product's own words, not the user's data.
6. English must read like product copy written in English — not a gloss of the
   Chinese. Sentence case, no trailing full stop on short labels, and keep it
   short enough to fit the same button.

## Before you finish

- `npx tsc --noEmit <your files>` is not meaningful alone; instead confirm the
  repo still typechecks no worse than its 49-error baseline:
  `npx tsc --noEmit 2>&1 | grep -c 'error TS'`.
- Run the tests that cover your files if any exist.
- Your two JSON files must both parse and have identical key trees.

## Report back

- the batch name and the files you changed
- how many strings you moved, and how many you marked `i18n-data` and why
- any string you could not classify, named explicitly, left untouched
- any defect you noticed and did not fix
