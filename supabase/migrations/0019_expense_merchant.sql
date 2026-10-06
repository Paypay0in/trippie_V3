-- The shop as printed on the receipt.
--
-- 「會代入但不會翻譯」. The title a photographed receipt produces is now in
-- Traditional Chinese, so the ledger can be read at a glance — which leaves
-- nothing that matches the paper in the traveller's hand or the line on the
-- card statement. 광안리 대교밀면 and 廣安里 大橋麥麵 are both needed, for
-- different questions.
--
-- Deliberately not a second description: `description` is the name, editable
-- and shown everywhere, and this is evidence of where it came from. Nothing
-- rewrites it after the parse.
alter table public.expenses
  add column if not exists merchant text;
