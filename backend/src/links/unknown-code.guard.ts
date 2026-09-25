import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { clientKey } from '../common/client-key';
import { isWellFormedCode } from './short-code';
import { UnknownCodeLimiter } from './unknown-code-limiter';

/** Applies the unknown-code budget (FR-020) to the routes that look a code up. */
@Injectable()
export class UnknownCodeGuard implements CanActivate {
  constructor(private readonly limiter: UnknownCodeLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // A malformed code is answered 404 without a query, so it reveals nothing and is not a
    // guess. Charging it would let /favicon.ico requests lock a visitor out.
    const { code } = req.params;
    if (typeof code !== 'string' || !isWellFormedCode(code)) return true;

    const admission = await this.limiter.admit(clientKey(req.ip));

    if (!admission.admitted) {
      // Same convention as the throttler, so the exception filter picks it up for Retry-After.
      res.setHeader('Retry-After-unknown-code', String(admission.retryAfterSeconds));
      throw new ThrottlerException();
    }

    // 'finish' settles as soon as the status is final; 'close' covers a client that hangs up
    // first, so a reservation can never leak. Settling twice is a no-op.
    const settle = () => admission.settle(res.statusCode === 404);
    if (res.destroyed) {
      // The client left while this lookup waited in admit(): 'close' has already fired and
      // would never reach a listener added now. Nobody will see the answer, so release it.
      settle();
      return true;
    }
    res.once('finish', settle);
    res.once('close', settle);
    return true;
  }
}
