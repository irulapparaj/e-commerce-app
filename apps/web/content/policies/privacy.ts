import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your personal data at Invita Company.',
    lastUpdated: '2025-09-01',
  },
  sections: [
    {
      heading: 'Who we are',
      body: `This policy applies to {{legalName}} ("we", "our", "us"), a company registered in India under GSTIN {{gstin}}, operating the website Invita Company.`,
    },
    {
      heading: 'Data we collect and why',
      body: `We collect the following personal data and use it as described:

| Data | Purpose | Retention |
|---|---|---|
| Email address | Authentication (OTP login), order confirmations, transactional emails | Until account deletion + 30 days |
| Name and phone | Order fulfilment, shipping labels | Until account deletion + 30 days |
| Delivery addresses | Shipping orders | Until deleted from your account or account deletion |
| Order history | Fulfilment, tax compliance | 8 years (GST requirement) |
| IP address, user agent | Security logging, fraud prevention | 90 days |
| Session tokens | Keeping you signed in | Until sign-out or token expiry |

We do not share your data with third parties except as necessary for order fulfilment (shipping partners such as Shiprocket) and payment processing (Razorpay). Both are bound by their own privacy policies and applicable law.`,
    },
    {
      heading: 'Cookies and analytics',
      body: `We use a single session cookie (\`__Host-session\`) for authentication. We do not currently use third-party analytics cookies or tracking pixels. Any change to this will be communicated by updating this policy and, where required by law, obtaining your consent.`,
    },
    {
      heading: 'Your rights under DPDP',
      body: `Under the Digital Personal Data Protection Act, 2023, you have the right to:

- **Access** — request a copy of the data we hold about you. Use the **Download your data** option in your account security settings.
- **Correction** — update your name and phone number from your account profile.
- **Erasure** — request deletion of your account and personal data. Use the **Delete account** option in your account security settings. Active orders will block immediate deletion.
- **Grievance redressal** — raise a concern with our Grievance Officer (details below).

To exercise your rights, use the tools in your account. If you do not have an account or require assistance, email {{supportEmail}}.`,
    },
    {
      heading: 'Grievance Officer',
      body: `Our designated Grievance Officer for data protection matters:

**{{grievanceOfficer.name}}**
Email: {{grievanceOfficer.email}}
Phone: {{grievanceOfficer.phone}}

We will acknowledge your complaint within 48 hours and aim to resolve it within 30 days.`,
    },
    {
      heading: 'Changes to this policy',
      body: `We will update this policy when our data practices change. Material changes will be communicated by email or a notice on the website. Continued use of our services after notice constitutes acceptance.`,
    },
  ],
};
