"""Missing-run monitoring must fail safely without sending secrets elsewhere."""
import http.client
import importlib.util
from pathlib import Path
from unittest.mock import Mock
import urllib.error
import urllib.request

import pytest

spec = importlib.util.spec_from_file_location('heartbeat', Path(__file__).parents[1] / 'heartbeat.py')
heartbeat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(heartbeat)

URL = 'https://hc-ping.com/11111111-2222-3333-4444-555555555555'


class Response:
    def __init__(self, body=b'OK', status=200, url=URL):
        self.body, self.status, self.url = body, status, url
        self.read_limit = None

    def __enter__(self): return self
    def __exit__(self, *args): pass
    def geturl(self): return self.url

    def read(self, limit):
        self.read_limit = limit
        return self.body[:limit]


@pytest.fixture
def network(monkeypatch):
    opener = Mock()
    opener.open.return_value = Response()
    builder = Mock(return_value=opener)
    monkeypatch.setattr(heartbeat.urllib.request, 'build_opener', builder)
    sleeper = Mock()
    monkeypatch.setattr(heartbeat.time, 'sleep', sleeper)
    return opener, builder, sleeper


def test_success_sends_only_empty_post_and_no_sensitive_output(network, capsys, monkeypatch):
    monkeypatch.setenv('CHANGEROOM_SWEEP_DSN', 'private-database-secret')
    opener, builder, sleeper = network
    heartbeat.send_success(URL)
    request = opener.open.call_args.args[0]
    assert request.full_url == URL
    assert request.get_method() == 'POST'
    assert request.data == b''
    assert request.header_items() == [('User-agent', 'ChangeRoom-Sweep-Heartbeat/1.0')]
    assert opener.open.call_args.kwargs == {'timeout': 10}
    assert opener.open.return_value.read_limit == 3
    assert capsys.readouterr().out == 'Cleanup heartbeat: ok\n'
    assert opener.open.call_count == 1
    sleeper.assert_not_called()
    handlers = builder.call_args.args
    assert isinstance(handlers[0], urllib.request.ProxyHandler) and handlers[0].proxies == {}
    assert isinstance(handlers[1], heartbeat.NoRedirect)


@pytest.mark.parametrize('url', [
    '', URL.replace('https:', 'http:'), URL.replace('hc-ping.com', 'hc-ping.com.evil.invalid'),
    URL.replace('hc-ping.com', 'other.invalid'), URL.replace('hc-ping.com', '127.0.0.1'),
    URL.replace('hc-ping.com', 'secret@hc-ping.com'), URL.replace('hc-ping.com', 'hc-ping.com:443'),
    URL + '/fail', URL + '/', URL + '?token=private', URL + '#private',
    URL + '\n', ' ' + URL, URL.replace('https://', 'https://\n'),
    'https://hc-ping.com/invalid', 'https://hc-ping.com/%31' + URL.split('/')[-1][1:],
])
def test_unapproved_url_never_uses_network(url, network, capsys):
    with pytest.raises(SystemExit) as error:
        heartbeat.send_success(url)
    network[1].assert_not_called()
    assert str(error.value) == 'Invalid heartbeat configuration; use the approved HTTPS UUID endpoint.'
    assert capsys.readouterr() == ('', '')


@pytest.mark.parametrize('status,body,url', [
    (200, b'OK (not found)', URL), (200, b'OK (rate limited)', URL),
    (200, b'OK\n', URL), (200, b'', URL), (201, b'OK', URL),
    (302, b'OK', URL), (503, b'private response body', URL),
    (200, b'OK', 'https://other.invalid/private-redirect'),
])
def test_non_success_is_bounded_and_response_never_emitted(status, body, url, network, capsys):
    opener, _, sleeper = network
    opener.open.side_effect = [Response(body, status, url), Response(body, status, url)]
    with pytest.raises(SystemExit) as error:
        heartbeat.send_success(URL)
    assert str(error.value) == 'Cleanup heartbeat failed after bounded retries; inspect the monitor configuration.'
    assert opener.open.call_count == 2
    sleeper.assert_called_once_with(1)
    assert capsys.readouterr() == ('', '')


@pytest.mark.parametrize('failure', [
    TimeoutError('private-url'), urllib.error.URLError(URL),
    urllib.error.HTTPError(URL, 503, 'private-body', {}, None),
    http.client.BadStatusLine('private-body'),
])
def test_network_failure_can_retry_and_recover_without_leak(failure, network, capsys):
    opener, _, sleeper = network
    opener.open.side_effect = [failure, Response()]
    heartbeat.send_success(URL)
    assert opener.open.call_count == 2
    sleeper.assert_called_once_with(1)
    assert capsys.readouterr().out == 'Cleanup heartbeat: ok\n'


def test_exhausted_connection_errors_do_not_expose_private_exception(network, capsys):
    opener, _, _ = network
    opener.open.side_effect = urllib.error.URLError(URL + '?private-body')
    with pytest.raises(SystemExit) as error:
        heartbeat.send_success(URL)
    assert URL not in str(error.value) and 'private-body' not in str(error.value)
    assert opener.open.call_count == 2
    assert capsys.readouterr() == ('', '')


def test_response_read_failure_is_safely_retried(network, capsys):
    bad = Response()
    bad.read = Mock(side_effect=http.client.IncompleteRead(b'private-response'))
    network[0].open.side_effect = [bad, Response()]
    heartbeat.send_success(URL)
    assert capsys.readouterr().out == 'Cleanup heartbeat: ok\n'


def test_redirect_handler_never_builds_followup_request():
    handler = heartbeat.NoRedirect()
    for code in (301, 302, 303, 307, 308):
        assert handler.redirect_request(None, None, code, 'private-url', {}, 'https://other.invalid') is None


@pytest.mark.parametrize('target,event,allowed', [
    ('staging', 'workflow_dispatch', True), ('staging', 'schedule', False),
    ('production', 'workflow_dispatch', False), ('production', 'schedule', False),
    ('', 'workflow_dispatch', False), ('production', '', False), ('production', 'pull_request', False),
])
def test_missing_heartbeat_fails_except_explicit_manual_staging_setup(target, event, allowed, monkeypatch, network, capsys):
    monkeypatch.setenv('CHANGEROOM_HEARTBEAT_TARGET', target)
    monkeypatch.setenv('CHANGEROOM_HEARTBEAT_EVENT', event)
    monkeypatch.delenv('CHANGEROOM_SWEEP_HEARTBEAT_URL', raising=False)
    if allowed:
        heartbeat.main()
        assert 'missing-run monitoring is not verified' in capsys.readouterr().out
    else:
        with pytest.raises(SystemExit): heartbeat.main()
        assert capsys.readouterr() == ('', '')
    network[1].assert_not_called()


def test_configured_staging_is_not_exempt_from_validation(monkeypatch, network):
    monkeypatch.setenv('CHANGEROOM_HEARTBEAT_TARGET', 'staging')
    monkeypatch.setenv('CHANGEROOM_HEARTBEAT_EVENT', 'workflow_dispatch')
    monkeypatch.setenv('CHANGEROOM_SWEEP_HEARTBEAT_URL', URL + '/fail')
    with pytest.raises(SystemExit): heartbeat.main()
    network[1].assert_not_called()


def test_configured_production_sends_success(monkeypatch, network):
    monkeypatch.setenv('CHANGEROOM_HEARTBEAT_TARGET', 'production')
    monkeypatch.setenv('CHANGEROOM_HEARTBEAT_EVENT', 'schedule')
    monkeypatch.setenv('CHANGEROOM_SWEEP_HEARTBEAT_URL', URL)
    heartbeat.main()
    assert network[0].open.call_count == 1
