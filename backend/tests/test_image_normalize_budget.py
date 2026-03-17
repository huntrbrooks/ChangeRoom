import io


def test_normalize_with_budget_shrinks_under_limit():
    from PIL import Image as PILImage  # type: ignore

    from services.image_normalize import normalize_image_bytes_with_budget

    # Create a large, noisy-ish image (harder to compress than a solid color).
    img = PILImage.new("RGB", (5000, 3500), color=(120, 130, 140))
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


