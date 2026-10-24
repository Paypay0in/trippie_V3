-- Product pages the traveller named, when the search cannot find them.
--
-- 「這兩個我隨便搜都知道價格」 — about two CHANEL rows. Chanel publishes no price
-- anywhere a program can reach, not even one written for a person, and every
-- page a search returns is a department store's brand index. Nothing about
-- searching better reaches it, and a traveller can produce the right page in
-- thirty seconds.
--
-- One page per country, keyed by ISO code: {"JP": "https://…", "TW": "https://…"}.
-- jsonb rather than two columns, because the pair being compared is a per-trip
-- choice out of twelve countries and not a fixed 日本/台灣.
--
-- Nullable with no default: absent means nobody named one, which is almost
-- every row, and the lookup searches as it always did.

alter table public.shopping_items
  add column if not exists price_urls jsonb;

comment on column public.shopping_items.price_urls is
  'Product page URLs chosen by the traveller, keyed by ISO country code. Read instead of searching when present.';
