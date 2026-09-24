import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/client';
import { links, type LinkRow } from '../db/schema';

export interface NewLink {
  originalUrl: string;
  expiresAt: Date | null;
}

/**
 * The identity column is the sole id source (research.md §1). If write volume ever exceeds
 * one Postgres primary, `insert` is the single seam to swap for per-instance range
 * allocation; nothing else in the application changes.
 */
@Injectable()
export class LinksRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(link: NewLink): Promise<LinkRow> {
    const [row] = await this.db
      .insert(links)
      .values({ originalUrl: link.originalUrl, expiresAt: link.expiresAt })
      .returning();
    return row;
  }

  async findById(id: number): Promise<LinkRow | null> {
    const [row] = await this.db.select().from(links).where(eq(links.id, id)).limit(1);
    return row ?? null;
  }
}
