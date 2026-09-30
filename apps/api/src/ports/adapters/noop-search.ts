import type { IndexableProduct, SearchPort, SearchQuery, SearchResults } from '../search';

const EMPTY: SearchResults = { products: [], categories: [] };

/** Placeholder until the Postgres full-text adapter lands in P04. */
export class NoopSearchAdapter implements SearchPort {
  async search(_query: SearchQuery): Promise<SearchResults> {
    return EMPTY;
  }

  async indexProduct(_product: IndexableProduct): Promise<void> {
    return undefined;
  }

  async removeProduct(_productId: string): Promise<void> {
    return undefined;
  }
}
