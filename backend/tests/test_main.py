"""Public HTTP contract, with no calls to paid providers."""
import base64
import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from main import app
from services import auth, tryon_jobs, vton


@pytest.fixture
def signed(monkeypatch):
    monkeypatch.setenv("BACKEND_AUTH_MODE","clerk")
    monkeypatch.setattr(auth,"_verify_clerk_token",AsyncMock(return_value={"sub":"user_test"}))
    return {"Authorization":"Bearer fixture", "X-Request-Id": str(uuid.uuid4())}


def files(image):
    return {"user_image": ("user.heic",image,"image/heic"), "clothing_image":("garment.jpg",image,"image/jpeg")}


def test_health_and_cors(client):
    r=client.get("/",headers={"X-Request-Id":"trace"})
    assert r.status_code==200 and r.headers["x-request-id"]=="trace"
    r=client.options("/api/try-on",headers={"Origin":"https://igetdressed.online",
        "Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"Authorization,X-Request-Id,Content-Type"})
    assert r.status_code==200 and r.headers["access-control-allow-origin"]=="https://igetdressed.online"


@pytest.mark.parametrize("path",["/api/analyze-and-save-clothing","/api/analyze-clothing",
    "/api/preprocess-model-photos","/api/preprocess-clothing"])
def test_public_disk_pipeline_retired(client,path):
    assert client.post(path,data={"output_dir":"/tmp/invalid"}).status_code==410
    assert client.get("/uploads/known.jpg").status_code==404
    assert client.get("/api/read-image-metadata",params={"image_path":"known.jpg"}).status_code==410


def test_direct_replay_does_not_call_provider_again(client, signed, sample_image_bytes,monkeypatch):
    provider=AsyncMock(return_value={"image_url":"data:image/png;base64,"+base64.b64encode(sample_image_bytes).decode()})
    sql=AsyncMock(side_effect=["trial",True,"denied"])
    monkeypatch.setattr(tryon_jobs,"_call",sql)
    monkeypatch.setattr(vton,"generate_try_on",provider)
    r=client.post("/api/try-on",files=files(sample_image_bytes),headers=signed)
    assert r.status_code==200 and r.json()["usedFreeTrial"]
    assert r.json()["image_url"]==f"/api/try-on/jobs/{signed['X-Request-Id']}/result"
    assert len(sql.await_args_list[1].args[1][2]) > 0
    assert client.post("/api/try-on",files=files(sample_image_bytes),headers=signed).status_code==409
    assert provider.await_count==1


def test_unpaid_and_unsafe_requests_do_not_generate(client,signed,sample_image_bytes,monkeypatch):
    provider=AsyncMock()
    sql=AsyncMock(return_value="no_credits")
    monkeypatch.setattr(vton,"generate_try_on",provider)
    monkeypatch.setattr(tryon_jobs,"_call",sql)
    for key in ("clothing_file_urls","clothing_file_url"):
        assert client.post("/api/try-on",files=files(sample_image_bytes),headers=signed,
            data={key:"/uploads/../sentinel"}).status_code==400
    assert client.post("/api/try-on",files=files(sample_image_bytes)).status_code==401
    assert client.post("/api/try-on",files=files(sample_image_bytes),headers=signed).status_code==402
    provider.assert_not_awaited()
    assert sql.await_count==1


@pytest.mark.parametrize("bad",["https://example.invalid/unsafe","data:image/png;base64,bm90YW5pbWFnZQ=="])
def test_failed_result_releases_before_returning(client,signed,sample_image_bytes,monkeypatch,bad):
    sql=AsyncMock(side_effect=["credits",True])
    monkeypatch.setattr(tryon_jobs,"_call",sql)
    monkeypatch.setattr(vton,"generate_try_on",AsyncMock(return_value={"image_url":bad}))
    r=client.post("/api/try-on",files=files(sample_image_bytes),headers=signed)
    assert r.status_code==502 and sql.await_args_list[-1].args[1][-1] is None


def test_oversized_body_and_bounded_file_count(client,signed,sample_image_bytes):
    assert client.post("/api/try-on",headers={**signed,"Content-Length":str(100*1024*1024)}).status_code==413
    uploads=[("clothing_images",("x.jpg",sample_image_bytes,"image/jpeg"))]*6
    uploads.append(("user_image",("subject.png",sample_image_bytes,"image/png")))
    assert client.post("/api/try-on",files=uploads,headers=signed).status_code==400


@pytest.mark.parametrize("mode",["", "typo", "none"])
def test_production_auth_fails_closed(client,sample_image_bytes,monkeypatch,mode):
    monkeypatch.setenv("BACKEND_AUTH_MODE",mode)
    monkeypatch.setenv("RENDER","true")
    assert client.post("/api/try-on",files=files(sample_image_bytes)).status_code in (401,503)


def test_auxiliary_calls_require_completed_job(client,signed,sample_image_bytes,monkeypatch):
    sql=AsyncMock(return_value=False)
    monkeypatch.setattr(tryon_jobs,"_call",sql)
    assert client.post("/api/shop",data={"query":"garment"},headers=signed).status_code==403
    assert client.post("/api/identify-products",files={"clothing_image":("item.jpg",sample_image_bytes,"image/jpeg")},headers=signed).status_code==403
