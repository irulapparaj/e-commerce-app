export interface SitemapProduct {
  readonly slug: string;
  readonly updatedAt: string;
}

export interface SitemapData {
  readonly products: readonly SitemapProduct[];
  readonly categorySlugs: readonly string[];
  readonly pages: readonly string[];
  readonly policies: readonly string[];
}
