"""Non-billable probes. Require the expected page/stack, not merely HTTP 200."""
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def probe(name, path, expected):
    base = os.environ[name].rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment or parsed.path:
        raise ValueError(f'{name} must be an HTTPS origin without credentials')
    try:
        opener = urllib.request.build_opener(NoRedirect)
        headers = {'User-Agent': 'ChangeRoom-Availability/1.0'}
        # Only the protected staging storefront needs this. Never forward this
        # credential to the separate worker, and never follow a redirect.
        bypass = os.environ.get('CHANGEROOM_APP_PROTECTION_BYPASS', '')
        if name == 'APP_ORIGIN' and bypass:
            headers['x-vercel-protection-bypass'] = bypass
        with opener.open(urllib.request.Request(base + path, headers=headers), timeout=15) as res:
            if res.status != 200 or res.url != base + path:
                raise ValueError('unexpected redirect')
            body = res.read(256_000)
            if not expected(res, body):
                raise ValueError('unexpected content or stack')
    except (OSError,ValueError) as exc:
        # Never dump a gateway body, signed redirect or auth/login HTML.
        raise SystemExit(f'{name}: health check failed ({type(exc).__name__}, status={getattr(exc,"code",None)})') from None
    print(f'{name}: ok')


def worker_liveness(response, body):
    mime = response.headers.get('Content-Type', '').partition(';')[0].strip().lower()
    stack = response.headers.get('X-ChangeRoom-Stack')
    if mime != 'application/json' or stack not in {'fastapi-worker', 'fastapi-render'}:
        return False
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeError):
        return False
    return isinstance(payload, dict) and payload.get('message') == 'IGetDressed.Online API is running'


if __name__ == '__main__':
    probe('APP_ORIGIN', '/status', lambda _, b: b'Service availability' in b and b'Manage billing' in b)
    probe('API_ORIGIN', '/', worker_liveness)
