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
  /** i18n key for the one-line heading. Resolved by the caller, not here. */
  titleKey: string;
  /** i18n key for the body. */
  detailKey: string;
  /**
   * An official page for this tip, when one exists.
   *
   * `appUrl` is tried first on a phone. There is no public link that opens a
   * particular screen inside Wallet, so it opens the app and the traveller
   * taps Add > Transit Card themselves; `url` is where they land when the
   * scheme goes nowhere, which is what happens on a desktop and on any device
   * without that app.
   */
  link?: { labelKey: string; url: string; appUrl?: string };
}

const TIPS: Record<string, DestinationTip[]> = {
  // i18n-data: these keys are matched against the stored country value.
  韓國: [
    {
      kind: 'app',
      titleKey: 'plan.tips.kr.appNaverMap.title',
      detailKey: 'plan.tips.kr.appNaverMap.detail',
      link: { labelKey: 'plan.tips.kr.appNaverMap.linkLabel', url: 'https://apps.apple.com/app/id311867728' },
    },
    {
      kind: 'transport',
      titleKey: 'plan.tips.kr.tmoney.title',
      detailKey: 'plan.tips.kr.tmoney.detail',
      link: {
        labelKey: 'plan.tips.kr.tmoney.linkLabel',
        url: 'https://support.apple.com/en-us/105079',
        // Wallet's own scheme. Undocumented, so the support page above is the
        // fallback rather than an afterthought.
        appUrl: 'shoebox://',
      },
    },
    {
      kind: 'app',
      titleKey: 'plan.tips.kr.kakaotalk.title',
      detailKey: 'plan.tips.kr.kakaotalk.detail',
    },
    {
      kind: 'payment',
      titleKey: 'plan.tips.kr.cards.title',
      detailKey: 'plan.tips.kr.cards.detail',
    },
  ],
  // i18n-data: matched against the stored country value.
  日本: [
    {
      kind: 'transport',
      titleKey: 'plan.tips.jp.suica.title',
      detailKey: 'plan.tips.jp.suica.detail',
      link: {
        labelKey: 'plan.tips.jp.suica.linkLabel',
        url: 'https://support.apple.com/en-us/105079',
        // Wallet's own scheme. Undocumented, so the support page above is the
        // fallback rather than an afterthought.
        appUrl: 'shoebox://',
      },
    },
    {
      kind: 'app',
      titleKey: 'plan.tips.jp.transfer.title',
      detailKey: 'plan.tips.jp.transfer.detail',
      link: { labelKey: 'plan.tips.jp.transfer.linkLabel', url: 'https://transit.yahoo.co.jp' },
    },
    {
      kind: 'payment',
      titleKey: 'plan.tips.jp.cash.title',
      detailKey: 'plan.tips.jp.cash.detail',
    },
  ],
  // i18n-data: matched against the stored country value.
  泰國: [
    {
      kind: 'app',
      titleKey: 'plan.tips.th.grab.title',
      detailKey: 'plan.tips.th.grab.detail',
      link: { labelKey: 'plan.tips.th.grab.linkLabel', url: 'https://www.grab.com' },
    },
    {
      kind: 'payment',
      titleKey: 'plan.tips.th.cash.title',
      detailKey: 'plan.tips.th.cash.detail',
    },
  ],
  // i18n-data: matched against the stored country value.
  越南: [
    {
      kind: 'app',
      titleKey: 'plan.tips.vn.grab.title',
      detailKey: 'plan.tips.vn.grab.detail',
      link: { labelKey: 'plan.tips.vn.grab.linkLabel', url: 'https://www.grab.com' },
    },
    {
      kind: 'payment',
      titleKey: 'plan.tips.vn.cash.title',
      detailKey: 'plan.tips.vn.cash.detail',
    },
  ],
  // i18n-data: matched against the stored country value.
  新加坡: [
    {
      kind: 'payment',
      titleKey: 'plan.tips.sg.contactless.title',
      detailKey: 'plan.tips.sg.contactless.detail',
    },
  ],
  // i18n-data: matched against the stored country value.
  香港: [
    {
      kind: 'transport',
      titleKey: 'plan.tips.hk.octopus.title',
      detailKey: 'plan.tips.hk.octopus.detail',
      link: { labelKey: 'plan.tips.hk.octopus.linkLabel', url: 'https://www.octopus.com.hk' },
    },
  ],
  // i18n-data: matched against the stored country value.
  中國: [
    {
      kind: 'payment',
      titleKey: 'plan.tips.cn.mobilePay.title',
      detailKey: 'plan.tips.cn.mobilePay.detail',
    },
  ],
  // i18n-data: matched against the stored country value.
  美國: [
    {
      kind: 'custom',
      titleKey: 'plan.tips.us.tipping.title',
      detailKey: 'plan.tips.us.tipping.detail',
    },
  ],
};

/** Tips for a country, or an empty list when this table has nothing to add. */
export const getDestinationTips = (country?: string): DestinationTip[] => {
  const key = (country || '').trim();
  if (!key) return [];
  // Match on the country's own name and the common alternatives people type.
  const aliases: Record<string, string> = {
    // i18n-data: matching key, never displayed.
    南韓: '韓國',
    // i18n-data: matching key, never displayed.
    韩国: '韓國',
    // i18n-data: matching key, never displayed.
    大韓民國: '韓國',
    // i18n-data: matching key, never displayed.
    日本國: '日本',
    // i18n-data: matching key, never displayed.
    泰國王國: '泰國',
    // i18n-data: matching key, never displayed.
    美國: '美國',
    // i18n-data: matching key, never displayed.
    中國大陸: '中國',
  };
  return TIPS[aliases[key] ?? key] ?? [];
};
