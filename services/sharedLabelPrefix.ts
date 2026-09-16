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

const commonPrefix = (first: string, second: string): string => {
  let index = 0;
  while (index < first.length && index < second.length && first[index] === second[index]) {
    index += 1;
  }
  return first.slice(0, index);
};

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

  // Per name, not across the whole set. A country's formalities are rarely all
  // named alike: Japan's list is 簽證豁免 plus two 「Visit Japan Web 申報（…）」
  // entries, and requiring a prefix common to every tile meant the two that did
  // collide kept their identical titles.
  const parts = cleaned.map((name, index) => {
    let best = '';
    cleaned.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      const shared = commonPrefix(name, other).replace(TRAILING_NOISE, '').trim();
      if (shared.length > best.length) best = shared;
    });
    if (best.length < MIN_SHARED_LENGTH) return name;
    const remainder = name
      .slice(best.length)
      .replace(LEADING_NOISE, '')
      .replace(TRAILING_NOISE, '')
      .trim();
    // A name that is entirely the shared part would be left blank, which is
    // worse than repeating it.
    return remainder || name;
  });

  const shared = longestCommonPrefix(cleaned).replace(TRAILING_NOISE, '').trim();
  return { shared: shared.length >= MIN_SHARED_LENGTH ? shared : '', parts };
};
