"""Keep FastAPI CI deterministic. Never let a test contact a real external provider."""
import ipaddress
import os
from pathlib import Path
import socket
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex


def check(address):
    if isinstance(address, tuple):
        host = address[0]
        if host != 'localhost':
            try:
                local = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = False
            if not local:
                raise OSError('External network disabled in ChangeRoom backend CI')


def connect(sock, address):
    check(address)
    return original_connect(sock, address)


def connect_ex(sock, address):
    check(address)
    return original_connect_ex(sock, address)


if __name__ == '__main__':
    os.chdir(ROOT / 'backend')
    socket.socket.connect, socket.socket.connect_ex = connect, connect_ex
    sys.exit(pytest.main(['-q', *sys.argv[1:]]))
