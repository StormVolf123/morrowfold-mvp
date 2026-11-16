"""Apply the initial schema atomically to a new, dedicated database."""
import os
from pathlib import Path
import psycopg
from dotenv import load_dotenv
load_dotenv()
url=os.environ['MIGRATION_DATABASE_URL']
with psycopg.connect(url, autocommit=True) as c:
    c.execute(Path('api/schema.sql').read_text())
print('Created the isolated morrowfold schema. Existing schemas were not changed.')
