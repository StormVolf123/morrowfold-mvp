BEGIN;
CREATE TABLE morrowfold.connections (
 user_id varchar(36) NOT NULL,
 provider text NOT NULL CHECK(provider='google'),
 payload text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,provider)
);
ALTER TABLE morrowfold.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE morrowfold.connections FORCE ROW LEVEL SECURITY;
CREATE POLICY connection_owner ON morrowfold.connections
 USING(user_id=current_setting('morrowfold.user_id',true))
 WITH CHECK(user_id=current_setting('morrowfold.user_id',true));
CREATE TABLE morrowfold.oauth_states (
 state_hash text PRIMARY KEY,
 user_id varchar(36) NOT NULL,
 proof_hash text NOT NULL,
 phase text NOT NULL CHECK(phase IN ('pending','processing','ready')),
 payload text NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE morrowfold.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE morrowfold.oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY oauth_owner_or_state ON morrowfold.oauth_states
 USING(user_id=current_setting('morrowfold.user_id',true) OR state_hash=current_setting('morrowfold.oauth_state',true))
 WITH CHECK(user_id=current_setting('morrowfold.user_id',true) OR state_hash=current_setting('morrowfold.oauth_state',true));
REVOKE ALL ON morrowfold.connections,morrowfold.oauth_states FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON morrowfold.connections,morrowfold.oauth_states TO morrowfold_app;
COMMIT;
