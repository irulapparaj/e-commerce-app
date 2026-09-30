import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Refund & Return Policy',
    description: 'Our refund and return policy for all orders placed at Invita Company.',
    lastUpdated: '2025-09-01',
  },
  sections: [
    {
      heading: 'Return window',
      body: `We accept return requests within **{{returnWindowDays}} days** of the delivery date. Requests raised after this window will not be accepted.`,
    },
    {
      heading: 'Eligible items',
      body: `Returns are accepted only for products that arrive **damaged, defective, or materially different** from what was ordered. The following are **not eligible** for return:

- Consumables that have been opened, unwrapped, or used
- Change-of-mind returns or unwanted gifts
- Products with missing, tampered, or removed seals
- Items damaged due to misuse or improper storage after delivery

To initiate a return, contact us at {{supportEmail}} within the return window, with clear photographs showing the defect or damage.`,
    },
    {
      heading: 'Return pickup',
      body: `For approved defect or damage returns, **we arrange and pay for the return pickup** at no cost to you. A Shiprocket courier will collect the item from your delivery address.

For quality-check (QC) failures on return, a processing fee of ₹40–80 (itemised in the rejection notice) will be deducted from the refund amount.`,
    },
    {
      heading: 'Refund timeline',
      body: `Once we receive and inspect the returned item:

- Approved refunds are processed to the **original payment method within 5–7 business days**.
- UPI and card refunds typically reflect within 3–5 business days after processing.
- Bank transfers may take up to 7 business days.

We will email you at each stage of the process.`,
    },
    {
      heading: 'Cancellations',
      body: `Orders can be cancelled before dispatch. Once dispatched, cancellation is not possible. To cancel, contact us immediately at {{supportEmail}} with your order number.`,
    },
    {
      heading: 'Contact us',
      body: `For any questions about returns, write to {{supportEmail}} or use the Contact page. Include your order number and photos of any defect.`,
    },
  ],
};
