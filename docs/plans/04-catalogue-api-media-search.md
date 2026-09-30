# P04 — Catalogue API, media pipeline, Postgres search, revalidation

|                  |                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                                                    |
| Estimated effort | 5 dev-days                                                                                                                                                              |
| Depends on       | P02                                                                                                                                                                     |
| Unblocks         | P06, P07, P10                                                                                                                                                           |
| Design refs      | DESIGN.md §2.2, §3 WF-01/02, §7 (Product, Variant, Image, Category), §9 Catalogue & search, §11.3 (Input validation and content; Uploads), §12 Performance, R2, R8, R16 |
| Branch           | `feat/p04-catalogue-api`                                                                                                                                                |

## 1. Goal

The read API the storefront needs (categories, collections with filters, product detail, search), the catalogue **services** the admin will call (create/update products, variants, images, categories — routes and UI are P06), a hardened media pipeline, rich-text sanitisation, the Postgres `SearchPort` adapter, a background job runner, and the ISR revalidation hook.

## 2. Scope

### In

- Public routes: `GET /categories`, `GET /categories/:slug/products`, `GET /products`, `GET /products/:slug`, `GET /search`, `GET /settings/public`
- Catalogue write **services** (no routes): products, variants, images, categories; `audit.record()` primitive
- Media: presigned upload service, `media-process` job (magic bytes, Sharp re-encode + derivatives, metadata strip, original deletion), URL builder
- Rich text: Tiptap JSON schema validation + HTML rendering + `sanitize-html`
- `SearchPort` Postgres adapter (tsvector + trigram)
- Job runner (`pg-boss`) with `media-process`, `revalidate` jobs
- Revalidation: API → web `POST /api/internal/revalidate` (route handler included here)
- Valkey cache for the category tree

### Out

- Admin routes/UI (P06), import (P07), storefront pages (P10), reviews/wishlist (P21), Meilisearch (P20)

## 3. Deliverables

```
apps/api/src/modules/catalogue/{routes.public.ts, dto.ts, queries.ts, filters.ts, product.service.ts, variant.service.ts, image.service.ts, category.service.ts, related.ts}
apps/api/src/modules/media/{presign.service.ts, process.job.ts, url.ts, allowed-types.ts}
apps/api/src/modules/richtext/{schema.ts, render.ts, sanitize.ts}
apps/api/src/modules/audit/record.ts
apps/api/src/modules/settings/public.ts
apps/api/src/ports/adapters/postgres-search.ts
apps/api/src/jobs/{boss.ts, register.ts, revalidate.job.ts}
apps/api/src/modules/revalidate/notify.ts
apps/web/app/api/internal/revalidate/route.ts
apps/api/test/int/catalogue/*.test.ts  apps/api/test/int/media/*.test.ts  tests/fixtures/media/{exif.jpg, polyglot.png, tiny.svg, sample.avif}
```

## 4. Tasks (ordered)

1. **Job runner.** `jobs/boss.ts` starts `pg-boss` on `DATABASE_URL` (schema `pgboss`), `register.ts` registers handlers; jobs run inside the API process in Phase 1 (`JOBS_ENABLED=true`), separable later by env. Retry policy per job; dead-letter logged with request id.
2. **DTOs.** `ProductSummaryDto { id, slug, name, categorySlug, priceFrom, compareAtFrom?, images[0], isFeatured, inStock, lowStock, ratingSummary: { avg: 0, count: 0 } }`; `ProductDetailDto` adds `descriptionHtml`, `specifications`, `howToUse`, `variants[] { id, label, price, compareAtPrice, inStock, lowStock, isDefault }`, `images[] { srcset per width/format, alt }`, `breadcrumb[]`, `related[]`, `seo { metaTitle, metaDescription }`, `hsnCode`, `gstRate`, `manufacturer` (from `SiteSetting.brand`/legal). Exact stock numbers are never exposed publicly.
3. **Filters/sort.** `filters.ts`: Zod query schema `{ sort: 'newest'|'price_asc'|'price_desc'|'featured' (default featured), minPrice?, maxPrice? (paise ints), page ≥ 1, limit 12–48 (default 24) }`; price filters apply to the default variant price. `bestselling` sort arrives with sales data in P25 — document.
4. **Queries.** Category tree (2 levels) → cached in Valkey `cat:tree` 5 min; collection query joins default variant, first image, `isActive` only, includes descendant categories for top-level slugs; product detail by slug; `related.ts` = same category, `isFeatured` first then newest, 8, excluding self.
5. **Public routes** with `meta { page, limit, total }`; 404 `NOT_FOUND` for unknown slug/inactive product; ETag on detail responses.
6. **Rich text.** `richtext/schema.ts`: Zod for the Tiptap doc (`doc > paragraph|heading(level 2|3)|bulletList|orderedList`, marks `bold|italic|link{href https-only}`, `hardBreak`); `render.ts` uses `@tiptap/html` `generateHTML` with the matching extensions; `sanitize.ts` allow-list `p,h2,h3,ul,ol,li,strong,em,a,br`, `a` gets `rel="noopener nofollow" target="_blank"`, disallowed schemes stripped. Detail responses carry `descriptionHtml` only (R16).
7. **Catalogue services** (used by P06/P07): `createProduct/updateProduct/setActive/setFeatured`, `upsertVariant/deleteVariant` (price changes recorded in audit with before/after), `addImage/reorderImages/deleteImage`, `createCategory/updateCategory/reorderCategories/deleteCategory` (refuse delete with products). Each service takes `{ actor }`, runs in a transaction, calls `audit.record(tx, …)`, invalidates `cat:tree`, and enqueues `revalidate` with tags. Slugs generated server-side from names (`slugify` + uniqueness suffix), never taken from input.
8. **Media.** `presign.service.presignProductImage({ productId, contentType, contentLength })` → validates type ∈ {image/jpeg, image/png, image/webp, image/avif} and ≤ 10 MB, key `products/{productId}/{uuid}.{ext}`, presigned PUT with `ContentType` and `content-length-range`, 5-min expiry. `confirmUpload(key)` enqueues `media-process` `{ key, productId, alt }`. `process.job.ts`: stream head → `file-type` on first 4 KB, mismatch or SVG/PDF → delete + `ImportError`-style audit; Sharp: rotate by EXIF then strip all metadata; derivatives at widths `[320, 640, 1024, 1600]` in `webp` (q80) and `avif` (q55) named `{base}-{w}.{ext}`; upload derivatives; delete original; insert `ProductImage { objectKey: base }`. `url.ts`: `imageUrl(base, w, fmt)` → `MEDIA_PUBLIC_BASE_URL/${key}` if set else presigned GET (1 h); `srcset` builder for DTOs.
9. **Search adapter.** `postgres-search.ts`: normalise `q` (trim, ≤ 100 chars); products: `search_vector @@ websearch_to_tsquery('english', $q)` ranked by `ts_rank`, union with trigram `similarity(name, $q) > 0.3` ordered by similarity (typo tolerance), `isActive` only, limit; categories: trigram on name. `indexProduct/removeProduct` are no-ops (generated column). Route `GET /search?q=&type=products|categories|all&limit=` → `{ products: ProductSummaryDto[], categories: [] }`; rate limit 60/min/IP.
10. **Revalidation (R8).** `notify.ts` enqueues `revalidate { tags }`; job POSTs `{ tags }` to `${WEB_ORIGIN}/api/internal/revalidate` with header `x-revalidate-secret`, 3 retries (1 s, 5 s, 30 s). Web route validates the secret (timing-safe), calls `revalidateTag` per tag, returns `{ revalidated: tags }`. Tag scheme: `home`, `categories`, `category:{slug}`, `product:{slug}`, `search`.
11. **Settings public.** `GET /settings/public` → `{ brand, announcementBar, promoPopup, freeShippingThreshold, pickupLocation.city }` from `SiteSetting`, cached 60 s.
12. **Audit primitive.** `audit.record(tx, { actorId, action, entityType, entityId, before, after, ip, userAgent })` with a redaction pass (drops `phone`, `line1`, `line2`, `totpSecret`, tokens) before insert.

## 5. Contracts

- `GET /categories → { data: CategoryNode[] }`, `CategoryNode { id, slug, name, imageUrl?, children[] }`.
- `GET /categories/:slug/products → { data: ProductSummaryDto[], meta }`; 400 `VALIDATION` on bad params.
- `GET /products/:slug → { data: ProductDetailDto }`; `ETag`; 404 if inactive.
- `GET /search?q= → { data: { products, categories } }`; empty `q` → 400.
- Services: `product.service.create(input, { actor, tx? }) → Product`; all inputs `.strict()` Zod; description is Tiptap JSON validated by `richtext/schema`.
- `media.presign → { url, key, headers, expiresAt }`; `media.confirm(key) → { jobId }`.
- Revalidate request `{ tags: string[] }`, header `x-revalidate-secret`.

## 6. Test plan

### Unit

- DTO mappers (price from default variant; `inStock`/`lowStock` booleans; no `stock` numbers leak — property test over random stock values).
- Filter schema (defaults, bounds, paise ints, unknown sort rejected).
- Rich text: schema rejects `script` nodes, unknown marks, `link` with `javascript:`/`data:`; render + sanitise against an XSS vector list (`<img onerror>`, `<svg onload>`, nested `<a href="javascript:">`, unicode-escaped schemes) → output contains none; allowed markup preserved.
- Slug generation (transliteration of accents, collision suffix).
- `imageUrl`/`srcset` builders for both public-base and presigned modes.
- Search query normalisation (length cap, special chars, `websearch` syntax injection like `' OR 1=1` stays a literal).

### Integration (Postgres + Valkey + MinIO; seeded)

- Category tree shape; cache hit on second call; invalidated after `createCategory`.
- Collection: pagination meta correct; `price_asc` order; `minPrice/maxPrice` filter; inactive product excluded; child-category products appear under parent.
- Product detail: `descriptionHtml` sanitised; `related` excludes self, max 8; unknown slug 404; inactive 404; ETag → 304.
- Search: finds "Pure Camphor" by `kapur` (trigram) and by SKU; ranks name match above tag match; inactive excluded; limit honoured.
- Media: presign for `image/svg+xml` → 400; 11 MB → 400; upload PNG → confirm → job → four widths × two formats exist in MinIO, original deleted, `ProductImage` row inserted; JPEG with EXIF → derivatives have no EXIF (Sharp `metadata()`); `polyglot.png` (PNG header + HTML) → rejected and deleted; content-type spoof (PDF as jpeg) → rejected.
- Services: `updateVariant` price change writes audit with before/after; `deleteCategory` with products → 409; every write enqueues `revalidate` with the right tags (assert on pg-boss queue).
- Revalidate job → stub HTTP server receives tags with secret; wrong secret → 401 from the web route (test the Next route handler directly).
- `GET /settings/public` shape and 60 s cache.

### E2E

- None (P10 covers pages).

### Security

- Path traversal in `:slug` (`../`, `%2e%2e`) → 400/404, never a filesystem or bucket access.
- Presign key never derives from client-supplied filename.
- `x-revalidate-secret` compared timing-safe (unit test on the helper).

### Coverage targets

- `modules/catalogue`, `modules/richtext`, `modules/media`, `ports/adapters/postgres-search.ts`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] All public catalogue routes in DESIGN §9 respond with the envelope and `meta`
- [ ] No public response contains exact stock or admin-only fields (test asserts DTO keys)
- [ ] Media job proven against MinIO with fixtures (EXIF stripped, polyglot rejected)
- [ ] Writes go through services with audit + revalidation; no route in this PR mutates data
- [ ] `pg-boss` schema created by migration or on boot, documented

## 8. Senior engineer review notes

- `pg-boss` keeps us hosting-agnostic (no SQS/Redis queues) and gives cron for later jobs; it is the right size for this store. Run it in-process now; splitting a worker later is one env flag.
- The trigram fallback is what makes "kapoor/kapur/camphor" work without Meilisearch; keep the similarity threshold configurable and test with the seed data's real names.
- Never render Tiptap JSON on the client; the storefront must only receive sanitised HTML (R16). Snapshot the allow-list in a test so widening it is a reviewed change.
- Derivatives are generated once at upload; do not add on-the-fly resizing routes (they are an easy DoS).
- Keep `ProductImage.objectKey` as the base key and compute derivative names deterministically; storing eight keys per image is needless.
- The related-products query must use the same `isActive` filter as everything else; a common bug is leaking unpublished products through "related".
- ETag on product detail is cheap and helps ISR revalidation verification in P10.
- `audit.record` lives here so P06/P07 can use it; P05 only adds the read API. Do not duplicate it.

## 9. Implementation prompt

```
You are implementing plan P04 from docs/plans/04-catalogue-api-media-search.md. Read docs/plans/00-README.md (R2, R8, R16) and DESIGN.md §3 WF-01/02, §7 Product/Variant/Image/Category, §9 Catalogue & search, §11.3 "Input validation and content" and "Customer uploads/File uploads" first. P01–P02 are merged: use the ports (ObjectStoragePort→MinIO), the Prisma client, applyMovement, the audit-free services pattern and the test harness.

Deliver: pg-boss job runner (in-process, env-gated) with media-process and revalidate jobs; public catalogue routes (categories tree with Valkey cache, collection listing with filters/sort/pagination, product detail with sanitised descriptionHtml/srcset/related/breadcrumb, search via SearchPort, settings/public); catalogue write services for products/variants/images/categories that run in transactions, record audit (audit.record primitive with redaction), invalidate the tree cache and enqueue revalidation tags; the media pipeline (presigned PUT restricted to jpeg/png/webp/avif ≤ 10 MB with server-generated keys; process job with file-type magic-byte check, Sharp EXIF-rotate + metadata strip, webp/avif derivatives at 320/640/1024/1600, original deleted); rich-text Tiptap schema + @tiptap/html rendering + sanitize-html allow-list; the Postgres SearchPort adapter (tsvector + trigram fallback); the revalidate notifier and the Next.js /api/internal/revalidate route handler with timing-safe secret check.

Work test-first from P04 §6: unit tests for DTO mappers (prove no stock numbers leak), filters, rich-text XSS vectors, slugs, URL builders, search query normalisation; then integration tests against seeded Postgres/Valkey/MinIO for every route, the media job with the fixtures in tests/fixtures/media (add an EXIF JPEG, a PNG/HTML polyglot, an SVG, a PDF renamed .jpg), service audit + revalidation enqueue, and the revalidate job against a stub server.

Constraints: no routes that mutate data in this PR (services only), immutable data, files ≤ 400 lines, .strict() Zod for every input, slugs and object keys never taken from client input, storefront receives HTML only, no on-the-fly image resizing endpoints.

When done: run unit + integration suites, show a product created via the service appearing in GET /products/:slug with derivatives in MinIO, and complete the P04 Definition of Done with evidence. Stop for review.
```
