# 釜山 dogfood 的部署需求

**狀態：需求清單，尚未部署。** 部署需要 Founder 核准。
目標：2026-10-02 之前，兩支手機不靠 localhost 使用同一趟旅程。

---

## 為什麼是單一 Node 服務，不是靜態網站 + serverless

`server.ts` 同時是三件事：

1. Vite（開發）／`dist` 靜態檔（生產）
2. `/api/*` — Gemini、Places、Routes、Pexels 的代理
3. socket.io

第 2 點決定了形態：**API 金鑰必須留在伺服器端**。把前端丟到靜態託管、API 拆成
serverless，是另一次重寫，而且會在 13 天內製造一批新的未知。

**一個 Node process，`npm run build` 然後 `NODE_ENV=production npm start`。**

已實測（`PORT=3100`）：app、manifest、圖示都正常，深層路由落回 SPA，
未知的 `/api/` 仍然回 404 而不是 index.html。

---

## 環境變數

伺服器端（**絕不可加 `VITE_` 前綴**，那會被打包進前端）：

| 變數 | 缺了會怎樣 |
|---|---|
| `GEMINI_API_KEY` | 所有 AI 功能停擺（規劃、入境規定、準備建議） |
| `GOOGLE_MAPS_API_KEY` | 地點身分與交通時間查不到 → 卡片一律顯示「需確認」。**App 仍可用** |
| `PEXELS_API_KEY` | 只影響配圖 |
| `PORT` | 由平台注入 |
| `NODE_ENV=production` | **不設就會嘗試啟動 Vite dev server** |

前端（會進 bundle，只能放公開值）：

| 變數 | 備註 |
|---|---|
| `VITE_SUPABASE_URL` | |
| `VITE_SUPABASE_ANON_KEY` | anon key，**永遠不要放 service-role key** |
| `VITE_GEMINI_API_KEY` | ⚠️ 見下方 |

### ⚠️ `VITE_GEMINI_API_KEY` — 部署前最大的一個決定

**查證結果：前端仍在直接呼叫 Gemini。** `App.tsx` 有一段註解寫著「金鑰早就搬到
伺服器端了」，但那只對了一半——`/api/` 那幾支是搬過去了，
`services/geminiService.ts` 底下還有 **10 支函式**留在瀏覽器，
透過 `import.meta.env.VITE_GEMINI_API_KEY` 直接呼叫。

有 `VITE_` 前綴 = **打包進前端 JS，打開 devtools 就看得到**。

其中三支是釜山期間會用到的：

| 函式 | 用途 | 釜山會用嗎 |
|---|---|---|
| `fetchCurrentExchangeRate` | 韓元 → 台幣 | **每一筆記帳** |
| `parseImageExpenseWithGemini` | 拍收據自動記帳 | 很可能 |
| `parseExpenseWithGemini` | 打一句話記帳 | 很可能 |

其餘七支（退稅規則、簽證、旅遊書、推薦⋯）行前或非必要。

**兩條路，都要付代價：**

**A. 設這個變數。** 功能完整，但金鑰公開。網址不公開、只有兩個人用，風險有界，
**但配額被盜用會算在你帳上**。若選這條：**旅程結束後立刻輪替金鑰**，
並在 Google Cloud 設用量上限。

**B. 不設，把那三支搬到 `/api/`。** 金鑰不外洩，但要新增三條伺服器路由並改前端呼叫。
估計半天到一天，而且會動到記帳這條 P0 流程——出發前動它有風險。

**我的看法**：先選 A 出門，回來立刻輪替並排 B。理由是記帳是這趟最不能壞的功能，
而出發前一週去改它換來的是「理論上的安全」對上「實際上的可用」。
但這是花錢與風險的取捨，**要 Founder 決定**。

---

## Supabase 設定

### ⚠️ 已確認：資料庫是空的（Founder 確認，2026-09-19）

`0001` 從來沒有套用過。**這代表費用共享從來沒有真的運作過**——`useTripSync`
一直在靜默失敗，只有開發模式的紅色橫幅會說，正式環境沒有人看得到。

先前盤點把費用、爭議、結算標為 🟡（「取決於 0001 是否套用」），現在答案揭曉：
**那三項全部是 🔴**。專案存在、publishable key 正確，但一張表都沒有。

1. **套用全部結構**：`~/Desktop/trippie_apply_ALL.sql`
   涵蓋 `0001`～`0006`，依相依順序，包在單一 transaction，可重複執行。
   執行後應有 10 張表與 5 個函式。
   （舊的 `trippie_apply_0003_0004.sql` 已作廢，不要用——它假設 0001 已存在。）
2. **Auth → URL Configuration**：把部署網址加進 Site URL 與 Redirect URLs，
   否則註冊確認信裡的連結會導回 localhost。
3. **Email confirmation**：目前 `authService.ts` 有 `resendSignupConfirmation`，
   代表信箱驗證是開的。**朋友註冊時會需要收信**——出發前要確認那封信寄得出去，
   不然她在機場註冊不進來。

---

## Google Cloud 設定

`GOOGLE_MAPS_API_KEY` 是伺服器端使用，所以應以 **IP 限制**而非 HTTP referrer 限制。
需要啟用 Places API (New) 與 Routes API。

**已知外部限制**：Google 不提供南韓境內的路線服務。釜山的交通時間會是空的，
卡片顯示「交通時間需確認」。**這是預期行為，不是部署錯誤。**

---

## iPhone 專屬：兩個會咬人的地方（Founder 確認兩人都用 iPhone，2026-09-19）

**Service worker 確定不做。** iOS 的「加入主畫面」只需要 manifest 與 apple meta 標籤，
兩者都已就緒。在每天都在改的兩週裡，快取 shell 的 worker 是旅途中「打開看到舊版」
的來源，而那是比沒裝 SW 嚴重得多的問題。

### ⚠️ 陷阱一：Safari 與主畫面 App 的儲存空間是分開的

iOS 上，從主畫面開啟的 standalone web app 與 Safari **不共用 localStorage 與 session**。

所以這個順序會出事：

```
在 Safari 開邀請連結 → 註冊 → 加入成功 → 再加到主畫面
→ 從主畫面打開 → 未登入、沒有旅程、邀請也不見了
```

**正確順序（出發前務必照做）：**

1. 先用 Safari 開部署網址
2. **先加到主畫面**
3. **從主畫面的 App 圖示打開**
4. 在那裡面註冊 / 登入 / 開邀請連結

朋友那支也一樣。**邀請連結要在主畫面 App 裡開**，不是在 Safari 裡開。

### ⚠️ 陷阱二：Safari 會清掉七天沒用的網站資料

Safari 的 ITP 對「腳本可寫入的儲存」有七天上限。**加到主畫面的 App 不受這條限制**，
但純用 Safari 瀏覽的話會。

距離出發 13 天。**如果現在在 Safari 登入、然後兩週不開，可能會被登出，
而且只存在本機的資料（行程以外的部分）會消失。**

再一次指向同一個結論：**盡早加到主畫面，之後都從那裡開。**

---

## 還沒決定的

- **託管平台**。需要能跑常駐 Node process 並提供 HTTPS 的服務。
- **bundle 大小**：2.38 MB／gzip 669 KB。漫遊下首次載入偏慢，裝成 PWA 後只有第一次。
  出發前不建議動 code splitting，風險高於收益。
