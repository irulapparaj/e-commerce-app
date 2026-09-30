# P09 — Storefront design system, shell, i18n scaffold

|                  |                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 1 — Code development                                                                                                                          |
| Estimated effort | 4 dev-days                                                                                                                                    |
| Depends on       | P01 (tokens.css, `[locale]`, BFF proxy) · reads `GET /settings/public` and `GET /categories` from P04 when available (falls back to fixtures) |
| Unblocks         | P10, P11, P15, P16                                                                                                                            |
| Design refs      | DESIGN.md §2.1, §2.3, §12 (Performance, SEO, Accessibility), §16 (design direction — the spec for this plan), R1, R12                         |
| Branch           | `feat/p09-storefront-shell`                                                                                                                   |

## 1. Goal

The storefront's visual system and shell, built once and reused by every page: tokens → Tailwind theme, the two typefaces, layout primitives, an accessible component set, header with the mega menu, announcement bar, footer, dark mode, reduced motion, the `[locale]` scaffold with `en` messages, metadata defaults, error pages, and the typed API fetchers for server and client. Verified visually at four breakpoints in both themes.

## 2. Scope

### In

- Tailwind theme from `tokens.css`; `next/font` for Fraunces + Manrope (swap, subsets); type scale; spacing rhythm
- Primitives: `Container`, `Section`, `Grid`, `Stack`, `Rule`
- Components: `Button` (primary/secondary/ghost/link; loading; icon), `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Field` (label/help/error), `Badge` (small-caps text), `Price` (tabular, ₹ Indian grouping, compare-at), `QuantityStepper`, `Drawer` (focus trap, inert background), `Dialog`, `Toast`, `Skeleton`, `Tabs`, `Accordion`, `Breadcrumb`, `Pagination`, `Link`, `VisuallyHidden`, `Icon` set (inline SVG sprite: search, heart, user, bag, close, chevron, menu, sun/moon)
- Shell: `AnnouncementBar` (from settings), `Header` (wordmark, mega menu desktop, drawer nav mobile, search trigger, account, cart count from a store stub), `MegaMenu` (two-column type list + one image per category; keyboard-operable; hover intent; escape closes), `Footer` (categories, quick links, policies, business block with GSTIN placeholder + Udyam, newsletter form UI, social links), `ThemeToggle`
- `[locale]` layout with `next-intl` (`en`), `messages/en.json` for shell strings, `generateMetadata` defaults (title template, description, canonical, OG image placeholder), `not-found.tsx`, `error.tsx`, `loading.tsx`
- `lib/api/server.ts` (server components → API directly with `next: { tags, revalidate }`), `lib/api/client.ts` (browser → BFF), typed envelope handling
- `/dev/components` gallery (development only) for visual regression
- a11y baseline: skip link, landmarks, focus rings, `prefers-reduced-motion`, colour contrast checked

### Out

- Any page content (P10), cart behaviour (P11 — the count badge reads a placeholder store), login page styling (P15), policies/static pages (P16), Tamil/Hindi (P27)

## 3. Deliverables

```
apps/web/tailwind.config.ts  apps/web/styles/{tokens.css, typography.css, global.css}
apps/web/app/[locale]/{layout.tsx, not-found.tsx, error.tsx, loading.tsx, dev/components/page.tsx}
apps/web/components/ui/*  apps/web/components/layout/{AnnouncementBar,Header,MegaMenu,MobileNav,Footer,ThemeToggle,SkipLink}.tsx
apps/web/lib/api/{server.ts, client.ts, envelope.ts}  apps/web/lib/{format.ts, theme.ts}
apps/web/messages/en.json  apps/web/i18n.ts
apps/web/components/**/*.test.tsx  tests/e2e/visual/shell.spec.ts  tests/e2e/a11y/shell.spec.ts
```

## 4. Tasks (ordered)

1. **Theme.** Map every §16 token to Tailwind (`colors.bg/surface/hairline/text/muted/subtle/accent/success/warning/critical`, `fontFamily.display/body`, `fontSize` scale 1.25, `spacing` on the 8-pt grid, `borderRadius.control=6px/image=2px`, `boxShadow.drawer/modal` only). Dark theme via `[data-theme=dark]` and `prefers-color-scheme` on tokens; `ThemeToggle` writes `localStorage` (try/catch) and the attribute; SSR renders from a cookie hint to avoid flash.
2. **Fonts.** `next/font/google` Fraunces (opsz axis, weights 400/500) and Manrope (400/500/600), `display: swap`, `latin` subset; CSS variables consumed by Tailwind; `tabular-nums` utility for prices.
3. **Primitives & components** with these rules: hairlines not cards; one accent for primary CTA/active/free-shipping only; badges are small-caps text; motion 150–250 ms opacity/transform only, disabled under reduced motion; every interactive element has visible focus (2 px accent ring, offset 2 px); touch targets ≥ 44 px on mobile. `Drawer`/`Dialog` use `<dialog>` or a focus-trap with `inert` on the rest, restore focus on close, close on Escape.
4. **Price.** `formatINR(paise)` from `packages/shared` (re-exported), `Price` shows `₹80.00` with compare-at struck through and an `sr-only` "Sale price / Regular price" for screen readers.
5. **Header & mega menu.** Data from `GET /categories` (server component; tag `categories`); desktop: top-level items open a panel with two type columns of sub-collections + one category image (from the first child with an image or a placeholder), "Explore All" link; keyboard: arrow keys move, Enter opens, Escape closes, focus returns; hover intent 120 ms. Mobile: hamburger → `MobileNav` drawer with accordion levels. Right cluster: search button (opens the P10 overlay; here a no-op with `aria-expanded`), account link (`/account` or `/login` from `getSession()`), cart button with count from `useCartCount()` placeholder (0).
6. **Announcement bar & footer.** From `GET /settings/public` (tag `settings`): single quiet line, dismissible per session; footer sections per §2.1 with the GSTIN/Udyam placeholder text from settings and a "placeholder" marker only in development.
7. **i18n scaffold (R12).** `next-intl` request config, `messages/en.json` namespaces `shell`, `nav`, `footer`, `a11y`, `errors`; `useTranslations` in all shell components; `[locale]` param validated (`en` only → 404 otherwise).
8. **Metadata & errors.** `generateMetadata` defaults (title template `%s · Puja Essentials`, description from brand tagline, canonical from `WEB_ORIGIN`, `robots` index for storefront), OG image route placeholder; `not-found.tsx`, `error.tsx` (no stack), `loading.tsx` skeleton shell.
9. **API fetchers.** `server.ts`: `apiGet<T>(path, { tags, revalidate })` using `API_INTERNAL_URL`, forwarding the Bearer from cookies when present, unwrapping the envelope, throwing `ApiError { code, status }`; `client.ts`: same via BFF with CSRF header on mutations. Never expose `API_INTERNAL_URL` to the client bundle (lint check for `NEXT_PUBLIC_`).
10. **Dev gallery.** `/dev/components` renders every component in every state (default/hover/focus/disabled/loading/error) in both themes; guarded by `NODE_ENV !== 'production'`.
11. **Visual + a11y tests.** Playwright `visual/shell.spec.ts`: screenshots of `/dev/components` and the shell at 375/768/1024/1440 × light/dark with `toHaveScreenshot` (baseline committed); `a11y/shell.spec.ts`: `@axe-core/playwright` on `/` and the open mega menu with zero serious/critical violations; keyboard walk of the mega menu.

## 5. Contracts

- Component props are typed and documented in the file header (one line); variants via a `variant` prop, never className overrides from pages.
- `useCartCount()` returns `number` (placeholder 0 until P11 replaces the store).
- `apiGet` cache tags: `settings`, `categories`, `home`, `category:{slug}`, `product:{slug}` — must match the P04 revalidation scheme.
- `messages/en.json` keys are the contract for P27; no hard-coded shell strings.

## 6. Test plan

### Unit / component (Vitest + Testing Library + `vitest-axe`)

- `Price`: paise → string cases; compare-at rendering; sr-only labels.
- `QuantityStepper`: min 1 / max 20 clamps; keyboard ↑/↓; disabled states.
- `Drawer`/`Dialog`: focus trapped, Escape closes, focus restored, background `inert`.
- `MegaMenu`: opens on Enter/click, arrow navigation, Escape closes and returns focus, `aria-expanded`/`aria-controls` correct.
- `ThemeToggle`: toggles attribute; survives `localStorage` throwing.
- `AnnouncementBar`: renders from settings; dismissed state per session.
- axe on every component in the gallery (no serious/critical).

### Integration

- `apiGet` unwraps envelope, maps `error.code`, forwards Bearer only server-side, never includes cookies to the API.

### E2E

- Visual snapshots at four breakpoints × two themes; a11y scan of the shell; mobile nav opens/closes with touch.

### Security

- No `NEXT_PUBLIC_API_INTERNAL_URL` or secrets in the client bundle (grep the build output in CI).
- Storefront CSP applied (from P05 split); inline styles only via Tailwind classes.

### Coverage targets

- `components/ui/**`, `components/layout/**`, `lib/api/**`: 85 %.

## 7. Definition of Done

Global DoD plus:

- [ ] Every §16 token present in Tailwind theme and `tokens.css`; no hex literals in components (lint rule)
- [ ] Visual baselines committed for 4 breakpoints × 2 themes; axe clean
- [ ] Mega menu fully keyboard-operable; drawer/dialog focus management tested
- [ ] No horizontal scroll at 320 px; touch targets ≥ 44 px
- [ ] All shell strings in `messages/en.json`
- [ ] Bundle check: shell JS ≤ 90 kB gzipped (leaves headroom for pages under the 150 kB landing budget)

## 8. Senior engineer review notes

- This plan is where "Minimalist & Clean" either becomes real or stays a slogan. Review against §16 line by line: one accent, hairlines, small-caps badges, no auto-play, no shadows except drawer/modal.
- Build the mega menu with real category data early; a menu that only works with fixtures hides layout bugs with long Tamil-length names later.
- Do not adopt a component library (shadcn/Radix) wholesale; a handful of headless behaviours (focus trap, dialog) is fine, but the look must be ours. If Radix primitives are used for a11y, wrap them so no page imports Radix directly.
- Dark mode must be designed, not inverted: check the accent on the dark ground and the hairline visibility.
- Keep the dev gallery: it is the cheapest visual-regression surface and doubles as documentation.
- Ship the `[locale]` segment now even though only `en` exists — retrofitting it later touches every route and link.
- The server fetcher forwarding Bearer from cookies is the only place SSR touches auth; keep it in one file.

## 9. Implementation prompt

```
You are implementing plan P09 from docs/plans/09-storefront-design-system-shell.md. Read DESIGN.md §16 (the design direction — treat every row as a requirement), §2.1, §2.3, §12 (Performance, SEO, Accessibility) and docs/plans/00-README.md (R1, R12). P01 is merged (tokens.css, [locale] scaffold, BFF proxy); P04's GET /categories and GET /settings/public exist if merged, otherwise use fixture JSON with the same shape.

Deliver: the Tailwind theme mapped from tokens.css (light + dark via data-theme and prefers-color-scheme), Fraunces + Manrope via next/font with swap, layout primitives, the full UI component set in P09 §2 with the a11y and motion rules in §4.3, Price with Indian grouping, the Header with a keyboard-operable two-column mega menu fed by categories, MobileNav drawer, AnnouncementBar and Footer from settings/public (GSTIN/Udyam placeholder), ThemeToggle without flash, next-intl [locale] layout with messages/en.json for all shell strings, metadata defaults and error/not-found/loading pages, typed apiGet server/client fetchers with cache tags matching P04's revalidation scheme, a development-only /dev/components gallery, and Playwright visual (4 breakpoints × 2 themes, baselines committed) and axe a11y specs.

Work test-first from P09 §6: component tests for Price, QuantityStepper, Drawer/Dialog focus management, MegaMenu keyboard behaviour, ThemeToggle resilience, AnnouncementBar; axe on the gallery; fetcher tests proving no cookies reach the API and no internal URL reaches the client bundle.

Constraints: no hex colour literals outside tokens.css (add a lint rule), one accent colour used only for primary CTA/active states/free-shipping bar, hairlines instead of cards, shadows only on drawer/modal, motion opacity/transform 150–250 ms and off under reduced motion, no auto-playing carousels, no component library adopted wholesale, all strings via next-intl, immutable data, files ≤ 400 lines.

When done: run component tests, the visual and a11y specs on the compose stack, check the gzipped shell bundle size, complete the P09 Definition of Done with screenshots in the PR, and stop for review.
```
