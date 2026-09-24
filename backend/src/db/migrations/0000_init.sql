CREATE TABLE "links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"original_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "original_url_length" CHECK (char_length("links"."original_url") between 1 and 2048),
	CONSTRAINT "original_url_scheme" CHECK ("links"."original_url" ~* '^https?://'),
	CONSTRAINT "expires_after_created" CHECK ("links"."expires_at" is null or "links"."expires_at" > "links"."created_at")
);
