// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import { IMPORT_ID, QUEUE_JOB_ID, uploadedJob } from '@/test-utils/import';
import { FakeXhr, flushAsync, installFakeXhr } from '@/test-utils/xhr';

import { UploadCard } from './UploadCard';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/import' };
});

const MB = 1024 * 1024;
const csv = (name = 'products.csv', size = 12, type = 'application/vnd.ms-excel') =>
  new File([new Uint8Array(size)], name, { type });
const presigned = {
  job: uploadedJob,
  upload: {
    url: 'https://bucket.test/imports/job.csv?sig=1',
    key: `imports/${IMPORT_ID}.csv`,
    headers: { 'content-type': 'text/csv', 'content-length': '12' },
    expiresAt: '2026-09-26T00:05:00.000Z',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('UploadCard', () => {
  it('links both templates through the BFF and keeps STAFF read-only', () => {
    render(<UploadCard role="STAFF" />);

    expect(screen.getByTestId('import-template-csv')).toHaveAttribute(
      'href',
      '/api/v1/admin/import/template?format=csv',
    );
    expect(screen.getByTestId('import-template-xlsx')).toHaveAttribute(
      'href',
      '/api/v1/admin/import/template?format=xlsx',
    );
    expect(screen.getByTestId('import-file-input')).toBeDisabled();
    expect(screen.getByTestId('import-admin-only')).toHaveTextContent('Admin only');
  });

  it('rejects the wrong type and oversized files client-side without a request', async () => {
    installFakeXhr();
    const calls = stubFetch(() => okEnvelope(presigned));
    const user = userEvent.setup({ applyAccept: false });
    render(<UploadCard role="ADMIN" />);
    const input = screen.getByTestId('import-file-input');

    await user.upload(input, csv('notes.txt', 4, 'text/plain'));
    expect(screen.getByTestId('import-error')).toHaveTextContent(
      'notes.txt: Only .csv or .xlsx files can be imported',
    );

    await user.upload(input, csv('huge.csv', 5 * MB + 1));
    expect(screen.getByTestId('import-error')).toHaveTextContent('5 MB or smaller');
    expect(calls).toHaveLength(0);
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('presigns with the canonical type, PUTs with the exact headers, queues the dry run and opens the job', async () => {
    installFakeXhr();
    const calls = stubFetch((call) =>
      call.url.endsWith('/validate') ? okEnvelope({ jobId: QUEUE_JOB_ID }) : okEnvelope(presigned),
    );
    const user = userEvent.setup();
    render(<UploadCard role="ADMIN" />);

    await user.upload(screen.getByTestId('import-file-input'), csv());
    await flushAsync();
    expect(screen.getByTestId('import-upload-state')).toHaveTextContent('Uploading');
    const xhr = FakeXhr.instances[0]!;
    xhr.progress(6, 12);
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Uploading products.csv' })).toHaveAttribute(
        'aria-valuenow',
        '50',
      ),
    );
    xhr.respond(200);

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith(
        `/admin/import/${IMPORT_ID}?job=${QUEUE_JOB_ID}`,
      ),
    );
    expect(xhr.headers).toEqual(presigned.upload.headers);
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['POST', '/api/v1/admin/import', { contentType: 'text/csv', contentLength: 12 }],
      ['POST', `/api/v1/admin/import/${IMPORT_ID}/validate`, undefined],
    ]);
  });

  it('accepts a dropped file and shows API and bucket failures inline', async () => {
    installFakeXhr();
    stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(429, 'RATE_LIMITED', 'Import limit reached for today')
        : okEnvelope(presigned),
    );
    render(<UploadCard role="ADMIN" />);
    const zone = screen.getByTestId('import-dropzone');

    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute('data-active', 'true');
    fireEvent.drop(zone, { dataTransfer: { files: [csv('first.csv')] } });
    expect(zone).not.toHaveAttribute('data-active');
    await waitFor(() =>
      expect(screen.getByTestId('import-error')).toHaveTextContent('Import limit reached'),
    );

    fireEvent.drop(zone, { dataTransfer: { files: [csv('second.csv')] } });
    await flushAsync();
    FakeXhr.instances[0]!.respond(403);
    await waitFor(() =>
      expect(screen.getByTestId('import-error')).toHaveTextContent('Upload rejected (403)'),
    );
    expect(screen.queryByTestId('import-progress')).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
