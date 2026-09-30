// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import {
  appliedJob,
  failedJob,
  IMPORT_ID,
  QUEUE_JOB_ID,
  queueJob,
  uploadedJob,
  validatedJob,
} from '@/test-utils/import';

import { ToastProvider } from '../Toast';

import { ADMIN_ONLY_MESSAGE, ApplyBar, CANCELLED_MESSAGE, canApply } from './ApplyBar';
import { DryRunReport } from './DryRunReport';
import { ImportJobPanel } from './ImportJobPanel';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/import/x' };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DryRunReport', () => {
  it('opens on creates for a clean file and switches tabs by click and arrow keys', async () => {
    const user = userEvent.setup();
    render(<DryRunReport job={validatedJob} />);

    expect(screen.getByTestId('dryrun-tab-creates')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('dryrun-row')).toHaveLength(3);
    expect(screen.getByTestId('dryrun-count-creates')).toHaveTextContent('3');
    expect(screen.getByTestId('dryrun-count-errors')).toHaveTextContent('0');

    await user.click(screen.getByTestId('dryrun-tab-updates'));
    expect(screen.getAllByTestId('dryrun-row')).toHaveLength(1);
    expect(screen.getByTestId('dryrun-panel-updates')).toHaveTextContent('Rose Agarbatti');

    await user.click(screen.getByTestId('dryrun-tab-stock'));
    const stock = screen.getAllByTestId('dryrun-row');
    expect(stock).toHaveLength(2);
    expect(stock[0]).toHaveTextContent('+30');
    expect(stock[1]).toHaveTextContent('−2');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('dryrun-tab-errors')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('dryrun-tab-errors')).toHaveFocus();
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No row problems found');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('dryrun-tab-creates')).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on errors with line numbers and fetches the error CSV link on demand', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() =>
      okEnvelope({
        url: 'https://bucket.test/errors.csv?sig=1',
        expiresAt: '2026-09-26T00:15:00Z',
      }),
    );
    render(<DryRunReport job={failedJob} />);

    expect(screen.getByTestId('dryrun-tab-errors')).toHaveAttribute('aria-selected', 'true');
    const rows = screen.getAllByTestId('dryrun-error-row');
    expect(rows).toHaveLength(4);
    expect(screen.getAllByTestId('dryrun-error-line').map((cell) => cell.textContent)).toEqual([
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(rows[1]).toHaveTextContent('category_slug');
    expect(rows[1]).toHaveTextContent('no-such-category');

    await user.click(screen.getByTestId('dryrun-errors-link'));
    expect(await screen.findByTestId('dryrun-errors-csv')).toHaveAttribute(
      'href',
      'https://bucket.test/errors.csv?sig=1',
    );
    expect(calls[0]?.url).toBe(`/api/v1/admin/import/${failedJob.id}/errors`);
  });

  it('explains a missing report and reports a failed link fetch', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(404, 'NOT_FOUND', 'No error report'));
    const { unmount } = render(<DryRunReport job={uploadedJob} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No dry run yet');
    unmount();

    render(<DryRunReport job={failedJob} />);
    await user.click(screen.getByTestId('dryrun-errors-link'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No error report');
  });
});

describe('ApplyBar', () => {
  const renderBar = (job = validatedJob, role: 'ADMIN' | 'STAFF' = 'ADMIN', working = false) => {
    const onQueued = vi.fn();
    render(<ApplyBar job={job} role={role} working={working} onQueued={onQueued} />);
    return onQueued;
  };

  it('is enabled only for a clean VALIDATED job seen by an ADMIN', () => {
    expect(canApply(validatedJob)).toBe(true);
    expect(canApply(failedJob)).toBe(false);
    expect(canApply({ ...validatedJob, errorRows: 1 })).toBe(false);

    const { unmount } = render(
      <ApplyBar job={uploadedJob} role="ADMIN" working={false} onQueued={vi.fn()} />,
    );
    expect(screen.getByTestId('import-apply')).toBeDisabled();
    expect(screen.getByTestId('apply-explanation')).toHaveTextContent('Run the dry run first');
    unmount();

    renderBar(failedJob);
    expect(screen.getByTestId('import-status')).toHaveTextContent('FAILED');
    expect(screen.getByTestId('import-apply')).toBeDisabled();
    expect(screen.getByTestId('import-summary-errors')).toHaveTextContent('4');
  });

  it('shows the admin-only note for STAFF and the applied timestamp afterwards', () => {
    const { unmount } = render(
      <ApplyBar job={validatedJob} role="STAFF" working={false} onQueued={vi.fn()} />,
    );
    expect(screen.getByTestId('import-apply')).toBeDisabled();
    expect(screen.getByTestId('apply-explanation')).toHaveTextContent(ADMIN_ONLY_MESSAGE);
    unmount();

    render(<ApplyBar job={appliedJob} role="ADMIN" working={false} onQueued={vi.fn()} />);
    expect(screen.queryByTestId('import-apply')).toBeNull();
    expect(screen.getByText(/^Applied /)).toBeInTheDocument();
  });

  it('queues the apply job and hands the queue id up', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope({ jobId: QUEUE_JOB_ID }));
    const onQueued = renderBar();

    await user.click(screen.getByTestId('import-apply'));

    await waitFor(() => expect(onQueued).toHaveBeenCalledWith(QUEUE_JOB_ID));
    expect(calls).toEqual([
      { url: `/api/v1/admin/import/${IMPORT_ID}/apply`, method: 'POST', body: undefined },
    ]);
  });

  it('explains a cancelled step-up and other refusals, and waits while working', async () => {
    const user = userEvent.setup();
    stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
        : errorEnvelope(409, 'CONFLICT', 'File changed since validation'),
    );
    const onQueued = renderBar();

    await user.click(screen.getByTestId('import-apply'));
    expect(await screen.findByTestId('apply-error')).toHaveTextContent(CANCELLED_MESSAGE);
    await user.click(screen.getByTestId('import-apply'));
    expect(await screen.findByTestId('apply-error')).toHaveTextContent('File changed');
    expect(onQueued).not.toHaveBeenCalled();

    render(
      <ApplyBar
        job={validatedJob}
        role="ADMIN"
        working
        workingLabel="Applying…"
        onQueued={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('import-apply').at(-1)).toBeDisabled();
    expect(screen.getByTestId('import-working')).toHaveTextContent('Applying…');
  });
});

describe('ImportJobPanel', () => {
  const renderPanel = (initial = uploadedJob, queueJobId: string | null = QUEUE_JOB_ID) =>
    render(
      <ToastProvider>
        <ImportJobPanel initial={initial} queueJobId={queueJobId} role="ADMIN" pollIntervalMs={1} />
      </ToastProvider>,
    );

  it('polls the validate job from the redirect, then applies behind the bar and toasts success', async () => {
    const user = userEvent.setup();
    let polls = 0;
    let applied = false;
    const calls = stubFetch((call) => {
      if (call.url.includes('/jobs/')) {
        polls += 1;
        return okEnvelope(queueJob(polls % 2 === 1 ? 'active' : 'completed'));
      }
      if (call.url.endsWith('/apply')) {
        applied = true;
        return okEnvelope({ jobId: QUEUE_JOB_ID });
      }
      return okEnvelope(applied ? appliedJob : validatedJob);
    });
    renderPanel();

    expect(screen.getByTestId('import-working')).toHaveTextContent('dry run');
    await waitFor(() => expect(screen.getByTestId('import-status')).toHaveTextContent('VALIDATED'));
    expect(screen.getAllByTestId('dryrun-row')).toHaveLength(3);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('import-apply'));
    await waitFor(() => expect(screen.getByTestId('import-status')).toHaveTextContent('APPLIED'));
    expect(screen.getByTestId('toast')).toHaveTextContent('Import applied');
    expect(calls.filter((call) => call.url.endsWith(`/import/${IMPORT_ID}`))).toHaveLength(2);
  });

  it('surfaces the import error when the apply transaction rolled back', async () => {
    const user = userEvent.setup();
    stubFetch((call) =>
      call.url.includes('/jobs/')
        ? okEnvelope(queueJob('failed', 'category missing'))
        : call.url.endsWith('/apply')
          ? okEnvelope({ jobId: QUEUE_JOB_ID })
          : okEnvelope({
              ...validatedJob,
              status: 'FAILED',
              error: 'Category agarbatti was deleted',
            }),
    );
    renderPanel(validatedJob, null);

    await user.click(screen.getByTestId('import-apply'));

    await waitFor(() => expect(screen.getByTestId('import-status')).toHaveTextContent('FAILED'));
    expect(screen.getByTestId('toast')).toHaveTextContent('Category agarbatti was deleted');
    expect(screen.getByTestId('toast')).toHaveClass('admin-toast-critical');
    expect(screen.getByTestId('apply-explanation')).toHaveTextContent(
      'Category agarbatti was deleted',
    );
  });

  it('offers a manual dry run for an UPLOADED job without a queue id and reports lost jobs', async () => {
    const user = userEvent.setup();
    stubFetch((call) =>
      call.url.endsWith('/validate')
        ? okEnvelope({ jobId: QUEUE_JOB_ID })
        : errorEnvelope(404, 'NOT_FOUND', 'Job not found'),
    );
    renderPanel(uploadedJob, null);

    expect(screen.queryByTestId('import-working')).toBeNull();
    await user.click(screen.getByTestId('import-validate'));

    expect(await screen.findByTestId('import-job-error')).toHaveTextContent('Job not found');
    expect(within(screen.getByTestId('apply-bar')).getByTestId('import-status')).toHaveTextContent(
      'UPLOADED',
    );
  });
});
