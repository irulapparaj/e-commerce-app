# P06 — Admin catalogue & inventory

|                  |                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                               |
| Estimated effort | 4 dev-days                                                                                                                         |
| Depends on       | P04 (services, media, rich text), P05 (admin shell, step-up)                                                                       |
| Unblocks         | P07                                                                                                                                |
| Design refs      | DESIGN.md §8.1 (Products, Inventory, Categories rows), §9 Admin (Products, Inventory), §7 (StockMovement), §11.3 (Uploads), R7, R8 |
| Branch           | `feat/p06-admin-catalogue`                                                                                                         |

## 1. Goal

Admins and staff can manage the catalogue end to end — products, variants, images, categories — and operate inventory through the ledger, with the §8.1 permissions and step-up rules enforced by the API and reflected in the UI. Every change revalidates the storefront.

## 2. Scope

### In

- Admin routes wiring P04 services: products (list/search, create, update, activate/publish, feature), variants, images (presign, confirm, reorder, alt, delete), categories (tree, create, update, reorder, delete)
- Inventory routes: stock table, low-stock list, manual adjustment (reason required; step-up above 100 units), movement ledger with filters
- `ledger-check` nightly job (R7) + counter surfaced on `/admin/security`
- Admin pages: products list, product editor (Tiptap editor constrained to the P04 schema, specifications editor, variants table, image uploader with progress + reorder, SEO fields, publish/feature toggles), categories tree editor, inventory (stock, low-stock, adjust dialog, ledger)

### Out

- Import/export (P07), reviews moderation (P21), bundles (P26)

## 3. Deliverables

```
apps/api/src/modules/admin/{products.routes.ts, variants.routes.ts, images.routes.ts, categories.routes.ts, inventory.routes.ts}
apps/api/src/modules/inventory/{adjust.service.ts, ledger.query.ts, low-stock.query.ts, ledger-check.job.ts}
apps/web/app/admin/{products/page.tsx, products/new/page.tsx, products/[id]/page.tsx, categories/page.tsx, inventory/page.tsx, inventory/movements/page.tsx}
apps/web/components/admin/catalogue/{ProductForm.tsx, RichTextEditor.tsx, SpecificationsEditor.tsx, VariantsTable.tsx, ImageUploader.tsx, ImageGrid.tsx, CategoryTree.tsx, PublishToggle.tsx}
apps/web/components/admin/inventory/{StockTable.tsx, AdjustDialog.tsx, LedgerTable.tsx, LowStockList.tsx}
apps/web/lib/admin/upload.ts   # presigned PUT with progress and retry
apps/api/test/int/admin-catalogue/*.test.ts  apps/web/components/admin/catalogue/*.test.tsx  tests/e2e/admin-catalogue.spec.ts
```

## 4. Tasks (ordered)

1. **Product routes.** `GET /admin/products?q&status&category&page` (STAFF; includes inactive; exact stock visible), `POST /admin/products` (STAFF; created inactive), `PUT /admin/products/:id` (STAFF for content fields; price/publish/feature fields require ADMIN + step-up — split into `PATCH /admin/products/:id/content` (STAFF) and `PATCH /admin/products/:id/commercial` (ADMIN ⚡) so the guard is route-level, not field-level), `DELETE` only when never ordered (else 409 → use unpublish).
2. **Variants.** `PUT /admin/products/:id/variants/:variantId` content (label, weight, default) STAFF; price/compareAt ADMIN ⚡; `POST` create (ADMIN ⚡ because it sets a price); `DELETE` if no order items reference it.
3. **Images.** `POST /admin/products/:id/images/presign` (STAFF), `POST …/images/confirm`, `PATCH …/images/order`, `PATCH …/images/:imageId` (alt), `DELETE`. Presign refuses when the product already has 12 images.
4. **Categories.** `GET /admin/categories` (tree with counts), `POST`, `PUT /:id`, `PATCH /reorder { orderedIds }`, `DELETE /:id` (409 if products or children), image presign reusing the media pipeline with key prefix `categories/`.
5. **Inventory.** `adjust.service.adjust({ variantId, delta, reason:'ADJUSTMENT', note, actor })` → `applyMovement` in a transaction + audit; route requires STAFF, and ADMIN ⚡ when `|delta| > 100`. `GET /admin/inventory?q&category&belowThreshold` (variant rows: sku, product, label, stock, threshold, last movement), `GET /admin/inventory/low-stock`, `GET /admin/inventory/movements?variantId&reason&from&to&page`.
6. **`ledger-check` job.** pg-boss cron `0 2 * * *` (IST 02:00 → `20 30 * * *` UTC; document): for each variant compare `stock` with `SUM(delta)`; mismatches → log `inventory.ledger.drift`, increment security counter, optionally auto-heal is **off** (report only). Manual trigger route `POST /admin/inventory/ledger-check` (ADMIN).
7. **Revalidation.** Every route above calls the P04 service which enqueues tags; images confirm → tag `product:{slug}` after the job completes (job enqueues revalidate on success).
8. **Product editor UI.** `ProductForm` with React Hook Form + the shared Zod schemas; `RichTextEditor` = Tiptap with only the P04-allowed nodes/marks (StarterKit trimmed, Link with https validation); `SpecificationsEditor` (key/value rows, reorder); `VariantsTable` (inline edit, price fields disabled for STAFF with a hint, step-up on save for ADMIN); `ImageUploader` (client validates type/size, requests presign, PUTs with progress via `XMLHttpRequest`, confirms, polls job status until derivatives are ready, shows thumbnails); `ImageGrid` (drag reorder, alt text, delete); `PublishToggle` (ADMIN ⚡). "Saved" state, unsaved-changes guard.
9. **Categories page.** Tree with drag reorder (keyboard alternative: move up/down buttons), create/edit dialog, image, delete with guard message.
10. **Inventory pages.** `StockTable` with search/filter and low-stock badge; `AdjustDialog` (delta, reason note ≥ 5 chars, preview new stock; step-up when needed); `LedgerTable` with filters and CSV-free (export is P07); `LowStockList` linked from the dashboard tile.
11. **E2E** `admin-catalogue.spec.ts`: ADMIN creates a product with two variants and an image (fixture PNG), publishes with step-up; `GET /api/products/:slug` (via BFF) returns it with derivatives; STAFF edits description but cannot change price (field disabled; direct API → 403); STAFF adjusts stock −5 with a note; ADMIN adjusts +150 → step-up; ledger shows both.

## 5. Contracts

- Route/role/step-up table (used by tests):

| Route                                                                                                                                  | STAFF | ADMIN | ⚡  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- | --- |
| `GET /admin/products`, `POST /admin/products`, `PATCH …/content`, images, `PATCH …/variants/:id` (content)                             | ✓     | ✓     | —   |
| `PATCH …/commercial`, `POST …/variants`, `PATCH …/variants/:id` (price), `DELETE` product/variant, `PATCH /admin/products/:id/publish` | ✗     | ✓     | ✓   |
| Categories read                                                                                                                        | ✓     | ✓     | —   |
| Categories write                                                                                                                       | ✗     | ✓     | —   |
| Inventory read, adjust ≤ 100                                                                                                           | ✓     | ✓     | —   |
| Adjust > 100, ledger-check trigger                                                                                                     | ✗     | ✓     | ✓   |

- `POST /admin/inventory/:variantId/adjust { delta: int ≠ 0, note: string ≥ 5 } → { data: { stock, movementId } }`; 409 `INSUFFICIENT_STOCK` when the result would be negative.
- Image confirm returns `{ jobId }`; `GET /admin/jobs/:id` → `{ state, error? }` (small generic endpoint added here).

## 6. Test plan

### Unit

- Editor schema guard: `RichTextEditor` output for a pasted `<script>`-laden fragment conforms to the P04 schema (Tiptap drops it); `SpecificationsEditor` rejects duplicate keys.
- `AdjustDialog` computes step-up need at `|delta| > 100` boundary (100 no, 101 yes).
- `ledger-check` comparison logic (pure function over rows).

### Integration

- Table-driven RBAC for every route in §5 (STAFF/ADMIN × with/without step-up).
- Content PATCH cannot change price even if the field is sent (`.strict()` → 400).
- Publish requires at least one variant and one processed image → else 422 `PRODUCT_INCOMPLETE`.
- Adjust: writes movement + audit; −(stock+1) → 409 and no movement; 20 concurrent −1 adjustments on stock 10 → exactly 10 succeed.
- Ledger-check: corrupt `stock` via `prismaRaw` → job reports drift and counter increments; no auto-heal.
- Category delete with products → 409; reorder persists `sortOrder`; tree cache invalidated.
- Image presign refuses 13th image; confirm → job → `GET /admin/jobs/:id` reaches `completed`; product detail lists derivatives; revalidate enqueued after completion.

### Web

- `ImageUploader` rejects `.svg` and > 10 MB client-side with a message; progress events update; retry on network failure once.
- `VariantsTable` disables price inputs for STAFF (role from session).

### E2E

- `admin-catalogue.spec.ts` (task 11).

### Security

- Presigned PUT with a different content-type than requested → S3 rejects (integration against MinIO).
- IDs in routes are UUIDs; non-UUID → 400 not 500.

### Coverage targets

- `modules/admin/{products,variants,images,categories,inventory}.routes.ts`, `modules/inventory/**`: 85 %; admin catalogue components: 80 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Route/role table in §5 is enforced by tests and matches DESIGN §8.1
- [ ] No route accepts price or publish changes outside the ⚡ routes
- [ ] Ledger-check job scheduled and manually triggerable; drift test passes
- [ ] E2E creates a product with an image and sees derivatives via the public API
- [ ] Storefront revalidation enqueued for every catalogue mutation (test asserts queue)

## 8. Senior engineer review notes

- Splitting content vs commercial updates into separate routes makes the step-up rule a route guard instead of field inspection — simpler and testable. Keep that shape even if the form submits both (the client sends two requests).
- Tiptap on the client must use exactly the extensions P04 allows; otherwise the server rejects the JSON and the editor looks broken. Share the extension list from `packages/shared` if practical.
- Uploads go browser → MinIO/S3 directly via presigned PUT; the API never proxies bytes. In production this needs bucket CORS (Phase 2 note in P19).
- Do not add "set absolute stock" to the UI; adjustments are deltas with reasons so the ledger explains every number. Absolute stock only exists in import (P07) where it is converted to a delta.
- The "12 images" cap and "publish requires an image" rule are product-quality guards; keep them, they prevent empty PDPs.
- Ledger auto-heal is deliberately off: drift means a bug, and hiding it would defeat the ledger.

## 9. Implementation prompt

```
You are implementing plan P06 from docs/plans/06-admin-catalogue-inventory.md. Read docs/plans/00-README.md (R7, R8) and DESIGN.md §8.1 (Products, Inventory, Categories rows), §9 Admin Products/Inventory, §11.3 "File uploads". P01–P05 are merged: use the P04 catalogue/media/richtext services and audit.record, applyMovement from P02, the P03 guards and the P05 admin shell (StepUpProvider, DataTable, FormField, ConfirmDialog, Toast, adminApi).

Deliver the admin routes that wire the P04 services with the exact role/step-up table in P06 §5 (content vs commercial PATCH routes, publish route requiring ≥1 variant and ≥1 processed image, images presign/confirm/reorder/alt/delete with a 12-image cap, categories CRUD/reorder with delete guards), inventory adjust service and routes (delta + note, ADMIN step-up above 100 units), low-stock and ledger queries, the nightly ledger-check pg-boss job (report-only) with a manual trigger and a security counter, a small GET /admin/jobs/:id, and the admin pages/components: products list, product editor (Tiptap restricted to the P04 schema, specifications editor, variants table with role-disabled price fields, direct-to-bucket ImageUploader with progress/retry, ImageGrid reorder, publish toggle), categories tree editor, inventory stock table, AdjustDialog, LedgerTable, LowStockList.

Work test-first from P06 §6: table-driven RBAC integration tests for every route, publish preconditions, adjust concurrency (20 parallel −1 on stock 10), ledger drift detection, category guards, image cap and job completion; web tests for the uploader and role-disabled fields; the admin-catalogue Playwright spec.

Constraints: immutable data, files ≤ 400 lines, the API never proxies upload bytes, no absolute-stock setter in the UI, every mutation audited and revalidated, .strict() Zod everywhere.

When done: run all suites and the E2E on the compose stack, complete the P06 Definition of Done with evidence, and stop for review.
```
