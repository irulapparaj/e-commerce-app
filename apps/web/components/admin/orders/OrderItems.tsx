import { formatPaise } from '@/lib/admin/format';
import type { OrderItemDto } from '@/lib/admin/order-types';

interface OrderItemsProps {
  readonly items: readonly OrderItemDto[];
  readonly subtotal: number;
  readonly total: number;
}

export function OrderItems({ items, subtotal, total }: OrderItemsProps) {
  return (
    <section aria-labelledby="order-items-heading">
      <h2 id="order-items-heading" className="admin-section-heading">
        Items
      </h2>
      <table className="admin-table" data-testid="order-items-table">
        <caption className="sr-only">Order items</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">SKU</th>
            <th scope="col" className="text-end">
              Unit Price
            </th>
            <th scope="col" className="text-end">
              Qty
            </th>
            <th scope="col" className="text-end">
              Line Total
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} data-testid="order-item-row">
              <td>
                <div className="font-medium">{item.productName}</div>
                <div className="admin-muted text-sm">{item.variantLabel}</div>
              </td>
              <td>
                <code className="admin-code">{item.sku}</code>
              </td>
              <td className="text-end admin-tabular">{formatPaise(item.unitPrice)}</td>
              <td className="text-end admin-tabular">{item.quantity}</td>
              <td className="text-end admin-tabular font-medium">
                {formatPaise(item.unitPrice * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="text-end admin-muted">
              Subtotal
            </td>
            <td className="text-end admin-tabular">{formatPaise(subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-end font-medium">
              Total
            </td>
            <td className="text-end admin-tabular font-bold" data-testid="order-items-total">
              {formatPaise(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
