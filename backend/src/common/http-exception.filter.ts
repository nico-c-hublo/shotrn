import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, type ErrorCode, type ErrorEnvelope } from './errors';

/**
 * Maps every failure to the stable envelope `{ error: { code, message } }`.
 * Internals (stack traces, SQL, file paths) are logged server-side only (FR-017).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url} failed`, exception as Error);
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      // The throttler guard reports the real window per named limiter (e.g.
      // Retry-After-create). Surface the longest of those rather than a guessed value:
      // telling a caller to retry in 60s when the window is an hour is worse than useless.
      response.setHeader('Retry-After', String(retryAfterSeconds(response)));
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof DomainError) {
      return { status: exception.status, body: exception.toEnvelope() };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: { error: { code: mapStatus(status), message: safeMessage(exception, status) } },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL', message: 'Something went wrong' } },
    };
  }
}

/** Longest Retry-After-* the throttler set, falling back to one minute. */
function retryAfterSeconds(response: Response): number {
  const candidates = Object.entries(response.getHeaders())
    .filter(([name]) => name.toLowerCase().startsWith('retry-after-'))
    .map(([, value]) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  return candidates.length > 0 ? Math.max(...candidates) : 60;
}

function mapStatus(status: number): ErrorCode {
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR';
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return 'INTERNAL';
  return 'VALIDATION_ERROR';
}

/** Validation messages are safe to surface; anything from a 5xx is not. */
function safeMessage(exception: HttpException, status: number): string {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return 'Something went wrong';
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'Too many requests, slow down';

  const payload = exception.getResponse();
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return exception.message;
}
