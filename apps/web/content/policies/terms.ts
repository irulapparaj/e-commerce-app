import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Terms of Service',
    description: 'Terms and conditions for using the Invita Company website and placing orders.',
    lastUpdated: '2025-09-01',
  },
  sections: [
    {
      heading: 'Acceptance',
      body: `By using this website or placing an order, you agree to these Terms of Service. These terms are governed by the laws of India. The courts at {{pickupCity}}, Tamil Nadu shall have exclusive jurisdiction over any dispute arising from these terms.`,
    },
    {
      heading: 'Availability',
      body: `We currently sell and ship to customers within India only. We reserve the right to decline orders from outside India or from addresses we cannot verify.`,
    },
    {
      heading: 'Prices and GST',
      body: `All prices displayed on the website are **inclusive of GST**. The applicable GST components (CGST + SGST for intra-state, IGST for inter-state) are shown at checkout. Prices are subject to change without notice, but changes will not affect orders already confirmed.`,
    },
    {
      heading: 'Order acceptance',
      body: `Placing an order constitutes an offer to purchase. An order is accepted only when you receive an order confirmation email from us. We reserve the right to decline or cancel orders due to pricing errors, stock availability, or suspected fraud, with a full refund where payment was taken.`,
    },
    {
      heading: 'Cancellation window',
      body: `You may cancel an order before it is dispatched by contacting us at {{supportEmail}}. Once dispatched, the order cannot be cancelled; the return policy applies instead.`,
    },
    {
      heading: 'Intellectual property',
      body: `All content on this website — including product descriptions, images, and brand marks — is the property of {{legalName}} or its licensors and may not be reproduced without written permission.`,
    },
    {
      heading: 'Limitation of liability',
      body: `To the maximum extent permitted by law, our liability is limited to the value of the order in dispute. We are not liable for indirect, incidental, or consequential losses.`,
    },
    {
      heading: 'Governing law',
      body: `These Terms are governed by the laws of India. Any dispute shall be subject to the exclusive jurisdiction of the courts at {{pickupCity}}, Tamil Nadu.`,
    },
  ],
};
