"""Integration: set TRYON_TEST_DB_URL to a disposable *loopback* database named jobs_test.
Uses the actual schema, PL/pgSQL state machine, concurrent connections and generated IDs.
"""
import concurrent.futures
import os
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest

dsn = os.getenv("TRYON_TEST_DB_URL")
pytestmark = pytest.mark.skipif(not dsn, reason="needs disposable PostgreSQL jobs_test")


@pytest.fixture
def pg():
    import psycopg
    target=urlparse(dsn)
    assert target.hostname in ("localhost","127.0.0.1","::1") and target.path=="/jobs_test"
    def query(stmt,params=()):
        with psycopg.connect(dsn) as c:
            res=c.execute(stmt,params)
            return res.fetchone()[0] if res.description else None
    root=Path(__file__).resolve().parents[2]
    with psycopg.connect(dsn) as c:
        c.execute((root/"database/schema.sql").read_text())
        c.execute((root/"database/migration_tryon_jobs.sql").read_text())
    return query


def create(pg,credits=4,trials=2,eligible=True):
    user="t_"+uuid.uuid4().hex
    pg("INSERT INTO users_billing(user_id,credits_available,trials_remaining) VALUES(%s,%s,%s)",(user,credits,trials))
    return user,issue(pg,user,eligible and trials>0)


def issue(pg,user,eligible):
    return pg("INSERT INTO tryon_jobs(user_id,trial_eligible,privileged) VALUES (%s,%s,false) RETURNING id",(user,eligible))


def claim(pg,j,u): return pg("SELECT tryon_claim(%s,%s)",(j,u))
def settle(pg,j,u,data): return pg("SELECT tryon_settle(%s,%s,%s)",(j,u,data))


def test_pack_before_trial_and_exactly_once_concurrent_settlement(pg):
    u,j=create(pg)
    assert claim(pg,j,u+'other')=="denied"
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        claims=list(pool.map(lambda _:claim(pg,j,u),range(6)))
    assert claims.count("trial")==1 and claims.count("denied")==5
    assert pg("SELECT credits_available FROM users_billing WHERE user_id=%s",(u,))==4
    assert pg("SELECT trials_remaining FROM users_billing WHERE user_id=%s",(u,))==1
    assert settle(pg,j,u,None) and settle(pg,j,u,None)
    assert pg("SELECT trials_remaining FROM users_billing WHERE user_id=%s",(u,))==2
    assert not settle(pg,j,u,b'already-refunded')
    new=issue(pg,u,True)
    assert claim(pg,new,u)=="trial" and settle(pg,new,u,b'result') and settle(pg,new,u,b'result')
    assert not settle(pg,new,u,None)
    assert pg("SELECT credits_available FROM users_billing WHERE user_id=%s",(u,))==4


def test_concurrent_last_credit_recovery_and_frozen_expiry(pg):
    u,j=create(pg,credits=1,trials=0)
    second=issue(pg,u,False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(lambda id:claim(pg,id,u),[j,second]))
    assert sorted(outcomes)==["credits","no_credits"]
    active=[j,second][outcomes.index('credits')]
    pg("UPDATE tryon_jobs SET updated_at=now()-interval '16 minutes' WHERE id=%s",(active,))
    pg("SELECT tryon_sweep()")
    assert not settle(pg,active,u,b'late-result')
    assert pg("SELECT credits_available FROM users_billing WHERE user_id=%s",(u,))==1
    assert pg("SELECT sum(credits_change) FROM credit_ledger_entries WHERE user_id=%s",(u,))==0
    fresh=issue(pg,u,False)
    pg("UPDATE users_billing SET is_frozen=true WHERE user_id=%s",(u,))
    assert claim(pg,fresh,u)=="frozen"
    pg("UPDATE tryon_jobs SET created_at=now()-interval '6 minutes' WHERE id=%s",(fresh,))
    assert claim(pg,fresh,u)=="denied"


def test_private_paid_delivery_credits_auxiliary_expiry_and_ledger(pg):
    u,j=create(pg,credits=2,trials=0)
    assert claim(pg,j,u)=="credits"
    assert not settle(pg,j,u+"other",b'wrong-owner')
    assert settle(pg,j,u,b'jpeg')
    for kind in ("identify","shop"):
        assert not pg("SELECT tryon_extra(%s,%s,%s)",(j,u+"other",kind))
        assert pg("SELECT tryon_extra(%s,%s,%s)",(j,u,kind))
        assert not pg("SELECT tryon_extra(%s,%s,%s)",(j,u,kind))
    assert pg("SELECT sum(credits_change) FROM credit_ledger_entries WHERE user_id=%s",(u,))==-1
    pg("UPDATE tryon_jobs SET updated_at=now()-interval '25 hours' WHERE id=%s",(j,))
    pg("SELECT tryon_sweep()")
    assert pg("SELECT result_bytes IS NULL FROM tryon_jobs WHERE id=%s",(j,))


def test_http_to_postgres_reopens_offline_without_second_provider_call(pg,client,sample_image_bytes,monkeypatch):
    """Run the actual async worker connection over TCP against an isolated DB."""
    import base64
    from unittest.mock import AsyncMock
    from services import auth,vton
    u,j=create(pg,credits=5,trials=1)
    monkeypatch.setenv("TRYON_DATABASE_URL",dsn)
    monkeypatch.setenv("BACKEND_AUTH_MODE","clerk")
    monkeypatch.setattr(auth,"_verify_clerk_token",AsyncMock(return_value={"sub":u}))
    provider=AsyncMock(return_value={"image_url":"data:image/png;base64,"+base64.b64encode(sample_image_bytes).decode()})
    monkeypatch.setattr(vton,"generate_try_on",provider)
    upload={"user_image":("person.png",sample_image_bytes,"image/png"),"clothing_image":("item.png",sample_image_bytes,"image/png")}
    opts={"files":upload,"headers":{"Authorization":"Bearer fixture","X-Request-Id":str(j)}}
    assert client.post("/api/try-on",**opts).status_code==200
    assert client.post("/api/try-on",**opts).status_code==409
    assert provider.await_count==1
    assert pg("SELECT octet_length(result_bytes)>500 FROM tryon_jobs WHERE id=%s AND user_id=%s AND state='succeeded'",(j,u))
    assert pg("SELECT credits_available FROM users_billing WHERE user_id=%s",(u,))==5


def test_render_role_can_consume_but_cannot_issue_or_browse_job_table(pg):
    import psycopg
    from psycopg import sql
    role="worker_test_"+uuid.uuid4().hex
    u,j=create(pg,trials=0)
    # The temporary role and its permissions are rolled back, including on failure.
    c=psycopg.connect(dsn)
    try:
        c.execute(sql.SQL("CREATE ROLE {}").format(sql.Identifier(role)))
        c.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(role)))
        c.execute(sql.SQL("GRANT EXECUTE ON FUNCTION tryon_claim(uuid,text),tryon_settle(uuid,text,bytea),tryon_extra(uuid,text,text) TO {}").format(sql.Identifier(role)))
        c.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
        assert c.execute("SELECT tryon_claim(%s,%s)",(j,u)).fetchone()==("credits",)
        for verb in ("SELECT","INSERT","UPDATE","DELETE"):
            assert c.execute("SELECT has_table_privilege(current_user,'public.tryon_jobs',%s)",(verb,)).fetchone()==(False,)
        assert not c.execute("SELECT has_function_privilege(current_user,'public.tryon_sweep()','EXECUTE')").fetchone()[0]
    finally:
        c.rollback()
        c.close()


def test_two_free_quotes_cannot_silently_consume_paid_pack(pg):
    u,j=create(pg,credits=5,trials=1)
    same_quote=issue(pg,u,True)
    assert claim(pg,j,u)=="trial"
    assert claim(pg,same_quote,u)=="trial_unavailable"
    assert pg("SELECT credits_available FROM users_billing WHERE user_id=%s",(u,))==5
