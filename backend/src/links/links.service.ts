import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { InvalidUrlError } from '../common/errors';
import type { LinkRow } from '../db/schema';
import { toExpiresAt, type ExpiryOption } from './expiry';
import { LinksRepository } from './links.repository';
import { CODE_GENERATOR, type CodeGenerator } from './code-generator.provider';
import { isWellFormedCode } from './short-code';
import {
  isExpired,
  toExpiredLinkResponse,
  toLinkResponse,
  type ExpiredLinkResponse,
  type LinkResponse,
} from './dto/link.response';
import { validateUrl } from './url-validation';

/**
 * A clash has probability N / 62¹¹ per draw (about 2e-13 at 10 million links), so a second
 * attempt is already a curiosity and a third failure means the random source is broken.
 * Failing loudly beats looping on it.
 */
export const MAX_CODE_DRAWS = 3;

export type Resolution =
  | { outcome: 'active'; row: LinkRow; response: LinkResponse }
  | { outcome: 'expired'; response: ExpiredLinkResponse }
  | { outcome: 'not-found' };

@Injectable()
export class LinksService {
  constructor(
    private readonly repository: LinksRepository,
    @Inject(CODE_GENERATOR) private readonly generateCode: CodeGenerator,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Creates a link. Never deduplicates (FR-018): the same URL submitted twice yields two
   * codes, each with its own creation time and expiry.
   */
  async create(url: unknown, expiry?: ExpiryOption): Promise<LinkResponse> {
    const validated = validateUrl(url);
    if (!validated.ok) throw new InvalidUrlError(validated.message);

    const expiresAt = toExpiresAt(expiry);
    for (let draw = 0; draw < MAX_CODE_DRAWS; draw++) {
      const row = await this.repository.insert({
        code: this.generateCode(),
        originalUrl: validated.value,
        expiresAt,
      });
      if (row !== null) return toLinkResponse(row, this.env.baseUrl);
    }

    // Surfaces as 500 INTERNAL; the filter logs this message server-side only.
    throw new Error(`short code clashed ${MAX_CODE_DRAWS} times in a row; check the RNG`);
  }

  /** Resolves a short code to its link, distinguishing "expired" from "never existed". */
  async resolve(code: string, now: Date = new Date()): Promise<Resolution> {
    // A string we could never have issued cannot match a row, so it costs no query.
    if (!isWellFormedCode(code)) return { outcome: 'not-found' };

    const row = await this.repository.findByCode(code);
    if (row === null) return { outcome: 'not-found' };

    // The expired outcome deliberately carries no row: nothing downstream can leak the
    // destination of a link it was never handed (FR-013).
    if (row.expiresAt !== null && isExpired(row.expiresAt, now)) {
      return { outcome: 'expired', response: toExpiredLinkResponse(code, row.expiresAt) };
    }
    return { outcome: 'active', row, response: toLinkResponse(row, this.env.baseUrl) };
  }
}
