import { vi } from 'vitest';

type ProgressHandler = ((event: ProgressEvent) => void) | null;

/** Minimal stand-in for the browser XHR: records the request and lets tests drive the outcome. */
export class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  upload: { onprogress: ProgressHandler } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers = { ...this.headers, [name]: value };
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.instances.push(this);
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number) {
    this.status = status;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

export const installFakeXhr = (): void => {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
};

/** Waits for the microtask queue and one macrotask so a pending XHR has been opened. */
export const flushAsync = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
