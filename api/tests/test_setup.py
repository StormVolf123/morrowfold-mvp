import httpx
import pytest
from scripts.check_setup import check_mistral


def stub_mistral(monkeypatch,status,payload):
    original=httpx.Client
    def handler(request):
        assert request.method=='GET'
        assert request.url.path=='/v1/models'
        return httpx.Response(status,json=payload)
    monkeypatch.setattr('scripts.check_setup.httpx.Client',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))


def test_setup_checks_available_model_without_chat(monkeypatch):
    stub_mistral(monkeypatch,200,{'data':[{'id':'test-model'}]})
    check_mistral('synthetic-test-key','test-model')


def test_setup_hides_provider_response_and_key(monkeypatch):
    stub_mistral(monkeypatch,401,{'error':'synthetic-secret-in-provider-error'})
    with pytest.raises(ValueError) as error:check_mistral('synthetic-test-key','test-model')
    assert 'HTTP 401' in str(error.value)
    assert 'synthetic' not in str(error.value)


def test_setup_rejects_unavailable_model(monkeypatch):
    stub_mistral(monkeypatch,200,{'data':[{'id':'different-model'}]})
    with pytest.raises(ValueError,match='not available'):check_mistral('synthetic-test-key','test-model')
