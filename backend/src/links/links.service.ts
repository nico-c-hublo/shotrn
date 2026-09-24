import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { InvalidUrlError } from '../common/errors';
import type { LinkRow } from '../db/schema';
import { toExpiresAt, type ExpiryOption } from './expiry';
import { LinksRepository } from './links.repository';
import { SHORT_CODEC, type ShortCodec } from './short-codec.provider';
import { linkStatus, toLinkResponse, type LinkResponse } from './dto/link.response';
import { validateUrl } from './url-validation';

export type Resolution =
  | { outcome: 'active'; row: LinkRow; code: string; response: LinkResponse }
  | { outcome: 'expired'; row: LinkRow; code: string; response: LinkResponse }
  | { outcome: 'not-found' };

@Injectable()
export class LinksService {
  constructor(
    private readonly repository: LinksRepository,
    @Inject(SHORT_CODEC) private readonly codec: ShortCodec,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Creates a link. Never deduplicates (FR-018): the same URL submitted twice yields two
   * codes, each with its own creation time and expiry.
   */
  async create(url: unknown, expiry?: ExpiryOption): Promise<LinkResponse> {
    const validated = validateUrl(url);
    if (!validated.ok) throw new InvalidUrlError(validated.message);

    const row = await this.repository.insert({
      originalUrl: validated.value,
      expiresAt: toExpiresAt(expiry),
    });

    return toLinkResponse(row, this.codec.encode(row.id), this.env.baseUrl);
  }

  /** Resolves a short code to its link, distinguishing "expired" from "never existed". */
  async resolve(code: string, now: Date = new Date()): Promise<Resolution> {
    const id = this.codec.decode(code);
    if (id === null) return { outcome: 'not-found' };

    const row = await this.repository.findById(id);
    if (row === null) return { outcome: 'not-found' };

    const response = toLinkResponse(row, code, this.env.baseUrl, now);
    const outcome = linkStatus(row.expiresAt, now);
    return { outcome, row, code, response };
  }
}
