import { z } from 'zod';

const KEY_BYTES = 32;

const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const base64Key = (label: string) =>
  z.string().refine((value) => Buffer.from(value, 'base64').length === KEY_BYTES, {
    message: `${label} must be ${KEY_BYTES} bytes encoded as base64`,
  });

const parseJson = (value: string, ctx: z.RefinementCtx): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
    return z.NEVER;
  }
};

export const jwtKeyPairSchema = z.strictObject({
  kid: z.string().min(1),
  privatePem: z.string().includes('PRIVATE KEY'),
  publicPem: z.string().includes('PUBLIC KEY'),
});

export const jwtPublicKeySchema = z.strictObject({
  kid: z.string().min(1),
  publicPem: z.string().includes('PUBLIC KEY'),
});

export type JwtKeyPair = z.infer<typeof jwtKeyPairSchema>;
export type JwtPublicKey = z.infer<typeof jwtPublicKeySchema>;

const jsonArray = <T extends z.ZodTypeAny>(item: T) =>
  z.string().transform(parseJson).pipe(z.array(item).min(1));

export const apiEnvSchema = z
  .strictObject({
    NODE_ENV: nodeEnvSchema,
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url().startsWith('postgres'),
    VALKEY_URL: z
      .url()
      .regex(/^(redis|rediss|valkey|valkeys):\/\//, 'must be a redis:// or valkey:// URL'),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('ap-south-1'),
    S3_BUCKET_MEDIA: z.string().min(1),
    S3_BUCKET_IMPORTS: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString,
    SMTP_URL: z.url().startsWith('smtp'),
    EMAIL_FROM: z.string().min(3),
    ENCRYPTION_KEY_B64: base64Key('ENCRYPTION_KEY_B64'),
    BLIND_INDEX_KEY_B64: base64Key('BLIND_INDEX_KEY_B64'),
    JWT_ACTIVE_KID: z.string().min(1),
    JWT_KEYS_JSON: jsonArray(jwtKeyPairSchema),
    JWT_ISSUER: z.string().min(1).default('puja-essentials'),
    API_INTERNAL_URL: z.url().optional(),
    WEB_ORIGIN: z.url(),
    REVALIDATE_SECRET: z.string().min(16),
    RAZORPAY_KEY_ID: z.string().min(1),
    RAZORPAY_KEY_SECRET: z.string().min(1),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
    EMAIL_ADAPTER: z.enum(['smtp', 'fake']).default('smtp'),
    STORAGE_ADAPTER: z.enum(['s3']).default('s3'),
    KEY_PROVIDER: z.enum(['env']).default('env'),
    SHIPPING_ADAPTER: z.enum(['fake', 'shiprocket']).default('fake'),
    SEARCH_ADAPTER: z.enum(['noop', 'postgres']).default('noop'),
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
    SHIPROCKET_WEBHOOK_SECRET: z.string().optional(),
    SHIPROCKET_BASE_URL: z.url().optional(),
    SHIPROCKET_WEBHOOK_IPS: z.string().optional(),
    SENTRY_DSN: z.url().optional(),
    RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).optional(),
    OTP_EMAIL_RATE_LIMIT: z.coerce.number().int().min(1).optional(),
    OTP_IP_RATE_LIMIT: z.coerce.number().int().min(1).optional(),
    TRUSTED_PROXIES: z.string().optional(),
    JOBS_ENABLED: booleanString,
    MEDIA_PUBLIC_BASE_URL: z.url().optional(),
    SEARCH_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).optional(),
    CONTACT_INBOX_EMAIL: z.string().email().optional(),
    PII_REVEAL_TTL_SECONDS: z.coerce.number().int().min(1).optional(),
    HMAC_SECRET: z.string().min(16).optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.JWT_KEYS_JSON.some((key) => key.kid === env.JWT_ACTIVE_KID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACTIVE_KID'],
        message: 'must match a kid in JWT_KEYS_JSON',
      });
    }
    if (env.SHIPPING_ADAPTER === 'shiprocket') {
      for (const key of [
        'SHIPROCKET_EMAIL',
        'SHIPROCKET_PASSWORD',
        'SHIPROCKET_WEBHOOK_SECRET',
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when SHIPPING_ADAPTER=shiprocket',
          });
      }
    }
    if (env.EMAIL_ADAPTER === 'fake' && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_ADAPTER'],
        message: 'fake adapter is only allowed when NODE_ENV=test',
      });
    }
    if (env.RATE_LIMIT_MULTIPLIER !== undefined && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_MULTIPLIER'],
        message: 'only allowed when NODE_ENV=test',
      });
    }
    if (env.OTP_EMAIL_RATE_LIMIT !== undefined && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_EMAIL_RATE_LIMIT'],
        message: 'only allowed when NODE_ENV=test',
      });
    }
    if (env.OTP_IP_RATE_LIMIT !== undefined && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_IP_RATE_LIMIT'],
        message: 'only allowed when NODE_ENV=test',
      });
    }
  });

export const webEnvSchema = z.strictObject({
  NODE_ENV: nodeEnvSchema,
  API_INTERNAL_URL: z.url(),
  WEB_ORIGIN: z.url(),
  REVALIDATE_SECRET: z.string().min(16),
  JWT_PUBLIC_KEYS_JSON: jsonArray(jwtPublicKeySchema),
  JWT_ISSUER: z.string().min(1).default('puja-essentials'),
  NEXT_PUBLIC_MEDIA_HOST: z.string().optional(),
  SENTRY_DSN: z.url().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

export type EnvSource = Readonly<Record<string, string | undefined>>;

export type EnvResult<T> =
  | { readonly ok: true; readonly env: T }
  | { readonly ok: false; readonly issues: readonly string[] };

type AnyObjectSchema =
  | z.ZodObject<z.ZodRawShape>
  | z.ZodPipe<z.ZodObject<z.ZodRawShape>, z.ZodTransform<unknown, unknown>>;

const shapeOf = (schema: z.ZodTypeAny): z.ZodRawShape => {
  const def = schema.def as { shape?: z.ZodRawShape; in?: z.ZodTypeAny };
  if (def.shape) return def.shape;
  if (def.in) return shapeOf(def.in);
  return {};
};

const pickDeclared = (schema: z.ZodTypeAny, source: EnvSource): Record<string, string> =>
  Object.fromEntries(
    Object.keys(shapeOf(schema))
      .map((key) => [key, source[key]] as const)
      .filter(
        (entry): entry is readonly [string, string] => entry[1] !== undefined && entry[1] !== '',
      ),
  );

export const parseEnv = <S extends AnyObjectSchema>(
  schema: S,
  source: EnvSource = process.env,
): EnvResult<z.output<S>> => {
  const result = schema.safeParse(pickDeclared(schema, source));
  if (result.success) return { ok: true, env: result.data as z.output<S> };
  const issues = result.error.issues.map((issue) => {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    const kind =
      issue.code === 'invalid_type' && issue.message.includes('undefined') ? 'missing' : 'invalid';
    return `${key}: ${kind} — ${issue.message}`;
  });
  return { ok: false, issues };
};

export const formatEnvIssues = (issues: readonly string[]): string =>
  ['Environment configuration is invalid:', ...issues.map((issue) => `  - ${issue}`)].join('\n');

export const loadEnv = <S extends AnyObjectSchema>(
  schema: S,
  source: EnvSource = process.env,
): z.output<S> => {
  const result = parseEnv(schema, source);
  if (result.ok) return result.env;
  console.error(formatEnvIssues(result.issues));
  process.exit(1);
};
