import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/client';
import { links, type LinkRow } from '../db/schema';

export interface NewLink {
  code: string;
  originalUrl: string;
  expiresAt: Date | null;
}

@Injectable()
export class LinksRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Returns null when the code is already taken. `ON CONFLICT DO NOTHING` reports a clash as
   * an empty result instead of an error, so there is no exception to parse and concurrent
   * inserts of one code are settled by the primary key alone.
   */
  async insert(link: NewLink): Promise<LinkRow | null> {
    const [row] = await this.db.insert(links).values(link).onConflictDoNothing().returning();
    return row ?? null;
  }

  async findByCode(code: string): Promise<LinkRow | null> {
    const [row] = await this.db.select().from(links).where(eq(links.code, code)).limit(1);
    return row ?? null;
  }
}
