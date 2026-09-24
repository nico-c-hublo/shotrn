import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SPA_INDEX_PATH, sendSpa } from './spa';

/**
 * Serves the single-page app shell. Registered before the `/:code` catch-all so a two-segment
 * preview path is never mistaken for a short code.
 */
@Controller()
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
