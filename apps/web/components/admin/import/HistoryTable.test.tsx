// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routerMock } from '@/test-utils/admin';
import { appliedJob, failedJob, uploadedJob } from '@/test-utils/import';

import { HistoryTable } from './HistoryTable';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/import' };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('HistoryTable', () => {
  it('lists jobs with status, row counts and summaries, and opens a job on activation', async () => {
    const user = userEvent.setup();
    render(
      <HistoryTable
        rows={[
          appliedJob,
          failedJob,
          {
            ...uploadedJob,
            id: 'x',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ]}
        pagination={{ page: 2, limit: 20, total: 43 }}
      />,
    );
    const [first, second, third] = screen.getAllByTestId('import-history-row');

    expect(first).toHaveTextContent('APPLIED');
    expect(first).toHaveTextContent('7 ok');
    expect(first).toHaveTextContent('3 new · 1 updated · 2 stock');
    expect(first).toHaveTextContent('admin@example.test');
    expect(second).toHaveTextContent('FAILED');
    expect(second).toHaveTextContent('2 ok · 4 errors');
    expect(third).toHaveTextContent('XLSX');
    expect(third).toHaveTextContent('—');
    expect(screen.getAllByTestId('import-history-open')[1]).toHaveAttribute(
      'href',
      `/admin/import/${failedJob.id}`,
    );

    await user.click(second!);
    expect(routerMock.push).toHaveBeenCalledWith(`/admin/import/${failedJob.id}`);

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/import?page=3');
  });

  it('shows an empty state without rows', () => {
    render(<HistoryTable rows={[]} pagination={{ page: 1, limit: 20, total: 0 }} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent('No imports yet');
  });
});
