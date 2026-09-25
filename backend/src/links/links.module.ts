import { Module } from '@nestjs/common';
import { codeGeneratorProvider } from './code-generator.provider';
import { LinksController } from './links.controller';
import { LinksRepository } from './links.repository';
import { LinksService } from './links.service';
import { PagesController } from './pages.controller';
import { RedirectController } from './redirect.controller';

@Module({
  // Order matters: Nest matches routes in declaration order, so the `/:code` catch-all
  // in RedirectController must come last.
  controllers: [LinksController, PagesController, RedirectController],
  providers: [LinksService, LinksRepository, codeGeneratorProvider],
  exports: [LinksService],
})
export class LinksModule {}
