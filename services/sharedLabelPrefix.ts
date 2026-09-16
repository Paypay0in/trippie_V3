/**
 * Pulling the shared part out of a set of tile names.
 *
 * Japan's entry formalities are all called 「Visit Japan Web 申報（入境審查）」,
 * 「…（海關申報）」 and so on. Shown as titles they are three tiles that read
 * identically, and the one word that distinguishes them is the last one. The
 * common prefix is the label of the group, not of any tile in it.
 *
 * Only applied when it actually helps: a prefix long enough to matter, and a
 * remainder left for every name. Korea's 「K-ETA」/「Q-Code」/「海關申報」 share
 * nothing and are returned untouched.
 */

export interface SharedLabelSplit {
  /** Common opening text, or '' when the names have nothing useful in common. */
  shared: string;
  /** Each name with the shared part removed, tidied of leading punctuation. */
  parts: string[];
}

const MIN_SHARED_LENGTH = 4;
const LEADING_NOISE = /^[\s:：（(【「·\-—]+/;
const TRAILING_NOISE = /[\s（(【「·\-—：:）)】」]+$/;

const longestCommonPrefix = (values: string[]): string => {
  if (values.length < 2) return '';
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) {
      index += 1;
    }
    prefix = prefix.slice(0, index);
    if (!prefix) break;
  }
  return prefix;
};

export const splitSharedPrefix = (names: string[]): SharedLabelSplit => {
  const cleaned = names.map(name => (name || '').trim());
  const prefix = longestCommonPrefix(cleaned).replace(TRAILING_NOISE, '').trim();

  if (prefix.length < MIN_SHARED_LENGTH) return { shared: '', parts: cleaned };

  const parts = cleaned.map(name =>
    name.slice(prefix.length).replace(LEADING_NOISE, '').replace(TRAILING_NOISE, '').trim(),
  );
  // A name that is entirely the shared prefix would be left blank, which is
  // worse than showing the full names.
  if (parts.some(part => !part)) return { shared: '', parts: cleaned };

  return { shared: prefix, parts };
};
