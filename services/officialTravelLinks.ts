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
 */

export interface OfficialLink {
  label: string;
  url: string;
}

interface LinkRule extends OfficialLink {
  country: string;
  /** Any of these appearing in the task name selects this link. */
  keywords: string[];
}

const RULES: LinkRule[] = [
  {
    country: '韓國',
    keywords: ['k-eta', 'keta', '電子旅行許可'],
    label: 'K-ETA 官方申請網站',
    url: 'https://www.k-eta.go.kr',
  },
  {
    country: '韓國',
    keywords: ['q-code', 'qcode', '檢疫'],
    label: 'Q-CODE 檢疫資訊預先輸入系統',
    url: 'https://cov19ent.kdca.go.kr',
  },
  {
    country: '韓國',
    keywords: ['入境卡', '入境登記', 'arrival card', '입국신고'],
    label: '韓國電子入境申報 (e-Arrival Card)',
    url: 'https://www.e-arrivalcard.go.kr',
  },
  {
    country: '韓國',
    keywords: ['海關', '關稅'],
    label: '韓國關稅廳',
    url: 'https://www.customs.go.kr',
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
    label: 'ESTA 官方申請網站',
    url: 'https://esta.cbp.dhs.gov',
  },
  {
    country: '加拿大',
    keywords: ['eta', '電子旅行證'],
    label: '加拿大 eTA 官方申請',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html',
  },
  {
    country: '英國',
    keywords: ['eta', '電子旅行許可'],
    label: 'UK ETA 官方申請',
    url: 'https://www.gov.uk/eta',
  },
  {
    country: '澳洲',
    keywords: ['eta', '電子簽證', '簽證'],
    label: '澳洲簽證與 ETA',
    url: 'https://immi.homeaffairs.gov.au',
  },
  {
    country: '越南',
    keywords: ['evisa', 'e-visa', '電子簽證', '簽證'],
    label: '越南電子簽證官方網站',
    url: 'https://evisa.gov.vn',
  },
];

/** The traveller's own passport paperwork, wherever they are going. */
const PASSPORT_RULE: LinkRule = {
  country: '*',
  keywords: ['護照'],
  label: '外交部領事事務局（護照）',
  url: 'https://www.boca.gov.tw',
};

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
  if (match) return { label: match.label, url: match.url };

  if (PASSPORT_RULE.keywords.some(keyword => name.includes(keyword))) {
    return { label: PASSPORT_RULE.label, url: PASSPORT_RULE.url };
  }
  return null;
};
