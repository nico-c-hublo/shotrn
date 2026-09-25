import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { codeGeneratorProvider } from './code-generator.provider';
import { LinksController } from './links.controller';
import { LinksRepository } from './links.repository';
import { LinksService } from './links.service';
import { PagesController } from './pages.controller';
import { RedirectController } from './redirect.controller';
import { UnknownCodeGuard } from './unknown-code.guard';
import { UnknownCodeLimiter } from './unknown-code-limiter';

/** One limiter for both lookup routes, so redirect and preview draw on the same budget. */
const unknownCodeLimiterProvider = {
  provide: UnknownCodeLimiter,
  inject: [ENV],
  useFactory: (env: Env) =>
    new UnknownCodeLimiter(env.rateLimitUnknownCodePer10Minutes, 10 * 60 * 1000),
};

@Module({
  // Order matters: Nest matches routes in declaration order, so the `/:code` catch-all
  // in RedirectController must come last.
  controllers: [LinksController, PagesController, RedirectController],
  providers: [
    LinksService,
    LinksRepository,
    codeGeneratorProvider,
    unknownCodeLimiterProvider,
    UnknownCodeGuard,
  ],
  exports: [LinksService],
})
export class LinksModule {}
