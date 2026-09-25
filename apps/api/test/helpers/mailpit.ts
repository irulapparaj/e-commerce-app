export interface MailpitAddress {
  readonly Name: string;
  readonly Address: string;
}

export interface MailpitMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly MailpitAddress[];
  readonly Snippet: string;
}

const RETRIES = 20;
const RETRY_DELAY_MS = 150;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const mailpitUrl = (): string => {
  const url = process.env.TEST_MAILPIT_URL;
  if (!url) throw new Error('TEST_MAILPIT_URL is not set (containers.ts globalSetup)');
  return url;
};

export const searchMailpit = async (query: string): Promise<readonly MailpitMessage[]> => {
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const res = await fetch(`${mailpitUrl()}/api/v1/search?query=${encodeURIComponent(query)}`);
    const body = (await res.json()) as { messages: readonly MailpitMessage[] };
    if (body.messages.length > 0) return body.messages;
    await sleep(RETRY_DELAY_MS);
  }
  return [];
};

export const readMailpitText = async (id: string): Promise<string> => {
  const res = await fetch(`${mailpitUrl()}/api/v1/message/${id}`);
  const body = (await res.json()) as { Text: string };
  return body.Text;
};
