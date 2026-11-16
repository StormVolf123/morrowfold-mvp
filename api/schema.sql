-- Apply to a NEW dedicated PostgreSQL database using its migration owner.
BEGIN;
CREATE SCHEMA morrowfold;
REVOKE ALL ON SCHEMA morrowfold FROM PUBLIC;
CREATE TABLE morrowfold.items (
 user_id varchar(36) NOT NULL,
 id varchar(36) NOT NULL,
 kind varchar(20) NOT NULL CHECK (kind IN ('area','task','memory','draft','conversation')),
 version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
 payload text NOT NULL,
 area_id varchar(36),
 area_kind varchar(20) GENERATED ALWAYS AS (CASE WHEN area_id IS NOT NULL THEN 'area' END) STORED,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id,id),
 UNIQUE (user_id,id,kind),
 FOREIGN KEY (user_id,area_id,area_kind) REFERENCES morrowfold.items(user_id,id,kind) ON DELETE RESTRICT,
 CHECK (kind <> 'area' OR area_id IS NULL)
);
ALTER TABLE morrowfold.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE morrowfold.items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON morrowfold.items
 USING (user_id = current_setting('morrowfold.user_id', true))
 WITH CHECK (user_id = current_setting('morrowfold.user_id', true));
CREATE INDEX items_area ON morrowfold.items(user_id,area_id);
CREATE TABLE morrowfold.access_tokens (
 token_hash varchar(64) PRIMARY KEY,
 user_id varchar(36) NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked boolean NOT NULL DEFAULT FALSE
);
REVOKE ALL ON ALL TABLES IN SCHEMA morrowfold FROM PUBLIC;
-- Create a separate LOGIN role using your provider's secure admin flow.
-- As migration owner, grant that role only:
-- GRANT USAGE ON SCHEMA morrowfold TO morrowfold_app;
-- GRANT SELECT,INSERT,UPDATE,DELETE ON morrowfold.items TO morrowfold_app;
-- GRANT SELECT ON morrowfold.access_tokens TO morrowfold_app;
COMMIT;
