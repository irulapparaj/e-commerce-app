import { Prisma } from '@prisma/client';

import type { PrismaRaw } from '../../db/prisma';
import type {
  IndexableProduct,
  SearchHit,
  SearchPort,
  SearchQuery,
  SearchResults,
} from '../search';

export const SEARCH_QUERY_MAX_LENGTH = 100;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
const MAX_LIMIT = 50;
/** Exact SKU hits outrank everything; full-text hits sit above trigram matches. */
const SKU_SCORE = 10;
const FULLTEXT_BASE_SCORE = 1;

/** Trims, collapses whitespace and caps length. Search syntax is never interpreted: values are bound. */
export const normaliseQuery = (q: string): string =>
  q.replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX_LENGTH).trim();

export interface PostgresSearchOptions {
  readonly similarityThreshold?: number;
}

/**
 * Phase 1 `SearchPort` (R2): generated `search_vector` (websearch syntax) ranked by `ts_rank`, unioned
 * with a trigram similarity fallback on the name for typo tolerance ("kapor" → "Kapur") and exact SKU
 * matches. Active products only. `indexProduct`/`removeProduct` are no-ops: the column is generated.
 *
 * The trigram branch uses the `%` operator (sargable with GIN pg_trgm index) instead of
 * `similarity() > threshold` (function-call form, not index-friendly). Threshold is set via
 * `SET LOCAL` in a transaction-scoped statement so the GIN index is used.
 */
export class PostgresSearchAdapter implements SearchPort {
  private readonly raw: PrismaRaw;
  private readonly threshold: number;

  constructor(raw: PrismaRaw, options: PostgresSearchOptions = {}) {
    this.raw = raw;
    this.threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  }

  async search(query: SearchQuery): Promise<SearchResults> {
    const q = normaliseQuery(query.q);
    const limit = Math.min(Math.max(1, query.limit), MAX_LIMIT);
    if (q === '') return { products: [], categories: [] };
    const wantProducts = query.type === undefined || query.type === 'product';
    const wantCategories = query.type === undefined || query.type === 'category';
    const [products, categories] = await Promise.all([
      wantProducts ? this.searchProducts(q, limit) : Promise.resolve([]),
      wantCategories ? this.searchCategories(q, limit) : Promise.resolve([]),
    ]);
    return { products, categories };
  }

  private searchProducts(q: string, limit: number): Promise<SearchHit[]> {
    // threshold is a validated float 0–1, safe to embed as a SQL literal
    const thresholdSql = Prisma.raw(this.threshold.toFixed(4));
    return this.raw.$transaction(async (tx) => {
      // SET LOCAL applies for the duration of this transaction, enabling the GIN index for `%`
      await tx.$executeRaw`SET LOCAL pg_trgm.similarity_threshold = ${thresholdSql}`;
      return tx.$queryRaw<SearchHit[]>`
        SELECT "id", "slug", "name", max("score")::float AS "score" FROM (
          SELECT p."id", p."slug", p."name",
                 ${FULLTEXT_BASE_SCORE} + ts_rank(p."search_vector", websearch_to_tsquery('english', ${q})) AS "score"
          FROM "product" p
          WHERE p."is_active" = true AND p."search_vector" @@ websearch_to_tsquery('english', ${q})
          UNION ALL
          SELECT p."id", p."slug", p."name", similarity(p."name", ${q})::float AS "score"
          FROM "product" p
          WHERE p."is_active" = true AND p."name" % ${q}
          UNION ALL
          SELECT p."id", p."slug", p."name", ${SKU_SCORE}::float AS "score"
          FROM "product" p
          WHERE p."is_active" = true AND (
            upper(p."sku") = upper(${q})
            OR EXISTS (SELECT 1 FROM "product_variant" v WHERE v."product_id" = p."id" AND upper(v."sku") = upper(${q}))
          )
        ) hits
        GROUP BY "id", "slug", "name"
        ORDER BY "score" DESC, "name" ASC
        LIMIT ${limit}`;
    });
  }

  private searchCategories(q: string, limit: number): Promise<SearchHit[]> {
    const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const thresholdSql = Prisma.raw(this.threshold.toFixed(4));
    return this.raw.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL pg_trgm.similarity_threshold = ${thresholdSql}`;
      return tx.$queryRaw<SearchHit[]>`
        SELECT "id", "slug", "name", greatest(similarity("name", ${q}), CASE WHEN "name" ILIKE ${pattern} THEN 1 ELSE 0 END)::float AS "score"
        FROM "category"
        WHERE "name" % ${q} OR "name" ILIKE ${pattern}
        ORDER BY "score" DESC, "name" ASC
        LIMIT ${limit}`;
    });
  }

  async indexProduct(_product: IndexableProduct): Promise<void> {
    return undefined;
  }

  async removeProduct(_productId: string): Promise<void> {
    return undefined;
  }
}
