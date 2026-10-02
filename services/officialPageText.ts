/**
 * Reading an official page directly, when search is not available.
 *
 * Google Search grounding runs on its own quota, and on the day before this
 * trip every model answered 429 to it. The lookup fell back to memory, said
 * 「無法確認現況」 for K-ETA, and offered a link — while Korea's own notice board
 * had carried the answer since 2025-12-23: the exemption runs to 2026-12-31.
 * 「這是不專業的回答」, and it was: the page was one HTTP request away.
 *
 * So the server fetches the pages the answer already names. No search, no
 * quota, no key — just the site the traveller was being told to go and read.
 */

/** Only official-looking hosts are worth fetching, and never a private address. */
export const isFetchableOfficialUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
};

/** Collapses a page to readable text, capped so one page cannot flood a prompt. */
export const extractReadableText = (html: string, maxChars = 6000): string => {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = withoutCode
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxChars);
};

/** Every distinct official URL an answer points at, in the order it names them. */
export const officialUrlsFromAnswer = (parsed: unknown, limit = 3): string[] => {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (found.length >= limit || !node) return;
    if (typeof node === 'string') {
      if (/^https:\/\//i.test(node) && isFetchableOfficialUrl(node) && !found.includes(node)) found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object') Object.values(node as Record<string, unknown>).forEach(visit);
  };
  visit(parsed);
  return found;
};
