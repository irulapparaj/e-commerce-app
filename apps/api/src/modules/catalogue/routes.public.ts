import { createHash } from 'node:crypto';

import { AppError, ok } from '@pe/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { renderRichText } from '../richtext/render';
import { parseRichText } from '../richtext/schema';

import {
  gstRateOf,
  type ProductDetailDto,
  specificationsOf,
  stockFlags,
  toProductSummary,
  toVariantDto,
  EMPTY_RATING,
} from './dto';
import {
  collectionQuerySchema,
  productListQuerySchema,
  searchQuerySchema,
  slugParamsSchema,
} from './filters';
import {
  findActiveProductBySlug,
  findCategoryScope,
  findPriceBounds,
  findProductsByIds,
  listProducts,
  type ProductDetailRow,
} from './queries';
import { findRelatedProducts } from './related';
import { getCategoryTree } from './tree';

const SEARCH_RATE_LIMIT = { limit: 60, windowSeconds: 60 } as const;
const ETAG_LENGTH = 32;

const etagFor = (body: unknown): string =>
  `"${createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, ETAG_LENGTH)}"`;

const sendWithEtag = (reply: FastifyReply, ifNoneMatch: string | undefined, body: unknown) => {
  const etag = etagFor(body);
  void reply.header('etag', etag);
  if (ifNoneMatch !== undefined && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
    return reply.code(304).send();
  }
  return reply.send(body);
};

const descriptionHtml = (description: unknown): string => {
  try {
    return renderRichText(parseRichText(description));
  } catch {
    // A stored document that fails today's schema renders as nothing rather than as a 500.
    return '';
  }
};

/** Public read API (P04 tasks 5, 9, 11). No route here mutates data. */
export const catalogueRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { prisma, imageUrls, rateLimiter } = app;

  const toDetail = async (row: ProductDetailRow): Promise<ProductDetailDto> => {
    const [related, brand, gst] = await Promise.all([
      findRelatedProducts(prisma, row, imageUrls),
      app.settings.get('brand'),
      app.settings.get('gst_profile'),
    ]);
    const primary = row.variants.find((variant) => variant.isDefault) ?? row.variants[0];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      categorySlug: row.category.slug,
      defaultVariantId: primary?.id ?? null,
      priceFrom: primary?.price ?? 0,
      compareAtFrom: primary?.compareAtPrice ?? null,
      isFeatured: row.isFeatured,
      ...stockFlags(row.variants),
      ratingSummary: EMPTY_RATING,
      descriptionHtml: descriptionHtml(row.description),
      specifications: specificationsOf(row.specifications),
      howToUse: row.howToUse,
      tags: row.tags,
      variants: row.variants.map(toVariantDto),
      images: await Promise.all(
        row.images.map((image) => imageUrls.imageUrls(image.objectKey, image.alt)),
      ),
      breadcrumb: [
        ...(row.category.parent
          ? [{ name: row.category.parent.name, slug: row.category.parent.slug }]
          : []),
        { name: row.category.name, slug: row.category.slug },
      ],
      related,
      seo: { metaTitle: row.metaTitle, metaDescription: row.metaDescription },
      hsnCode: row.hsnCode,
      gstRate: gstRateOf(row.gstRate),
      manufacturer: { name: brand.name, legalName: gst.legalName, addressLines: gst.addressLines },
    };
  };

  app.get('/categories', async () =>
    ok(await getCategoryTree({ prisma, cache: app.cache, urls: imageUrls })),
  );

  app.get(
    '/categories/:slug/products',
    { schema: { params: slugParamsSchema, querystring: collectionQuerySchema } },
    async (request) => {
      const scope = await findCategoryScope(prisma, request.params.slug);
      if (scope === null) throw new AppError('NOT_FOUND', 'Category not found');
      const [{ rows, total }, priceRange] = await Promise.all([
        listProducts(prisma, { ...request.query, categoryIds: scope.ids }),
        findPriceBounds(prisma, scope.ids),
      ]);
      const data = await Promise.all(rows.map((row) => toProductSummary(row, imageUrls)));
      return ok(data, { page: request.query.page, limit: request.query.limit, total, priceRange });
    },
  );

  app.get('/products', { schema: { querystring: productListQuerySchema } }, async (request) => {
    const [{ rows, total }, priceRange] = await Promise.all([
      listProducts(prisma, request.query),
      findPriceBounds(prisma),
    ]);
    const data = await Promise.all(rows.map((row) => toProductSummary(row, imageUrls)));
    return ok(data, { page: request.query.page, limit: request.query.limit, total, priceRange });
  });

  app.get('/products/:slug', { schema: { params: slugParamsSchema } }, async (request, reply) => {
    const row = await findActiveProductBySlug(prisma, request.params.slug);
    if (row === null) throw new AppError('NOT_FOUND', 'Product not found');
    return sendWithEtag(reply, request.headers['if-none-match'], ok(await toDetail(row)));
  });

  app.get('/search', { schema: { querystring: searchQuerySchema } }, async (request) => {
    await rateLimiter.consume([{ key: `search:ip:${request.ip}`, ...SEARCH_RATE_LIMIT }]);
    const { q, type, limit } = request.query;
    const results = await app.ports.search.search({
      q,
      limit,
      ...(type === 'all' ? {} : { type: type === 'products' ? 'product' : 'category' }),
    });
    const rows = await findProductsByIds(
      prisma,
      results.products.map((hit) => hit.id),
    );
    const products = await Promise.all(rows.map((row) => toProductSummary(row, imageUrls)));
    return ok({
      products,
      categories: results.categories.map((hit) => ({ id: hit.id, slug: hit.slug, name: hit.name })),
    });
  });

  app.get('/settings/public', async () => ok(await app.settings.getPublic()));
};
