"""Capacity guards must run before decode, payment claim, and multipart spooling."""
import asyncio
import base64
import io
import struct
import uuid
import zlib
from unittest.mock import AsyncMock

import httpx
import pytest
from PIL import Image

import main
from services import auth, image_normalize, subscriber_image, tryon_jobs


def oversized_header(width, height):
    # A PNG header is sufficient: rejection must occur before IDAT is decoded.
    def chunk(kind, data):
        return struct.pack('>I', len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00'*5))+chunk(b'IEND',b'')


def test_raw_pixel_limit_rejects_before_decode(monkeypatch):
    transpose=AsyncMock()
    monkeypatch.setattr(image_normalize.ImageOps,'exif_transpose',transpose)
    with pytest.raises(image_normalize.ImagePixelLimitError):
        image_normalize.normalize_image_bytes(oversized_header(6500,8000))
    transpose.assert_not_called()


def test_result_pixel_limit_rejects_before_decode(monkeypatch):
    transpose=AsyncMock()
    monkeypatch.setattr(tryon_jobs.ImageOps,'exif_transpose',transpose)
    value='data:image/png;base64,'+base64.b64encode(oversized_header(2001,2000)).decode()
    with pytest.raises(ValueError,match='image exceeds size limit'):
        tryon_jobs.private_jpeg(value,False)
    transpose.assert_not_called()


def test_expanded_reference_is_bounded_before_retaining_other_uploads():
    image=Image.effect_noise((2200,2200),100).convert('RGBA')
    raw=io.BytesIO();image.save(raw,'PNG')
    reference=subscriber_image.Reference(raw.getvalue(),'image/png')
    budget=subscriber_image.MAX_INPUT_BYTES//10
    assert len(reference.data)>budget
    bounded=subscriber_image.bound_reference(reference,budget)
    assert bounded.mime=='image/jpeg' and len(bounded.data)<=budget
    with Image.open(io.BytesIO(bounded.data)) as result:
        assert result.size==(1250,1250)
    assert subscriber_image.bound_reference(bounded,budget) is bounded


def test_pixel_limit_is_inclusive_and_orientation_is_preserved():
    image=Image.new('RGB',(3000,2000),'red')
    exif=Image.Exif();exif[274]=6
    raw=io.BytesIO();image.save(raw,'JPEG',exif=exif)
    data,mime,width,height=image_normalize.normalize_image_bytes(raw.getvalue())
    assert mime=='image/jpeg' and (width,height)==(1467,2200)
    with Image.open(io.BytesIO(data)) as result:
        assert result.getexif().get(274) is None


def test_oversized_reference_returns_actionable_413_without_charge(client,monkeypatch,sample_image_bytes):
    monkeypatch.setenv('BACKEND_AUTH_MODE','clerk')
    monkeypatch.setattr(auth,'_verify_clerk_token',AsyncMock(return_value={'sub':'capacity_reject'}))
    claim=AsyncMock();provider=AsyncMock()
    monkeypatch.setattr(tryon_jobs,'claim',claim)
    monkeypatch.setattr(subscriber_image,'generate',provider)
    response=client.post('/api/try-on',headers={'Authorization':'Bearer fixture','X-Request-Id':str(uuid.uuid4())},files={
        'user_image':('person.png',oversized_header(6500,8000),'image/png'),
        'clothing_image':('garment.png',sample_image_bytes,'image/png')})
    assert response.status_code==413
    assert '2200 pixels' in response.json()['detail'] and 'No credit or free trial was used' in response.json()['detail']
    claim.assert_not_called();provider.assert_not_called()


@pytest.mark.asyncio
async def test_busy_or_unauthenticated_request_never_reads_multipart(monkeypatch,sample_image_bytes):
    monkeypatch.setenv('BACKEND_AUTH_MODE','clerk')
    monkeypatch.setattr(auth,'_verify_clerk_token',AsyncMock(return_value={'sub':'capacity_admission'}))
    monkeypatch.setattr(main,'_generation_slots',asyncio.Semaphore(1))
    started,release=asyncio.Event(),asyncio.Event()
    normalize=main.read_and_normalize_upload
    async def paused(*args,**kwargs):
        started.set();await release.wait()
        return await normalize(*args,**kwargs)
    monkeypatch.setattr(main,'read_and_normalize_upload',paused)
    sql=AsyncMock(side_effect=['trial',True])
    monkeypatch.setattr(tryon_jobs,'_call',sql)
    monkeypatch.setattr(subscriber_image,'generate',AsyncMock(return_value='data:image/png;base64,'+base64.b64encode(sample_image_bytes).decode()))
    class UnreadBody(httpx.AsyncByteStream):
        reads=0
        async def __aiter__(self):
            self.reads+=1
            yield b'This body must never be parsed.'
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://offline') as client:
        headers={'Authorization':'Bearer fixture','X-Request-Id':str(uuid.uuid4())}
        first=asyncio.create_task(client.post('/api/try-on',headers=headers,files={
            'user_image':('person.png',sample_image_bytes,'image/png'),
            'clothing_image':('garment.png',sample_image_bytes,'image/png')}))
        await asyncio.wait_for(started.wait(),2)
        try:
            for path,authorized,expected in (('/api/try-on',True,429),('/api/try-on',False,401),('/api/identify-products',True,429)):
                body=UnreadBody()
                response=await client.post(path,content=body,headers={
                    **(headers if authorized else {}),'Content-Type':'multipart/form-data; boundary=offline'})
                assert response.status_code==expected and body.reads==0
                assert response.headers['x-changeroom-stack']=='fastapi-worker'
                assert response.headers['x-request-id']==response.headers['x-changeroom-request-id']
                assert response.headers['x-request-id']
                if authorized:
                    assert response.headers['x-request-id']==headers['X-Request-Id']
            sql.assert_not_awaited()
        finally:
            release.set()
        assert (await first).status_code==200
    assert sql.await_count==2 and main._generation_slots._value==1
    assert sql.await_args_list[0].args[1][1]=='capacity_admission'
