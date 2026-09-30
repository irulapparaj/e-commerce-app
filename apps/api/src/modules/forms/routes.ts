import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { isHoneypotFilled } from './honeypot';
import { contactFormSchema, sellerInquirySchema } from './schemas';
import { generateTicketId } from './ticket';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CONTACT_RATE_LIMIT = { limit: 5, windowSeconds: 3600 };
const SELLER_RATE_LIMIT = { limit: 3, windowSeconds: 3600 };

const buildContactHtml = (ticketId: string, name: string, email: string, subject: string, message: string, orderNumber?: string): string => `
<p><strong>Ticket:</strong> ${escapeHtml(ticketId)}</p>
<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
${orderNumber ? `<p><strong>Order:</strong> ${escapeHtml(orderNumber)}</p>` : ''}
<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
<hr/>
<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
`;

const buildSellerHtml = (ticketId: string, data: {
  businessName: string; contactName: string; email: string;
  phone: string; gstin: string | undefined; productCategories: string; message: string;
}): string => `
<p><strong>Ticket:</strong> ${escapeHtml(ticketId)}</p>
<p><strong>Business:</strong> ${escapeHtml(data.businessName)}</p>
<p><strong>Contact:</strong> ${escapeHtml(data.contactName)} &lt;${escapeHtml(data.email)}&gt;</p>
<p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
${data.gstin ? `<p><strong>GSTIN:</strong> ${escapeHtml(data.gstin)}</p>` : ''}
<p><strong>Categories:</strong> ${escapeHtml(data.productCategories)}</p>
<hr/>
<p>${escapeHtml(data.message).replace(/\n/g, '<br/>')}</p>
`;

/** P16: Public forms — contact, seller inquiry. Honeypot + per-IP rate limiting. */
export const formsRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { ports, env, rateLimiter } = app;
  const inboxEmail = env.CONTACT_INBOX_EMAIL ?? env.EMAIL_FROM.replace(/^.*<(.+)>$/, '$1').trim();

  app.post(
    '/forms/contact',
    { schema: { body: contactFormSchema } },
    async (request, reply) => {
      const { name, email, subject, message, orderNumber, website } = request.body;

      if (isHoneypotFilled(website)) {
        await reply.status(200).send(ok({ ticketId: generateTicketId('C') }));
        return;
      }

      await rateLimiter.consume([
        { key: `forms:contact:ip:${request.ip}`, ...CONTACT_RATE_LIMIT },
      ]);

      const ticketId = generateTicketId('C');
      const html = buildContactHtml(ticketId, name, email, subject, message, orderNumber);

      await Promise.all([
        ports.email.send({
          to: inboxEmail,
          subject: `[Contact] ${subject} — ${ticketId}`,
          html,
          text: `Ticket: ${ticketId}\nFrom: ${name} <${email}>\n${orderNumber ? `Order: ${orderNumber}\n` : ''}Subject: ${subject}\n\n${message}`,
          headers: { 'Reply-To': `${name} <${email}>` },
        }),
        ports.email.send({
          to: email,
          subject: `We received your message — ${ticketId}`,
          html: `<p>Hi ${name},</p><p>Thank you for reaching out. We have received your message and will reply within 24 business hours.</p><p>Your reference number is <strong>${ticketId}</strong>.</p>`,
          text: `Hi ${name},\n\nThank you for reaching out. We have received your message and will reply within 24 business hours.\n\nYour reference number is ${ticketId}.`,
        }),
      ]);

      return ok({ ticketId });
    },
  );

  app.post(
    '/forms/seller-inquiry',
    { schema: { body: sellerInquirySchema } },
    async (request, reply) => {
      const { businessName, contactName, email, phone, gstin, productCategories, message, website } = request.body;

      if (isHoneypotFilled(website)) {
        await reply.status(200).send(ok({ ticketId: generateTicketId('S') }));
        return;
      }

      await rateLimiter.consume([
        { key: `forms:seller:ip:${request.ip}`, ...SELLER_RATE_LIMIT },
      ]);

      const ticketId = generateTicketId('S');
      const html = buildSellerHtml(ticketId, { businessName, contactName, email, phone, gstin, productCategories, message });

      await Promise.all([
        ports.email.send({
          to: inboxEmail,
          subject: `[Seller Inquiry] ${businessName} — ${ticketId}`,
          html,
          text: `Ticket: ${ticketId}\nBusiness: ${businessName}\nContact: ${contactName} <${email}>\nPhone: ${phone}\n${gstin ? `GSTIN: ${gstin}\n` : ''}Categories: ${productCategories}\n\n${message}`,
          headers: { 'Reply-To': `${contactName} <${email}>` },
        }),
        ports.email.send({
          to: email,
          subject: `Seller inquiry received — ${ticketId}`,
          html: `<p>Hi ${contactName},</p><p>Thank you for your interest in selling with us. We have received your inquiry and will be in touch within 5 business days.</p><p>Your reference number is <strong>${ticketId}</strong>.</p>`,
          text: `Hi ${contactName},\n\nThank you for your interest in selling with us. We have received your inquiry and will be in touch within 5 business days.\n\nYour reference number is ${ticketId}.`,
        }),
      ]);

      return ok({ ticketId });
    },
  );
};
