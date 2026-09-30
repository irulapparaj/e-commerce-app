// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';
import { IDS, image, product } from '@/test-utils/catalogue';
import { FakeXhr, flushAsync, installFakeXhr } from '@/test-utils/xhr';

import { ToastProvider } from '../Toast';

import { ImageGrid, moveImage } from './ImageGrid';
import { ImageUploader } from './ImageUploader';
import { INCOMPLETE_MESSAGE, PublishToggle } from './PublishToggle';

const presigned = {
  url: 'https://bucket.test/products/p1/abc.png',
  key: 'products/p1/abc.png',
  headers: { 'content-type': 'image/png', 'content-length': '4' },
  expiresAt: '2026-09-26T00:05:00.000Z',
};

const png = (name = 'front.png', size = 4) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

const job = (state: string, error: string | null = null) => ({
  id: 'job-1',
  name: 'media-process',
  state,
  error,
  output: null,
});

const renderUploader = (currentCount = 0) => {
  const onUploaded = vi.fn();
  render(
    <ImageUploader
      presignPath={`/admin/products/${IDS.product}/images/presign`}
      confirmPath={`/admin/products/${IDS.product}/images/confirm`}
      currentCount={currentCount}
      onUploaded={onUploaded}
      pollIntervalMs={1}
    />,
  );
  return onUploaded;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImageUploader', () => {
  it('rejects svg and oversized files client-side with a message and no request', async () => {
    installFakeXhr();
    const calls = stubFetch(() => okEnvelope(presigned));
    // The input's `accept` filter is what user-event applies by default; the svg must reach the component.
    const user = userEvent.setup({ applyAccept: false });
    renderUploader();

    await user.upload(screen.getByTestId('image-input'), [
      new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
      png('huge.png', 10 * 1024 * 1024 + 1),
    ]);

    const rows = screen.getAllByTestId('upload-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Only JPEG, PNG, WebP or AVIF images are allowed');
    expect(rows[1]).toHaveTextContent('Images must be 10 MB or smaller');
    expect(calls).toHaveLength(0);
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('shows progress, retries once after a network failure, polls the job and reports completion', async () => {
    installFakeXhr();
    let polls = 0;
    const calls = stubFetch((call) => {
      if (call.url.endsWith('/presign')) return okEnvelope(presigned);
      if (call.url.endsWith('/confirm')) return okEnvelope({ jobId: 'job-1' });
      polls += 1;
      return okEnvelope(job(polls < 2 ? 'active' : 'completed'));
    });
    const user = userEvent.setup();
    const onUploaded = renderUploader();

    await user.upload(screen.getByTestId('image-input'), png());
    await flushAsync();
    const bar = screen.getByRole('progressbar', { name: 'Uploading front.png' });
    FakeXhr.instances[0]!.progress(1, 4);
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '25'));
    FakeXhr.instances[0]!.fail();
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    FakeXhr.instances[1]!.progress(4, 4);
    FakeXhr.instances[1]!.respond(200);

    await waitFor(() => expect(screen.getByTestId('upload-state')).toHaveTextContent('Ready'));
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => call.url.includes('/jobs/'))).toHaveLength(2);
    expect(calls.find((call) => call.url.endsWith('/confirm'))?.body).toEqual({
      key: presigned.key,
      alt: '',
    });
    expect(FakeXhr.instances[1]!.headers).toEqual(presigned.headers);
  });

  it('surfaces a failed processing job and enforces the image cap', async () => {
    installFakeXhr();
    stubFetch((call) =>
      call.url.endsWith('/presign')
        ? okEnvelope(presigned)
        : call.url.endsWith('/confirm')
          ? okEnvelope({ jobId: 'job-1' })
          : okEnvelope(job('failed', 'Corrupt image')),
    );
    const user = userEvent.setup();
    const onUploaded = renderUploader(11);

    await user.upload(screen.getByTestId('image-input'), [png('a.png'), png('b.png')]);
    expect(screen.getByTestId('uploader-notice')).toHaveTextContent(
      'Only 1 more image can be added (maximum 12)',
    );
    expect(screen.getAllByTestId('upload-row')).toHaveLength(1);
    await flushAsync();
    FakeXhr.instances[0]!.respond(200);

    await waitFor(() => expect(screen.getByTestId('upload-state')).toHaveTextContent('Failed'));
    expect(screen.getByTestId('upload-row')).toHaveTextContent('Corrupt image');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('accepts dropped files and reports a full product', async () => {
    installFakeXhr();
    stubFetch(() => okEnvelope(presigned));
    renderUploader(12);
    const zone = screen.getByTestId('image-uploader').firstElementChild as HTMLElement;

    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute('data-active', 'true');
    fireEvent.drop(zone, { dataTransfer: { files: [png()] } });

    expect(screen.getByTestId('uploader-notice')).toHaveTextContent(
      'already has the maximum of 12 images',
    );
    expect(zone).not.toHaveAttribute('data-active');
  });
});

describe('ImageGrid', () => {
  const renderGrid = () => {
    const onChanged = vi.fn();
    render(
      <ToastProvider>
        <ImageGrid productId={IDS.product} images={product.images} onChanged={onChanged} />
      </ToastProvider>,
    );
    return onChanged;
  };

  it('moves items by id without mutating the input', () => {
    const [a, b] = product.images;
    expect(moveImage(product.images, b!.id, a!.id).map((entry) => entry.id)).toEqual([
      b!.id,
      a!.id,
    ]);
    expect(moveImage(product.images, a!.id, a!.id)).toBe(product.images);
    expect(moveImage(product.images, 'nope', a!.id)).toBe(product.images);
  });

  it('saves alt text on blur, reorders via buttons and drag, and deletes with confirmation', async () => {
    const user = userEvent.setup();
    const reordered = [product.images[1], product.images[0]];
    const calls = stubFetch((call) =>
      call.url.endsWith('/order')
        ? okEnvelope(reordered)
        : call.method === 'DELETE'
          ? okEnvelope({ deleted: true })
          : okEnvelope({ ...image, alt: 'Front view' }),
    );
    const onChanged = renderGrid();
    const [first, second] = screen.getAllByTestId('image-card');

    const alt = within(first!).getByLabelText('Alt text for image 1');
    await user.clear(alt);
    await user.type(alt, 'Front view');
    await user.tab();
    expect(await screen.findByTestId('toast')).toHaveTextContent('Alt text saved');
    expect(calls[0]).toEqual({
      url: `/api/v1/admin/products/${IDS.product}/images/${IDS.image1}`,
      method: 'PATCH',
      body: { alt: 'Front view' },
    });
    expect(onChanged).toHaveBeenLastCalledWith([
      { ...image, alt: 'Front view' },
      product.images[1],
    ]);

    expect(within(first!).getByRole('button', { name: 'Move image 1 left' })).toBeDisabled();
    await user.click(within(first!).getByRole('button', { name: 'Move image 1 right' }));
    await waitFor(() => expect(onChanged).toHaveBeenLastCalledWith(reordered));
    expect(calls[1]?.body).toEqual({ orderedIds: [IDS.image2, IDS.image1] });

    fireEvent.dragStart(second!);
    fireEvent.dragOver(first!);
    expect(first).toHaveAttribute('data-drop-target', 'true');
    fireEvent.drop(first!);
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]?.body).toEqual({ orderedIds: [IDS.image2, IDS.image1] });

    await user.click(within(second!).getByRole('button', { name: 'Delete image 2' }));
    await user.click(screen.getByTestId('confirm-accept'));
    await waitFor(() => expect(onChanged).toHaveBeenLastCalledWith([product.images[0]]));
    expect(calls[3]?.method).toBe('DELETE');
  });

  it('reports API failures as critical toasts', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(404, 'NOT_FOUND', 'Image not found'));
    renderGrid();

    await user.click(screen.getByRole('button', { name: 'Move image 1 right' }));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Image not found');
  });
});

describe('PublishToggle', () => {
  const renderToggle = (role: 'ADMIN' | 'STAFF', isActive = false) => {
    const onChanged = vi.fn();
    render(
      <ToastProvider>
        <PublishToggle
          productId={IDS.product}
          isActive={isActive}
          role={role}
          onChanged={onChanged}
        />
      </ToastProvider>,
    );
    return onChanged;
  };

  it('shows the 422 PRODUCT_INCOMPLETE explanation inline and toggles on success', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(422, 'PRODUCT_INCOMPLETE', 'Product needs a variant and an image')
        : okEnvelope({ ...product, isActive: true }),
    );
    const onChanged = renderToggle('ADMIN');

    expect(screen.getByTestId('publish-badge')).toHaveTextContent('Draft');
    await user.click(screen.getByTestId('publish-toggle'));
    expect(await screen.findByTestId('publish-error')).toHaveTextContent(INCOMPLETE_MESSAGE);

    await user.click(screen.getByTestId('publish-toggle'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...product, isActive: true }));
    expect(screen.queryByTestId('publish-error')).toBeNull();
    expect(screen.getByTestId('toast')).toHaveTextContent('Product published');
    expect(calls[1]).toEqual({
      url: `/api/v1/admin/products/${IDS.product}/publish`,
      method: 'PATCH',
      body: { isActive: true },
    });
  });

  it('is read-only for STAFF and toasts cancelled step-ups and other failures', async () => {
    const user = userEvent.setup();
    renderToggle('STAFF', true);
    expect(screen.getByTestId('publish-badge')).toHaveTextContent('Published');
    expect(screen.queryByTestId('publish-toggle')).toBeNull();
    expect(screen.getByText(/Publishing: Admin only/)).toBeInTheDocument();

    stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
        : errorEnvelope(503, 'SERVICE_UNAVAILABLE', 'Try later'),
    );
    renderToggle('ADMIN', true);
    await user.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Confirmation was cancelled');
    await user.click(screen.getByRole('button', { name: 'Unpublish' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('toast').at(-1)).toHaveTextContent('Try later'),
    );
  });
});
