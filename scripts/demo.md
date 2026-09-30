# Phase 1 Demo Script

Run this walkthrough on the compose stack before tagging `v1.0.0-phase1`.
Each step should complete without errors; capture notes or a screen recording.

## Prerequisites

```bash
# Build and start the compose stack
node scripts/generate-dev-env.mjs .env.e2e
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait
```

Verify everything is healthy:
```bash
curl http://localhost:4000/healthz/ready   # {"status":"ok"}
curl http://localhost:3000/               # HTML response
curl http://localhost:8025/               # Mailpit UI
```

---

## Step 1 — Seed and admin login

1. Open Mailpit at http://localhost:8025
2. Open the storefront at http://localhost:3000/admin/login
3. Enter `admin@example.test` → click **Send code**
4. Copy the 6-digit OTP from Mailpit → enter and continue
5. Enrol TOTP (or enter existing TOTP code)
6. ✅ Admin dashboard loads

---

## Step 2 — Load the catalogue

1. In the admin shell, click **Import** in the sidebar
2. Upload `tests/e2e/fixtures/catalogue.csv`
3. Wait for status **VALIDATED** — review the summary (≥ 50 rows)
4. Click **Apply import**
5. Wait for status **APPLIED**
6. ✅ Products appear in the admin product list

---

## Step 3 — Browse as a customer

1. Open a new browser tab at http://localhost:3000
2. Navigate to **Collections** — verify category grid loads
3. Click a category → product listing loads
4. Click **Sandalwood Agarbatti Premium** (or any product)
5. ✅ PDP loads with price, variants, and add-to-cart button

---

## Step 4 — Add to cart and checkout

1. Select a variant and click **Add to cart**
2. ✅ Cart drawer/badge shows item count
3. Proceed to checkout — you are redirected to login
4. Enter a test email (e.g. `demo-buyer@example.test`) → get OTP → log in
5. ✅ Checkout page loads with cart items
6. Fill in the TN shipping address from `tests/e2e/fixtures/addresses.ts`
7. Complete checkout using the payment stub:
   ```bash
   # In a terminal, after placing the order:
   ORDER_ID=<order-id-from-success-page>
   curl -X POST http://localhost:4000/api/v1/__test__/payments/simulate \
     -H "content-type: application/json" \
     -d "{\"orderId\": \"$ORDER_ID\", \"outcome\": \"captured\"}"
   ```
8. ✅ Order status changes to **CONFIRMED**; confirmation email arrives in Mailpit

---

## Step 5 — Admin order processing

1. In the admin shell, click **Orders**
2. Open the order just placed
3. Click **Mark dispatched** → fill in AWB number → confirm
4. ✅ Order status changes to **DISPATCHED**; dispatch email arrives in Mailpit

---

## Step 6 — Shipping webhook (delivery)

```bash
curl -X POST http://localhost:4000/__test__/webhooks/shiprocket \
  -H "content-type: application/json" \
  -d '{"fixture": "webhook-delivered", "awb": "<awb-number>"}'
```

5. ✅ Order status changes to **DELIVERED**; delivery email arrives in Mailpit

---

## Step 7 — Customer account order detail

1. Open http://localhost:3000/en/account as the buyer
2. Click the order in the order history
3. ✅ Order detail page shows status DELIVERED, items, and address

---

## Step 8 — Return placeholder

1. On the order detail page, click **Request return** (if available)
2. ✅ Return request created or a "coming soon" placeholder is shown (P22 scope)

---

## Done

Record completion date, any anomalies, and the SHA of the `main` branch being demoed:

- **Date**: ___________
- **SHA**: ___________
- **Demo reviewer**: ___________
- **Anomalies**: ___________
