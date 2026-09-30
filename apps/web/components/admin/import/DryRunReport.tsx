'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import { formatCount, formatDelta } from '@/lib/admin/format';
import {
  type ErrorReportLink,
  IMPORT_REPORT_ERRORS_MAX,
  type ImportJobDto,
  type ImportReport,
} from '@/lib/admin/import-types';

import { EmptyState } from '../EmptyState';

interface DryRunReportProps {
  readonly job: ImportJobDto;
}

type TabKey = 'creates' | 'updates' | 'errors' | 'stock';

const TABS: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: 'creates', label: 'Creates' },
  { key: 'updates', label: 'Updates' },
  { key: 'stock', label: 'Stock changes' },
  { key: 'errors', label: 'Errors' },
];

const countFor = (report: ImportReport, key: TabKey, errorRows: number): number =>
  key === 'errors' ? errorRows : report[key === 'stock' ? 'stockDeltas' : key].length;

const initialTab = (report: ImportReport): TabKey =>
  report.errors.length > 0 ? 'errors' : report.creates.length > 0 ? 'creates' : 'updates';

const EMPTY_COPY: Readonly<Record<TabKey, string>> = {
  creates: 'No new products in this file.',
  updates: 'No existing products are changed by this file.',
  stock: 'Stock already matches every row.',
  errors: 'No row problems found.',
};

function ProductRows({ rows }: { readonly rows: ImportReport['creates'] }) {
  return (
    <table className="admin-table admin-dryrun-table">
      <caption className="admin-visually-hidden">Products in this import</caption>
      <thead>
        <tr>
          <th scope="col">SKU</th>
          <th scope="col">Name</th>
          <th scope="col" className="admin-align-end">
            Variants
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sku} data-testid="dryrun-row">
            <td>
              <code className="admin-mono">{row.sku}</code>
            </td>
            <td>{row.name}</td>
            <td className="admin-align-end admin-tabular">{formatCount(row.variants)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StockRows({ rows }: { readonly rows: ImportReport['stockDeltas'] }) {
  return (
    <table className="admin-table admin-dryrun-table">
      <caption className="admin-visually-hidden">Stock deltas written by this import</caption>
      <thead>
        <tr>
          <th scope="col">Variant SKU</th>
          <th scope="col" className="admin-align-end">
            Current
          </th>
          <th scope="col" className="admin-align-end">
            Target
          </th>
          <th scope="col" className="admin-align-end">
            Delta
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.variantSku} data-testid="dryrun-row">
            <td>
              <code className="admin-mono">{row.variantSku}</code>
            </td>
            <td className="admin-align-end admin-tabular">{formatCount(row.current)}</td>
            <td className="admin-align-end admin-tabular">{formatCount(row.target)}</td>
            <td className="admin-align-end admin-tabular">{formatDelta(row.delta)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ErrorRows({ rows }: { readonly rows: ImportReport['errors'] }) {
  return (
    <table className="admin-table admin-dryrun-table">
      <caption className="admin-visually-hidden">
        Row problems with spreadsheet line numbers
      </caption>
      <thead>
        <tr>
          <th scope="col" className="admin-align-end">
            Line
          </th>
          <th scope="col">Column</th>
          <th scope="col">Problem</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.line}-${row.field}-${index}`} data-testid="dryrun-error-row">
            <td className="admin-align-end admin-tabular" data-testid="dryrun-error-line">
              {row.line}
            </td>
            <td>
              <code className="admin-mono">{row.field}</code>
            </td>
            <td>{row.message}</td>
            <td className="admin-dryrun-value">{row.value === '' ? '—' : row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ErrorReportLinkButton({ jobId }: { readonly jobId: string }) {
  const [link, setLink] = useState<ErrorReportLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await adminApi.get<ErrorReportLink>(`/admin/import/${jobId}/errors`);
      setLink(data);
    } catch (caught) {
      setError(isAdminApiError(caught) ? caught.message : 'Could not fetch the error report');
    } finally {
      setBusy(false);
    }
  };

  if (link !== null)
    return (
      <a
        href={link.url}
        download
        className="admin-btn admin-btn-small"
        data-testid="dryrun-errors-csv"
      >
        Download error CSV (link valid 15 min)
      </a>
    );
  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn-small"
        onClick={() => void fetchLink()}
        disabled={busy}
        data-testid="dryrun-errors-link"
      >
        {busy ? 'Preparing…' : 'Get error CSV'}
      </button>
      {error !== null && (
        <span role="alert" className="admin-error">
          {error}
        </span>
      )}
    </>
  );
}

/** Tabs over the dry-run report: creates, updates, stock deltas and errors with line numbers. */
export function DryRunReport({ job }: DryRunReportProps) {
  const report = job.report;
  const [active, setActive] = useState<TabKey>(report === null ? 'creates' : initialTab(report));

  if (report === null)
    return (
      <EmptyState
        title="No dry run yet"
        description="The report appears here once the file has been validated."
      />
    );

  const select = (key: TabKey) => setActive(key);
  const rows =
    active === 'creates'
      ? report.creates.length
      : active === 'updates'
        ? report.updates.length
        : active === 'stock'
          ? report.stockDeltas.length
          : report.errors.length;

  return (
    <section aria-labelledby="dryrun-heading" className="admin-dryrun" data-testid="dryrun-report">
      <h2 id="dryrun-heading" className="admin-section-title">
        Dry run
      </h2>
      <div role="tablist" aria-label="Dry-run sections" className="admin-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`dryrun-tab-${tab.key}`}
            aria-selected={tab.key === active}
            aria-controls={`dryrun-panel-${tab.key}`}
            tabIndex={tab.key === active ? 0 : -1}
            className={
              tab.key === 'errors' && job.errorRows > 0
                ? 'admin-tab admin-tab-critical'
                : 'admin-tab'
            }
            onClick={() => select(tab.key)}
            onKeyDown={(event) => {
              const index = TABS.findIndex((entry) => entry.key === tab.key);
              const next =
                event.key === 'ArrowRight'
                  ? TABS[(index + 1) % TABS.length]
                  : event.key === 'ArrowLeft'
                    ? TABS[(index - 1 + TABS.length) % TABS.length]
                    : undefined;
              if (next === undefined) return;
              event.preventDefault();
              select(next.key);
              document.getElementById(`dryrun-tab-${next.key}`)?.focus();
            }}
            data-testid={`dryrun-tab-${tab.key}`}
          >
            {tab.label}
            <span className="admin-tab-count admin-tabular" data-testid={`dryrun-count-${tab.key}`}>
              {formatCount(countFor(report, tab.key, job.errorRows))}
            </span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`dryrun-panel-${active}`}
        aria-labelledby={`dryrun-tab-${active}`}
        data-testid={`dryrun-panel-${active}`}
      >
        {active === 'errors' && job.errorRows > 0 && (
          <p className="admin-dryrun-note">
            {job.errorRows > IMPORT_REPORT_ERRORS_MAX
              ? `Showing the first ${IMPORT_REPORT_ERRORS_MAX} of ${formatCount(job.errorRows)} problems; the CSV lists all of them. `
              : 'Fix these rows in the sheet and upload it again; partial imports are never applied. '}
            {job.hasErrorReport && <ErrorReportLinkButton jobId={job.id} />}
          </p>
        )}
        {rows === 0 ? (
          <EmptyState title={EMPTY_COPY[active]} />
        ) : active === 'errors' ? (
          <ErrorRows rows={report.errors} />
        ) : active === 'stock' ? (
          <StockRows rows={report.stockDeltas} />
        ) : (
          <ProductRows rows={active === 'creates' ? report.creates : report.updates} />
        )}
      </div>
    </section>
  );
}
