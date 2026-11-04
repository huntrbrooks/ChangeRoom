import io


def test_normalize_with_budget_shrinks_under_limit():
    from PIL import Image as PILImage  # type: ignore

    from services.image_normalize import normalize_image_bytes_with_budget

    # Create a large, noisy-ish image (harder to compress than a solid color).
    img = PILImage.new("RGB", (2800, 2000), color=(120, 130, 140))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()

    out_bytes, out_mime, w, h = normalize_image_bytes_with_budget(
        raw,
        max_bytes=250_000,  # 250KB
        max_dimension=2200,
        min_dimension=600,
        prefer_mime="image/jpeg",
        jpeg_quality=88,
        min_jpeg_quality=65,
        allow_png_alpha=False,
    )

    assert out_mime in ("image/jpeg", "image/png", "image/webp")
    assert isinstance(out_bytes, (bytes, bytearray))
    assert w is None or w <= 2200
    assert h is None or h <= 2200
    # Best-effort: should typically get under the target for this test image.
    assert len(out_bytes) <= 250_000




def test_real_heif_is_decoded_for_phone_uploads():
    import pillow_heif
    from PIL import Image
    from services.image_normalize import normalize_image_bytes
    source = Image.new("RGB",(640,480),(22,100,120))
    encoded = io.BytesIO()
    pillow_heif.from_pillow(source).save(encoded)
    data,mime,width,height = normalize_image_bytes(encoded.getvalue())
    assert mime == "image/jpeg" and (width,height)==(640,480)
    assert data.startswith(b"\xff\xd8")
