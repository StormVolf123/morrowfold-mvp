import base64
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.google_integration import GoogleConnection,email_text
from test_api import client,A

def encoded(s):return base64.urlsafe_b64encode(s.encode()).decode()

def test_email_text_ignores_attachments_and_html_scripts():
    assert email_text({'parts':[{'mimeType':'text/html','body':{'data':encoded('<p>Hello</p><script>steal()</script>')}},{'filename':'secret.txt','mimeType':'text/plain','body':{'data':encoded('attachment')}}]}).strip()=='Hello'
    assert email_text({'parts':[{'mimeType':'text/html','body':{'data':encoded('HTML')}},{'mimeType':'text/plain','body':{'data':encoded('Plain')}}]})=='Plain'
    assert len(email_text({'mimeType':'text/plain','body':{'data':encoded('x'*20000)}}))==12000

def test_google_routes_require_auth(client):
    for path in ('/v1/integrations/google','/v1/integrations/google/messages'):
        assert client.get(path).status_code==401
    assert client.post('/v1/integrations/google/start').status_code==401
    assert client.post('/v1/integrations/google/finish',json={'state':'x'*40,'proof':'y'*40}).status_code==401

def test_email_ai_needs_separate_consent(client,monkeypatch):
    def unexpected(*a,**k):raise AssertionError('Must not fetch emails without consent')
    monkeypatch.setattr(GoogleConnection,'message',unexpected)
    r=client.post('/v1/integrations/google/assist',headers=A,json={'message_ids':['aabb'],'action':'summary','share_with_ai':False})
    assert r.status_code==422

def test_email_ids_cannot_change_api_endpoint():
    c=GoogleConnection(None,None)
    with pytest.raises(HTTPException):c.message('alice','../../settings')

def test_cancelled_callback_is_fixed_redirect(client):
    r=client.get('/v1/integrations/google/callback?error=denied&state=bad',follow_redirects=False)
    assert r.status_code==303
    assert r.headers['location'].startswith('https://stormvolf123.github.io/morrowfold-mvp/#gmail_error=')
