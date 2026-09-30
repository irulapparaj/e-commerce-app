import type { Metadata } from 'next';

import { CategoryTree } from '@/components/admin/catalogue/CategoryTree';
import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const [session, tree] = await Promise.all([
    getSession(),
    adminServerGet<readonly AdminCategoryNode[]>('/admin/categories'),
  ]);
  if (!tree.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load categories ({tree.code}).
      </p>
    );
  return <CategoryTree tree={tree.data} role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'} />;
}
