"""Report successful cleanup without exposing the private heartbeat URL or data."""
import http.client
import os
import re
import time
import urllib.request


PING_URL = re.compile(
    r'https://hc-ping\.com/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
)
ATTEMPTS = 2
TIMEOUT_SECONDS = 10
RETRY_DELAY_SECONDS = 1


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def send_success(url):
    if not PING_URL.fullmatch(url):
        raise SystemExit('Invalid heartbeat configuration; use the approved HTTPS UUID endpoint.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    for attempt in range(ATTEMPTS):
        try:
            request = urllib.request.Request(
                url, data=b'', method='POST',
                headers={'User-Agent': 'ChangeRoom-Sweep-Heartbeat/1.0'},
            )
            with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
                # Healthchecks can return HTTP 200 with "OK (not found)".
                # Read one extra byte so only the exact success body passes.
                if response.status != 200 or response.geturl() != url or response.read(3) != b'OK':
                    raise ValueError('Unexpected heartbeat response')
            print('Cleanup heartbeat: ok')
            return
        except (OSError, ValueError, http.client.HTTPException):
            # Never print exceptions, response bodies, redirects or the URL.
            if attempt + 1 < ATTEMPTS:
                time.sleep(RETRY_DELAY_SECONDS)
    raise SystemExit('Cleanup heartbeat failed after bounded retries; inspect the monitor configuration.')


def main():
    target = os.environ.get('CHANGEROOM_HEARTBEAT_TARGET', '')
    event = os.environ.get('CHANGEROOM_HEARTBEAT_EVENT', '')
    if target not in ('staging', 'production') or event not in ('workflow_dispatch', 'schedule'):
        raise SystemExit('Heartbeat target/event configuration is required.')
    url = os.environ.get('CHANGEROOM_SWEEP_HEARTBEAT_URL', '')
    if not url:
        if target == 'staging' and event == 'workflow_dispatch':
            print('Cleanup heartbeat: unconfigured manual staging setup; missing-run monitoring is not verified.')
            return
        raise SystemExit('Cleanup heartbeat is required for production and scheduled checks.')
    send_success(url)


if __name__ == '__main__':
    main()
