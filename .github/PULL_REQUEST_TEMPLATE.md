## Plan

`[PNN] Title` — link: `docs/plans/NN-slug.md`

## Summary

<!-- What changed and why, in a few sentences. -->

## Definition of Done (global)

- [ ] All tasks in the plan complete; nothing marked TODO in code
- [ ] Unit + integration tests written first and green; coverage thresholds met
- [ ] E2E scenarios listed in the plan pass on the compose stack (where the plan has any)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean; CI green including security jobs
- [ ] No new `pnpm audit` high/critical; no secrets in diff (gitleaks clean)
- [ ] Error paths return the envelope with stable codes; logs redact PII
- [ ] DESIGN.md §4.2 hosting-agnostic rules respected (env-only config, ports, no cloud SDK for config)
- [ ] `/code-review` run; CRITICAL/HIGH resolved
- [ ] `.env.example`, README and any ADR updated

## Plan-specific Definition of Done

<!-- Paste the plan's §7 checklist here, ticked, with evidence (test output, screenshots). -->

## Evidence

<!-- Command output, screenshots, links to CI runs. -->
