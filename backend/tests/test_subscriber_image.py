"""Transport fixtures: exercise real HTTP encoding and classification without paid requests."""
import base64
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from main import app
from services import subscriber_image as image


PNG=image.Reference(b"main-person-reference","image/png")
SECOND=image.Reference(b"other-person-reference","image/jpeg")
JACKET=image.Reference(b"yellow-jacket-reference","image/jpeg")
SHOES=image.Reference(b"white-shoes-reference","image/png")
INLINE=base64.b64encode(b'image-bytes').decode()
B64_RESPONSE={"data":[{"b64_json":INLINE}]}
GOOGLE_RESPONSE={"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"done"},{"inlineData":{"mimeType":"image/png","data":INLINE}}]}}]}


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY","fixture-openai")
    monkeypatch.setenv("GEMINI_API_KEY","fixture-google")


def response(code, obj): return httpx.Response(code,json=obj)


async def run(handler):
    meta={"items_wearing_styles":[{"index":0,"wearing_style":"unzipped","prompt_text":"not provider instructions"}],
          "prompt":"untrusted arbitrary prompt"}
    return await image.generate([PNG,SECOND],[JACKET,SHOES],main_index=1,metadata=meta,transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_primary_edit_matches_owner_order_and_privacy():
    calls=[]
    def handler(r):
        calls.append(r)
        assert str(r.url)==image.OPENAI_URL and r.headers['authorization']=='Bearer fixture-openai'
        assert 'x-goog-api-key' not in r.headers and 'multipart/form-data' in r.headers['content-type']
        body=r.content
        assert body.count(b'name="image[]"')==4 and body.index(SECOND.data)<body.index(PNG.data)<body.index(JACKET.data)<body.index(SHOES.data)
        assert b'gpt-image-2.5-sunburst' in body and b'For garment 1, show it unzipped' in body
        assert b'untrusted arbitrary prompt' not in body and b'not provider instructions' not in body
        return response(200,B64_RESPONSE)
    assert await run(handler)=='data:image/jpeg;base64,'+INLINE
    assert len(calls)==1


@pytest.mark.asyncio
@pytest.mark.parametrize("status,code",[(429,"insufficient_quota"),(429,"rate_limit_exceeded"),(503,"service_unavailable"),(500,"server_error")])
async def test_only_one_google_fallback_on_eligible_explicit_error(status,code):
    urls=[]
    def handler(r):
        urls.append(str(r.url))
        if len(urls)==1:return response(status,{"error":{"code":code}})
        assert r.headers['x-goog-api-key']=='fixture-google' and 'authorization' not in r.headers
        body=json.loads(r.content);parts=body['contents'][0]['parts']
        assert [base64.b64decode(p['inlineData']['data']) for p in parts[1:]] == [SECOND.data,PNG.data,JACKET.data,SHOES.data]
        assert 'For garment 1, show it unzipped' in parts[0]['text']
        assert 'safetySettings' not in body and 'tools' not in body
        return response(200,GOOGLE_RESPONSE)
    assert await run(handler)=='data:image/png;base64,'+INLINE
    assert urls==[image.OPENAI_URL,image.GOOGLE_URL]


@pytest.mark.asyncio
@pytest.mark.parametrize("status,err",[
    (400,{"type":"invalid_request_error"}), (401,{"code":"invalid_api_key"}),(403,{"type":"permission_error"}),
    (429,{"type":"unknown"}),(504,{"type":"server_error"}),(503,{"type":"server_error","message":"Content policy block"}),
    (503,{"type":"server_error","code":"unsupported_model"}),(400,{"code":"moderation_blocked"}),(502,{}),(200,{"code":"invalid_request_error"})])
async def test_terminal_error_never_crosses_providers(status,err):
    urls=[]
    def handler(r):
        urls.append(str(r.url));return response(status,{"error":err})
    with pytest.raises(image.GenerationFailed):await run(handler)
    assert urls==[image.OPENAI_URL]


@pytest.mark.asyncio
@pytest.mark.parametrize("error",[httpx.ReadTimeout("late result"),httpx.WriteTimeout("ambiguous upload"),httpx.ReadError("lost response")])
async def test_ambiguous_submission_does_not_generate_twice(error):
    urls=[]
    def handler(r):urls.append(str(r.url));raise error
    with pytest.raises(httpx.TransportError):await run(handler)
    assert urls==[image.OPENAI_URL]


@pytest.mark.asyncio
async def test_no_third_provider_after_google_safety_block():
    calls=[]
    def handler(r):
        calls.append(str(r.url))
        if len(calls)==1: raise httpx.ConnectTimeout('before upload')
        return response(200,{"candidates":[{"finishReason":"IMAGE_SAFETY","content":{"parts":[]}}]})
    with pytest.raises(image.ImageBlocked):await run(handler)
    assert calls==[image.OPENAI_URL,image.GOOGLE_URL]


@pytest.mark.asyncio
async def test_missing_fallback_key_does_not_retry_primary(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False);monkeypatch.delenv('GOOGLE_API_KEY',raising=False)
    calls=[]
    def handler(r):calls.append(str(r.url));return response(429,{"error":{"code":"insufficient_quota"}})
    with pytest.raises(image.GenerationFailed):await run(handler)
    assert calls==[image.OPENAI_URL]


@pytest.mark.asyncio
async def test_no_fetch_of_remote_or_malformed_result():
    urls=[]
    def handler(r):
        urls.append(str(r.url))
        return response(200,{"data":[{"url":"https://invalid.example/secret"}]})
    with pytest.raises(image.GenerationFailed): await run(handler)
    assert urls==[image.OPENAI_URL]


@pytest.mark.parametrize("key",[""," ","your_openai_key_here"])
def test_worker_startup_requires_primary_even_with_google_configured(monkeypatch,key):
    monkeypatch.setenv("OPENAI_API_KEY",key)
    with pytest.raises(RuntimeError,match="Primary image provider"):
        with TestClient(app):pass
