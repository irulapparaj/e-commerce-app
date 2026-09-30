import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Pricing Policy',
    description: 'How pricing works at Invita Company — inclusive of taxes, no hidden charges.',
    lastUpdated: '2025-09-01',
  },
  sections: [
    {
      heading: 'GST-inclusive pricing',
      body: `All prices shown on the website are **inclusive of Goods and Services Tax (GST)**. The GST breakdown is shown at checkout: intra-state orders show CGST + SGST; inter-state orders show IGST. GSTIN: {{gstin}}.`,
    },
    {
      heading: 'No hidden charges',
      body: `The price you see on the product page is the price you pay, subject only to applicable shipping charges. There are no processing fees, convenience fees, or surcharges at checkout.`,
    },
    {
      heading: 'Shipping charges',
      body: `Shipping charges depend on your delivery location and order value. The exact amount is shown before you confirm your order. Orders meeting the free-shipping threshold (displayed at checkout) qualify for free delivery.`,
    },
    {
      heading: 'Currency',
      body: `All prices are in Indian Rupees (₹). We do not accept payment in foreign currencies.`,
    },
    {
      heading: 'Price changes',
      body: `Prices may change without prior notice. Any change takes effect for new orders only and does not affect orders already confirmed.`,
    },
  ],
};
