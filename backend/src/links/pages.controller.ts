import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SPA_INDEX_PATH, sendSpa } from './spa';

/**
 * Serves the single-page app shell. Registered before the `/:code` catch-all so a two-segment
 * preview path is never mistaken for a short code.
 *
 * Unthrottled: the shell is static and never touches the database, so it offers nothing to
 * enumerate, and a shared office IP must not lose the home page after 60 visits an hour.
 */
@Controller()
@SkipThrottle({ create: true, redirect: true })
export class PagesController {
  @Get()
  @Header('Cache-Control', 'no-cache')
  home(@Res() res: Response): void {
    sendSpa(res, 200);
  }

  @Get('p/:code')
  @Header('Cache-Control', 'no-cache')
  preview(@Res() res: Response): void {
    sendSpa(res, 200);
  }
}

export { SPA_INDEX_PATH };
