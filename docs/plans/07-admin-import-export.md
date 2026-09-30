# P07 — Admin import / export

|                  |                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                                     |
| Estimated effort | 4 dev-days                                                                                                                                               |
| Depends on       | P06                                                                                                                                                      |
| Unblocks         | — (P18 uses it to load E2E catalogue)                                                                                                                    |
| Design refs      | DESIGN.md §3 WF-17, §7 (ImportJob, StockMovement), §8.1 Import/Export row, §9 Admin Import/Export, §11.2 (Bulk import row), §11.3 (Bulk import / export) |
| Branch           | `feat/p07-import-export`                                                                                                                                 |

## 1. Goal

Load and maintain the catalogue from a spreadsheet safely: template download, upload to object storage, a validating dry-run that reports every row problem, a transactional apply keyed by SKU that writes the stock ledger, and injection-guarded exports with PII minimisation and expiry.

## 2. Scope

### In

- Template (CSV + XLSX) generated from the row schema so columns cannot drift
- Upload via presigned PUT to the `imports` bucket; `ImportJob` lifecycle `UPLOADED → VALIDATED → APPLIED | FAILED`
- `import-validate` job (parse as text, per-row Zod, cross-row checks, report) and `import-apply` job (single transaction, upsert by SKU, variants by variant SKU, stock as delta via `applyMovement(IMPORT)`, categories by slug, audit per job)
- Error report CSV; import history page; apply with step-up
- Exports: products (STAFF), orders and customers (ADMIN ⚡, PII-minimised), generated as jobs into `exports/` with 24 h expiry (`export-expire` job); CSV-injection guard

### Out

- Image import (images use P06's uploader matched by filename `SKU-1.jpg` — a "bulk image upload" screen is included here as a thin wrapper over the P06 presign flow), translations (P27), order import

## 3. Deliverables

```
apps/api/src/modules/imports/{routes.ts, row.schema.ts, template.ts, parse.ts, validate.job.ts, apply.job.ts, report.ts}
apps/api/src/modules/exports/{routes.ts, products.export.ts, orders.export.ts, customers.export.ts, csv-safe.ts, expire.job.ts}
apps/web/app/admin/import/{page.tsx, [jobId]/page.tsx}  apps/web/app/admin/export/page.tsx
apps/web/components/admin/import/{UploadCard.tsx, DryRunReport.tsx, ApplyBar.tsx, HistoryTable.tsx, BulkImageUpload.tsx}
tests/fixtures/imports/{valid.csv, valid.xlsx, formula.xlsx, bad-rows.csv, too-many-rows.csv, unknown-column.csv}
apps/api/test/int/imports/*.test.ts  apps/api/test/int/exports/*.test.ts  tests/e2e/admin-import.spec.ts
```

## 4. Tasks (ordered)

1. **Row schema.** `row.schema.ts` (Zod, `.strict()`; all inputs strings): `sku` (product), `name`, `category_slug`, `description_text` (plain → converted to a single-paragraph Tiptap doc), `how_to_use?`, `specifications?` (`key=value|key=value`), `hsn_code` (4–8 digits), `gst_rate` (`5|12|18`), `tags?` (`a|b`), `is_active` (`true|false`), `is_featured?`, `variant_sku`, `variant_label`, `price_inr` (decimal string → paise via `rupeesToPaise`), `compare_at_price_inr?`, `stock` (int ≥ 0, absolute), `weight_grams` (int > 0), `low_stock_threshold?`, `meta_title?`, `meta_description?`. Multiple rows share a product `sku`; product-level fields must be identical across the group (cross-row check).
2. **Template.** `template.ts` builds header + two example rows from the schema keys (CSV UTF-8 with BOM; XLSX via `exceljs` with text-formatted columns); `GET /admin/import/template?format=csv|xlsx`.
3. **Upload.** `POST /admin/import { contentType, contentLength }` (ADMIN) → presigned PUT `imports/{jobId}.{csv|xlsx}`, ≤ 5 MB, creates `ImportJob UPLOADED`; `POST /admin/import/:jobId/validate` → enqueues `import-validate`.
4. **Parse.** `parse.ts`: detect by magic bytes (ZIP → XLSX, else CSV); CSV via `papaparse` `{ dynamicTyping: false, header: true, skipEmptyLines: true }`; XLSX via `exceljs` reading `cell.text` (never `cell.value`/`result`) so formulas are literal text; strip BOM; row cap 5,000 (fail fast with `IMPORT_TOO_MANY_ROWS`); unknown header → `IMPORT_UNKNOWN_COLUMN`.
5. **Validate job.** Per row: Zod → collect `{ line, field, message }`; cross-row: duplicate `variant_sku`, inconsistent product fields within a `sku` group, unknown `category_slug`; classify each product as `create`/`update` by existing `sku`; compute stock deltas against current cached stock; write report JSON to the job (`okRows`, `errorRows`, summary) and the error CSV to `imports/{jobId}-errors.csv`; state `VALIDATED` (or `FAILED` when > 0 errors — apply is refused until a clean file is uploaded; partial applies are not allowed).
6. **Apply job.** `POST /admin/import/:jobId/apply` (ADMIN ⚡; only from `VALIDATED` with 0 errors; re-validates the file hash matches) → single transaction: upsert categories? **No** — categories must pre-exist (safer); upsert products by `sku` (content via P04 service, commercial fields allowed here because the route is ⚡), variants by `variant_sku`, stock delta via `applyMovement({ reason:'IMPORT', referenceId: jobId })`, one `audit.record` for the job with counts; on any error the whole transaction rolls back and the job is `FAILED` with the error; success → `APPLIED`, revalidate tags for touched products/categories + `home`.
7. **History & UI.** `GET /admin/import` (jobs list), `GET /admin/import/:jobId` (report), `GET /admin/import/:jobId/errors` (presigned GET). Pages: `UploadCard` (template links, drag-drop, client checks), job page with `DryRunReport` (tabs: creates, updates, errors with line numbers; stock delta preview), `ApplyBar` (disabled until clean; step-up), `HistoryTable`. `BulkImageUpload`: drop many files named `SKU-n.ext`, resolves SKU → product, reuses P06 presign/confirm per file, shows per-file status.
8. **Exports.** `csv-safe.ts`: prefix `'` to cells starting with `= + - @ \t \r`; always quote. `products.export.ts` (STAFF): full catalogue in the import format (round-trips). `orders.export.ts` (ADMIN ⚡): order number, date, status, totals, city/state/pincode, masked phone, item lines — no names/addresses unless `?full=true` with a `reason` (audited). `customers.export.ts` (ADMIN ⚡): id, hashed email, created, order count, masked phone. Jobs write to `exports/{type}-{uuid}.csv`; `GET /admin/export/:id` → presigned GET (15 min); `export-expire` cron deletes objects > 24 h.
9. **E2E** `admin-import.spec.ts`: download template → upload `valid.csv` (3 products, 5 variants) → dry-run shows 3 creates → apply with step-up → products visible via public API and stock ledger has IMPORT rows; upload `bad-rows.csv` → errors listed with line numbers, apply disabled.

## 5. Contracts

- `ImportJob` API shape: `{ id, status, totalRows, okRows, errorRows, summary: { creates, updates, stockDeltas }, errorReportUrl?, createdAt, appliedAt }`.
- Error CSV columns: `line, field, message, value(truncated 80)`.
- Stock semantics: `stock` column is the **target** absolute stock; apply writes `delta = target − current` (0 delta → no movement).
- Export row order and columns are stable and documented in `template.ts`.

## 6. Test plan

### Unit

- `parse.ts`: `formula.xlsx` cell `=1+1` yields the string `"=1+1"`; CSV `"007"` stays `"007"`; BOM stripped; unknown column error; row cap.
- `row.schema.ts`: each field's valid/invalid cases; `price_inr` `"80"`, `"80.50"`, `"80.555"` (reject); specifications parser (`k=v|k2=v2`, `=` inside value); tags.
- Cross-row checks: inconsistent `name` within a sku group; duplicate variant sku.
- `csv-safe.ts`: every dangerous prefix neutralised; normal values untouched; quoting of commas/quotes/newlines.
- Delta computation table (target vs current incl. equal).

### Integration

- Validate job on `valid.csv` → `VALIDATED`, counts right; on `bad-rows.csv` → `FAILED` with error CSV listing line numbers; `too-many-rows.csv` → `IMPORT_TOO_MANY_ROWS`.
- Apply: creates products/variants; rerun same file → all `update`, zero stock movements; changed stock → correct delta movements with `referenceId = jobId`; a forced failure mid-way (e.g. category deleted between validate and apply) → transaction rolled back, job `FAILED`, no partial products.
- Apply refused from `UPLOADED`/`FAILED`; refused if file hash changed after validation; requires step-up.
- Audit row per job with counts; revalidate tags enqueued.
- Exports: products export round-trips through validate with 0 errors; orders export masks phone and omits address lines by default; `full=true` without reason → 400; export object deleted by `export-expire` after 24 h (clock injection).

### E2E

- `admin-import.spec.ts` (task 9).

### Security

- XLSX with external link / macro-bearing `.xlsm` renamed `.xlsx` → rejected by magic/type checks; CSV with `=HYPERLINK(...)` in a name → imported as literal text and exported with `'` prefix.
- STAFF cannot call apply or orders/customers exports (403).

### Coverage targets

- `modules/imports/**`, `modules/exports/**`: 90 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Template columns generated from the schema (test: template headers == schema keys)
- [ ] Formula cells never evaluated (fixture test)
- [ ] Apply is all-or-nothing and re-validates the file hash
- [ ] Exports pass the injection guard and expire
- [ ] E2E import → storefront-visible products with IMPORT ledger rows

## 8. Senior engineer review notes

- "Cells as text" is the whole security story for spreadsheets; `exceljs` `cell.text` and papaparse without dynamic typing do it — write the fixture tests before the parser.
- Absolute stock in the sheet, delta in the ledger: this is what lets the same sheet be re-applied safely. Do not implement "stock += column".
- Refusing partial applies is a product decision: operators fix the sheet and re-upload. It avoids half-loaded catalogues that are painful to reconcile.
- Categories are not created by import on purpose; a typo in `category_slug` should fail validation, not spawn a category.
- Keep exports as jobs even though small today; synchronous CSV generation of orders will time out at the first festival.
- The `full=true` export path is a PII exfiltration route — reason + step-up + audit + 15-min link is the minimum; consider disabling entirely until a real need appears.

## 9. Implementation prompt

```
You are implementing plan P07 from docs/plans/07-admin-import-export.md. Read DESIGN.md §3 WF-17, §8.1 Import/Export, §9 Admin Import/Export and §11.3 "Bulk import / export" first. P01–P06 are merged: use ObjectStoragePort (imports/exports buckets), pg-boss, applyMovement, the P04 catalogue services (commercial fields allowed on the step-up apply route), audit.record, revalidation, the P05 admin shell and step-up handling.

Deliver: the strict row schema with cross-row checks; template generation (CSV with BOM, XLSX text columns) from the schema; presigned upload creating ImportJob; parse.ts reading XLSX via exceljs cell.text and CSV via papaparse without dynamic typing, with magic-byte detection, 5,000-row cap and unknown-column rejection; the import-validate job producing counts, create/update classification, stock deltas and an error CSV; the import-apply job (ADMIN step-up, only from a clean VALIDATED job with matching file hash) that upserts products/variants by SKU and writes IMPORT stock movements in one transaction with a single audit row and revalidation; import history/report/error-download routes; exports (products round-trip format; orders/customers ADMIN step-up, PII-minimised, full=true requires a reason and is audited) generated as jobs with 24-h expiry and a CSV-injection guard; admin pages (UploadCard, DryRunReport, ApplyBar, HistoryTable, BulkImageUpload reusing P06 presign by filename SKU-n.ext).

Work test-first from P07 §6 using the fixtures in tests/fixtures/imports (create them: valid.csv, valid.xlsx, formula.xlsx with =1+1, bad-rows.csv, too-many-rows.csv, unknown-column.csv): parser and schema unit tests, validate/apply integration tests including rollback on mid-apply failure, hash mismatch, idempotent re-apply, export masking and expiry; the admin-import Playwright spec.

Constraints: immutable data, files ≤ 400 lines, no formula evaluation anywhere, categories never auto-created, no partial applies, every job audited.

When done: run all suites and the E2E, complete the P07 Definition of Done with evidence, and stop for review.
```
