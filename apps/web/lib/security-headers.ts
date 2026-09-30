export type Surface = 'storefront' | 'admin';

export interface CspOptions {
  readonly nonce: string;
  readonly surface: Surface;
  /** `NEXT_PUBLIC_MEDIA_HOST` (host[:port]) or a full origin; a bare host is allowed over http and https. */
  readonly mediaOrigin?: string;
  /**
   * Development skips `upgrade-insecure-requests` (it would upgrade http://localhost:9000 media
   * requests to https and break them), HSTS (ignored over http anyway) and needs `'unsafe-eval'`
   * for the Next.js dev bundler. Production never sets this.
   */
  readonly isDevelopment?: boolean;
}

export type HeaderOptions = Omit<CspOptions, 'nonce' | 'surface'>;

/** Only the storefront talks to Razorpay (DESIGN §11.3); the admin CSP carries none of these. */
const RAZORPAY = {
  script: ['https://checkout.razorpay.com'],
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
} as const;

const SELF = "'self'";
const NONE = "'none'";
const HSTS_MAX_AGE_SECONDS = 63_072_000;

const mediaSources = (mediaOrigin: string | undefined): readonly string[] => {
  if (mediaOrigin === undefined || mediaOrigin === '') return [];
  if (mediaOrigin.includes('://')) return [mediaOrigin];
  return [`http://${mediaOrigin}`, `https://${mediaOrigin}`];
};

const directive = (name: string, sources: readonly string[]): string =>
  [name, ...sources].join(' ');

export const buildCsp = ({
  nonce,
  surface,
  mediaOrigin,
  isDevelopment = false,
}: CspOptions): string => {
  const payments = surface === 'storefront';
  const directives = [
    directive('default-src', [SELF]),
    directive('script-src', [
      SELF,
      `'nonce-${nonce}'`,
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ...(payments ? RAZORPAY.script : []),
    ]),
    directive('style-src', [SELF, "'unsafe-inline'", 'https://fonts.googleapis.com']),
    directive('font-src', [SELF, 'https://fonts.gstatic.com']),
    directive('img-src', [SELF, 'data:', ...mediaSources(mediaOrigin)]),
    // The admin uploads straight to the bucket (presigned PUT), so it may connect to the media origin.
    directive('connect-src', [SELF, ...(payments ? RAZORPAY.connect : mediaSources(mediaOrigin))]),
    directive('frame-src', payments ? RAZORPAY.frame : [NONE]),
    directive('object-src', [NONE]),
    directive('base-uri', [SELF]),
    directive('frame-ancestors', [NONE]),
    directive('form-action', [SELF]),
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
};

/** The full response header set from DESIGN §11.3 "Browser and transport". */
export const securityHeaders = (
  surface: Surface,
  nonce: string,
  options: HeaderOptions = {},
): Readonly<Record<string, string>> => ({
  'Content-Security-Policy': buildCsp({ nonce, surface, ...options }),
  ...(options.isDevelopment === true
    ? {}
    : {
        'Strict-Transport-Security': `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`,
      }),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
});

export const surfaceForPath = (pathname: string): Surface =>
  pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'storefront';

/** Header name used to hand the per-request nonce to server components (`headers().get('x-nonce')`). */
export const NONCE_HEADER = 'x-nonce';
