/**
 * Whether a page is a shop selling the thing, or writing about it.
 *
 * 「這個點進去明顯是錯誤」 — `roomie.tw/posts/157366` was quoted as a Taiwanese
 * price of NT$389. Every check it faced, it passed: the address says Taiwan,
 * the page opened, and the page published a `Product` with a price in its
 * structured data. It is an article, and the 389 belongs to something else
 * mentioned in it.
 *
 * Publishers embed product data on purpose — that is how an article earns an
 * affiliate link — so the structured price is real data about a real product
 * and still the wrong answer to 「what does this cost」. Nothing downstream can
 * tell: a price with a currency and a reachable page is exactly what a shop
 * looks like.
 *
 * One module because two callers need the same judgement and have needed it
 * twice already. The picture search wants it to rank a shop's photograph
 * above a magazine's styled shot; the price search wants it to refuse a
 * quote outright. Same question, different consequence — which is why this
 * answers the question and lets each caller decide what to do about it.
 */

/**
 * Hosts that publish rather than sell.
 *
 * Only ones seen doing it. A list of every magazine on earth would be a
 * maintenance burden pretending to be a rule; these are the ones that have
 * actually turned up in a search for a product on this list.
 */
const PUBLISHER = /roomie\.tw|elle\.|vogue|marieclaire|cosmopolitan|popbee|harpersbazaar|beauty321|bella\.tw|mombaby|businessweekly|storm\.mg|ettoday|setn\.com|ltn\.com|udn\.com|chinatimes|lipscosme|hypebeast|engadget|mobile01|kocpc|t客邦|techbang/i;

/**
 * Paths that mean 「an article about things」 rather than 「a thing for sale」.
 *
 * The shape is the same in every language a shop writes in: a post has an
 * editorial segment in its path, a product has a product one.
 */
const ARTICLE = /\/(posts?|articles?|blogs?|news|reviews?|columns?|magazine|stories|story|guide|tips|feature|editorial|topics?)(\/|$)/i;

/** Where either the host or the path says this is somebody writing. */
export const looksEditorial = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return PUBLISHER.test(parsed.hostname) || ARTICLE.test(parsed.pathname);
  } catch {
    return false;
  }
};

/**
 * Marketplaces where the seller is a person clearing out a drawer.
 *
 * 「請擋二手」. mercari quoted ¥300 for 無印's cleansing sheets against a shop
 * price several times that, and every check passed: a real product page, a
 * real price, the right product. It is simply not an answer to the question
 * the list is asking — 「how much will this cost me in Japan」 means in a shop,
 * on a shelf, at a price that will still be there next week.
 *
 * A used listing is one item, sold once, at whatever one stranger wanted for
 * it. Printed beside 松本清's price it reads as the same kind of fact and is
 * not, and a traveller who plans around it finds nothing when they arrive.
 *
 * Only platforms that are used goods by default, and only hosts — not paths.
 * 露天拍賣 and 蝦皮 are full of small shops selling new stock, and refusing
 * them would cost far more real prices than it saves; a flea market is not
 * 「anywhere an individual can list」, it is 「where the normal listing is
 * somebody's own used one」.
 */
const SECOND_HAND = new RegExp([
  // 日本
  'mercari', 'fril\\.jp', 'rakuma', 'paypayfleamarket', 'auctions\\.yahoo',
  'aucfan', 'jauce', 'buyee', 'zenmarket', 'sellinall',
  '2ndstreet', 'hardoff', 'bookoff', 'surugaya', 'mandarake',
  // 其他
  'ebay\\.', 'carousell', 'poshmark', 'vinted', 'depop', 'gumtree', 'craigslist',
].join('|'), 'i');

/**
 * Whether this listing is somebody reselling their own one.
 *
 * Separate from `looksEditorial` because the reason differs and a reader of
 * this code should see which rule refused a page. Same consequence in the
 * price search; the picture search does not care, since a used listing's
 * photograph is still a photograph of the product.
 */
export const looksSecondHand = (url: string): boolean => {
  try {
    return SECOND_HAND.test(new URL(url).hostname);
  } catch {
    return false;
  }
};
