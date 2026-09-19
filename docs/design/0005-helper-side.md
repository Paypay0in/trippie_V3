# 提案：幫手端、出價、完成確認、檢舉（migration `0005`）

**狀態：提案，尚未核准，尚未實作。**
依據：`docs/PRODUCT.md` 第 8 節（服務的經濟模型）。
本文件只描述資料模型與狀態機，不含 UI。

---

## 1. 範圍

v1 要做的：幫手檔案、出價、指派、完成回報、三天自動確認、檢舉與停權、
價格統計來源。

v1 **不**做的：押款、放款、抽成、仲裁。這些是 v2，接在現有狀態機後面，
不需要改動本文件的任何一張表。

---

## 2. 遠端限定的單點封鎖

正典要求 `on_site` 在 v1 關閉，且判斷不得散落各處。

```ts
// services/serviceScope.ts —— 唯一的真相來源
export const V1_SERVICE_CATEGORIES = ['booking', 'translation', 'consultation'] as const;
export const V1_ASSISTANCE_NEEDS = ['phone_call', 'translation', 'multi_contact'] as const;
```

`ServiceCategory` 與 `AssistanceNeed` 的型別**不變**——`on_site` 是真實存在的
未來概念，只是 v1 不開放。所有建立與出價的入口都引用上面兩個清單驗證。

`other` 不列入 v1 可用清單。理由：它是唯一無法從分類判斷是否需要見面的值，
而遠端限定正是 v1 安全性的基礎。需要 `other` 的需求，等有人工審核能力再開。

資料庫端以 CHECK 約束擋一次，不只靠應用層。

---

## 3. 資料表

### 3.1 金額的共用表示

正典要求：美金計價、輸入用當地幣別、原始值與衍生值都留、整數最小單位。

每個金額出現的地方都是同一組五個欄位（以 `xxx_` 為前綴）：

```sql
xxx_amount_minor      bigint not null,   -- 原始幣別的最小單位（日圓為 1、美金為 0.01）
xxx_currency          text   not null,   -- ISO 4217，例如 'JPY'
xxx_fx_rate           numeric not null,  -- 換算成美金的匯率
xxx_fx_rate_at        timestamptz not null,
xxx_amount_usd_cents  bigint not null    -- 衍生值，可重算
```

`xxx_amount_usd_cents` 是衍生的，但仍然落地儲存——統計要靠它排序與聚合，
每次查詢重算不切實際。**它可以被重算覆蓋，原始欄位不行。**

> 待確認：零小數幣別（JPY、KRW）與兩位小數幣別（USD、TWD）的最小單位不同。
> 需要一張幣別 → 小數位數的對照表，不可假設一律兩位。

### 3.2 `service_helper_profiles`

一個使用者要接單就需要一份檔案。沒有檔案不能出價。

```sql
create table public.service_helper_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  -- 幫手人在哪。與需求的 location 比對，但不要求一致：
  -- 遠端服務不需要人在當地，代打電話到大阪不必身在大阪。
  based_in_country text not null,
  based_in_city text,
  languages text[] not null default '{}',
  -- 只能是 V1_SERVICE_CATEGORIES 之內的值
  offered_categories text[] not null default '{}',
  bio text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);
```

**`based_in_*` 不作為媒合的硬條件。** 遠端服務的關鍵是語言與時區，不是地理位置。
把它當硬條件會誤殺「住東京但能處理大阪訂位」的幫手。

### 3.3 `service_requests` 的增修

現有表新增需求方的開價（正典：需求方先出價當錨點）：

```sql
alter table public.service_requests
  add column asking_amount_minor bigint,
  add column asking_currency text,
  add column asking_fx_rate numeric,
  add column asking_fx_rate_at timestamptz,
  add column asking_amount_usd_cents bigint,
  -- 指派後才有值
  add column assigned_offer_id text references public.service_offers(id),
  add column assigned_helper_user_id uuid references auth.users(id);
```

`status` 的 CHECK 需擴充（見第 4 節狀態機）。

**開價為必填。** 沒有錨點的需求會拿到發散的報價，而且拿不到開價資料——
即使最後沒成交，開價本身就是統計的第一層來源。

### 3.4 `service_offers`

一個需求對多個報價。

```sql
create table public.service_offers (
  id text primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  helper_user_id uuid not null references auth.users(id) on delete cascade,
  -- 幫手的報價。接受開價時填入與開價相同的數字，
  -- 不另設「接受」旗標——那會變成兩條要同步的真相。
  offer_amount_minor bigint not null,
  offer_currency text not null,
  offer_fx_rate numeric not null,
  offer_fx_rate_at timestamptz not null,
  offer_amount_usd_cents bigint not null,
  message text,
  status text not null default 'open'
    check (status in ('open', 'withdrawn', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  -- 同一個幫手對同一個需求只能有一個有效報價
  unique (request_id, helper_user_id)
);
```

### 3.5 `service_completions`

一筆指派對應一列。完成回報與雙邊確認都記在這裡。

```sql
create table public.service_completions (
  request_id text primary key references public.service_requests(id) on delete cascade,
  helper_user_id uuid not null references auth.users(id),

  -- 幫手回報完成
  reported_at timestamptz not null,
  -- 履約紀錄。遠端服務會留下痕跡，這是爭議時唯一可看的東西。
  -- 沒有它，自動確認等於把疑義一律判給幫手。
  evidence_note text not null,
  evidence_reference text,          -- 訂位編號、單據號、交付連結

  -- 雙方各自填的最終金額（同一組五欄，前綴 helper_ / traveller_）
  helper_final_amount_minor bigint not null,
  helper_final_currency text not null,
  helper_final_fx_rate numeric not null,
  helper_final_fx_rate_at timestamptz not null,
  helper_final_amount_usd_cents bigint not null,

  traveller_confirmed_at timestamptz,
  traveller_final_amount_minor bigint,
  traveller_final_currency text,
  traveller_final_fx_rate numeric,
  traveller_final_fx_rate_at timestamptz,
  traveller_final_amount_usd_cents bigint,

  -- 逾時自動確認的時間點；主動確認時為 null
  auto_confirmed_at timestamptz,

  outcome text not null default 'awaiting_traveller' check (outcome in (
    'awaiting_traveller',   -- 幫手已回報，三天內等旅客
    'confirmed',            -- 旅客主動確認，金額一致
    'auto_confirmed',       -- 逾時視為完成
    'amount_disputed',      -- 兩邊金額不一致
    'disputed'              -- 旅客明確提出異議
  )),
  created_at timestamptz not null default now()
);
```

**為什麼 `auto_confirmed` 與 `confirmed` 分開**：正典要求價格標籤反映資料可信度。
逾時預設不等於旅客看過並同意，統計時要能分辨。

### 3.6 `service_reports`

```sql
create table public.service_reports (
  id text primary key,
  request_id text references public.service_requests(id) on delete set null,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,

  -- 兩層處置的分界就在這個欄位（正典：檢舉兩層處置）
  reason text not null check (reason in (
    -- 立即停權
    'safety', 'no_show_paid', 'off_platform_payment',
    'identity_abuse', 'excessive_personal_data',
    -- 先審後處理
    'quality', 'amount_dispute', 'communication'
  )),
  detail text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'upheld', 'rejected')),
  created_at timestamptz not null default now()
);

create index service_reports_pair_idx
  on public.service_reports (reporter_user_id, reported_user_id, created_at desc);
```

那個索引是為了偵測**同一檢舉人反覆檢舉同一對象**——正典明列的配套，
檢舉機制本身會被當成武器。

### 3.7 `service_suspensions`

停權與申訴分開存。**停權不是把 profile 改成 `suspended` 就算**——
那樣沒有原因、沒有時間、沒有申訴紀錄。

```sql
create table public.service_suspensions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  triggered_by_report_id text references public.service_reports(id),
  reason text not null,
  suspended_at timestamptz not null default now(),
  -- 申訴
  appeal_text text,
  appealed_at timestamptz,
  lifted_at timestamptz,
  lifted_reason text
);
```

正典：**立即停權必須有申訴管道，而且真的有人看。** 沒有 `appeal_*` 欄位的停權
系統就是沒有回頭路的系統。

---

## 4. 狀態機

```
requested
   │  幫手出價（多筆 service_offers，不改需求狀態）
   │  旅客接受其中一筆
   ▼
assigned ──────────────► cancelled（任一方在開始前取消）
   │  幫手回報完成 + 履約紀錄
   ▼
awaiting_confirmation
   │
   ├── 旅客確認，金額一致 ──────────► completed（confirmed）
   ├── 旅客確認，金額不一致 ────────► completed（amount_disputed）
   ├── 旅客提出異議 ───────────────► disputed
   └── 3 天無回應 ─────────────────► completed（auto_confirmed）
```

`service_requests.status` 需擴充為：
`requested / assigned / awaiting_confirmation / completed / disputed / cancelled`

（現有 CHECK 只有 `requested / in_progress / completed / cancelled`。
`in_progress` 語意被 `assigned` 與 `awaiting_confirmation` 取代，需處理遷移——
但 `0003` 尚未套用到任何資料庫，可直接改寫而非新增 migration。）

### 三天自動確認怎麼觸發

**不要靠背景排程。** 一個每天跑的 job 是額外的基礎設施，而且它壞掉時沒有人會發現。

改為**讀取時判定**：`outcome = 'awaiting_traveller'` 且 `reported_at < now() - 3 days`
即視為 `auto_confirmed`。用資料庫 view 或函式表達，讓讀與寫看到同一個判定。

`auto_confirmed_at` 於旅客或幫手下次讀取該筆時落地寫入，避免每次重算。

> 待確認：這個做法在「沒有人再打開那筆交易」時不會落地。統計若走 view，
> 不影響正確性；但若之後 v2 要用它觸發放款，就必須改成真的排程。

---

## 5. 價格統計的來源

正典的可信度階層轉成一張 view：

| 來源 | 可稱為 | 是否進統計 |
|---|---|---|
| `service_requests.asking_*` | 開價 | 是，標記為 asking |
| `outcome = 'confirmed'` 且兩邊金額一致 | 成交價 | 是，標記為 settled |
| `outcome = 'auto_confirmed'` | 不可稱成交價 | 是，降權 |
| `outcome = 'amount_disputed'` | — | 否 |
| `outcome = 'disputed'` | — | 否 |
| 涉及任何 `service_reports` | — | 否 |

分組：**類別 × 時長級距 × 城市**。樣本 < 5 不顯示，且明說沒有，不塞估計值。
顯示區間優先於單一平均。

```sql
create view public.service_price_samples as ...
```

（實際 SQL 待 schema 定案後補。）

---

## 6. RLS 草案

延續 `0003` 的嚴格程度。

| 表 | 讀 | 寫 |
|---|---|---|
| `service_helper_profiles` | 所有登入者（媒合需要看得到） | 本人 |
| `service_requests` | 需求者本人 **＋ 已出價或可出價的幫手** | 需求者本人 |
| `service_offers` | 該需求的需求者 ＋ 出價的幫手本人 | 幫手本人 |
| `service_completions` | 該筆交易的雙方 | 各自欄位 |
| `service_reports` | **只有檢舉人本人** | 檢舉人本人 |
| `service_suspensions` | 被停權者本人（申訴需要看得到） | 服務端 |

**`service_requests` 的讀取範圍是 v1 最大的一個政策變更。** `0003` 是
requester-only，一旦幫手要能看到需求才能出價，就必須開放。這牽涉旅客的行程、
日期、地點暴露給陌生人——**需求列表要限制欄位**，不可整列開放。

> 待確認：需求對幫手可見的欄位子集。至少 `tasks[].taskName` 含自由文字，
> 旅客可能在裡面寫了住宿名稱或私人細節。

---

## 7. 尚待 Founder 決定

1. **金額不一致的處理** — 本文件採「標記 `amount_disputed`、排除出統計」（我的提案）
2. **評價是否綁在確認之後** — 本文件尚未納入評價表，等這題決定
3. **需求對幫手可見的欄位子集**（第 6 節）
4. **零小數幣別的最小單位對照**（第 3.1 節）
5. **自動確認是否需要真排程**（第 4 節），v2 放款會逼出這題
