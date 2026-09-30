# P20 — Search: Meilisearch adapter (+ blog articles)

|                  |                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- |
| Phase            | 3 — Growth                                                                              |
| Estimated effort | 3 dev-days                                                                              |
| Depends on       | P19 (deployed baseline) · P04 (`SearchPort`) · P24 supplies articles when merged        |
| Unblocks         | P24 (article indexing hook)                                                             |
| Design refs      | DESIGN.md §3 WF-02, §5 (Search), §9 Catalogue & search, §11.2 (Search), §14 Phase 3, R2 |
| Branch           | `feat/p20-meilisearch`                                                                  |

## 1. Goal

Replace the Postgres full-text adapter with Meilisearch behind the unchanged `SearchPort`: typo-tolerant, synonym-aware, grouped results across products, categories and (when P24 lands) articles, with incremental indexing from catalogue hooks, a full reindex job, and automatic fallback to Postgres if Meilisearch is unhealthy.

## 2. Scope

### In

- `MeilisearchSearchAdapter` (products, categories, articles indexes; settings: searchable/filterable/sortable attributes, typo tolerance, synonyms `kapur ↔ kapoor ↔ camphor`, `agarbatti ↔ incense`, ranking rules), search-only key used server-side only
- `search-reindex` job (full) + incremental `indexProduct/removeProduct/indexCategory/indexArticle` on hooks; document mappers
- `CompositeSearchAdapter`: Meilisearch primary, Postgres fallback on error/unhealthy; `/readyz` reports `search: degraded`
- Route `GET /search?q=&type=all|products|categories|articles&limit=` unchanged contract + `highlights`; zero-result query counter
- Storefront overlay/results page: grouped sections incl. articles; highlight snippets
- Compose + Phase 2 tier: Meilisearch container with master key from the secret store; data volume; backups (dump nightly to object storage)

### Out

- Client-side tenant tokens (API keeps proxying), facets UI beyond price (Phase 4 candidate), Hindi/Tamil analyzers (P27)

## 3. Deliverables

```
apps/api/src/ports/adapters/{meilisearch-search.ts, composite-search.ts, meilisearch.settings.ts, meilisearch.mappers.ts}
apps/api/src/jobs/search-reindex.job.ts  apps/api/src/modules/search/{hooks.ts, dump.job.ts}
docker-compose.yml (+ meilisearch)  infra/tier-x (+ meilisearch service, volume, key)
apps/web/components/catalogue/{SearchOverlay.tsx (grouped + highlights), SearchResults.tsx}
apps/api/test/int/search/meilisearch.test.ts (Testcontainers Meilisearch)  tests/e2e/search.spec.ts
```

## 4. Tasks (ordered)

1. Index settings as code (`meilisearch.settings.ts`), applied idempotently at boot and by the reindex job; snapshot-tested.
2. Mappers: product doc `{ id, slug, name, sku, tags, categorySlug, categoryPath, priceFrom, isActive, imageUrl, updatedAt }`; category doc; article doc `{ id, slug, title, excerpt, tags, publishedAt }` (P24 provides; mapper lands now with a fixture).
3. Adapter with typed client; `search()` runs multi-search across indexes filtered `isActive = true`; returns grouped DTOs + highlights (sanitised: only `<em>` allowed).
4. Hooks: subscribe to catalogue write hooks from P04 and article hooks (P24); debounce per id; delete on unpublish.
5. Full reindex job (batched 500 docs, swap via index alias to avoid empty windows); nightly dump job to `backups/meilisearch/`.
6. Composite adapter + health check; env `SEARCH_ADAPTER=meilisearch|postgres`; `/readyz` degraded state does not fail readiness.
7. Web: overlay/results grouped with article section; keyboard nav across groups; zero-result suggestions unchanged.
8. Deployment notes for the tier (container, key in secret store, volume, dump restore).

## 5. Contracts

- `GET /search` response adds `articles: ArticleHit[]` and `highlights` per hit; existing fields unchanged.
- Meilisearch master key never leaves the API environment; no browser access to Meilisearch.
- Index alias `products` → `products_<timestamp>` swapped atomically on full reindex.

## 6. Test plan

- **Unit:** mappers; settings snapshot; highlight sanitiser rejects tags other than `<em>`.
- **Integration (Testcontainers Meilisearch + Postgres):** index seed → `kapor` finds camphor; `incense` finds agarbatti via synonym; inactive excluded; unpublish removes; full reindex leaves counts equal and no empty window (query during swap); composite falls back to Postgres when the container is stopped and `/readyz` shows degraded; hook-driven incremental update visible within 2 s.
- **E2E:** overlay shows grouped results with highlights; Enter → results page; article group present when an article exists (skipped until P24).
- **Security:** search endpoint rate limit unchanged; response never contains Meilisearch internals.
- **Coverage:** adapters + search module 85 %.

## 7. Definition of Done

- [ ] Contract of `GET /search` unchanged except additive fields; storefront works with either adapter
- [ ] Fallback and degraded readiness proven; reindex has no empty window
- [ ] Synonyms and typo tolerance verified with seed names
- [ ] Deployed on the tier with key management and nightly dump

## 8. Senior engineer review notes

- The port paid off here: this plan touches no route contracts. Keep it that way — no Meilisearch types in DTOs.
- Alias swapping is the difference between "search is empty for 30 seconds during reindex" and nobody noticing.
- Keep the Postgres adapter alive as the fallback; deleting it saves nothing and costs resilience.
- Synonyms are product knowledge; put them in settings-as-code with a test so a typo does not silently break "kapur".

## 9. Implementation prompt

```
You are implementing plan P20 from docs/plans/20-search-meilisearch.md. Read DESIGN.md §3 WF-02, §9 Catalogue & search, §11.2 Search and docs/plans/00-README.md (R2). P04's SearchPort and Postgres adapter exist; P19 deployed the baseline.

Deliver the Meilisearch adapter (settings as code with synonyms and typo tolerance, product/category/article mappers, multi-index search with sanitised highlights), incremental indexing from catalogue/article hooks, a batched full-reindex job using alias swap, a nightly dump job, a composite adapter with Postgres fallback and degraded readiness, SEARCH_ADAPTER env selection, the compose/tier service with the master key in the secret store, and the grouped storefront overlay/results with an articles section.

Work test-first with Testcontainers Meilisearch: synonym/typo/exclusion tests, unpublish removal, alias-swap no-empty-window test, fallback when the container stops, incremental latency; then the search Playwright spec.

Constraints: GET /search contract additive only, no Meilisearch types outside the adapter, key never exposed to the browser, immutable data, files ≤ 400 lines.

When done: run suites and E2E, deploy to staging, complete the P20 Definition of Done with evidence, and stop for review.
```
