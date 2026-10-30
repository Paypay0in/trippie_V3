# pending/

Staging area for the APP-IN-ENGLISH migration.

A translator working on a batch of files never edits `en.json` or `zh-Hant.json`
directly — several batches run at once and they would overwrite each other's
keys. Instead each batch writes two files here:

    <batch>.zh-Hant.json   the Chinese the screen already showed, verbatim
    <batch>.en.json        the English for the same keys

The Builder merges these into the real bundles and deletes the staging files.
`parity.test.ts` only reads the real bundles, so a batch is not finished until
its keys are merged.

Rules that hold for every batch:

- zh-Hant values are the existing strings copied exactly. A migration that
  also rewords the Chinese is two changes wearing one commit.
- Stored values, matching keys and regex anchors are not copy. Leave them and
  mark the line `// i18n-data: <reason>`.
- No product logic or data format changes.
