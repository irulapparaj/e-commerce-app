import type { Metadata } from 'next';
import Link from 'next/link';

import { BulkImageUpload } from '@/components/admin/import/BulkImageUpload';
import { PageHeader } from '@/components/admin/PageHeader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bulk image upload' };

export default function BulkImagesPage() {
  return (
    <>
      <PageHeader
        title="Bulk image upload"
        description="Drop many product photos at once; each file is matched to a product by the SKU in its name and processed like an upload from the product page."
        actions={
          <Link href="/admin/import" className="admin-btn">
            Back to imports
          </Link>
        }
      />
      <BulkImageUpload />
    </>
  );
}
