# P26 — Partial pay, tax invoice PDF, bundles, gift wrap, festival pages

|                  |                                                                             |
| ---------------- | --------------------------------------------------------------------------- |
| Phase            | 4 — Scale & delight                                                         |
| Estimated effort | 6 dev-days                                                                  |
| Depends on       | P22 (replacement orders), P23 (promotions), P25 (reconciliation)            |
| Unblocks         | —                                                                           |
| Design refs      | DESIGN.md §2.6 (partial pay), §10 (GST invoice, Payments), §14 Phase 4, §16 |
| Branch           | `feat/p26-phase4-commerce`                                                  |

## 1. Goal

Four commercial features on top of the stable core: partial payment for selected PIN codes with the balance collected on delivery, GST-compliant tax invoices as PDFs, product bundles with derived stock, gift wrap at checkout, and festival campaign pages with scheduled promotions.

## 2. Scope

### In

- **Partial pay:** settings `partial_pay { enabled, pinPrefixes[], advancePercent }`; checkout option when eligible; Razorpay order for the advance; order `paymentStatus PARTIALLY_PAID`, `balanceDuePaise`; shipment created as COD for the balance via `ShippingPort` (`codAmount`); on `DELIVERED` → `PAID` pending remittance; COD remittance reconciliation added to the P25 job (Shiprocket remittance API fixtures)
- **Invoice PDF:** `Invoice` model (number series per financial year `INV-2026-27-000001` via sequence, generated on `CONFIRMED`, regenerated on refund as credit note `CN-…`), PDF via `@react-pdf/renderer` with seller GSTIN/legal/address, buyer state, HSN lines, taxable value, CGST/SGST or IGST, place of supply, totals in words; stored in `invoices/` bucket; `GET /orders/:id/invoice` (scoped, signed GET); admin regenerate
- **Bundles:** `Bundle` (components with quantities, bundle price, derived stock = min(floor(componentStock / qty))); sold as a variant kind `BUNDLE`; cart/pricing expand components for reservation and tax (per component HSN/rate, bundle discount pro-rata); admin builder
- **Gift wrap:** checkout toggle, flat charge from settings (`gift_wrap_paise`, GST 18 % service line), order flag + optional message (≤ 120 chars, plain text) shown on the packing view
- **Festival pages:** `Campaign` (slug, window, hero, product list, linked promotion), `/festival/[slug]` ISR page, scheduled activation/deactivation job, festival calendar in admin (Pongal, Diwali, Navratri, Ganesh Chaturthi presets)

### Out

- Multi-currency, EMI plans beyond Razorpay's native, wishlists in campaigns

## 3. Deliverables

```
apps/api/src/modules/{partial-pay,invoices,bundles,gift-wrap,campaigns}/*
apps/api/prisma/migrations/* (Invoice, Bundle, BundleComponent, Campaign, Order.balanceDuePaise/giftWrap fields, VariantKind enum)
apps/web/components/checkout/{PartialPayOption, GiftWrapOption}.tsx  apps/web/app/[locale]/festival/[slug]/page.tsx
apps/web/app/admin/{bundles,campaigns,invoices}/*  apps/web/components/account/InvoiceLink.tsx
tests/fixtures/shiprocket/{cod-remittance.json}  apps/api/test/int/{partial-pay,invoices,bundles,campaigns}/*.test.ts  tests/e2e/phase4-commerce.spec.ts
```

## 4. Tasks (ordered)

1. Partial pay: eligibility by PIN prefix; pricing splits `advancePaise = ceil(total × advancePercent)`; Razorpay order for the advance; `verify-payment` → `PARTIALLY_PAID`; ship as COD with `balanceDuePaise`; delivered → `PAID` + remittance expectation; reconciliation extension; emails updated (amount due on delivery).
2. Invoices: FY sequence function in a migration; PDF component with the GST fields per §10; generation job on `CONFIRMED` and credit notes on refunds; storage + scoped signed link; admin list/regenerate; invoice number shown on order pages/emails.
3. Bundles: schema, admin builder (choose components/quantities, price ≤ Σ component prices), derived stock in DTOs, cart expansion for reservation (`applyMovement` per component), tax per component with the bundle discount distributed pro-rata (reuse P23 distribution), PDP for bundles listing contents.
4. Gift wrap: setting, checkout option, service line with 18 % GST (separate HSN/SAC 9985 line), order flag, admin packing note.
5. Campaigns: model, admin CRUD with presets, scheduled job toggling `active`, ISR page with hero (single still per §16), products, linked promotion (P23), sitemap entry when active, revalidation on toggle.
6. E2E for each feature.

## 5. Contracts

- `Order.paymentStatus` gains `PARTIALLY_PAID` semantics: `balanceDuePaise > 0` until delivery; reconciliation tracks remittance.
- Invoice numbers immutable once issued; regeneration reuses the number; credit notes reference the invoice.
- Bundle stock is derived, never stored; components reserved individually.
- Gift wrap line `{ sac:'9985', rate:18 }`.

## 6. Test plan

- **Unit:** advance rounding; invoice number FY rollover (April); amount-in-words; bundle derived stock; gift-wrap tax line; campaign window logic.
- **Integration:** partial pay end to end with COD shipment payload (fake adapter) and delivered → PAID; remittance mismatch surfaces in reconciliation; invoice PDF generated (text extraction asserts GSTIN, HSN, tax split, number), credit note on refund; bundle order reserves each component, insufficient component → 409; gift wrap adds the line and flag; campaign activates/deactivates on schedule and page 404s outside the window; RBAC and step-up for admin routes.
- **E2E:** partial-pay checkout on an eligible PIN → advance paid → ship → deliver; download invoice from account; buy a bundle; gift-wrapped order; festival page live during the window.
- **Coverage:** modules 90 %.

## 7. Definition of Done

- [ ] Partial pay + COD balance + remittance reconciliation proven
- [ ] Invoices GST-compliant (reviewed against §10 fields), immutable numbering, credit notes
- [ ] Bundles reserve components; gift wrap taxed as a service; campaigns scheduled
- [ ] DESIGN §7 updated with the new models

## 8. Senior engineer review notes

- Partial pay is the riskiest feature here (cash collected by a courier); keep it PIN-gated and reconciled from day one.
- Invoice numbering must be a DB sequence per FY, never derived from order numbers; auditors check gaps.
- Derived bundle stock avoids the classic double-count; never cache it.
- Gift wrap is a service (SAC), not goods (HSN) — different rate and line type.

## 9. Implementation prompt

```
You are implementing plan P26 from docs/plans/26-partial-pay-invoice-bundles-festivals.md. Read DESIGN.md §2.6, §10 (GST invoice fields, Payments), §14 Phase 4, §16 and the P23/P25 plans. P22, P23 and P25 are merged.

Deliver: PIN-gated partial payment (advance via Razorpay, PARTIALLY_PAID, COD balance shipment, PAID on delivery, remittance reconciliation), GST tax invoices and credit notes as PDFs with an FY sequence and scoped signed downloads, bundles with derived stock and component reservation/tax, gift wrap as an 18 % service line, and scheduled festival campaign pages linked to promotions — with admin screens and the checkout options.

Work test-first from P26 §6, then the phase4-commerce Playwright spec. Update DESIGN.md §7 with the new models in the same PR.

Constraints: invoice numbers from a DB sequence and immutable, bundle stock never stored, gift wrap taxed as SAC 9985, immutable data, files ≤ 400 lines, every admin action audited.

When done: run suites and E2E, complete the P26 Definition of Done with evidence, and stop for review.
```
