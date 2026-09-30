# P19 — Deployment & Go-Live (Phase 2)

|                  |                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase            | 2 — Deployment & Go-Live                                                                                                                                                           |
| Estimated effort | 5 dev-days (Tier B) · 7–8 (Tier A) · 8–10 (Tier C), plus VAPT lead time                                                                                                            |
| Depends on       | P18 (Phase 1 exit signed)                                                                                                                                                          |
| Unblocks         | P20+                                                                                                                                                                               |
| Design refs      | DESIGN.md §4.1, §4.2, §6.3, §11.3 (Email, Data protection, Infrastructure), §11.5, §11.6 right column, §14 Phase 2 (tier table, work items, exit criteria), §17 deferred decisions |
| Branch           | `feat/p19-deployment` (+ `infra/` changes)                                                                                                                                         |

## 1. Goal

Take the code-complete, hosting-agnostic Phase 1 build to a live, monitored, backed-up, pen-tested production on the chosen tier, with staging in front of it, real payment and shipping integrations verified, and the deferred decisions (tier, hosting, admin IP allow-list, monitoring backend, GSTIN, staff) made and recorded.

## 2. Scope

### In

- Tier decision (A open-source VPS / B lean AWS / C full managed) and the deferred decisions from DESIGN §17
- Production adapters: `KeyProvider` (KMS or SOPS-managed key), secret injection (SSM / Secrets Manager / SOPS+age), `SesSnsFeedbackAdapter`, real `ShiprocketAdapter` on staging with captured fixtures, `MEDIA_PUBLIC_BASE_URL` via CDN, bucket CORS for presigned PUT
- Environments: staging + production, separate secrets and provider keys; CD pipeline (staging on `main`, production by approval), migration job, health gates, rollback
- SES domain (DKIM/SPF/DMARC/MAIL FROM), production access, feedback loop; Razorpay live keys + webhook registration + ₹1 real order/refund; Shiprocket live + pickup + webhooks + IP list; `TRUSTED_PROXIES`
- Edge: Cloudflare Free (or AWS WAF), DNS, TLS, HSTS (+ preload only after verification)
- Backups + PITR + **restore drill**; monitoring (Sentry/GlitchTip, dashboards from `/metrics`, uptime), alert routing; log shipping/retention
- Admin IP allow-list decision applied; staff accounts + MFA; GSTIN/legal entity/grievance officer in settings; policy review
- External VAPT + fixes; ZAP full scan on staging; security headers scan; deliverability test
- Runbooks: deploy, rollback, restore, incident/breach (DPDP), secret rotation; go-live checklist; DNS cutover

### Out

- Feature work (Phase 3+), tier upgrade B→C (Phase 4 item unless triggers fire)

## 3. Deliverables

```
docs/deployment/{tier-decision.md (ADR), runbook-deploy.md, runbook-rollback.md, runbook-restore.md, runbook-incident.md, runbook-secrets-rotation.md, go-live-checklist.md, environments.md}
infra/README.md  +  one of:
  infra/tier-a/{compose.prod.yml, Caddyfile or traefik.yml, coraza/, crowdsec/, pgbackrest.conf, dokploy-notes.md, sops/.sops.yaml}
  infra/tier-b/{compose.prod.yml, Caddyfile, cloudformation-or-terraform for RDS+S3+CloudFront+SSM+IAM, ec2-userdata.sh}
  infra/tier-c/{terraform or cdk: vpc, rds, elasticache, ecs, alb, waf, secrets, cloudfront, ses, iam-oidc}
apps/api/src/ports/adapters/{kms-key-provider.ts | sops-key-provider.ts, ses-sns-feedback.ts}
.github/workflows/{deploy-staging.yml, deploy-production.yml}
tests/e2e/staging.spec.ts (smoke subset)  tests/fixtures/shiprocket/* (refreshed from staging captures)
```

## 4. Tasks (ordered)

1. **Decide and record.** `tier-decision.md` ADR using the DESIGN §14 tier table (default B); also record: storefront hosting (self-host vs Vercel/Amplify), admin IP allow-list (yes/no + CIDRs), monitoring backend (Sentry vs GlitchTip), staff count. Update DESIGN §17.
2. **Provider accounts (start day 1 — lead times).** SES production access request; Razorpay live activation + webhook secret; Shiprocket live account + pickup address (Chennai) + webhook + published IP ranges; domain purchase/transfer; Cloudflare zone.
3. **Secrets & keys.** Generate production JWT RS256 key pair(s) with `kid`; 32-byte encryption + blind-index keys; choose the injection path (Tier A: SOPS+age files decrypted at deploy; B: SSM Parameter Store SecureString pulled by user-data/compose env; C: Secrets Manager → ECS task secrets). Implement `KmsKeyProvider` (AWS KMS data-key envelope) for B/C or `SopsKeyProvider` (key from the decrypted env) for A; `KEY_PROVIDER` env selects. Rotation runbook: dual-key read, single-key write, backfill job (document; implement the read-two-keys path in the provider now).
4. **Data stores.** Postgres: Tier A self-hosted with pgBackRest (full nightly + WAL to S3-compatible, 35-day retention); B/C RDS with automated backups + PITR 35 d, KMS at rest. Valkey: container (A/B) or ElastiCache (C) with AUTH + TLS. Object storage: S3 buckets `media` (private), `imports`, `exports` with lifecycle rules (imports 30 d, exports 24 h) and CORS for presigned PUT from `WEB_ORIGIN`; CloudFront (or Cloudflare) in front of `media` with OAC; set `MEDIA_PUBLIC_BASE_URL`. Run the migration job (`prisma migrate deploy`) as a one-shot before app rollout.
5. **Compute & edge.** Tier A: Dokploy/Coolify on a 4 GB India-region VPS, Caddy (auto-TLS) + Coraza (OWASP CRS) + CrowdSec; disk encryption enabled and evidenced; SSH via provider console/SSM only. Tier B: t4g.medium with compose + Caddy; RDS micro; security group DB ← app only. Tier C: IaC for VPC/private subnets, ECS Fargate ×2 + ALB, ElastiCache, RDS Multi-AZ, WAF managed rules + rate rule, CloudFront. All tiers: Cloudflare Free (or AWS WAF) in front with proxied DNS; `TRUSTED_PROXIES` set to the edge's IP ranges; HSTS active; submit to preload only after every subdomain is HTTPS.
6. **CD.** `deploy-staging.yml` on `main`: build images (from P01 Dockerfiles), push to registry (GHCR/ECR), run migrations, roll out (Dokploy webhook / SSH compose pull / ECS service update), wait for `/readyz`, run `staging.spec.ts`; `deploy-production.yml` manual approval, same steps, canary not required; rollback = redeploy previous image tag + `prisma migrate` is forward-only (document "expand/contract" rule for schema changes from now on). OIDC federation for AWS (no long-lived keys).
7. **Email.** Verify domain in SES `ap-south-1`; Easy DKIM 2048; SPF include; DMARC `p=quarantine` → `p=reject` after two clean weeks; custom MAIL FROM; configuration set with SNS topic → `POST /webhooks/email` via `SesSnsFeedbackAdapter` (SNS signature verification against Amazon's cert, subscription confirmation handling, bounce/complaint → suppression); switch `EMAIL_FEEDBACK_ADAPTER=ses-sns`; send test mails and check deliverability (mail-tester score ≥ 9); bounce/complaint alerts (> 5 % / > 0.1 %).
8. **Payments & shipping on staging → production.** Razorpay test keys on staging, live on production; register webhook URLs with the webhook secret; place a real ₹1 order in production after cutover and refund it (documented evidence). Shiprocket: run the adapter against the live API on staging, capture responses into `tests/fixtures/shiprocket/`, fix contract tests, verify serviceability for a TN and a remote PIN, create/cancel a test shipment, receive a real webhook (check `x-api-key` + IP list). Set `SHIPPING_ADAPTER=shiprocket` on staging and production.
9. **Observability.** Sentry (or GlitchTip) DSNs per environment with `beforeSend` scrubbing verified; Prometheus scrape of `/metrics` (Grafana Cloud free / self-hosted) with dashboards: request latency, error rate, orders/hour, payment failures, webhook signature failures, OTP send rate, job queue depth, ledger drift; Uptime Kuma / external uptime check on `/readyz` and `/`; alert routing (email + optional Slack); log shipping (CloudWatch / Loki) with 90-day retention.
10. **Restore drill.** Restore last night's backup into a scratch instance, run migrations check and a read-only smoke; record RTO/RPO achieved in `runbook-restore.md`. Repeat quarterly (calendar reminder).
11. **Business settings.** Enter GSTIN, legal name, address, grievance officer, support email in `/admin/settings` (clears `isPlaceholder`); create staff accounts, enforce MFA enrolment; apply the admin IP allow-list (Cloudflare access rule / WAF rule / Caddy matcher) if decided; business review of the ten policy pages.
12. **Security verification.** External VAPT by a CERT-In-empanelled firm on staging with the P17 walkthrough as input; fix Critical/High before go-live; ZAP full scan on staging; securityheaders/observatory A grade; confirm boot assertions pass with production config; rotate any secret that touched a laptop.
13. **Go-live.** `go-live-checklist.md`: DNS cutover (low TTL set a day earlier), robots/sitemap live, Search Console + sitemap submit, uptime monitor green, on-call contact and escalation, rollback plan rehearsed, first real order + refund, announcement.

## 5. Contracts

- Environment variable set is exactly `.env.example` (no new keys without schema); production values only in the chosen secret store.
- Image tags are immutable (`sha-<git>`); rollback is by tag.
- Schema changes after go-live follow expand/contract (never a destructive migration in the same release as code that needs the old shape).
- Webhook URLs: `https://<api-domain>/api/v1/webhooks/{razorpay,shiprocket,email}` reachable only through the edge; API otherwise private.
- Exit criteria: DESIGN §14 Phase 2 — staging + production live, VAPT Critical/High fixed, restore drill passed, checklist signed.

## 6. Test plan

- **Staging smoke** (`staging.spec.ts`): browse, login (real SES OTP to a test inbox), add to cart, checkout with Razorpay test mode (manual step or Razorpay test card automation where allowed), webhook received, admin ships via live Shiprocket serviceability + test shipment, tracking email delivered.
- **Restore drill** executed and documented with timings.
- **Security**: VAPT report + fixes; ZAP full; headers A; SES DMARC reports reviewed after week 1.
- **Resilience**: kill the app container/task → `/readyz` recovers within the tier's expectation; DB failover (Tier C) or restart (A/B) documented.
- **Deliverability**: mail-tester ≥ 9; bounce/complaint dashboards show 0 after test sends.
- **Cost check**: first invoice within the tier estimate in DESIGN §6.3; alarms on budget.

## 7. Definition of Done

- [ ] Tier ADR and all deferred decisions recorded in `docs/deployment/` and DESIGN §17 updated
- [ ] Staging and production deployed via CD with OIDC/no long-lived keys; rollback rehearsed
- [ ] SES domain authenticated (DKIM/SPF/DMARC), production access granted, feedback loop live
- [ ] Razorpay live webhook verified with a real ₹1 order and refund; Shiprocket live verified with fixtures refreshed
- [ ] Backups + PITR configured; restore drill passed with RTO/RPO recorded
- [ ] Monitoring, alerts, uptime and log retention live; boot assertions pass in production
- [ ] VAPT Critical/High fixed; ZAP full green; headers A
- [ ] GSTIN/legal/grievance settings entered; staff with MFA; policies reviewed
- [ ] Go-live checklist signed; DNS cut over; first order processed

## 8. Senior engineer review notes

- Start provider paperwork (SES production access, Razorpay live, Shiprocket) on day one; these, not engineering, set the calendar.
- Whatever the tier, the database is managed or properly backed up _before_ any customer data exists; everything else can be re-provisioned.
- Expand/contract migrations from go-live onward: the CD pipeline runs migrations before rollout, so a destructive migration would break the still-running old version.
- The Shiprocket fixtures captured here become the truth for P14's contract tests; commit them with the capture date.
- HSTS preload is irreversible in practice; submit only after every subdomain (including future admin hostnames) is HTTPS.
- Keep the API private behind the edge; the only public ingress is the web origin and the webhook paths.
- Tier A adds two to four days mostly in backup/restore and WAF tuning — budget them honestly rather than discovering them at go-live.

## 9. Implementation prompt

```
You are implementing plan P19 from docs/plans/19-deployment-go-live.md — the Phase 2 Deployment & Go-Live plan. Read DESIGN.md §4.1, §4.2, §6.3, §11.3 (Email, Data protection, Infrastructure), §11.6 right column and §14 Phase 2 (tier table, work items, exit criteria), and docs/plans/00-README.md. Phase 1 is code-complete and tagged v1.0.0-phase1; the code is hosting-agnostic and must not be changed for deployment except to add production adapters.

First, produce docs/deployment/tier-decision.md as an ADR choosing Tier A, B or C from the DESIGN §14 table (default B), and record the storefront-hosting, admin IP allow-list, monitoring-backend and staff-count decisions; stop and confirm the tier with the owner before provisioning anything that costs money.

Then deliver, for the chosen tier: infra under infra/tier-x (compose-for-prod or IaC), production KeyProvider (KMS or SOPS) and secret injection, SES domain authentication and the SesSnsFeedbackAdapter wired to /webhooks/email, S3/CloudFront (or equivalent) with bucket CORS and MEDIA_PUBLIC_BASE_URL, Cloudflare Free or AWS WAF in front with TRUSTED_PROXIES set, staging and production environments with separate secrets and provider keys, CD workflows (staging on main, production by approval, migrations before rollout, readiness gate, rollback by image tag, OIDC for AWS), backups + PITR and a documented restore drill, monitoring/alerting/uptime/log retention, Razorpay live webhook registration and a real ₹1 order + refund, Shiprocket live verification with refreshed fixtures and SHIPPING_ADAPTER=shiprocket, business settings entry (GSTIN, legal name, grievance officer) and staff MFA, the admin IP allow-list if decided, the external VAPT with Critical/High fixes and a ZAP full scan, and the runbooks (deploy, rollback, restore, incident/breach, secret rotation) plus the go-live checklist.

Work in the order of P19 §4; start provider account requests immediately because of lead times. Run tests/e2e/staging.spec.ts against staging after each deploy. Never store production secrets in the repo or CI logs; never run a destructive migration in the same release as dependent code.

When done: complete the P19 Definition of Done with evidence (ADR, CD run links, DKIM/DMARC status, ₹1 order + refund ids, restore drill timings, VAPT summary, signed go-live checklist) and stop for the go-live review.
```
