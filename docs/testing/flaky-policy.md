# Flaky Test Policy

A spec is **flaky** if it fails on the first attempt and then passes on a retry in the same CI run (Playwright `retries: 1`).

## Detection

The CI e2e job uses `retries: 1`. After every run Playwright emits a JSON report at `test-results/results.json`. A post-run script parses that report and flags any spec where `retry > 0` and the final outcome is `passed`.

```bash
node scripts/mark-flaky.mjs test-results/results.json
```

The script opens a GitHub issue titled `[flaky] <spec title> <date>` and adds the `@flaky` annotation to the spec file via an automated PR.

## Grace period

A spec tagged `@flaky` is **still run** in CI but does **not block** the required-checks gate for a maximum of **7 days** from the date of the issue.

After 7 days the spec is either:
1. Fixed and the `@flaky` tag removed, OR
2. Removed from the critical path and demoted to an informational job.

## Rules

- No `@flaky` tags are permitted at `v1.0.0-phase1` tag time.
- `@critical` and `@flaky` cannot coexist on the same spec. A critical spec that is found flaky must be fixed before the tag.
- The root cause must be documented in the GitHub issue before the grace period expires.

## Common causes

- Timing-dependent assertions: replace with deterministic waits or the test clock.
- Shared mutable state between specs: enforce per-spec data isolation.
- Port-race on the compose stack: wait for `/healthz/ready` in global setup.
- Mailpit OTP polling timeout: increase `waitForMessage` timeout or check SMTP delivery.
