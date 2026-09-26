import { AppError, type ErrorCode, fail, isAppError } from '@pe/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

import { sharedPlugin } from '../lib/plugin';

const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION',
  415: 'VALIDATION',
  429: 'RATE_LIMITED',
};

const validationDetails = (error: FastifyError) =>
  (error.validation ?? []).map((issue) => ({
    path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
    message: issue.message ?? 'Invalid value',
  }));

const sendError = (
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
) =>
  reply
    .status(status)
    .send(fail(details === undefined ? { code, message } : { code, message, details }));

const handleKnownError = (error: FastifyError, reply: FastifyReply): boolean => {
  if (hasZodFastifySchemaValidationErrors(error)) {
    void sendError(
      reply,
      400,
      'VALIDATION',
      `Invalid ${error.validationContext ?? 'request'}`,
      validationDetails(error),
    );
    return true;
  }
  if (isAppError(error)) {
    const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)
      ?.retryAfterSeconds;
    if (error.code === 'RATE_LIMITED' && retryAfter !== undefined)
      void reply.header('retry-after', String(retryAfter));
    void sendError(reply, error.httpStatus, error.code, error.message, error.details);
    return true;
  }
  const status = error.statusCode;
  if (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    !isResponseSerializationError(error)
  ) {
    void sendError(reply, status, STATUS_TO_CODE[status] ?? 'VALIDATION', error.message);
    return true;
  }
  return false;
};

export const errorHandlerPlugin = sharedPlugin(async (app) => {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (handleKnownError(error, reply)) return;
    request.log.error({ err: error, reqId: request.id }, 'unhandled error');
    void sendError(reply, 500, 'INTERNAL', new AppError('INTERNAL').message);
  });

  app.setNotFoundHandler((request, reply) => {
    void sendError(reply, 404, 'NOT_FOUND', `Route ${request.method} ${request.url} not found`);
  });
});
