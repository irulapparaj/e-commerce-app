// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_NAME_MESSAGE } from '@/lib/admin/bulk-images';
import { okEnvelope, stubFetch } from '@/test-utils/admin';
import { IDS } from '@/test-utils/catalogue';
import { FakeXhr, flushAsync, installFakeXhr } from '@/test-utils/xhr';

import { BulkImageUpload, classifyFile } from './BulkImageUpload';

const png = (name: string, size = 4) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });
const productRow = {
  id: IDS.product,
  name: 'Rose Agarbatti',
  slug: 'rose-agarbatti',
  sku: 'ROSE',
  isActive: true,
  isFeatured: false,
  category: { id: IDS.agarbatti, name: 'Agarbatti', slug: 'agarbatti' },
  variants: [],
  imageCount: 0,
  thumbUrl: null,
  updatedAt: '2026-09-25T00:00:00.000Z',
};
const presigned = {
  url: 'https://bucket.test/products/p1/abc.png',
  key: 'products/p1/abc.png',
  headers: { 'content-type': 'image/png', 'content-length': '4' },
  expiresAt: '2026-09-26T00:05:00.000Z',
};
const job = (state: string) => ({
  id: 'job-1',
  name: 'media-process',
  state,
  error: null,
  output: null,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyFile', () => {
  it('parses the SKU from the name and fails unparsable names or bad images up front', () => {
    expect(classifyFile(1, png('ROSE-1.png'))).toMatchObject({
      sku: 'ROSE',
      state: 'queued',
      error: null,
    });
    expect(classifyFile(2, png('holiday.png'))).toMatchObject({
      sku: null,
      state: 'failed',
      error: IMAGE_NAME_MESSAGE,
    });
    expect(
      classifyFile(3, new File(['<svg/>'], 'ROSE-2.svg', { type: 'image/svg+xml' })),
    ).toMatchObject({ state: 'failed', error: IMAGE_NAME_MESSAGE });
    expect(classifyFile(4, png('ROSE-3.png', 10 * 1024 * 1024 + 1))).toMatchObject({
      sku: 'ROSE',
      state: 'failed',
      error: 'Images must be 10 MB or smaller',
    });
  });
});

describe('BulkImageUpload', () => {
  it('rejects unparsable names without any request', async () => {
    installFakeXhr();
    const calls = stubFetch(() => okEnvelope([productRow]));
    const user = userEvent.setup();
    render(<BulkImageUpload pollIntervalMs={1} />);

    await user.upload(screen.getByTestId('bulk-image-input'), png('holiday.png'));

    expect(screen.getByTestId('bulk-state')).toHaveTextContent('Failed');
    expect(screen.getByTestId('bulk-error')).toHaveTextContent(IMAGE_NAME_MESSAGE);
    expect(calls).toHaveLength(0);
  });

  it('resolves the SKU once, uploads each file through presign/confirm and reports per-file status', async () => {
    installFakeXhr();
    const calls = stubFetch((call) => {
      if (call.url.startsWith('/api/v1/admin/products?')) return okEnvelope([productRow]);
      if (call.url.endsWith('/presign')) return okEnvelope(presigned);
      if (call.url.endsWith('/confirm')) return okEnvelope({ jobId: 'job-1' });
      return okEnvelope(job('completed'));
    });
    render(<BulkImageUpload pollIntervalMs={1} />);
    const zone = screen.getByTestId('bulk-dropzone');

    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute('data-active', 'true');
    fireEvent.drop(zone, { dataTransfer: { files: [png('ROSE-1.png'), png('ROSE-2.png')] } });

    const states = screen.getAllByTestId('bulk-state');
    expect(states.map((node) => node.textContent)).toEqual(['Queued', 'Queued']);
    await waitFor(() => expect(states[0]).toHaveTextContent('Uploading'));
    await flushAsync();
    expect(screen.getByRole('progressbar', { name: 'Uploading ROSE-1.png' })).toBeInTheDocument();
    FakeXhr.instances[0]!.respond(200);
    await waitFor(() => expect(states[0]).toHaveTextContent('Done'));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1]!.respond(200);
    await waitFor(() => expect(states[1]).toHaveTextContent('Done'));

    expect(screen.getAllByTestId('bulk-row')[0]).toHaveTextContent('→ Rose Agarbatti');
    expect(calls.filter((call) => call.url.startsWith('/api/v1/admin/products?'))).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/admin/products?q=ROSE&limit=5');
    expect(calls.filter((call) => call.url.endsWith('/presign'))).toHaveLength(2);
    expect(calls.find((call) => call.url.endsWith('/confirm'))?.body).toEqual({
      key: presigned.key,
      alt: '',
    });
    expect(FakeXhr.instances[0]!.headers).toEqual(presigned.headers);
  });

  it('fails a file whose SKU matches no product and one whose processing job fails', async () => {
    installFakeXhr();
    stubFetch((call) => {
      if (call.url.includes('q=NOPE')) return okEnvelope([{ ...productRow, sku: 'NOPE-X' }]);
      if (call.url.startsWith('/api/v1/admin/products?')) return okEnvelope([productRow]);
      if (call.url.endsWith('/presign')) return okEnvelope(presigned);
      if (call.url.endsWith('/confirm')) return okEnvelope({ jobId: 'job-1' });
      return okEnvelope({ ...job('failed'), error: 'Corrupt image' });
    });
    const user = userEvent.setup();
    render(<BulkImageUpload pollIntervalMs={1} />);

    await user.upload(screen.getByTestId('bulk-image-input'), [
      png('NOPE-1.png'),
      png('ROSE-1.png'),
    ]);

    const states = screen.getAllByTestId('bulk-state');
    await waitFor(() => expect(states[0]).toHaveTextContent('Failed'));
    expect(screen.getAllByTestId('bulk-error')[0]).toHaveTextContent('No product has the SKU NOPE');
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0]!.respond(200);
    await waitFor(() => expect(states[1]).toHaveTextContent('Failed'));
    expect(screen.getAllByTestId('bulk-error')[1]).toHaveTextContent('Corrupt image');
  });
});
