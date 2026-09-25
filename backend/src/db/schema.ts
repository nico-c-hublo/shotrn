import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The only table, keyed by the random short code (research.md §1). The primary key is what
 * makes a clash impossible to store: the insert reports it and the service draws again.
 * `COLLATE "C"` is declared in the migration; Drizzle has no column option for it.
 */
export const links = pgTable(
  'links',
  {
    code: text('code').primaryKey(),
    originalUrl: text('original_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // NULL means permanent (FR-011).
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    check('code_format', sql`${table.code} ~ '^[0-9A-Za-z]{11}$'`),
    check('original_url_length', sql`char_length(${table.originalUrl}) between 1 and 2048`),
    // Case-insensitive: an uppercase scheme is stored verbatim per FR-008.
    check('original_url_scheme', sql`${table.originalUrl} ~* '^https?://'`),
    check(
      'expires_after_created',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export type LinkRow = typeof links.$inferSelect;
export type NewLinkRow = typeof links.$inferInsert;
