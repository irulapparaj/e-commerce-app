export interface HsnEntry {
  readonly code: string;
  readonly description: string;
  readonly defaultGstRate: number;
}

export const HSN_CODES: readonly HsnEntry[] = [
  {
    code: '3307',
    description: 'Agarbatti, dhoop and other odoriferous preparations',
    defaultGstRate: 5,
  },
  { code: '2914', description: 'Camphor', defaultGstRate: 18 },
  { code: '3406', description: 'Candles, tapers and the like', defaultGstRate: 12 },
  { code: '3303', description: 'Perfumes, attars and toilet waters', defaultGstRate: 18 },
  { code: '3301', description: 'Essential and aroma oils', defaultGstRate: 18 },
  { code: '1301', description: 'Natural gums and resins (sambrani, loban)', defaultGstRate: 5 },
  { code: '8509', description: 'Electric diffusers and humidifiers', defaultGstRate: 18 },
  {
    code: '6913',
    description: 'Ceramic ornamental articles (kapur dani, burners)',
    defaultGstRate: 12,
  },
  { code: '5601', description: 'Cotton wicks and wadding', defaultGstRate: 5 },
  { code: '2201', description: 'Natural water (gangajal)', defaultGstRate: 18 },
];

export interface CategoryTaxDefault {
  readonly hsnCode: string;
  readonly gstRate: number;
}

export const DEFAULT_HSN_BY_CATEGORY: Readonly<Record<string, CategoryTaxDefault>> = {
  agarbatti: { hsnCode: '3307', gstRate: 5 },
  dhoop: { hsnCode: '3307', gstRate: 5 },
  'puja-samagri': { hsnCode: '3307', gstRate: 5 },
  'air-care': { hsnCode: '3301', gstRate: 18 },
  'home-fragrance': { hsnCode: '3406', gstRate: 12 },
  'body-fragrance': { hsnCode: '3303', gstRate: 18 },
  more: { hsnCode: '6913', gstRate: 12 },
};

export const GST_RATES = [5, 12, 18] as const;
