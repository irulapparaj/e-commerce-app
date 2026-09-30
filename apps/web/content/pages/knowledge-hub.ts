import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Knowledge Hub',
    description: 'Guides, tips, and articles about puja rituals, ingredients, and devotional practices from Invita Company.',
    noindex: false,
  },
  sections: [
    {
      body: `Welcome to the **Invita Knowledge Hub** — a growing library of guides, rituals, and behind-the-scenes stories about the products we source and the traditions they serve.`,
    },
    {
      heading: 'Coming soon',
      body: `We are putting together our first set of articles. Topics we plan to cover:

- How to choose the right agarbatti for your puja room
- The difference between camphor varieties and how to use them safely
- Setting up a daily puja — a simple, practical guide
- Understanding the significance of traditional diyas

Check back soon, or [subscribe to our newsletter](#newsletter) to be the first to know when new articles go live.`,
    },
    {
      heading: 'Have a question?',
      body: `If there is a specific topic you would like us to cover, we would love to hear from you. [Contact us](/pages/contact) and we will do our best to write about it.`,
    },
  ],
};
