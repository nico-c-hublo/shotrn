import { Module } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksRepository } from './links.repository';
import { LinksService } from './links.service';
import { PagesController } from './pages.controller';
import { RedirectController } from './redirect.controller';
import { shortCodecProvider } from './short-codec.provider';

@Module({
  // Order matters: Nest matches routes in declaration order, so the `/:code` catch-all
  // in RedirectController must come last.
  controllers: [LinksController, PagesController, RedirectController],
  providers: [LinksService, LinksRepository, shortCodecProvider],
  exports: [LinksService],
})
export class LinksModule {}
