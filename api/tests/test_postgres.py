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
