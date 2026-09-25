-- Short codes become random and stored (research.md §1). The identity-keyed table is
-- dropped rather than converted: nothing was deployed, and a link reachable by its Sqids
-- code would stay enumerable by anyone who recovered the alphabet.
DROP TABLE "links";
CREATE TABLE "links" (
	-- Byte-order collation: codes are identifiers, not words, and a locale-dependent key
	-- can be reordered by an operating-system update (research.md §2).
	"code" text COLLATE "C" PRIMARY KEY,
	"original_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "code_format" CHECK ("links"."code" ~ '^[0-9A-Za-z]{11}$'),
	CONSTRAINT "original_url_length" CHECK (char_length("links"."original_url") between 1 and 2048),
	CONSTRAINT "original_url_scheme" CHECK ("links"."original_url" ~* '^https?://'),
	CONSTRAINT "expires_after_created" CHECK ("links"."expires_at" is null or "links"."expires_at" > "links"."created_at")
);
-- Same least-privilege grant as 0001, minus the sequence that no longer exists.
DO $$
DECLARE
	app_role text := coalesce(current_setting('shotrn.app_role', true), current_user);
BEGIN
	EXECUTE format('GRANT SELECT, INSERT ON TABLE links TO %I', app_role);
END
$$;
