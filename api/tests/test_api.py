import base64
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4
import pytest
from cryptography.exceptions import InvalidTag
from fastapi import HTTPException
from fastapi.testclient import TestClient
from api.main import app, scoped, limits
from api.store import Vault, Store

class MemoryStore:
    def __init__(self): self.rows={}
    def authenticate(self,token):
        if token not in ['alice-token','bob-token']: raise HTTPException(401,'Invalid code')
        return token
    def list(self,owner): return deepcopy(list(self.rows.get(owner,{}).values()))
    def get(self,owner,id):
        try:return deepcopy(self.rows[owner][id])
        except KeyError:raise HTTPException(404,'Item not found')
    def save(self,owner,kind,data,id=None,version=None):
        if id:
            old=self.get(owner,id)
            if old['version']!=version:raise HTTPException(409,'Conflict')
        item={'id':id or str(uuid4()),'kind':kind,'data':data,'version':1 if not id else version+1}
        self.rows.setdefault(owner,{})[item['id']]=deepcopy(item)
        return item
    def delete(self,owner,id,version):
        if self.get(owner,id)['version']!=version:raise HTTPException(409,'Conflict')
        del self.rows[owner][id]

@pytest.fixture
def client():
    app.state.store=MemoryStore()
    app.state.settings=SimpleNamespace(mistral_api_key='',mistral_model='test-model')
    limits.clear()
    return TestClient(app)

A={'Authorization':'Bearer alice-token'}
B={'Authorization':'Bearer bob-token'}

def area(client):
    r=client.post('/v1/items',headers=A,json={'kind':'area','data':{'title':'Career','goal':'Meaningful work','theme':'forest'}})
    assert r.status_code==201
    return r.json()

def test_requires_auth(client):
    assert client.get('/v1/items').status_code==401
    assert client.get('/v1/items',headers={'Authorization':'Bearer invalid'}).status_code==401

def test_crud_isolation_and_optimistic_lock(client):
    a=area(client)
    assert client.get('/v1/items',headers=B).json()==[]
    data={'kind':'area','data':a['data'],'version':1}
    assert client.put('/v1/items/'+a['id'],headers=B,json=data).status_code==404
    assert client.put('/v1/items/'+a['id'],headers=A,json=data).json()['version']==2
    assert client.put('/v1/items/'+a['id'],headers=A,json=data).status_code==409
    assert client.delete('/v1/items/'+a['id']+'?version=1',headers=A).status_code==409
    assert client.delete('/v1/items/'+a['id']+'?version=2',headers=A).status_code==204

def test_reference_cannot_cross_users(client):
    a=area(client)
    body={'kind':'task','data':{'title':'Test','area_id':a['id'],'done':False,'due':''}}
    assert client.post('/v1/items',headers=B,json=body).status_code==404
    assert client.post('/v1/items',headers=A,json=body).status_code==201
    assert client.delete('/v1/items/'+a['id']+'?version=1',headers=A).status_code==409

def test_validation_and_payload_bound(client):
    assert client.post('/v1/items',headers=A,json={'kind':'area','data':{'title':'','goal':'x'}}).status_code==422
    assert client.post('/v1/items',headers=A,json={'kind':'area','data':{'title':'x','goal':'x','admin':True}}).status_code==422
    assert client.post('/v1/items',headers=A,content=b'x'*100001).status_code==413

def test_scoped_memory():
    items=[{'id':'a','kind':'area','data':{}},{'id':'b','kind':'area','data':{}},{'id':'m','kind':'memory','data':{'area_id':''}},{'id':'n','kind':'memory','data':{'area_id':'b'}},{'id':'t','kind':'task','data':{'area_id':'a'}},{'id':'c','kind':'conversation','data':{'area_id':'a'}}]
    assert {i['id'] for i in scoped(items,'a')}=={'a','m','t'}

def test_ai_unconfigured_is_not_fake_success(client):
    a=area(client)
    r=client.post('/v1/chat',headers=A,json={'message':'Hello','area_id':a['id']})
    assert r.status_code==503
    assert len(client.get('/v1/items',headers=A).json())==1

def test_chat_scope_and_history(client,monkeypatch):
    import api.main as main
    prompts=[]
    monkeypatch.setattr(main,'completion',lambda request,messages:prompts.append(messages) or 'A useful next step.')
    a=area(client)
    r=client.post('/v1/chat',headers=A,json={'message':'Help me plan','area_id':a['id']})
    assert r.status_code==200
    c=r.json()
    assert len(c['data']['messages'])==2
    assert client.post('/v1/chat',headers=B,json={'message':'Read it','conversation_id':c['id']}).status_code==404
    assert client.post('/v1/chat',headers=A,json={'message':'Continue','conversation_id':c['id']}).status_code==422
    r=client.post('/v1/chat',headers=A,json={'message':'Continue','conversation_id':c['id'],'area_id':a['id']})
    assert r.json()['version']==2
    assert len(prompts[-1])==4

def test_draft_review_keeps_provenance(client,monkeypatch):
    import api.main as main
    monkeypatch.setattr(main,'completion',lambda *_:'Draft with [Please confirm: experience].')
    a=area(client)
    r=client.post('/v1/drafts',headers=A,json={'area_id':a['id'],'job':'A role requiring thoughtful software development.'})
    assert r.status_code==201
    d=r.json();d['data']['status']='reviewed'
    assert client.put('/v1/items/'+d['id'],headers=A,json={'kind':'draft','data':d['data'],'version':1}).status_code==200
    d['data']['source_job']='altered'
    assert client.put('/v1/items/'+d['id'],headers=A,json={'kind':'draft','data':d['data'],'version':2}).status_code==422

def test_vault_authenticated_encryption():
    vault=Vault(base64.b64encode(b'x'*32).decode())
    sealed=vault.seal('alice','id','memory',{'content':'private information'})
    assert 'private information' not in sealed
    assert vault.open('alice','id','memory',sealed)=={'content':'private information'}
    assert vault.seal('alice','id','memory',{'content':'private information'})!=sealed
    for owner,id,kind in [('bob','id','memory'),('alice','other','memory'),('alice','id','task')]:
        with pytest.raises(InvalidTag):vault.open(owner,id,kind,sealed)
    raw=bytearray(base64.b64decode(sealed));raw[-1]^=1
    with pytest.raises(InvalidTag):vault.open('alice','id','memory',base64.b64encode(raw))

def test_sql_updates_bind_tenant_and_version():
    from contextlib import contextmanager
    class Cursor:
        rowcount=1
        def __enter__(self): return self
        def __exit__(self,*_): pass
        def execute(self,sql,args): self.sql,self.args=sql,args
    cur=Cursor()
    class Connection:
        def cursor(self): return cur
    db=Store(SimpleNamespace(data_key=base64.b64encode(b'x'*32).decode()))
    @contextmanager
    def connection(owner=None):yield Connection()
    db.connection=connection
    result=db.save('alice','memory',{'content':"'; DROP TABLE ITEMS;--"},'id',3)
    assert 'USER_ID=%s' in cur.sql and 'VERSION=%s' in cur.sql
    assert cur.args[1:]==(None,'alice','id','memory',3)
    assert 'DROP TABLE' not in cur.sql and 'DROP TABLE' not in cur.args[0]
    assert result['version']==4
