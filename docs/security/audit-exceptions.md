# npm Audit — Tracked Exceptions

Exceptions for high/critical vulnerabilities that cannot be patched immediately due to upstream constraints.
Each entry documents the CVE, affected package path, exposure assessment, and expected resolution.

---

## AE-01 · postcss — GHSA-6g55-p6wh-862q & GHSA-r28c-9q8g-f849

| Field | Value |
|-------|-------|
| CVE | GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 |
| Package | `postcss@8.4.31` (bundled inside `next@15.5.26`) |
| Severity | High |
| Patched in | `postcss@8.5.12` (GHSA-6g55-p6wh-862q), `postcss@8.5.18` (GHSA-r28c-9q8g-f849) |
| Date tracked | 2026-09-29 |

**Dependency path:**
```
next@15.5.26 → [internal bundled postcss@8.4.31]
```

**Vulnerability summary:**
Both advisories are path traversal / arbitrary file read vulnerabilities triggered via a crafted `sourceMappingURL` comment inside a CSS file processed by PostCSS. An attacker would need to supply a malicious `.css` file that PostCSS processes at build time or via HMR.

**Exposure assessment:**
- `postcss` inside Next.js is only executed at **build time** and during the **development HMR server**. It is not exposed to user-supplied input at runtime.
- An attacker exploiting this would need write access to a CSS source file — equivalent to full code execution on the build system. The blast radius is no worse than any other build-time dependency.
- **Production deployments run compiled JS artefacts; PostCSS is not invoked at runtime.** CVSS exploitability is therefore negligible for this project.

**Why it cannot be patched immediately:**
`postcss` is vendored inside the Next.js package itself (`next/node_modules/postcss`). It cannot be upgraded independently; a patch requires upgrading Next.js to a version that vendors PostCSS >=8.5.18. As of 2026-09-29, `next@16.x` is the first release line bundling a fixed PostCSS but it introduces breaking API changes.

**Resolution plan:**
Upgrade to `next@16.x` during the Phase 2 sprint. Track via backlog item BL-13 (to be created).

---

## AE-02 · deepmerge-ts — GHSA-ggr8-5vv4-36mx

| Field | Value |
|-------|-------|
| CVE | GHSA-ggr8-5vv4-36mx |
| Package | `deepmerge-ts@7.1.5` (via `@prisma/config@6.19.3`) |
| Severity | High |
| Patched in | `deepmerge-ts@8.0.0` |
| Date tracked | 2026-09-29 |

**Dependency path:**
```
@pe/api → prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5
```

**Vulnerability summary:**
Stack exhaustion (DoS) when merging deeply recursive object graphs. An attacker would need to supply a deeply-nested object to a code path that passes user input into a `deepmerge-ts` call.

**Exposure assessment:**
- `deepmerge-ts` is used **internally by `@prisma/config`** to merge the Prisma configuration object at startup. It does not appear in any path that accepts user-supplied request data.
- Prisma configuration is loaded from static `schema.prisma` and environment variables — not from user input. There is no realistic attack surface.
- This is effectively a **build/tooling-only exposure**, comparable to a vulnerability in a bundler.

**Why it cannot be patched immediately:**
`deepmerge-ts@8.0.0` requires `@prisma/config@>=8.0.0`, which in turn requires `prisma@>=8.0.0`. As of 2026-09-29, `prisma@8.0.0-rc.19` is the only available version and is a release candidate. Adopting an RC in production is not acceptable before the Phase 1 code-ready gate.

**Resolution plan:**
Upgrade to `prisma@8.x` stable when it exits RC. Track with the scheduled Prisma 8 migration.

---

## How this file is used

The CI job that runs `pnpm audit` is configured to check this file before blocking the build:
- Any advisory listed here with a valid **Date tracked** and **Resolution plan** is considered a *tracked exception* and does not fail the gate.
- Exceptions older than 90 days without a resolution update will be escalated in the weekly security review.
