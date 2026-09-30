import type { ContentPage } from '@/lib/content/load';

export const content: ContentPage = {
  meta: {
    title: 'Grievance Redressal',
    description: 'How to raise a grievance or complaint with Invita Company under DPDP and Consumer Protection rules.',
  },
  sections: [
    {
      body: `In line with the requirements of the Digital Personal Data Protection Act, 2023 and the Consumer Protection Act, 2019, we have designated a Grievance Officer to address your concerns.`,
    },
    {
      heading: 'Grievance Officer',
      body: `**{{grievanceOfficer.name}}**
Email: {{grievanceOfficer.email}}
Phone: {{grievanceOfficer.phone}}

You may reach the Grievance Officer for:
- Data protection queries or complaints (erasure, access, correction)
- Order or product disputes not resolved through normal customer support
- Any concern about our compliance with applicable law`,
    },
    {
      heading: 'Service level',
      body: `We will:
- **Acknowledge** your grievance within **48 hours** of receipt.
- **Resolve** or provide a substantive update within **30 days** of receipt.

If you are unsatisfied with our response, you may escalate to the appropriate authority under applicable law.`,
    },
    {
      heading: 'How to raise a grievance',
      body: `Email the Grievance Officer at {{grievanceOfficer.email}} with:
1. Your full name and order number (if applicable)
2. A clear description of your concern
3. Any supporting documents or screenshots

For data protection requests (access, erasure, correction), you may also use the tools available in your account settings.`,
    },
  ],
};
