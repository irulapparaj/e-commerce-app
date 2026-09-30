export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'What areas do you deliver to?',
    answer: 'We currently deliver across India. Shipping times vary by location — most orders within Chennai are delivered in 1–2 business days, and pan-India delivery takes 3–7 business days.',
  },
  {
    question: 'What is the return policy?',
    answer: 'We accept returns within 15 days of delivery for defective or damaged products. Items must be unused and in original packaging. Change-of-mind returns are not accepted. Please see our Refund & Return Policy for full details.',
  },
  {
    question: 'How do I track my order?',
    answer: 'Once your order is dispatched, you will receive an email with a tracking number and link. You can also track your order from the Orders section in your account.',
  },
  {
    question: 'Are the prices inclusive of taxes?',
    answer: 'Yes. All prices shown on the website are inclusive of GST. There are no hidden charges. Shipping charges (if applicable) are shown at checkout.',
  },
  {
    question: 'How do I contact customer support?',
    answer: 'You can reach us via the Contact page. We aim to respond within 24 business hours. For urgent issues, call us during business hours (Monday–Saturday, 9 AM–6 PM IST).',
  },
  {
    question: 'Can I cancel my order?',
    answer: 'Orders can be cancelled before they are dispatched. Once dispatched, cancellation is not possible. Please contact us immediately if you need to cancel.',
  },
  {
    question: 'Do you offer bulk orders?',
    answer: 'Yes, we welcome bulk and institutional orders. Please use the Become a Seller / Bulk Inquiry form or contact us directly for pricing and arrangements.',
  },
  {
    question: 'Are your products authentic?',
    answer: 'Yes. All our products are sourced directly from verified manufacturers and suppliers. We stand behind the quality and authenticity of every product we sell.',
  },
];

export interface FaqJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'FAQPage';
  readonly mainEntity: readonly {
    readonly '@type': 'Question';
    readonly name: string;
    readonly acceptedAnswer: { readonly '@type': 'Answer'; readonly text: string };
  }[];
}

export const buildFaqJsonLd = (items: readonly FaqItem[]): FaqJsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
});
