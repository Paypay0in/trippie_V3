-- Receipts photographed for an expense.
--
-- 「帳目中可以新增照片 剛點擊沒有反應」: the button existed, disabled, titled
-- 照片功能尚未開放. A receipt is the evidence behind a split two people settle
-- from, so it belongs beside the number rather than in a camera roll.
--
-- Downscaled in the browser to a data URL before it is written, the same way
-- community post photos already are, so no storage bucket or signed URL is
-- involved and a photo survives wherever the expense does.
alter table public.expenses
  add column if not exists receipt_photos jsonb not null default '[]'::jsonb;
