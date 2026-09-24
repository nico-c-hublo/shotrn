import { sql } from 'drizzle-orm';
import { bigint, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The only table. The short code is NOT stored: it is Sqids-encoded from `id`
 * (see specs/001-url-shortener/research.md §1). Uniqueness therefore comes from the
 * identity column, so no collision handling exists anywhere in the application.
 */
export const links = pgTable(
  'links',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    originalUrl: text('original_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // NULL means permanent (FR-011).
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
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
