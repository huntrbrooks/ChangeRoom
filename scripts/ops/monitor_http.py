"""Non-billable probes. Require the expected page/stack, not merely HTTP 200."""
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def probe(name, path, expected):
    base = os.environ[name].rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment or parsed.path:
        raise ValueError(f'{name} must be an HTTPS origin without credentials')
    try:
        with urllib.request.urlopen(urllib.request.Request(base + path, headers={'User-Agent': 'ChangeRoom-Availability/1.0'}), timeout=15) as res:
            if urlsplit(res.url).hostname != parsed.hostname:
                raise ValueError('unexpected redirect')
            body = res.read(256_000)
            if not expected(res, body):
                raise ValueError('unexpected content or stack')
    except (OSError,ValueError) as exc:
        # Never dump a gateway body, signed redirect or auth/login HTML.
        raise SystemExit(f'{name}: health check failed ({type(exc).__name__}, status={getattr(exc,"code",None)})') from None
    print(f'{name}: ok')


probe('APP_ORIGIN', '/status', lambda _, b: b'Service availability' in b and b'Manage billing' in b)
probe('API_ORIGIN', '/', lambda r, b: r.headers.get('X-ChangeRoom-Stack') == 'fastapi-render' and 'IGetDressed.Online API' in json.loads(b).get('message',''))
