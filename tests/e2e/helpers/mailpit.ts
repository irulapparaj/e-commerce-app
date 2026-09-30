export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitMessage {
  readonly ID: string;
  readonly Created: string;
  readonly Subject: string;
}

export const searchMessages = async (to: string): Promise<MailpitMessage[]> => {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  );
  const body = (await res.json()) as { messages: MailpitMessage[] };
  return body.messages ?? [];
};

export const waitForMessage = async (
  to: string,
  subjectIncludes?: string,
  timeoutMs = 10_000,
): Promise<MailpitMessage> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await searchMessages(to);
    const sorted = [...messages].sort((a, b) => b.Created.localeCompare(a.Created));
    const match = subjectIncludes
      ? sorted.find((m) => m.Subject.includes(subjectIncludes))
      : sorted[0];
    if (match !== undefined) return match;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email to ${to}${subjectIncludes ? ` with subject "${subjectIncludes}"` : ''} after ${timeoutMs}ms`);
};

export const extractOtp = async (messageId: string): Promise<string> => {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const { Text } = (await res.json()) as { Text: string };
  const match = /\b(\d{6})\b/.exec(Text);
  if (match?.[1] === undefined) throw new Error(`no 6-digit OTP in message ${messageId}`);
  return match[1];
};

export const extractLink = async (messageId: string, pattern: RegExp): Promise<string> => {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const { HTML, Text } = (await res.json()) as { HTML: string; Text: string };
  const source = HTML || Text;
  const match = pattern.exec(source);
  if (match?.[0] === undefined) throw new Error(`link matching ${pattern} not found in message ${messageId}`);
  return match[0];
};

export const readOtp = async (to: string, timeoutMs = 10_000): Promise<string> => {
  const msg = await waitForMessage(to, undefined, timeoutMs);
  return extractOtp(msg.ID);
};

export const deleteAllMessages = async (): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
};
