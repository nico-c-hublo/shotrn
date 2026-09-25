import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { LinkNotFoundError } from '../common/errors';
import { CreateLinkDto } from './dto/create-link.dto';
import type { ExpiredLinkResponse, LinkResponse } from './dto/link.response';
import { LinksService } from './links.service';

@Controller('api/links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  /** FR-001, FR-011, FR-018. Rate limited by the `create` throttler only (FR-015). */
  @Post()
  @HttpCode(201)
  @SkipThrottle({ redirect: true })
  create(@Body() dto: CreateLinkDto): Promise<LinkResponse> {
    return this.links.create(dto.url, dto.expiry);
  }

  /**
   * Preview metadata (FR-016). Never redirects. An expired link answers 410 with when it
   * expired but not where it pointed (FR-013); the 410 carries data, not an error envelope.
   */
  @Get(':code')
  @SkipThrottle({ create: true })
  async findOne(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LinkResponse | ExpiredLinkResponse> {
    const resolved = await this.links.resolve(code);
    if (resolved.outcome === 'not-found') throw new LinkNotFoundError();
    if (resolved.outcome === 'expired') res.status(410);
    return resolved.response;
  }
}
