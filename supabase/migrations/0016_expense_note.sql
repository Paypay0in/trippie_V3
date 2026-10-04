-- Whatever the traveller wanted to remember about a bill.
--
-- 「這個欄位不能輸入」. The box was already on the form, labelled 備註（選填） — and
-- `disabled`, with nothing behind it and nowhere to store it. 「這筆是跟 Gina 平分
-- 的那頓」 or 「收據在背包側袋」 had no home at the moment somebody wanted to write
-- it down.
--
-- Separate from `description`, which names the purchase and is what every list
-- shows. This is the sentence that explains it.
--
-- Syncs with the expense because both travellers read the same ledger: a note
-- explaining a bill belongs on the bill, not on whichever phone typed it.
alter table public.expenses
  add column if not exists note text;
