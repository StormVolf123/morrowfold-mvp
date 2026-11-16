"""Create a private, expiring pilot code. Deliver the file privately, never commit it."""
import argparse
import hashlib
import os
import secrets
from datetime import datetime,timedelta,timezone
from pathlib import Path
from uuid import uuid4
import psycopg
from dotenv import load_dotenv
load_dotenv()

p=argparse.ArgumentParser()
p.add_argument('--output',required=True,help='A private file, e.g. .private/invitation.txt')
a=p.parse_args()
path=Path(a.output)
if path.exists():raise SystemExit('Output already exists; refusing to overwrite an invitation.')
token=secrets.token_urlsafe(48);user=str(uuid4());expires=datetime.now(timezone.utc)+timedelta(days=30)
with psycopg.connect(os.environ['MIGRATION_DATABASE_URL']) as c:
    with c.cursor() as cur:
        cur.execute('INSERT INTO morrowfold.access_tokens (TOKEN_HASH,USER_ID,EXPIRES_AT) VALUES (%s,%s,%s)',(hashlib.sha256(token.encode()).hexdigest(),user,expires))
path.parent.mkdir(parents=True,exist_ok=True)
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(f'Morrowfold private pilot\nAccess code: {token}\nExpires: {expires.isoformat()}\nWorkspace: {user}\n')
print('Invitation saved privately. Do not paste the access code into source code, logs, or public chat.')
