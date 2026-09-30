'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Price } from '@/components/ui/Price';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useToast } from '@/components/ui/Toast';

import { GallerySection } from './GallerySection';

export function GalleryOverlays() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { notify } = useToast();

  return (
    <GallerySection id="overlays" title="Drawer · Dialog · Toast">
      <Button variant="secondary" onClick={() => setDrawer(true)} data-testid="gallery-open-drawer">
        Open drawer
      </Button>
      <Button variant="secondary" onClick={() => setDialog(true)} data-testid="gallery-open-dialog">
        Open dialog
      </Button>
      <Button variant="ghost" onClick={() => notify('Added to your cart', { tone: 'success' })}>
        Success toast
      </Button>
      <Button variant="ghost" onClick={() => notify('Only 2 left in stock')}>
        Info toast
      </Button>
      <Button variant="ghost" onClick={() => notify('Payment failed', { tone: 'critical' })}>
        Critical toast
      </Button>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="My cart · 1"
        footer={
          <Button fullWidth onClick={() => setDrawer(false)}>
            Checkout
          </Button>
        }
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
          <div className="flex flex-col gap-2">
            <p className="font-medium">Royale Masala Agarbatti</p>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>
          <Price amount={19900} compareAt={24900} />
        </div>
      </Drawer>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Remove this item?"
        description="You can add it back from the product page."
        size="sm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Keep it
            </Button>
            <Button onClick={() => setDialog(false)}>Remove</Button>
          </>
        }
      >
        <p className="text-base text-muted">Royale Masala Agarbatti, 1 × ₹199.00</p>
      </Dialog>
    </GallerySection>
  );
}
