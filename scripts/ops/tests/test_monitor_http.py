"""A protected-preview health check must not leak its bypass to the worker."""
import importlib.util
from pathlib import Path
from unittest.mock import patch
import pytest

spec = importlib.util.spec_from_file_location('monitor_http', Path(__file__).parents[1] / 'monitor_http.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)


class Response:
    status = 200
    def __init__(self, url): self.url = url
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit): return b'healthy'


def test_preview_secret_only_goes_to_app(monkeypatch):
    monkeypatch.setenv('APP_ORIGIN', 'https://preview.example.com')
    monkeypatch.setenv('API_ORIGIN', 'https://worker.example.com')
    monkeypatch.setenv('CHANGEROOM_APP_PROTECTION_BYPASS', 'test-bypass')
    requests = []
    class Opener:
        def open(self, req, timeout):
            requests.append(req)
            return Response(req.full_url)
    with patch.object(monitor.urllib.request, 'build_opener', return_value=Opener()):
        monitor.probe('APP_ORIGIN', '/status', lambda *_: True)
        monitor.probe('API_ORIGIN', '/', lambda *_: True)
    assert requests[0].get_header('X-vercel-protection-bypass') == 'test-bypass'
    assert requests[1].get_header('X-vercel-protection-bypass') is None


def test_redirect_is_not_followed():
    assert monitor.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example') is None


def test_error_does_not_print_secret_or_response(monkeypatch, capsys):
    monkeypatch.setenv('APP_ORIGIN', 'https://preview.example.com')
    with patch.object(monitor.urllib.request, 'build_opener', side_effect=OSError('secret-private-gateway-body')):
        with pytest.raises(SystemExit) as exc:
            monitor.probe('APP_ORIGIN', '/status', lambda *_: True)
    assert 'secret-private' not in str(exc.value)
    assert capsys.readouterr().out == ''
