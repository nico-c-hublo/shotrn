import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { clientKey } from '../common/client-key';
import { UnknownCodeLimiter } from './unknown-code-limiter';

/** Applies the unknown-code budget (FR-020) to the routes that look a code up. */
@Injectable()
export class UnknownCodeGuard implements CanActivate {
  constructor(private readonly limiter: UnknownCodeLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const res = http.getResponse<Response>();
    const admission = this.limiter.admit(clientKey(http.getRequest<Request>().ip));

    if (!admission.admitted) {
      // Same convention as the throttler, so the exception filter picks it up for Retry-After.
      res.setHeader('Retry-After-unknown-code', String(admission.retryAfterSeconds));
      throw new ThrottlerException();
    }

    // 'finish' settles as soon as the status is final; 'close' covers a client that hangs up
    // first, so a reservation can never leak. Settling twice is a no-op.
    const settle = () => admission.settle(res.statusCode === 404);
    res.once('finish', settle);
    res.once('close', settle);
    return true;
  }
}
