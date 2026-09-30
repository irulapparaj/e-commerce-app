import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Shipping Policy',
    description: 'Information about shipping timelines, costs, and tracking at Invita Company.',
    lastUpdated: '2025-09-01',
  },
  sections: [
    {
      heading: 'Where we ship',
      body: `We ship across India. All orders are dispatched from **{{pickupCity}}**. At this time, we do not ship internationally.`,
    },
    {
      heading: 'Delivery timelines',
      body: `| Destination | Estimated delivery |
|---|---|
| Chennai (metro) | 1–2 business days |
| Tamil Nadu (non-metro) | 2–4 business days |
| Other metro cities | 3–5 business days |
| Rest of India | 4–7 business days |

Timelines are estimates from the date of dispatch, not the order date. Delays may occur during festivals, natural events, or courier disruptions. We will notify you by email if there is a significant delay.`,
    },
    {
      heading: 'Shipping charges',
      body: `Shipping charges are shown at checkout and depend on your delivery pin code and order value. Orders above the free-shipping threshold qualify for free delivery — the current threshold is displayed at checkout and on the announcement bar.`,
    },
    {
      heading: 'Tracking',
      body: `You will receive a tracking number by email once your order is dispatched. You can also track your order from the **Orders** section in your account. Tracking updates may take up to 24 hours to appear after dispatch.`,
    },
    {
      heading: 'Address responsibility',
      body: `Please ensure your delivery address is complete and correct at the time of ordering. We are not responsible for delays or failed deliveries caused by incorrect or incomplete address information. Re-delivery charges may apply if the courier is unable to deliver due to an address error.`,
    },
    {
      heading: 'Contact',
      body: `For shipping queries, write to us at {{supportEmail}} with your order number.`,
    },
  ],
};
