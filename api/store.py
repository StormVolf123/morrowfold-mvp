"""Tenant-bound PostgreSQL persistence. Content never enters SQL in plaintext."""
import base64
import hashlib
import json
import os
from contextlib import contextmanager
from uuid import uuid4
import psycopg
from psycopg.conninfo import conninfo_to_dict
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

class Vault:
    def __init__(self, key):
        raw = base64.b64decode(key, validate=True)
        if len(raw) != 32:
            raise ValueError('DATA_KEY must be a base64-encoded 32-byte key')
        self.cipher = AESGCM(raw)

    def seal(self, owner, id, kind, data):
        nonce = os.urandom(12)
        aad = f'{owner}:{id}:{kind}'.encode()
        body = json.dumps(data, separators=(',', ':')).encode()
        return base64.b64encode(nonce + self.cipher.encrypt(nonce, body, aad)).decode()

    def open(self, owner, id, kind, ciphertext):
        raw = base64.b64decode(ciphertext)
        return json.loads(self.cipher.decrypt(raw[:12], raw[12:], f'{owner}:{id}:{kind}'.encode()))

class Store:
    def __init__(self, settings):
        self.settings = settings
        self.vault = Vault(settings.data_key)

    @contextmanager
    def connection(self, owner=None):
        info = conninfo_to_dict(self.settings.database_url)
        if info.get('host') not in ('localhost','127.0.0.1','::1') and info.get('sslmode') != 'verify-full':
            raise ValueError('Remote PostgreSQL connections require sslmode=verify-full')
        with psycopg.connect(self.settings.database_url, connect_timeout=15, prepare_threshold=None) as c:
            c.execute("SET LOCAL statement_timeout = '20s'")
            c.execute("SELECT set_config('morrowfold.user_id', %s, true)", (owner or '',))
            yield c

    def authenticate(self, token):
        if len(token) < 32 or len(token) > 200:
            raise HTTPException(401, 'Invalid or expired pilot access code.')
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.connection() as c, c.cursor() as cur:
            cur.execute('SELECT USER_ID FROM morrowfold.access_tokens WHERE TOKEN_HASH=%s AND EXPIRES_AT > CURRENT_TIMESTAMP AND REVOKED=FALSE', (digest,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(401, 'Invalid or expired pilot access code.')
        return row[0]

    def unpack(self, owner, row):
        id, kind, version, payload = row
        return {'id':id, 'kind':kind, 'version':version, 'data':self.vault.open(owner,id,kind,payload)}

    def list(self, owner):
        with self.connection(owner) as c, c.cursor() as cur:
            cur.execute('SELECT ID,KIND,VERSION,PAYLOAD FROM morrowfold.items WHERE USER_ID=%s ORDER BY CREATED_AT', (owner,))
            return [self.unpack(owner, row) for row in cur.fetchall()]

    def get(self, owner, id):
        with self.connection(owner) as c, c.cursor() as cur:
            cur.execute('SELECT ID,KIND,VERSION,PAYLOAD FROM morrowfold.items WHERE USER_ID=%s AND ID=%s', (owner,id))
            row = cur.fetchone()
        if row is None:
            raise HTTPException(404, 'Item not found.')
        return self.unpack(owner,row)

    def save(self, owner, kind, data, id=None, version=None):
        creating = id is None
        id = id or str(uuid4())
        payload = self.vault.seal(owner,id,kind,data)
        with self.connection(owner) as c, c.cursor() as cur:
            if creating:
                cur.execute('INSERT INTO morrowfold.items (USER_ID,ID,KIND,VERSION,PAYLOAD,AREA_ID) VALUES (%s,%s,%s,1,%s,%s)', (owner,id,kind,payload,data.get('area_id') or None))
            else:
                cur.execute('UPDATE morrowfold.items SET PAYLOAD=%s,AREA_ID=%s,VERSION=VERSION+1,UPDATED_AT=CURRENT_TIMESTAMP WHERE USER_ID=%s AND ID=%s AND KIND=%s AND VERSION=%s', (payload,data.get('area_id') or None,owner,id,kind,version))
                if cur.rowcount != 1:
                    raise HTTPException(409, 'This item changed in another session. Refresh before editing again.')
        return {'id':id,'kind':kind,'version':1 if creating else version+1,'data':data}

    def delete(self, owner, id, version):
        with self.connection(owner) as c, c.cursor() as cur:
            cur.execute('DELETE FROM morrowfold.items WHERE USER_ID=%s AND ID=%s AND VERSION=%s',(owner,id,version))
            if cur.rowcount != 1:
                raise HTTPException(409, 'This item changed. Refresh before deleting it.')
