import io
import logging
from typing import Optional, Tuple

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)


def _try_register_heif() -> bool:
    """
    Try to enable HEIC/HEIF decoding in Pillow via pillow-heif.
    This is optional at runtime; if not installed, HEIC/HEIF will not be decodable server-side.
    """
    try:
        import pillow_heif  # type: ignore

        pillow_heif.register_heif_opener()  # type: ignore
        return True
    except Exception:
        return False


_HEIF_REGISTERED: Optional[bool] = None


def ensure_heif_registered() -> bool:
    global _HEIF_REGISTERED
    if _HEIF_REGISTERED is None:
        _HEIF_REGISTERED = _try_register_heif()
        if _HEIF_REGISTERED:
            logger.info("pillow-heif enabled: HEIC/HEIF decoding available")
        else:
            logger.info("pillow-heif not available: HEIC/HEIF decoding NOT available")
    return bool(_HEIF_REGISTERED)


def normalize_image_bytes(
    image_bytes: bytes,
    *,
    max_dimension: int = 2200,
    prefer_mime: str = "image/jpeg",
    jpeg_quality: int = 90,
    allow_png_alpha: bool = True,
) -> Tuple[bytes, str, Optional[int], Optional[int]]:
    """
    Decode an image, apply EXIF orientation, optionally downscale to max_dimension (longest side),
    and re-encode to a predictable format (JPEG by default; PNG when alpha is present).

    Returns: (normalized_bytes, mime_type, width, height)
    """
    if not image_bytes:
        raise ValueError("Empty image")

    # Enable HEIC/HEIF decoding if possible (no-op if not installed)
    ensure_heif_registered()

    with Image.open(io.BytesIO(image_bytes)) as im:
        im = ImageOps.exif_transpose(im)

        width, height = im.size if im and hasattr(im, "size") else (None, None)

        # Downscale (keep aspect ratio) to reduce request payload size to Gemini/OpenAI.
        try:
            w = int(width) if width is not None else 0
            h = int(height) if height is not None else 0
            longest = max(w, h)
            if longest and longest > max_dimension:
                scale = max_dimension / float(longest)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                im = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
                width, height = im.size
        except Exception:
            # If resize fails for any reason, continue with original decoded image.
            pass

        # Decide output format
        has_alpha = False
        try:
            has_alpha = im.mode in ("RGBA", "LA") or (
                im.mode == "P" and "transparency" in (im.info or {})
            )
        except Exception:
            has_alpha = False

        out = io.BytesIO()
        if has_alpha and allow_png_alpha:
            out_mime = "image/png"
            im.save(out, format="PNG", optimize=True)
        else:
            out_mime = prefer_mime if prefer_mime in ("image/jpeg", "image/webp") else "image/jpeg"
            if out_mime == "image/webp":
                rgb = im.convert("RGB")
                rgb.save(out, format="WEBP", quality=jpeg_quality, method=6)
            else:
                # If alpha is present but we don't allow PNG, flatten onto white.
                if has_alpha and im.mode in ("RGBA", "LA"):
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    bg.paste(im, mask=im.split()[-1])
                    rgb = bg
                else:
                    rgb = im.convert("RGB")
                rgb.save(out, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)

        return out.getvalue(), out_mime, width, height


def normalize_image_bytes_with_budget(
    image_bytes: bytes,
    *,
    max_bytes: int,
    max_dimension: int = 2200,
    min_dimension: int = 900,
    prefer_mime: str = "image/jpeg",
    jpeg_quality: int = 88,
    min_jpeg_quality: int = 70,
    allow_png_alpha: bool = False,
) -> Tuple[bytes, str, Optional[int], Optional[int]]:
    """
    Normalize an image and ensure the output stays <= max_bytes by progressively
    downscaling and reducing quality (best-effort).

    This is ideal for model calls (OpenAI vision / Gemini) to avoid timeouts and oversized payloads,
    especially from iPhone photos/screenshots.
    """
    if max_bytes <= 0:
        raise ValueError("max_bytes must be > 0")

    dim = max_dimension
    q = jpeg_quality

    best_bytes: Optional[bytes] = None
    best_mime: str = "image/jpeg"
    best_w: Optional[int] = None
    best_h: Optional[int] = None

    for _ in range(8):
        out_bytes, out_mime, w, h = normalize_image_bytes(
            image_bytes,
            max_dimension=dim,
            prefer_mime=prefer_mime,
            jpeg_quality=q,
            allow_png_alpha=allow_png_alpha,
        )

        best_bytes, best_mime, best_w, best_h = out_bytes, out_mime, w, h
        if len(out_bytes) <= max_bytes:
            return out_bytes, out_mime, w, h

        # Tighten knobs
        dim = max(min_dimension, int(dim * 0.85))
        q = max(min_jpeg_quality, q - 6)

        if dim == min_dimension and q == min_jpeg_quality:
            break

    # Best-effort fallback (may exceed max_bytes)
    return best_bytes or image_bytes, best_mime, best_w, best_h


