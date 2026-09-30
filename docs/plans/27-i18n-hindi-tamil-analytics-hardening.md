# P27 — i18n (Hindi + Tamil), consented analytics, CSP style hashes

|                  |                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 4 — Scale & delight                                                                                                                                                                   |
| Estimated effort | 6 dev-days                                                                                                                                                                            |
| Depends on       | P24 (content), P19 (tier), P09 (`[locale]` scaffold), P07 (import columns)                                                                                                            |
| Unblocks         | P28 (localised templates)                                                                                                                                                             |
| Design refs      | DESIGN.md §5 (i18n), §7 (ProductTranslation, CategoryTranslation, User.locale), §10 (UX conventions, Tamil search), §11.3 (Browser: style hashes), §14 Phase 4, §16 (Tamil type), R12 |
| Branch           | `feat/p27-i18n-analytics`                                                                                                                                                             |

## 1. Goal

Ship Hindi and Tamil across the storefront, content, emails and policies without a rewrite (the `[locale]` scaffold and translation tables were pre-specified for this), add privacy-preserving analytics gated by consent, and remove `'unsafe-inline'` from `style-src`.

## 2. Scope

### In

- Locales `hi`, `ta`: `messages/{hi,ta}.json` with a translation workflow (extract → translate → review checklist), locale switcher, `User.locale` preference, `Accept-Language` default, hreflang + localised sitemaps, `Intl` en-IN formats with Latin digits
- Content: `ProductTranslation`/`CategoryTranslation` migrations, admin translation tab (STAFF), import/export columns `name_hi/ta`, `description_hi/ta`, …; API `?locale=` with English fallback; policies/pages MDX per locale with fallback; email templates `hi`/`ta` (P13 locale param)
- Search: per-locale searchable fields (Meilisearch multi-language attributes; Postgres fallback `simple` + trigram for `ta`/`hi`)
- Fonts: Noto Serif/Sans Tamil and Devanagari via `next/font`, per-locale line-height (§16 Tamil row)
- Analytics: self-hosted **Umami** or **Plausible** (OSS, cookieless) behind a consent toggle (DESIGN: analytics after consent); events `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (server-side, no PII); admin link to the dashboard
- CSP: `style-src` without `'unsafe-inline'` — hashes/nonces for the few inline styles Next/React emit; verify visual tests unchanged

### Out

- RTL, currency/locale pricing, machine translation at runtime

## 3. Deliverables

```
apps/web/messages/{hi.json, ta.json}  apps/web/i18n.ts (locales)  apps/web/components/layout/LocaleSwitcher.tsx
apps/api/prisma/migrations/* (translations, User.locale values)  apps/api/src/modules/catalogue/translations.ts  apps/api/src/modules/imports/row.schema.ts (+ locale columns)
apps/web/content/{pages,policies}/{hi,ta}/*.mdx  apps/api/src/modules/notifications/templates/{hi,ta}/*
apps/api/src/ports/adapters/{meilisearch.settings.ts (multi-lang), postgres-search.ts (simple config)}
apps/web/components/analytics/{ConsentToggle, Analytics}.tsx  apps/api/src/modules/analytics/{events.ts}  infra/tier-x (+ umami/plausible service)
apps/web/lib/security-headers.ts (style hashes)  docs/i18n/{translation-workflow.md, review-checklist.md}
tests/e2e/{i18n,analytics}.spec.ts  tests/e2e/visual (+ hi/ta baselines)
```

## 4. Tasks (ordered)

1. Locale plumbing: enable `hi`, `ta`; switcher (stores `User.locale` when logged in, cookie otherwise); middleware default from `Accept-Language`; hreflang tags; localised sitemaps; `Intl.NumberFormat('en-IN')` everywhere with Latin digits.
2. Translations: migrations; API read path with fallback (never 404 on missing translation); admin tab; import/export columns; search adapters per locale.
3. UI strings: extract keys, translate `hi`/`ta` (professional review — checklist in `review-checklist.md`), visual baselines per locale (Tamil strings are longer; fix overflow).
4. Fonts per locale with `font-display: swap`; verify CLS budget with the new fonts.
5. Content and emails: MDX per locale with fallback; email templates `hi`/`ta`; `User.locale` drives email language.
6. Analytics: deploy Umami/Plausible on the tier (own subdomain; data in India), consent toggle in the footer/cookie-less notice, script loaded only after consent (CSP `script-src` adds the analytics origin), server-side `purchase` event without PII; admin dashboard link.
7. CSP style hashes: enumerate inline styles from a production build, hash them, drop `'unsafe-inline'`; visual/E2E must stay green.

## 5. Contracts

- `?locale=` on catalogue/search/blog routes; DTOs carry the resolved locale and `fallback: boolean`.
- Consent state stored client-side (`localStorage`, try/catch) and mirrored to `User.consents` for logged-in users (new JSON field, migration).
- Analytics events contain no user ids, emails, phones or order numbers (schema test).

## 6. Test plan

- **Unit:** fallback resolver; number/date formatting per locale (Latin digits); event schema PII guard; hash list generation.
- **Integration:** translation CRUD + RBAC; import with locale columns; search finds Tamil product names; API fallback flags; email locale selection.
- **E2E:** switch to Tamil → shell, PDP, checkout and policy render in Tamil with correct fonts (visual baselines); missing translation shows English; analytics script absent before consent, present after; purchase event recorded without PII; CSP without `'unsafe-inline'` produces no console violations.
- **Coverage:** modules 85 %.

## 7. Definition of Done

- [ ] Hindi and Tamil live end to end with fallbacks; visual baselines per locale; no overflow at 320 px
- [ ] Analytics only after consent; events PII-free; data hosted on the tier
- [ ] `style-src` without `'unsafe-inline'`; visual suite unchanged
- [ ] Translation workflow and review checklist documented

## 8. Senior engineer review notes

- Do not machine-translate policies; legal text in Tamil/Hindi needs human review — the checklist exists for that.
- Tamil script needs more line-height and wider buttons; budget a visual pass, not just string swaps.
- Cookieless analytics still needs consent under the design's own policy; keep the toggle honest (off = no script at all).
- Style hashes break whenever a library changes its inline styles; generate the list in the build and test it.

## 9. Implementation prompt

```
You are implementing plan P27 from docs/plans/27-i18n-hindi-tamil-analytics-hardening.md. Read DESIGN.md §5 i18n, §7 translation tables and User.locale, §10 UX conventions, §11.3 Browser (style hashes), §16 Tamil type row and docs/plans/00-README.md (R12). P07, P09, P13, P19, P20 and P24 are merged.

Deliver: hi/ta locales with switcher, User.locale, Accept-Language default, hreflang and localised sitemaps; translation tables with API fallback, admin translation tab, import/export locale columns and per-locale search; UI messages, MDX content and email templates in hi/ta with a documented human-review workflow; Noto Tamil/Devanagari fonts per locale with visual baselines; consent-gated self-hosted Umami or Plausible with PII-free events including a server-side purchase event; and a CSP style-src without 'unsafe-inline' using build-time hashes.

Work test-first from P27 §6, then the i18n and analytics Playwright specs and per-locale visual baselines.

Constraints: never 404 on a missing translation, Latin digits everywhere, no analytics script before consent, no PII in events, immutable data, files ≤ 400 lines.

When done: run suites and E2E, complete the P27 Definition of Done with evidence, and stop for review.
```
