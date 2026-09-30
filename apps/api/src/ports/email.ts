export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface EmailPort {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}
