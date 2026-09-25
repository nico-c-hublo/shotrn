import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LinksService } from './links.service';
import { sendSpa } from './spa';
import { UnknownCodeGuard } from './unknown-code.guard';

/**
 * The public redirect. Registered last so `/api/...` and `/p/:code` win the route match.
 *
 * Permanent links use 301 with a day of caching; temporary links use 302 with no-store so
 * expiry takes effect for visitors who already followed the link (research.md §4).
 */
@Controller()
export class RedirectController {
  constructor(private readonly links: LinksService) {}

  @Get(':code')
  @SkipThrottle({ create: true })
  @UseGuards(UnknownCodeGuard)
  async redirect(@Param('code') code: string, @Res() res: Response): Promise<void> {
    const resolved = await this.links.resolve(code);

    if (resolved.outcome === 'not-found') {
      sendSpa(res, 404, { kind: 'not-found' });
      return;
    }

    if (resolved.outcome === 'expired') {
      sendSpa(res, 410, { kind: 'expired', expiresAt: resolved.response.expiresAt });
      return;
    }

    const permanent = resolved.row.expiresAt === null;
    res.setHeader('Cache-Control', permanent ? 'public, max-age=86400' : 'no-store');
    res.redirect(permanent ? 301 : 302, resolved.row.originalUrl);
  }
}
