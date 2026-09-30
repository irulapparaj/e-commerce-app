// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import { categoryTree, childCategory, IDS } from '@/test-utils/catalogue';

import type { AdminRole } from '../Nav.config';
import { ToastProvider } from '../Toast';

import {
  applyOrder,
  droppedOrder,
  movedOrder,
  removeNode,
  siblingsOf,
  upsertNode,
} from './category-tree';
import { CategoryTree } from './CategoryTree';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/categories' };
});

const renderTree = (role: AdminRole) =>
  render(
    <ToastProvider>
      <CategoryTree tree={categoryTree} role={role} />
    </ToastProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('category-tree helpers', () => {
  it('moves and drops within a sibling group without mutating the input', () => {
    const ids = ['a', 'b', 'c'];

    expect(movedOrder(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedOrder(ids, 'a', -1)).toBeNull();
    expect(movedOrder(ids, 'zz', 1)).toBeNull();
    expect(droppedOrder(ids, 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(droppedOrder(ids, 'a', 'a')).toBeNull();
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(siblingsOf(categoryTree, childCategory).map((n) => n.id)).toEqual([
      IDS.premium,
      IDS.flora,
    ]);
    expect(siblingsOf(categoryTree, categoryTree[1]!).map((n) => n.id)).toEqual([
      IDS.agarbatti,
      IDS.dhoop,
    ]);
  });

  it('applies orders, upserts and removes immutably', () => {
    const reordered = applyOrder(categoryTree, IDS.agarbatti, [IDS.flora, IDS.premium]);
    expect(reordered[0]!.children.map((n) => [n.id, n.sortOrder])).toEqual([
      [IDS.flora, 1],
      [IDS.premium, 2],
    ]);
    expect(categoryTree[0]!.children[0]!.id).toBe(IDS.premium);
    const added = upsertNode(categoryTree, {
      ...childCategory,
      id: 'new',
      parentId: IDS.dhoop,
      name: 'Cones',
    });
    expect(added[1]!.children.map((n) => n.name)).toEqual(['Cones']);
    const renamed = upsertNode(categoryTree, { ...categoryTree[1]!, name: 'Dhoop & Cones' });
    expect(renamed[1]!.name).toBe('Dhoop & Cones');
    expect(removeNode(categoryTree, IDS.flora)[0]!.children).toHaveLength(1);
    expect(removeNode(categoryTree, IDS.dhoop)).toHaveLength(1);
  });
});

describe('CategoryTree', () => {
  it('is read-only for STAFF', () => {
    renderTree('STAFF');

    expect(screen.getByTestId('category-tree')).toBeInTheDocument();
    expect(screen.queryByTestId('category-add-root')).toBeNull();
    expect(screen.queryByTestId('category-delete-dhoop')).toBeNull();
    expect(screen.getByText('Agarbatti')).toBeInTheDocument();
  });

  it('reorders siblings with the arrow buttons and refreshes', async () => {
    const calls = stubFetch(() => okEnvelope([]));
    const user = userEvent.setup();
    renderTree('ADMIN');

    await user.click(screen.getByRole('button', { name: 'Move Premium down' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/admin/categories/reorder',
      body: { orderedIds: [IDS.flora, IDS.premium] },
    });
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Move Premium up' })).toBeEnabled();
  });

  it('surfaces the delete guard message verbatim', async () => {
    stubFetch(() =>
      errorEnvelope(409, 'CONFLICT', 'Move or delete its products before deleting this category'),
    );
    const user = userEvent.setup();
    renderTree('ADMIN');

    await user.click(screen.getByTestId('category-delete-agarbatti'));
    await user.click(
      within(screen.getByTestId('category-delete-confirm')).getByRole('button', { name: 'Delete' }),
    );

    expect(
      await screen.findByText('Move or delete its products before deleting this category'),
    ).toBeInTheDocument();
    expect(screen.getByText('Agarbatti')).toBeInTheDocument();
  });

  it('creates a subcategory through the dialog with the parent preselected', async () => {
    const calls = stubFetch(() =>
      okEnvelope({
        ...childCategory,
        id: 'new-id',
        slug: 'agarbatti-cones',
        name: 'Cones',
        productCount: 0,
      }),
    );
    const user = userEvent.setup();
    renderTree('ADMIN');

    await user.click(screen.getByTestId('category-add-child-agarbatti'));
    await user.type(screen.getByTestId('category-name'), 'Cones');
    await user.click(screen.getByTestId('category-submit'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/admin/categories',
      body: { name: 'Cones', parentId: IDS.agarbatti, metaTitle: null, metaDescription: null },
    });
    expect(await screen.findByText('Cones')).toBeInTheDocument();
  });
});
