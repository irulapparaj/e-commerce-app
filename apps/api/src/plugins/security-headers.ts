/**
 * API security headers (P17 task 2).
 *
 * Applies helmet with the API-specific configuration documented in DESIGN §11.3:
 *   - Cache-Control: no-store on all authenticated responses
 *   - Content-Security-Policy: API has no UI so script/style directives are maximally restrictive
 *   - HSTS (emitted always; effective only once TLS terminates at the edge in Phase 2)
 *   - Referrer-Policy, X-Content-Type-Options, X-Frame-Options, COOP, Permissions-Policy
 *
 * This plugin replaces the bare `helmet` registration in app.ts with a tuned config.
 * It must be registered before any route so all responses carry the headers.
 */
import helmet from '@fastify/helmet';

import { sharedPlugin } from '../lib/plugin';

const HSTS_MAX_AGE = 63_072_000;

export const securityHeadersPlugin = sharedPlugin(async (app) => {
  await app.register(helmet, {
    // CSP for the API: no UI, no scripts — everything is denied except self.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // HSTS: emitted unconditionally; the HSTS header is only honoured over HTTPS.
    // Phase 2 must submit the domain to the preload list after confirming all subdomains are HTTPS.
    strictTransportSecurity: {
      maxAge: HSTS_MAX_AGE,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Allow same-origin framing (required for admin panel iframe previews).
    frameguard: { action: 'sameorigin' },
    // Remove X-Powered-By.
    hidePoweredBy: true,
    noSniff: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    permittedCrossDomainPolicies: false,
    dnsPrefetchControl: { allow: false },
    ieNoOpen: true,
  });

  // Permissions-Policy: deny all browser capabilities (API responses should never trigger these).
  // Set manually because @fastify/helmet does not expose this as a typed option.
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  // Add Cache-Control: no-store to all authenticated responses.
  // Public / health routes can override this by setting their own Cache-Control header.
  app.addHook('onSend', async (request, reply) => {
    const isAuthenticated = request.user !== undefined;
    const isApiRoute = request.url.startsWith('/api/');
    if (isAuthenticated && isApiRoute) {
      void reply.header('Cache-Control', 'no-store');
    }
  });
});
