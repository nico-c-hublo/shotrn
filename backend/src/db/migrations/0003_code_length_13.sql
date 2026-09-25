-- Codes grow from 11 to 13 characters (research.md §2). An 11-character row can exist only
-- in a database that applied 0002 from the unmerged branch; the new format check makes it
-- unreachable, so it is removed rather than kept as a dead row.
DELETE FROM "links" WHERE "code" !~ '^[0-9A-Za-z]{13}$';
ALTER TABLE "links" DROP CONSTRAINT "code_format";
ALTER TABLE "links" ADD CONSTRAINT "code_format" CHECK ("links"."code" ~ '^[0-9A-Za-z]{13}$');
