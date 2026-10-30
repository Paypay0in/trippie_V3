/**
 * Official sites for the entry formalities on the pre-trip checklist.
 *
 * A checklist that says 「K-ETA (韓國電子旅行許可)」 and then leaves the traveller
 * to search for it is where the scam sites win: search results for every one of
 * these are full of paid intermediaries charging several times the real fee.
 * Sending people straight to the government's own domain is the point.
 *
 * Every entry is a government domain, and only formalities whose official site
 * is unambiguous are listed. An item with no certain official home gets no
 * link — a wrong link here is worse than no link, because the surrounding
 * checklist lends it authority.
 *
 * The label is the one part of an entry that is copy. It is resolved at call
 * time rather than at module load, because this table is built once per page
 * load and the reader can change language after that.
 */
import i18n from '../i18n/config';

export interface OfficialLink {
  label: string;
  url: string;
}

interface LinkRule {
  country: string;
  /** Any of these appearing in the task name selects this link. */
  keywords: string[];
  /**
   * i18n key for the label. Absent when the label is the service's own brand
   * name, which is the same word in every language.
   */
  labelKey?: string;
  /** Brand name, used as-is when there is no `labelKey`. */
  label?: string;
  url: string;
}

/** The label a rule shows, in the reader's language. */
const labelOf = (rule: LinkRule): string =>
  rule.labelKey ? i18n.t(rule.labelKey) : rule.label ?? '';

/*
  `country` and `keywords` are matching anchors, not copy: the country comes
  from the trip's stored destination and the keywords are matched against the
  generated task name. i18n-data: matching keys.
*/
const RULES: LinkRule[] = [
  {
    country: '韓國',
    keywords: ['k-eta', 'keta', '電子旅行許可'],
    labelKey: 'plan.official.keta',
    url: 'https://www.k-eta.go.kr',
  },
  {
    country: '韓國',
    keywords: ['q-code', 'qcode', '檢疫'],
    labelKey: 'plan.official.qCode',
    url: 'https://cov19ent.kdca.go.kr',
  },
  {
    country: '韓國',
    keywords: ['入境卡', '入境登記', 'arrival card', '입국신고'],
    labelKey: 'plan.official.koreaArrivalCard',
    url: 'https://www.e-arrivalcard.go.kr',
  },
  {
    country: '日本',
    keywords: ['visit japan', '入境卡', '海關'],
    label: 'Visit Japan Web',
    url: 'https://services.digital.go.jp/visit-japan-web/',
  },
  {
    country: '新加坡',
    keywords: ['arrival card', '入境卡', 'sg arrival'],
    label: 'SG Arrival Card',
    url: 'https://eservices.ica.gov.sg/sgarrivalcard',
  },
  {
    country: '美國',
    keywords: ['esta', '旅行授權'],
    labelKey: 'plan.official.esta',
    url: 'https://esta.cbp.dhs.gov',
  },
  {
    country: '加拿大',
    keywords: ['eta', '電子旅行證'],
    labelKey: 'plan.official.canadaEta',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html',
  },
  {
    country: '英國',
    keywords: ['eta', '電子旅行許可'],
    labelKey: 'plan.official.ukEta',
    url: 'https://www.gov.uk/eta',
  },
  {
    country: '澳洲',
    keywords: ['eta', '電子簽證', '簽證'],
    labelKey: 'plan.official.australiaVisa',
    url: 'https://immi.homeaffairs.gov.au',
  },
  {
    country: '越南',
    keywords: ['evisa', 'e-visa', '電子簽證', '簽證'],
    labelKey: 'plan.official.vietnamEvisa',
    url: 'https://evisa.gov.vn',
  },
];

/*
 * 韓國關稅廳 used to be listed for customs declarations and has been removed.
 * It is a government portal, not a form: someone arriving there has to go
 * hunting, which is the situation a link is supposed to end. If the lookup
 * returns a page where the declaration is actually filled in, that is used
 * instead — and if nobody has one, no link is better than a front door.
 */

/** The traveller's own passport paperwork, wherever they are going. */
const PASSPORT_RULE: LinkRule = {
  country: '*',
  keywords: ['護照'], // i18n-data: matched against the generated task name.
  labelKey: 'plan.official.passportBureau',
  url: 'https://www.boca.gov.tw',
};

// i18n-data: stored destination spellings folded onto the canonical one.
const COUNTRY_ALIASES: Record<string, string> = {
  南韓: '韓國',
  韩国: '韓國',
  大韓民國: '韓國',
  中國大陸: '中國',
};

/**
 * The official site for a checklist item, or null when this table has no
 * certain answer. Matching is by country plus a keyword in the task's name,
 * because the checklist items are generated text rather than fixed ids.
 */
export const findOfficialLink = (
  country: string | undefined,
  taskName: string | undefined,
): OfficialLink | null => {
  const name = (taskName || '').toLocaleLowerCase();
  if (!name) return null;

  const key = COUNTRY_ALIASES[(country || '').trim()] ?? (country || '').trim();
  const match = RULES.find(
    rule => rule.country === key && rule.keywords.some(keyword => name.includes(keyword)),
  );
  if (match) return { label: labelOf(match), url: match.url };

  if (PASSPORT_RULE.keywords.some(keyword => name.includes(keyword))) {
    return { label: labelOf(PASSPORT_RULE), url: PASSPORT_RULE.url };
  }
  return null;
};
