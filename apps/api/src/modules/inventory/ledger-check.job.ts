import type { PrismaDb } from '../../db/prisma';
import type { LedgerCheckPayload } from '../../jobs/queue';
import { recordAudit, SYSTEM_ACTOR } from '../audit/record';
import type { SecurityCounters } from '../security-events/counters';

import { compareLedger, type LedgerCheckResult, type LedgerRow } from './ledger-check';

/** 02:00 IST every day, expressed in UTC (IST = UTC+05:30). */
export const LEDGER_CHECK_CRON = '30 20 * * *';

export interface LedgerCheckDeps {
  readonly prisma: PrismaDb;
  readonly counters: SecurityCounters;
  readonly log: { warn(obj: object, msg: string): void; info(obj: object, msg: string): void };
}

interface RawRow {
  readonly variant_id: string;
  readonly sku: string;
  readonly stock: number;
  readonly ledger: number;
}

/** Nightly `ledger-check` (P06 task 6): drift is logged, counted and audited; auto-heal is off. */
export const runLedgerCheck = async (
  deps: LedgerCheckDeps,
  payload: LedgerCheckPayload,
): Promise<LedgerCheckResult> => {
  const raw = await deps.prisma.$queryRaw<RawRow[]>`
    SELECT v."id" AS variant_id, v."sku", v."stock", coalesce(sum(m."delta"), 0)::int AS ledger
    FROM "product_variant" v LEFT JOIN "stock_movement" m ON m."variant_id" = v."id"
    GROUP BY v."id", v."sku", v."stock"`;
  const rows: LedgerRow[] = raw.map((row) => ({
    variantId: row.variant_id,
    sku: row.sku,
    stock: row.stock,
    ledger: row.ledger,
  }));
  const result = compareLedger(rows);
  for (const drift of result.drift) {
    deps.log.warn({ event: 'inventory.ledger.drift', ...drift }, 'inventory.ledger.drift');
    await deps.counters.increment('inventory.ledger.drift');
  }
  if (result.drift.length > 0) {
    deps.log.warn(
      {
        event: 'inventory.ledger.drift.alert',
        driftCount: result.drift.length,
        trigger: payload.trigger,
        skus: result.drift.map((d) => d.sku),
      },
      `ALERT inventory drift detected: ${result.drift.length} variant(s) out of sync — manual reconciliation required`,
    );
  }
  await recordAudit(deps.prisma, {
    ...SYSTEM_ACTOR,
    actorId: payload.actorId ?? null,
    action: 'inventory.ledger_check',
    entityType: 'inventory',
    after: { trigger: payload.trigger, checked: result.checked, drift: result.drift },
  });
  deps.log.info(
    { checked: result.checked, drift: result.drift.length, trigger: payload.trigger },
    'ledger check complete',
  );
  return result;
};
