"""Check backend configuration without printing secrets or transmitting user data.

Run from the repository root with the backend environment loaded. The optional
--mistral check lists model availability; it never sends workspace content.
"""
import argparse
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from dotenv import load_dotenv
from api.store import Store


def check_database(store):
    with store.connection() as connection:
        role = connection.execute('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user').fetchone()
        if not role or any(role):
            raise ValueError('Use a restricted runtime role, not the database administrator.')
        flags = connection.execute("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='morrowfold.items'::regclass").fetchone()
        if flags != (True,True):
            raise ValueError('The items table needs enabled and forced row-level security.')
        for privilege in ('SELECT','INSERT','UPDATE','DELETE'):
            allowed = connection.execute("SELECT has_table_privilege(current_user,'morrowfold.items',%s)",(privilege,)).fetchone()[0]
            if not allowed: raise ValueError('The runtime role is missing an item permission.')
        token_read = connection.execute("SELECT has_table_privilege(current_user,'morrowfold.access_tokens','SELECT')").fetchone()[0]
        token_write = connection.execute("SELECT has_table_privilege(current_user,'morrowfold.access_tokens','INSERT,UPDATE,DELETE')").fetchone()[0]
        if not token_read or token_write:
            raise ValueError('The runtime role must have read-only access to pilot access-code hashes.')
        if connection.execute('SELECT count(*) FROM morrowfold.items').fetchone()[0] != 0:
            raise ValueError('Rows are visible without tenant context. Check database policies.')


def check_mistral(key,model):
    if not key: raise ValueError('MISTRAL_API_KEY is not configured.')
    try:
        with httpx.Client(timeout=20) as client:
            response=client.get('https://api.mistral.ai/v1/models',headers={'Authorization':'Bearer '+key})
            response.raise_for_status()
            ids={entry['id'] for entry in response.json()['data']}
            if model not in ids: raise ValueError('The configured Mistral model is not available to this key.')
    except httpx.HTTPStatusError as error:
        raise ValueError(f'Mistral rejected the connection (HTTP {error.response.status_code}). Check API access and billing.') from None
    except (httpx.RequestError,KeyError,TypeError):
        raise ValueError('Could not verify Mistral availability. Check the connection and retry.') from None


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mistral',action='store_true',help='Also verify API key and model availability without sending personal data')
    args=parser.parse_args()
    load_dotenv()
    missing=[k for k in ('DATA_KEY','DATABASE_URL') if not os.environ.get(k)]
    if missing:
        print('Not configured: '+', '.join(missing));return 1
    try:
        store=Store(SimpleNamespace(data_key=os.environ['DATA_KEY'],database_url=os.environ['DATABASE_URL']))
        check_database(store)
        print('PASS: database connection, runtime permissions and tenant isolation configuration.')
        if args.mistral:
            check_mistral(os.environ.get('MISTRAL_API_KEY',''),os.environ.get('MISTRAL_MODEL','mistral-small-latest'))
            print('PASS: Mistral API key and configured model are available. Chat generation still needs a smoke test.')
    except ValueError as error:
        print('CHECK FAILED: '+str(error));return 1
    except Exception:
        # Database errors can contain connection strings or server details.
        print('CHECK FAILED: database connection/schema could not be verified. Inspect configuration privately.');return 1
    return 0

if __name__=='__main__':sys.exit(main())
