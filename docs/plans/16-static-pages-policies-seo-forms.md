# P16 — Static pages, policies, SEO, forms

|                  |                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                                                 |
| Estimated effort | 3 dev-days                                                                                                                                                           |
| Depends on       | P09 (shell), P13 (email for form notifications)                                                                                                                      |
| Unblocks         | P18                                                                                                                                                                  |
| Design refs      | DESIGN.md §3 WF-12/13, §8 (`/pages/*`, `/policies/*`, sitemap/robots), §10 (Returns policy text, Legal & compliance), §12 SEO, §11.3 (forms: honeypot + rate limits) |
| Branch           | `feat/p16-static-seo-forms`                                                                                                                                          |

## 1. Goal

Every legal and informational page the store needs at launch, written to the decided policies and populated from settings (legal name, GSTIN, grievance officer, pickup city), plus the contact / seller-inquiry / newsletter forms with abuse controls, and the SEO plumbing (sitemap, robots, structured data) that makes the storefront indexable.

## 2. Scope

### In

- Pages: `/pages/about-us`, `/pages/contact`, `/pages/faq`, `/pages/grievance-redressal`, `/pages/become-a-seller`; policies: `/policies/shipping`, `/policies/refund`, `/policies/privacy`, `/policies/terms`, `/policies/pricing` — content as MDX in the repo with settings-driven placeholders
- Forms: `POST /contact`, `POST /seller-inquiry` (honeypot, rate limit, email to `SUPPORT_EMAIL` with a ticket id), `POST /newsletter/subscribe` + `NewsletterSubscriber` table (opt-in stored; sending is P24)
- SEO: `sitemap.xml` (index + products/collections/pages), `robots.txt`, `FAQPage` and `Organization` JSON-LD, breadcrumbs on pages, `security.txt`
- 404/500 copy, footer links wired

### Out

- Admin editing of policies (Phase 3, P25 scope note), blog (P24), newsletter sending (P24), Tamil/Hindi content (P27)

## 3. Deliverables

```
apps/web/content/{pages/*.mdx, policies/*.mdx}      # with {{placeholders}} resolved server-side
apps/web/app/[locale]/{pages/[slug]/page.tsx, policies/[slug]/page.tsx, sitemap.ts, robots.ts}
apps/web/app/.well-known/security.txt/route.ts
apps/web/components/content/{Prose, Faq (accordion), ContactForm, SellerForm, NewsletterForm, PolicyMeta}.tsx
apps/web/lib/content/{load.ts, placeholders.ts, faq.ts}
apps/api/src/modules/forms/{routes.ts, honeypot.ts, ticket.ts, schemas.ts}
apps/api/src/modules/newsletter/{subscribe.routes.ts}
apps/api/prisma/migrations/*newsletter_subscriber*  (+ schema: NewsletterSubscriber { id, emailHash unique, email (encrypted), status: PENDING|SUBSCRIBED|UNSUBSCRIBED, consentAt, source, unsubscribedAt })
apps/api/src/modules/sitemap/{routes.ts}            # GET /sitemap-data (active product/category slugs + lastmod) for the web sitemap
apps/api/test/int/{forms,newsletter,sitemap}/*.test.ts  apps/web/lib/content/*.test.ts  tests/e2e/static-pages.spec.ts  tests/e2e/visual/pages.spec.ts
```

## 4. Tasks (ordered)

1. **Content loading.** `load.ts` reads MDX from `content/`, compiles server-side (`next-mdx-remote/rsc` or `@next/mdx`), restricted components (`Prose`, `Faq`, tables); `placeholders.ts` replaces `{{legalName}}`, `{{gstin}}`, `{{pickupCity}}`, `{{grievanceOfficer.name/email/phone}}`, `{{returnWindowDays}}`, `{{supportEmail}}` from `GET /settings/public` (extend the P04 public settings with `legal { legalName, gstin, isPlaceholder }`, `grievanceOfficer`, `returnWindowDays`, `supportEmail`, `pickupCity`); development shows a visible "placeholder" marker when `isPlaceholder`.
2. **Policies (write the text).** Refund & Return per DESIGN §10: 15 days from delivery, eligible defects only with photos, not eligible opened consumables/change of mind, seller pays pickup for approved defects, QC-fail deduction ≈ ₹40–80 itemised, refund 5–7 business days to original method or replacement; Shipping: dispatched from Chennai, ETA table, free ≥ threshold, tracking by email, address responsibility; Privacy: DPDP-aligned (data collected, purposes, retention schedule from §11.3, rights and how to exercise them via the account page, grievance officer, no WhatsApp/SMS in V1, cookies/analytics consent); Terms: India-only, prices GST-inclusive, order acceptance, cancellation window, governing law Chennai; Pricing: inclusive of GST, no hidden charges, shipping shown at checkout. Each policy has `lastUpdated` front-matter rendered by `PolicyMeta`.
3. **Pages.** About (brand placeholder copy; §16 single-still image), Contact (`ContactForm` + support email/phone as selectable text + business address from settings), FAQ (`Faq` accordion with `FAQPage` JSON-LD from `faq.ts` data; keyboard-operable, one open at a time optional), Grievance Redressal (officer details, SLA "acknowledge within 48 h, resolve within 30 days", escalation), Become a Seller (`SellerForm`).
4. **Forms API.** `schemas.ts` (name ≤ 80, email, phone optional, message 20–2,000 chars, `website` honeypot must be empty); `honeypot.ts` returns 200 with a fake ticket on honeypot hits (silent); rate limit 5/h/IP; `ticket.ts` id `PE-C-{yyyymmdd}-{6 base32}`; sends `contact-received` (new P13 template: internal, to `SUPPORT_EMAIL`, with ticket id in subject — the only subject with generated text) and an acknowledgement to the customer with the ticket id; no storage in Phase 1 (documented).
5. **Newsletter.** `POST /newsletter/subscribe { email, consent: true }` → upsert `NewsletterSubscriber` (status `SUBSCRIBED`, `consentAt`, `source: 'footer'`), honeypot + 5/h/IP, idempotent 200; respects `EmailSuppression` (`UNSUBSCRIBE` → keep unsubscribed, return 200); `NewsletterForm` in the footer with an unchecked consent checkbox and a success toast; unsubscribe route from P13 flips status.
6. **Sitemap & robots.** API `GET /sitemap-data` (active products with `updatedAt`, categories, static page slugs) cached 10 min; web `sitemap.ts` generates a sitemap index (`/sitemap.xml` → `/sitemap/products.xml`, `/sitemap/pages.xml`) with `lastmod`; `robots.ts` allows `/`, disallows `/admin`, `/account`, `/checkout`, `/cart`, `/search`, `/api`; `Sitemap:` line; `security.txt` with `Contact: mailto:{securityEmail}` and `Expires`.
7. **SEO on pages.** `generateMetadata` per page (title, description from front-matter), canonical, `BreadcrumbList` + `Organization` (on about/contact) JSON-LD with nonce; `noindex` on contact/seller forms' success states not needed (same URL); policies indexable.
8. **E2E** `static-pages.spec.ts`: all ten pages render with resolved placeholders (no `{{` in HTML); FAQ accordion keyboard; contact form submit → toast with ticket id → Mailpit has internal + acknowledgement mails; honeypot-filled submit → same toast, no mail; newsletter subscribe → row created, second subscribe idempotent; `/sitemap.xml` and `/robots.txt` valid. Visual snapshots for about, FAQ, refund policy, contact at 375/1440 light/dark; axe on all.

## 5. Contracts

- `GET /settings/public` extended with `legal`, `grievanceOfficer`, `returnWindowDays`, `supportEmail`, `pickupCity` (P05 settings gain `grievance_officer` and `support_email` keys; add schemas there or here — here, with a note).
- Forms: `POST /contact | /seller-inquiry` → 200 `{ ticketId }` always (including honeypot); 429 on limit; 400 on validation.
- `NewsletterSubscriber` semantics: idempotent subscribe; unsubscribe wins forever unless re-subscribed explicitly via the form (status flips back, `consentAt` updated).
- Sitemap excludes inactive products and non-`en` locales (single locale now).

## 6. Test plan

### Unit

- `placeholders.ts`: all placeholders replaced; unknown placeholder → build-time error (test); HTML in settings values escaped.
- `faq.ts` → `FAQPage` JSON-LD snapshot; `ticket.ts` format/uniqueness; honeypot detection; schemas.
- Sitemap builder chunks > 50,000 URLs (property test with synthetic input) and formats `lastmod`.

### Integration

- Contact: valid → two emails in Mailpit (internal subject contains ticket id, customer ack); honeypot → 200 + no email; 6th/h → 429; message with `<script>` arrives escaped in HTML mail and verbatim in text.
- Newsletter: subscribe → row with encrypted email + hash; repeat → 200 no duplicate; suppressed (`UNSUBSCRIBE`) → 200 and status stays unsubscribed; re-subscribe via form after unsubscribe → `SUBSCRIBED` with new `consentAt`.
- `GET /sitemap-data`: inactive product excluded; cache hit; unpublished category excluded.
- Settings public: new keys present; `isPlaceholder` true on seed.

### Web

- MDX loader refuses raw HTML/script in content (compile options); `Faq` a11y (`aria-expanded`, `aria-controls`, Enter/Space toggle).

### E2E

- `static-pages.spec.ts` (task 8); visual + axe.

### Security

- Forms accept no extra fields (`.strict()`); rate limits present; emails never include raw HTML from users; `security.txt` served with `text/plain`.

### Coverage targets

- `modules/forms`, `modules/newsletter`, `modules/sitemap`, `lib/content`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Policy texts match DESIGN §10 decisions word for word on the numbers (15 days, eligibility, pickup cost rule)
- [ ] No unresolved `{{placeholder}}` in any rendered page (E2E grep)
- [ ] Forms: honeypot + rate limit + escaping proven; ticket ids in mails
- [ ] Sitemap/robots valid; Search Console-ready (manual validation screenshot)
- [ ] `security.txt` present

## 8. Senior engineer review notes

- Policies as reviewed MDX in git (not admin-editable) is deliberate for launch: legal text needs review, not a WYSIWYG. Admin editing can come in Phase 3 with versioning.
- Placeholders from settings mean the GSTIN/legal name entered in Phase 2 propagate everywhere without a deploy — verify the "placeholder" marker is development-only so it never leaks to production.
- Silent honeypot success (fake ticket) is intentional; bots should not learn they were detected.
- Do not store contact messages in Phase 1; email with a ticket id is enough and avoids another PII table. Revisit when volume justifies a ticketing tool.
- Newsletter consent must be an unchecked checkbox and stored with a timestamp (`consentAt`) — that is the DPDP evidence.
- Keep the sitemap split by type; a single file will exceed limits once the catalogue grows, and Google handles indexes fine.

## 9. Implementation prompt

```
You are implementing plan P16 from docs/plans/16-static-pages-policies-seo-forms.md. Read DESIGN.md §3 WF-12/13, §8 pages/policies/sitemap rows, §10 (Returns policy, Legal & compliance), §11.3 forms controls and §12 SEO first. P09 and P13 are merged: use the shell/components, next-intl, apiGet, the CSP nonce, EmailPort templates (add contact-received and contact-ack templates), rate limits and the encryption-aware Prisma client.

Deliver: MDX content for the five pages and five policies with settings-driven placeholders (extend GET /settings/public and the P05 settings keys with legal, grievance_officer, support_email, returnWindowDays, pickupCity), policy texts written exactly to DESIGN §10 (15-day window, defects-only eligibility, seller-pays-pickup-for-defects, QC-fail deduction, refund timing) with lastUpdated meta, page routes with per-page metadata and BreadcrumbList/Organization/FAQPage JSON-LD, an accessible FAQ accordion, contact and seller-inquiry forms (strict schemas, honeypot returning a fake ticket, 5/h/IP, ticket ids, internal + acknowledgement emails with escaped content), newsletter subscribe with a NewsletterSubscriber table (migration, encrypted email + hash, consentAt, suppression-aware, idempotent) and the footer form with an unchecked consent box, sitemap index + per-type sitemaps fed by GET /sitemap-data, robots.txt, and /.well-known/security.txt.

Work test-first from P16 §6: placeholder/faq/ticket/honeypot/sitemap unit tests; integration tests for forms (mail contents, honeypot, rate limit, escaping), newsletter semantics, sitemap data and settings; MDX safety and accordion a11y tests; then the static-pages Playwright spec, visual snapshots and axe.

Constraints: no raw HTML in MDX, no user text in subjects except the generated ticket id, placeholders resolved server-side with escaping, immutable data, files ≤ 400 lines, strings via next-intl where UI (policy body text stays in MDX).

When done: run all suites and the E2E on compose, validate sitemap/robots and the FAQ rich result (screenshots), complete the P16 Definition of Done, and stop for review.
```
