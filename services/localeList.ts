/**
 * Joining a list for display, in the reader's language.
 *
 * 「C、F」 in Chinese is "C, F" in English: the separator is copy, so no module
 * that holds data may pick one. A descriptor carries the raw `string[]` and
 * this is the single place it becomes a sentence — the alternative is every
 * caller hardcoding 、 and English reading as Chinese punctuation.
 */
export type Translate = (key: string) => string;

export const joinList = (items: string[], t: Translate): string =>
  items.join(t('common.listSeparator'));

/** Resolves `string[]` params to joined strings, leaving scalars untouched. */
export const interpolationFor = (
  params: Record<string, string | number | string[]> | undefined,
  t: Translate,
): Record<string, string | number> | undefined => {
  if (!params) return undefined;
  const out: Record<string, string | number> = {};
  Object.entries(params).forEach(([key, value]) => {
    out[key] = Array.isArray(value) ? joinList(value, t) : value;
  });
  return out;
};
