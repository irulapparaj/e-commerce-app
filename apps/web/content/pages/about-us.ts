import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'About Us',
    description: 'Invita Company — everyday devotion, thoughtfully made. Based in Chennai.',
  },
  sections: [
    {
      body: `**Invita Company** was born from a simple observation: finding genuine, everyday puja items — agarbatti that truly burns for the right duration, camphor that lights cleanly, diyas made to last — had become harder than it should be.`,
    },
    {
      heading: 'Our story',
      body: `We are a small team based in **{{pickupCity}}**, working directly with manufacturers across South India to bring you products you can rely on. Every item in our catalogue has been selected for quality, authenticity, and everyday usefulness.

We started with a short list of essentials and we grow it carefully — only when we find a product that genuinely meets our standards.`,
    },
    {
      heading: 'What we stand for',
      body: `- **Authenticity** — products sourced directly from verified manufacturers
- **Transparency** — GST-inclusive prices, no hidden charges
- **Reliability** — honest descriptions, consistent quality
- **Care** — every order packed with attention, dispatched promptly`,
    },
    {
      heading: 'Contact',
      body: `We are always happy to hear from you — questions, feedback, or just a note. Reach us at {{supportEmail}}.`,
    },
  ],
};
