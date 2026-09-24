-- Constitution: the application role holds the minimum privileges required and never DDL.
-- Applied by the migration owner; the runtime role gets DML only.
-- SHOTRN_APP_ROLE defaults to the connecting role in single-role dev setups.
DO $$
DECLARE
	app_role text := coalesce(current_setting('shotrn.app_role', true), current_user);
BEGIN
	EXECUTE format('GRANT SELECT, INSERT ON TABLE links TO %I', app_role);
	EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE links_id_seq TO %I', app_role);
	-- Deliberately no UPDATE or DELETE: a link is never modified in v1.
END
$$;
