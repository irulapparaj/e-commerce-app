# P24 — Blog CMS, newsletter, related products

|                  |                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 3 — Growth                                                                                                                      |
| Estimated effort | 4 dev-days                                                                                                                      |
| Depends on       | P19 · P04 (rich text, media), P05 (admin shell), P13 (email jobs, unsubscribe token), P16 (subscribers), P20 (article indexing) |
| Unblocks         | P27 (translated content)                                                                                                        |
| Design refs      | DESIGN.md §3 WF-10/13, §7 BlogPost, §8.1 Blog row, §11.3 (Email, content), §12 SEO, §14 Phase 3                                 |
| Branch           | `feat/p24-blog-newsletter`                                                                                                      |

## 1. Goal

A Knowledge Hub that drives SEO and links to collections, a newsletter that respects consent and suppression, and "customers also bought" recommendations from real order data.

## 2. Scope

### In

- Blog CMS: `/admin/blogs` (STAFF write/publish per §8.1) with Tiptap extended allow-list (images via the media pipeline, h2/h3, blockquote, lists, links, a `collectionCta` node), drafts, publish/unpublish, cover image, tags, SEO fields; public `/blogs` (ISR) and `/blogs/[slug]` with `Article` JSON-LD, related articles by tags, inline collection CTA cards; home preview slot unhidden; article index hook → P20
- Newsletter: `NewsletterCampaign` model (subject, content (Tiptap), status, counts), admin compose/preview/test-send/send (ADMIN ⚡), audience = `SUBSCRIBED` minus suppressed, batched send job (SES quota-aware, resumable), per-recipient unsubscribe link (P13 token), `List-Unsubscribe` header
- Related products: nightly co-occurrence job from `OrderItem` → `RelatedProduct` table; API `related` prefers co-occurrence, falls back to same-category (P04)

### Out

- Comments, authors beyond staff name, A/B subjects, segmentation, WhatsApp broadcast (P28)

## 3. Deliverables

```
apps/api/src/modules/blog/{routes.public.ts, routes.admin.ts, richtext-blog.ts, dto.ts}
apps/api/src/modules/newsletter/{campaign.routes.ts, audience.ts, send.job.ts}
apps/api/src/modules/catalogue/related.job.ts (+ migration RelatedProduct, NewsletterCampaign)
apps/web/app/[locale]/blogs/{page.tsx, [slug]/page.tsx}  apps/web/components/blog/{ArticleCard, ArticleBody, CollectionCta, RelatedArticles}.tsx
apps/web/app/admin/{blogs/page.tsx, blogs/[id]/page.tsx, newsletter/page.tsx}  apps/web/components/admin/blog/{PostEditor, CampaignComposer}.tsx
apps/api/test/int/{blog,newsletter,related}/*.test.ts  tests/e2e/{blog,newsletter}.spec.ts
```

## 4. Tasks (ordered)

1. `richtext-blog.ts`: widened schema (images with keys from `media/`, blockquote, `collectionCta { categorySlug }`); render + sanitise allow-list snapshot; CTA node renders server-side to a link card.
2. Admin editor and routes (draft/publish, cover via media pipeline, tags, SEO); audit; publish enqueues revalidate (`blog`, `blog:{slug}`, `home`) and the P20 article index hook.
3. Public pages with ISR (list 900 s, article 900 s), `Article` JSON-LD with nonce, breadcrumbs, related by shared tags (max 3), sitemap section (`/sitemap/blog.xml`).
4. Newsletter: campaign CRUD, preview (P13 preview renderer), test send to the admin, send (⚡): audience query excludes suppressed/unsubscribed; job sends in batches of 50 with a 1/s pacing setting, resumable by `lastSentSubscriberId`, per-recipient unsubscribe token URL and `List-Unsubscribe` + `List-Unsubscribe-Post` headers; status/counts; subject rules: fixed text authored by admin, no recipient data interpolation.
5. Related job: co-occurrence counts over non-cancelled orders (last 180 d), top 8 per product into `RelatedProduct`; API `related` reads it first; nightly cron.
6. Home blog preview slot, footer link; E2E.

## 5. Contracts

- `GET /blogs?page=`, `GET /blogs/:slug` DTOs with `bodyHtml` (sanitised), `cover { srcset }`, `tags`, `related[]`.
- Campaign send is idempotent per campaign; a subscriber receives at most one message per campaign (unique `(campaignId, subscriberId)` send log table).
- Unsubscribe link → P13 route → `UNSUBSCRIBE` suppression + subscriber status.

## 6. Test plan

- **Unit:** blog schema/sanitiser snapshot (XSS vectors, CTA node), audience filter, batch/resume logic, co-occurrence ranking.
- **Integration:** publish → public visible + revalidate + index hook; unpublish → 404; audience excludes suppressed and unsubscribed; send job resumes after a simulated crash without duplicates; headers present in Mailpit; unsubscribe stops the next campaign; related job output and API preference; RBAC (STAFF blog, ADMIN newsletter ⚡).
- **E2E:** staff publishes an article with a collection CTA → appears on home/blog/search; customer subscribes → admin sends campaign → Mailpit → unsubscribe link → status updated.
- **Security:** images only from the media bucket; no raw HTML; campaign subjects contain no recipient data (test).
- **Coverage:** modules 85 %.

## 7. Definition of Done

- [ ] Blog live with structured data and search indexing; sanitiser allow-list reviewed
- [ ] Newsletter respects consent/suppression, resumable, one-per-subscriber, unsubscribe headers
- [ ] Related products from real data with fallback

## 8. Senior engineer review notes

- Marketing mail is where reputation is lost: `List-Unsubscribe`, suppression and pacing are not optional.
- Widening the rich-text allow-list is a security change; snapshot it and review the diff.
- Co-occurrence beats "same category" once there are a few hundred orders; keep the fallback until then.

## 9. Implementation prompt

```
You are implementing plan P24 from docs/plans/24-blog-newsletter-related.md. Read DESIGN.md §3 WF-10/13, §7 BlogPost, §8.1 Blog, §11.3 Email/content and §12 SEO. P04, P05, P13, P16, P19 and P20 are merged.

Deliver: the blog CMS (widened Tiptap schema with media images and a collectionCta node, draft/publish, SEO fields, revalidation and search index hooks), public blog pages with ISR, Article JSON-LD, related-by-tags and a sitemap section, the home preview slot; NewsletterCampaign model and admin composer with preview/test/send (ADMIN ⚡), audience excluding suppressed/unsubscribed, a resumable batched send job with per-recipient unsubscribe links and List-Unsubscribe headers and a per-subscriber send log; the nightly related-products co-occurrence job and API preference with fallback.

Work test-first from P24 §6 (sanitiser snapshot, audience, resume without duplicates, headers, unsubscribe effect, co-occurrence ranking, RBAC), then the blog and newsletter Playwright specs.

Constraints: no raw HTML, images only from the media bucket, subjects without recipient data, one message per subscriber per campaign, immutable data, files ≤ 400 lines.

When done: run suites and E2E, complete the P24 Definition of Done with evidence, and stop for review.
```
