# P21 — Wishlist & reviews

|                  |                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 3 — Growth                                                                                                                         |
| Estimated effort | 3 dev-days                                                                                                                         |
| Depends on       | P19 · P10 (hidden slots), P15 (account), P13 (review-invite template)                                                              |
| Unblocks         | —                                                                                                                                  |
| Design refs      | DESIGN.md §3 WF-07/09, §7 (Review, WishlistItem), §8.1 Reviews row, §9 Account (wishlist, reviews), §11.3 (Authorisation: reviews) |
| Branch           | `feat/p21-wishlist-reviews`                                                                                                        |

## 1. Goal

Customers can save products (as guests locally, synced on login) and leave reviews only for items they actually received; staff moderate; product pages show honest aggregate ratings.

## 2. Scope

### In

- Wishlist API (`GET /wishlist`, `POST/DELETE /wishlist/:variantId`, `POST /wishlist/sync` for local→server merge at login), header heart count, `/wishlist` page, heart on cards/PDP (unhide P10 slots), guest wishlist in `localStorage` (variant ids only)
- Reviews API: `POST /products/:slug/reviews` (verified purchase: an `OrderItem` of this product in a `DELIVERED` order owned by the user; one review per order item; plain text ≤ 2,000; rating 1–5; status `PENDING`), `GET /products/:slug/reviews` (approved, paginated), rating summary aggregate (cached, recomputed on approval), admin `/admin/reviews` queue (STAFF approve/hide, ADMIN delete), `review-invite` email 7 days after delivery (job scheduled by the delivered hook)
- PDP: reviews section (summary bars, list, "Verified purchase" badge, write-review CTA when eligible); account order detail: "Write a review" per delivered item

### Out

- Review photos, replies, helpfulness votes, incentives

## 3. Deliverables

```
apps/api/src/modules/wishlist/{routes.ts, sync.ts}
apps/api/src/modules/reviews/{routes.ts, eligibility.ts, summary.ts, moderation.routes.ts, invite.job.ts}
apps/web/components/{catalogue/WishlistButton.tsx, wishlist/WishlistPage.tsx, reviews/{ReviewSummary, ReviewList, ReviewForm}.tsx, admin/reviews/ReviewQueue.tsx}
apps/web/stores/wishlist.ts  apps/web/app/[locale]/wishlist/page.tsx  apps/web/app/admin/reviews/page.tsx
apps/api/test/int/{wishlist,reviews}/*.test.ts  tests/e2e/{wishlist,reviews}.spec.ts
```

## 4. Tasks (ordered)

1. Wishlist store: guest ids in `localStorage` (try/catch), server for users; after the BFF login succeeds, POST local ids to `/wishlist/sync` (server union), clear local; header count from the store.
2. `WishlistButton` (heart with `aria-pressed`; filled icon in text colour — the accent is reserved for CTAs), `/wishlist` page with current price/availability, Add to Cart, remove.
3. Eligibility: `eligibility.ts` returns eligible `orderItemId`s for (user, product); `POST` enforces (409 `REVIEW_NOT_ELIGIBLE` / `REVIEW_EXISTS`); rate limit 5/day/user; HTML stripped, plain text only.
4. Summary: `summary.ts` recomputes `{ avg, count, histogram }` on approve/hide; cached in Valkey `reviews:summary:{productId}`; included in product DTOs; PDP renders bars.
5. Moderation queue with RBAC per §8.1; audit; optional hide reason.
6. Invite job: on `onOrderDelivered` schedule `review-invite` +7 d (skips if reviewed or suppressed); links to `/account/orders/{id}`.
7. Web: PDP section, account CTA, admin queue page; E2E specs.

## 5. Contracts

- `POST /wishlist/sync { variantIds[] } → { data: WishlistItem[] }` (union, max 100).
- `POST /products/:slug/reviews { orderItemId, rating, title?, body } → 201 { status:'PENDING' }`.
- Product DTOs gain `ratingSummary { avg, count, histogram[5] }` (shaped in P04 with zeros).
- Review DTO shows reviewer as initial + masked surname (`Sunita R.`), never email.

## 6. Test plan

- **Unit:** eligibility table (delivered/not, owner/not, already reviewed); summary math; reviewer masking.
- **Integration:** guest sync union + cap; IDOR on wishlist; review on undelivered → 409; other user's item → 404; duplicate → 409; HTML stored as text; approve updates summary and DTO; hide removes; RBAC (STAFF approve, ADMIN delete); invite scheduled once, skips when reviewed; rate limit.
- **E2E:** guest hearts two products → logs in → wishlist shows both; buy → deliver (webhook fixture) → review → admin approves → PDP shows rating and badge.
- **Security:** review body never rendered as HTML; reviewer email never present.
- **Coverage:** modules 90 %.

## 7. Definition of Done

- [ ] Verified-purchase gate and one-per-item proven; moderation RBAC matches §8.1
- [ ] Guest→user wishlist sync proven; summary accurate after moderation
- [ ] Review invite scheduled and idempotent
- [ ] PDP and account slots unhidden; axe clean

## 8. Senior engineer review notes

- Verified purchase is the anti-fraud control for reviews; do not add "review without purchase" toggles.
- Recompute the summary on moderation events, not on every read; cache it with the product.
- Reviewer display anonymised by default — names are PII and reviews are public.

## 9. Implementation prompt

```
You are implementing plan P21 from docs/plans/21-wishlist-reviews.md. Read DESIGN.md §3 WF-07/09, §7 Review/WishlistItem, §8.1 Reviews, §9 Account and §11.3 Authorisation (reviews). P10, P13, P15 and P19 are merged.

Deliver: wishlist API with login sync (union, cap 100), guest localStorage store and header count, WishlistButton and /wishlist page; reviews API with verified-purchase eligibility (DELIVERED order item owned by the user, one per item), plain-text storage, PENDING → moderation queue (STAFF approve/hide, ADMIN delete, audited), cached rating summary recomputed on moderation and included in product DTOs, PDP reviews section, account "write a review" CTA, and the review-invite job 7 days after delivery.

Work test-first from P21 §6 (eligibility table, sync union, IDOR, moderation, summary, invite idempotency, masking), then the two Playwright specs.

Constraints: no unverified reviews, reviewer identity masked, body never rendered as HTML, immutable data, files ≤ 400 lines.

When done: run suites and E2E, complete the P21 Definition of Done with evidence, and stop for review.
```
