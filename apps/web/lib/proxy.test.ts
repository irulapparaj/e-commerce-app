import { describe, expect, it } from 'vitest';

import {
  buildUpstreamHeaders,
  buildUpstreamUrl,
  filterResponseHeaders,
  methodHasBody,
} from './proxy';

describe('buildUpstreamUrl', () => {
  it('joins the API base, /api prefix, path segments and query string', () => {
    expect(buildUpstreamUrl('http://api:4000/', ['v1', 'products'], '?page=2')).toBe(
      'http://api:4000/api/v1/products?page=2',
    );
  });

  it('re-encodes path segments so traversal and separators cannot leak through', () => {
    expect(buildUpstreamUrl('http://api:4000', ['v1', 'a%2Fb', 'c d'], '')).toBe(
      'http://api:4000/api/v1/a%2Fb/c%20d',
    );
  });
});

describe('buildUpstreamHeaders', () => {
  it('strips cookies, authorization, host and hop-by-hop headers and keeps the rest', () => {
    const incoming = new Headers({
      cookie: '__Host-access=secret',
      authorization: 'Bearer forged',
      host: 'shop.example',
      connection: 'keep-alive',
      'content-type': 'application/json',
      'x-request-id': 'abc',
      'content-length': '12',
    });

    const headers = buildUpstreamHeaders(incoming, { 'x-forwarded-for': '1.2.3.4' });

    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('host')).toBeNull();
    expect(headers.get('connection')).toBeNull();
    expect(headers.get('content-length')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-request-id')).toBe('abc');
    expect(headers.get('x-forwarded-for')).toBe('1.2.3.4');
  });
});

describe('filterResponseHeaders', () => {
  it('drops set-cookie and hop-by-hop headers from API responses', () => {
    const upstream = new Headers({
      'set-cookie': 'a=b',
      'transfer-encoding': 'chunked',
      'content-type': 'application/json',
      'x-request-id': 'abc',
    });

    const headers = filterResponseHeaders(upstream);

    expect(headers.get('set-cookie')).toBeNull();
    expect(headers.get('transfer-encoding')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-request-id')).toBe('abc');
  });
});

describe('methodHasBody', () => {
  it('is false for GET, HEAD and OPTIONS only', () => {
    expect(methodHasBody('get')).toBe(false);
    expect(methodHasBody('HEAD')).toBe(false);
    expect(methodHasBody('OPTIONS')).toBe(false);
    expect(methodHasBody('POST')).toBe(true);
    expect(methodHasBody('DELETE')).toBe(true);
  });
});
