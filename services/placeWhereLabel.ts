/**
 * Where something is, said once.
 *
 * 「這個我手動加入的景點」 — and under its name it read 「日本・日本」.
 *
 * The root cause is fixed upstream: a saved place now takes its town from
 * Google rather than from the trip's own destination field, which on a trip
 * built from a boarding pass can hold the country. But saves already on
 * devices carry the duplicate, and a line that names one place twice should
 * never render whatever produced it.
 *
 * Parts are kept in the order the caller passed them, because screens differ
 * on whether they read outward（國・市）or inward（市・國）and this is not the
 * place to settle that.
 *
 * A city that genuinely *is* its country — 新加坡, 香港, 摩納哥 — collapses here
 * too, and for those 「新加坡・新加坡」 was always the wrong line.
 */
export const placeWhereLabel = (...parts: Array<string | undefined>): string => {
  const seen = new Set<string>();
  return parts
    .map(part => (part || '').trim())
    .filter(part => {
      if (!part) return false;
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('・');
};
