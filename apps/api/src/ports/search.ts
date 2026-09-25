export interface SearchQuery {
  readonly q: string;
  readonly type?: 'product' | 'category';
  readonly limit: number;
}

export interface SearchHit {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly score: number;
}

export interface SearchResults {
  readonly products: readonly SearchHit[];
  readonly categories: readonly SearchHit[];
}

export interface IndexableProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sku: string;
  readonly tags: readonly string[];
  readonly categoryName: string;
  readonly isActive: boolean;
}

export interface SearchPort {
  search(query: SearchQuery): Promise<SearchResults>;
  indexProduct(product: IndexableProduct): Promise<void>;
  removeProduct(productId: string): Promise<void>;
}
