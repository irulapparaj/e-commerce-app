# P10 — Storefront catalogue pages (home, collection, PDP, search)

|                  |                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                        |
| Estimated effort | 5 dev-days                                                                                  |
| Depends on       | P04 (catalogue API), P09 (shell + components)                                               |
| Unblocks         | P11                                                                                         |
| Design refs      | DESIGN.md §2.3–2.5, §3 WF-01/02, §8 (storefront rows), §12 (Performance, SEO), §16, R8, R16 |
| Branch           | `feat/p10-storefront-catalogue`                                                             |

## 1. Goal

The public browsing experience: homepage, collection pages with URL-state filters and sort, the product detail page, the search overlay and results page — all ISR-rendered with on-demand revalidation, SEO structured data, and the minimalist design. "Add to Cart" buttons render and dispatch to the cart store; P11 makes them real.

## 2. Scope

### In

- `/` homepage: hero (single large still — featured product or settings-driven image), category grid, "Best Sellers" (featured products) grid, brand block, newsletter section (form wired in P16), hidden blog preview slot (P24)
- `/collections/[slug]`: breadcrumb, title + count, price filter (min/max), sort, grid/list toggle, pagination — all in URL search params; product cards with inline quantity + Add to Cart
- `/products/[slug]`: gallery with `srcset`/`sizes`, title/SKU/price/compare-at/"incl. of all taxes", variant selector, quantity, Add to Cart, Buy Now, description HTML, specifications, how to use, manufacturer note, related products; hidden reviews and wishlist slots (P21)
- Search: header overlay with debounced autocomplete (products + categories) and `/search?q=` results page grouped by type
- ISR: `revalidate` per page, `generateStaticParams` for top-level collections and featured products, cache tags matching P04
- SEO: `Product`, `BreadcrumbList`, `Organization`, `WebSite` (SearchAction) JSON-LD; per-page metadata; canonical; OG
- Loading skeletons, 404 for unknown/inactive, empty states

### Out

- Cart logic (P11), wishlist/reviews (P21), promo popup (P23), blog (P24), i18n content (P27)

## 3. Deliverables

```
apps/web/app/[locale]/{page.tsx, collections/[slug]/page.tsx, products/[slug]/page.tsx, search/page.tsx}
apps/web/app/[locale]/{collections/[slug]/loading.tsx, products/[slug]/loading.tsx}
apps/web/components/catalogue/{Hero, CategoryGrid, ProductCard, ProductGrid, CollectionToolbar, PriceFilter, SortSelect, ViewToggle, Pagination (uses ui), ProductGallery, VariantSelector, AddToCart, BuyNow, ProductInfo, Specifications, RelatedProducts, SearchOverlay, SearchResults, JsonLd}.tsx
apps/web/lib/catalogue/{params.ts, urls.ts, seo.ts}
apps/web/stores/cart.ts   # placeholder store with add(variantId, qty) recording intents; P11 replaces
apps/web/messages/en.json (+ catalogue namespace)
apps/web/components/catalogue/*.test.tsx  tests/e2e/browse.spec.ts  tests/e2e/visual/catalogue.spec.ts  tests/e2e/a11y/catalogue.spec.ts
```

## 4. Tasks (ordered)

1. **Params.** `params.ts`: Zod schema for collection search params (`sort`, `min`, `max` in rupees for URLs → paise for API, `page`, `view`), tolerant parsing (invalid → defaults, no 400s on pages); `urls.ts` builds canonical URLs (drop defaults from query so canonical is stable).
2. **Homepage.** Server component; `apiGet('/settings/public', tags ['settings','home'])`, `apiGet('/categories')`, `apiGet('/products?featured=true&limit=8', tags ['home'])`; `revalidate = 3600`. Hero = first featured product image at 1600 w with `priority` + `fetchPriority="high"`; category grid (image + name, hairline separators); best sellers grid of `ProductCard`; brand block copy from settings; newsletter section UI.
3. **ProductCard.** Image (aspect 4:5, `sizes`), name, `Price`, small-caps "Sale" when compare-at, `QuantityStepper` + `AddToCart` inline (collection cards) or compact (home); hover: image swap to second image if present, otherwise subtle scale (transform) — none under reduced motion; whole card is a link with a nested button pattern that stays accessible (button not inside anchor).
4. **Collection page.** `revalidate = 900`; `generateStaticParams` for top-level category slugs; toolbar (`CollectionToolbar`: count, `SortSelect`, `ViewToggle`, mobile "Filter" drawer with `PriceFilter` range inputs and apply); grid/list rendering; `Pagination` with `rel=prev/next` links; empty state; breadcrumb; child-category chips under the title for top-level collections.
5. **PDP.** `revalidate = 900`; `generateStaticParams` for featured products; `ProductGallery` (main image + thumbnails, keyboard arrows, `srcset` webp/avif with `<picture>`, no lightbox library — a simple zoom-on-click dialog using `ui/Dialog`); `ProductInfo` (title, SKU, price + tax note, `VariantSelector` as radio group updating price/availability, `QuantityStepper`, `AddToCart`, `BuyNow` (adds then navigates to `/cart` — P11 changes to `/checkout`), stock badges "In stock / Low stock / Out of stock" only); description via `dangerouslySetInnerHTML` of the **server-sanitised** HTML (R16) inside a `.prose` scope; `Specifications` table; how to use; manufacturer note from settings; `RelatedProducts` horizontal list (scroll-snap, no auto-play).
6. **Search.** `SearchOverlay` (opened from the header; input autofocus; debounced 250 ms `GET /search?q=&limit=6` via BFF; grouped results with keyboard navigation; Enter → `/search?q=`); `/search` page (`dynamic`, no ISR) with grouped sections and "no results" suggestions (top categories).
7. **SEO.** `seo.ts` builders: `Organization` (name, url, logo placeholder), `WebSite` with `SearchAction`, `BreadcrumbList`, `Product` (`offers` with `priceCurrency: INR`, `price` from default/selected variant in rupees, availability, `sku`, `brand`), rendered via `JsonLd` in a nonce'd script (P05 CSP nonce); `generateMetadata` per page (title, description from meta fields or truncated description text, canonical, OG image = first product image 1200 w).
8. **Cart intents.** `stores/cart.ts` Zustand placeholder: `add({ variantId, quantity })` pushes to an in-memory list and shows a toast "Added"; `useCartCount()` returns the sum. P11 replaces the internals; the component API stays.
9. **Performance.** Explicit `width/height` on all images; hero `priority`; below-the-fold images lazy; `sizes` attributes tuned per grid; route segments `loading.tsx` skeletons; no client component larger than needed (cards are server components with a small client island for the stepper/button).
10. **Tests & E2E.** `browse.spec.ts`: home → click category → collection → sort by price asc (URL updates, order verified) → filter min price → PDP → select variant (price updates) → search "kapur" finds camphor → results page. Visual snapshots for home/collection/PDP/search at 375/768/1440 light/dark; axe on all four pages.

## 5. Contracts

- URL state: `/collections/agarbatti?sort=price_asc&min=50&max=500&page=2&view=list` (rupees in URLs); defaults omitted from canonical.
- `AddToCart` calls `cart.add({ variantId, quantity })` and shows a toast; disabled when `!inStock`.
- `BuyNow` = `add` then `router.push('/cart')` (P11 changes target).
- JSON-LD emitted with the request nonce; product `price` string with two decimals.
- Cache tags used: `home`, `settings`, `categories`, `category:{slug}`, `product:{slug}`; search pages uncached.

## 6. Test plan

### Unit / component

- `params.ts`: tolerant parsing table (garbage → defaults; rupees↔paise conversion exact).
- `urls.ts`: canonical omits defaults; preserves non-default filters in sorted key order.
- `VariantSelector`: selecting updates price and availability; keyboard radio behaviour; out-of-stock variant disabled with label.
- `ProductCard`: nested-interactive pattern is accessible (axe); hover swap absent under reduced motion.
- `SearchOverlay`: debounce (fake timers), arrow navigation, Enter navigates, Escape closes, results announce count via `aria-live`.
- `seo.ts`: JSON-LD snapshots for a product with and without compare-at; breadcrumb depth.
- Description rendering: given server HTML containing an allowed `<a>` renders it; a test that a `<script>` string in fixture data is **not** stripped client-side (proves we rely on the server — assert it renders escaped only because the fixture is pre-sanitised; document).

### Integration (Vitest + msw mocking the API with P04 DTO fixtures)

- Each page renders server-side with the mocked data; 404 for `NOT_FOUND` responses; metadata generated; `revalidate` exported values asserted.

### E2E

- `browse.spec.ts` (task 10) against the seeded compose stack; visual + a11y specs.

### Performance (recorded now, gated in P18)

- Lighthouse CI on `/`, a collection and a PDP: LCP < 2.5 s, CLS < 0.1 on the compose stack with throttling; JS per route ≤ 150 kB gzipped.

### Security

- Only server-sanitised HTML is injected; the client never calls sanitize; nonce present on JSON-LD scripts; no query param reflected unescaped (search `q` is rendered via React text).

### Coverage targets

- `components/catalogue/**`, `lib/catalogue/**`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Home, collection, PDP, search render from the real API on compose and revalidate after an admin edit (manual check documented; automated in P18)
- [ ] URL state round-trips (reload preserves filters/sort/page)
- [ ] JSON-LD validates in Google's Rich Results test for a PDP (screenshot in PR)
- [ ] Visual baselines and axe clean for all four pages; Lighthouse numbers recorded in the PR
- [ ] No exact stock numbers or admin fields appear in any rendered HTML (grep the SSR output in a test)

## 8. Senior engineer review notes

- Cards as server components with a tiny client island keep the collection page fast; a fully client-rendered grid is the usual cause of missing the 150 kB budget.
- URL-as-state for filters is both a UX and an SEO requirement (shareable, crawlable); do not keep filters in React state only.
- The hover image swap is the one "delight" allowed by §16; it must be transform/opacity only and off under reduced motion.
- Put `revalidate` values in one constants file; scattered magic numbers make cache behaviour impossible to reason about in P18.
- `dangerouslySetInnerHTML` is acceptable _only_ because the API sanitises (R16); add a lint rule forbidding it outside `ProductInfo`/blog components.
- Search results page is dynamic on purpose; caching search would need query normalisation and is not worth it now.
- `BuyNow` navigating to `/cart` in this PR (not `/checkout`) keeps the plan independent of P12; P11 flips it.

## 9. Implementation prompt

```
You are implementing plan P10 from docs/plans/10-storefront-catalogue-pages.md. Read DESIGN.md §2.3–2.5, §3 WF-01/02, §12 (Performance, SEO) and §16, plus docs/plans/00-README.md (R8, R16). P04 and P09 are merged: use the public catalogue API DTOs, the P09 components/primitives, apiGet with cache tags, next-intl messages and the CSP nonce.

Deliver: the homepage (settings-driven hero as a single large priority image, category grid, featured "Best Sellers", brand block, newsletter UI slot), collection pages with URL-state filters/sort/pagination/view (rupees in URLs, paise to the API; canonical without defaults; generateStaticParams for top-level slugs; mobile filter drawer), the PDP (gallery with picture/srcset and keyboard thumbnails, variant selector radio group updating price/availability, quantity, Add to Cart and Buy Now → /cart for now, server-sanitised description HTML in a scoped prose block, specifications, how to use, manufacturer note, related products scroll-snap list), the header SearchOverlay with debounced grouped autocomplete and the /search results page, JSON-LD (Organization, WebSite SearchAction, BreadcrumbList, Product) with the request nonce, per-page metadata, loading skeletons, 404 handling, and a placeholder Zustand cart store exposing add() and useCartCount().

Work test-first from P10 §6: params/urls unit tests, VariantSelector/ProductCard/SearchOverlay component tests with axe, seo snapshot tests, SSR page tests with msw fixtures; then the browse Playwright spec, visual snapshots for the four pages at 375/768/1440 × light/dark, axe scans, and a Lighthouse CI run with numbers recorded.

Constraints: server components by default with minimal client islands, explicit image dimensions and sizes, no client-side sanitisation (add a lint rule restricting dangerouslySetInnerHTML to ProductInfo), revalidate values in one constants file, no exact stock numbers in HTML, immutable data, files ≤ 400 lines, all strings via next-intl.

When done: run all suites and specs on the compose stack, attach screenshots and Lighthouse numbers, complete the P10 Definition of Done, and stop for review.
```
