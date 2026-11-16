"""Real database tests; only run against an explicitly named disposable test database."""
import base64
import hashlib
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
import psycopg
from psycopg.conninfo import make_conninfo
from fastapi import HTTPException
import pytest
from api.store import Store

@pytest.fixture(scope='module')
def db():
    url=os.environ.get('TEST_DATABASE_URL')
    if not url:pytest.skip('Set TEST_DATABASE_URL for isolated PostgreSQL integration tests')
    with psycopg.connect(url,autocommit=True) as admin:
        if not admin.info.dbname.startswith('morrowfold_test'):
            pytest.fail('Integration tests require a dedicated morrowfold_test database')
        if not admin.execute("SELECT 1 FROM pg_namespace WHERE nspname='morrowfold'").fetchone():
            admin.execute(Path('api/schema.sql').read_text())
        role='morrowfold_test_runtime'
        if not admin.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',(role,)).fetchone():
            admin.execute('CREATE ROLE morrowfold_test_runtime LOGIN')
        admin.execute('GRANT USAGE ON SCHEMA morrowfold TO morrowfold_test_runtime')
        admin.execute('GRANT SELECT,INSERT,UPDATE,DELETE ON morrowfold.items TO morrowfold_test_runtime')
        admin.execute('GRANT SELECT ON morrowfold.access_tokens TO morrowfold_test_runtime')
        if not admin.execute("SELECT 1 FROM pg_tables WHERE schemaname='morrowfold' AND tablename='connections'").fetchone():
            admin.execute(Path('api/migrations/002_google_connections.sql').read_text().replace('TO morrowfold_app','TO morrowfold_test_runtime'))
        settings=SimpleNamespace(database_url=make_conninfo(url,user=role),data_key=base64.b64encode(os.urandom(32)).decode())
        yield Store(settings),admin

def test_database_isolation_encryption_and_persistence(db):
    store,admin=db
    alice,bob=str(uuid4()),str(uuid4())
    a=store.save(alice,'area',{'title':'Private ambition','goal':'Synthetic test','theme':'forest'})
    assert store.list(bob)==[]
    assert Store(store.settings).get(alice,a['id'])['data']['title']=='Private ambition'
    ciphertext=admin.execute('SELECT payload FROM morrowfold.items WHERE id=%s',(a['id'],)).fetchone()[0]
    assert 'Private ambition' not in ciphertext
    with store.connection() as c:
        assert c.execute('SELECT count(*) FROM morrowfold.items').fetchone()[0]==0
    with store.connection(alice) as c:
        assert c.execute('SELECT count(*) FROM morrowfold.items WHERE user_id=%s',(bob,)).fetchone()[0]==0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO morrowfold.items (user_id,id,kind,payload) VALUES (%s,%s,'area','fake')",(bob,str(uuid4())))

def test_database_concurrency_and_references(db):
    store,_=db
    owner,other=str(uuid4()),str(uuid4())
    area=store.save(owner,'area',{'title':'Career','goal':'Synthetic','theme':'forest'})
    task=store.save(owner,'task',{'title':'Next step','area_id':area['id'],'done':False,'due':''})
    with pytest.raises(psycopg.errors.ForeignKeyViolation):store.delete(owner,area['id'],1)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):store.save(other,'task',{'title':'Bad reference','area_id':area['id']})
    with pytest.raises(psycopg.errors.ForeignKeyViolation):store.save(owner,'task',{'title':'Non-area reference','area_id':task['id']})
    updated=store.save(owner,'task',{**task['data'],'done':True},task['id'],1)
    assert updated['version']==2
    with pytest.raises(HTTPException) as e:store.save(owner,'task',task['data'],task['id'],1)
    assert e.value.status_code==409
    assert store.get(owner,task['id'])['data']['done'] is True
    store.delete(owner,task['id'],2)
    store.delete(owner,area['id'],1)
    assert store.list(owner)==[]

def test_expired_and_revoked_codes(db):
    store,admin=db
    owner=str(uuid4());token=uuid4().hex+uuid4().hex
    digest=hashlib.sha256(token.encode()).hexdigest()
    admin.execute("INSERT INTO morrowfold.access_tokens VALUES (%s,%s,CURRENT_TIMESTAMP + INTERVAL '1 day',false)",(digest,owner))
    assert store.authenticate(token)==owner
    admin.execute('UPDATE morrowfold.access_tokens SET revoked=true WHERE token_hash=%s',(digest,))
    with pytest.raises(HTTPException) as e:store.authenticate(token)
    assert e.value.status_code==401
    admin.execute("UPDATE morrowfold.access_tokens SET revoked=false,expires_at=CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE token_hash=%s",(digest,))
    with pytest.raises(HTTPException):store.authenticate(token)

def test_remote_database_requires_verified_tls():
    store=Store(SimpleNamespace(database_url='postgresql://example.invalid/test?sslmode=require',data_key=base64.b64encode(b'x'*32).decode()))
    with pytest.raises(ValueError,match='verify-full'):
        with store.connection(): pass


def test_deployment_preflight_with_runtime_role(db):
    from scripts.check_setup import check_database
    check_database(db[0])


def test_google_state_proof_replay_and_tenant_isolation(db):
    from api.google_integration import GoogleConnection,digest,SCOPE
    store,admin=db
    google=GoogleConnection(store,SimpleNamespace(google_client_id='test-client',google_client_secret='test-secret'))
    alice,bob=str(uuid4()),str(uuid4())
    flow=google.begin(alice)
    assert 'code_challenge_method=S256' in flow['url']
    key=digest(flow['state'])
    payload=store.vault.seal(alice,key,'oauth',{'refresh_token':'synthetic-refresh','email':'synthetic@example.test','scopes':[SCOPE]})
    admin.execute("UPDATE morrowfold.oauth_states SET phase='ready',payload=%s WHERE state_hash=%s",(payload,key))
    with pytest.raises(HTTPException): google.finish(bob,flow['state'],flow['proof'])
    with pytest.raises(HTTPException): google.finish(alice,flow['state'],'incorrect-proof')
    assert not google.load(alice)
    assert google.finish(alice,flow['state'],flow['proof'])['connected']
    assert google.load(alice)['refresh_token']=='synthetic-refresh'
    assert google.load(bob) is None
    with store.connection(bob) as c:assert not c.execute('SELECT * FROM morrowfold.connections WHERE user_id=%s',(alice,)).fetchall()
    raw=admin.execute('SELECT payload FROM morrowfold.connections WHERE user_id=%s',(alice,)).fetchone()[0]
    assert 'synthetic-refresh' not in raw
    with pytest.raises(HTTPException):google.finish(alice,flow['state'],flow['proof'])
    expired=google.begin(alice)
    admin.execute("UPDATE morrowfold.oauth_states SET expires_at=now()-interval '1 minute' WHERE state_hash=%s",(digest(expired['state']),))
    with pytest.raises(HTTPException):google.callback(expired['state'],'fake-code')
    with store.connection(alice) as c:
        c.execute('DELETE FROM morrowfold.connections WHERE user_id=%s',(alice,))
        c.execute('DELETE FROM morrowfold.oauth_states WHERE user_id=%s',(alice,))


def test_google_callback_stages_tokens_until_browser_confirmation(db,monkeypatch):
    from api.google_integration import GoogleConnection,SCOPE
    store,admin=db
    google=GoogleConnection(store,SimpleNamespace(google_client_id='test-client',google_client_secret='test-secret'))
    owner=str(uuid4());pending=google.begin(owner)
    class FakeFlow:
        def fetch_token(self,**kwargs):return {'scope':[SCOPE],'refresh_token':'synthetic-only'}
    class FakeSession:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def get(self,*args,**kwargs):return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'emailAddress':'test@example.test'})
    monkeypatch.setattr(google,'flow',lambda *args:FakeFlow())
    monkeypatch.setattr(google,'session',lambda *args:FakeSession())
    google.callback(pending['state'],'synthetic-code')
    assert google.load(owner) is None
    with pytest.raises(HTTPException):google.callback(pending['state'],'synthetic-code')
    assert google.finish(owner,pending['state'],pending['proof'])['connected']
    with store.connection(owner) as c:c.execute('DELETE FROM morrowfold.connections WHERE user_id=%s',(owner,))
