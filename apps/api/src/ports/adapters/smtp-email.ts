import type { ApiEnv } from '@pe/shared';
import { createTransport, type Transporter } from 'nodemailer';

import type { EmailMessage, EmailPort } from '../email';

export class SmtpEmailAdapter implements EmailPort {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(transport: Transporter, from: string) {
    this.transport = transport;
    this.from = from;
  }

  static fromEnv(env: Pick<ApiEnv, 'SMTP_URL' | 'EMAIL_FROM'>): SmtpEmailAdapter {
    return new SmtpEmailAdapter(createTransport(env.SMTP_URL), env.EMAIL_FROM);
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const info = await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers === undefined ? undefined : { ...message.headers },
    });
    return { messageId: info.messageId };
  }
}
