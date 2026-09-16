/**
 * Practical things travellers only learn from other travellers.
 *
 * The pre-trip checklist covers what a government requires. It says nothing
 * about the fact that Google Maps will not give you walking directions in
 * Korea, which is the sort of thing every social-media trip guide leads with
 * and every first-time visitor discovers at the worst moment.
 *
 * Curated by hand rather than generated: these are claims about the real
 * world that a traveller will act on, and a fluent invented one — a payment
 * app that does not exist, a card that was discontinued — costs someone their
 * afternoon. Nothing goes in this table that is not durably true. Anything
 * time-sensitive belongs in the AI assistant below it, not here.
 */

export type DestinationTipKind = 'app' | 'payment' | 'transport' | 'connectivity' | 'custom';

export interface DestinationTip {
  kind: DestinationTipKind;
  title: string;
  detail: string;
}

const TIPS: Record<string, DestinationTip[]> = {
  韓國: [
    {
      kind: 'app',
      title: '下載 Naver Map 或 KakaoMap',
      detail: 'Google 地圖在韓國受法規限制，步行與部分路線導航不完整。當地人用的是這兩款。',
    },
    {
      kind: 'transport',
      title: '準備一張 T-money 卡',
      detail:
        '地鐵、公車、計程車都能刷，超商就能買和加值。iPhone 也可以先試 Wallet ＞ 加入 ＞ 交通卡：' +
        'Apple 的支援地區清單包含南韓，卡片能不能加會依機型與地區顯示。不行就在超商買實體卡。',
    },
    {
      kind: 'app',
      title: 'KakaoTalk 是主要通訊軟體',
      detail: '訂位、店家聯絡多半透過它；KakaoT 則是叫車用的。',
    },
    {
      kind: 'payment',
      title: '刷卡非常普及',
      detail: '小店也多半能刷，現金主要留給傳統市場和路邊攤。',
    },
  ],
  日本: [
    {
      kind: 'transport',
      title: 'Suica／PASMO 交通卡',
      detail: '可加入手機錢包，搭車和便利商店都能用。',
    },
    {
      kind: 'app',
      title: '轉乘查詢用 Yahoo!乘換案内 或 Google 地圖',
      detail: '日本鐵路轉乘複雜，班次與月台資訊以轉乘 App 最準。',
    },
    {
      kind: 'payment',
      title: '仍要帶現金',
      detail: '小型餐館、神社周邊、部分商店只收現金。',
    },
  ],
  泰國: [
    {
      kind: 'app',
      title: '叫車用 Grab',
      detail: '價格先講定，比路邊攔車少掉很多議價與繞路問題。',
    },
    {
      kind: 'payment',
      title: '以現金為主',
      detail: '市場、路邊攤幾乎只收現金，建議隨身備小鈔。',
    },
  ],
  越南: [
    {
      kind: 'app',
      title: '叫車用 Grab',
      detail: '機車與汽車都能叫，價格透明。',
    },
    {
      kind: 'payment',
      title: '現金為主，注意鈔票面額',
      detail: '越南盾零很多，付款前確認一下位數。',
    },
  ],
  新加坡: [
    {
      kind: 'payment',
      title: '感應式信用卡可直接刷地鐵',
      detail: '不必另外買交通卡，閘門直接感應。',
    },
  ],
  香港: [
    {
      kind: 'transport',
      title: '八達通',
      detail: '交通與便利商店通用，機場與地鐵站都能買。',
    },
  ],
  中國: [
    {
      kind: 'payment',
      title: '行動支付為主',
      detail: '支付寶／微信支付可綁定境外卡，現金與外國信用卡接受度低。',
    },
  ],
  美國: [
    {
      kind: 'custom',
      title: '小費是預設的',
      detail: '餐廳內用一般 15–20%，帳單上可能已經含服務費，付前看一下。',
    },
  ],
};

/** Tips for a country, or an empty list when this table has nothing to add. */
export const getDestinationTips = (country?: string): DestinationTip[] => {
  const key = (country || '').trim();
  if (!key) return [];
  // Match on the country's own name and the common alternatives people type.
  const aliases: Record<string, string> = {
    南韓: '韓國',
    韩国: '韓國',
    大韓民國: '韓國',
    日本國: '日本',
    泰國王國: '泰國',
    美國: '美國',
    中國大陸: '中國',
  };
  return TIPS[aliases[key] ?? key] ?? [];
};
