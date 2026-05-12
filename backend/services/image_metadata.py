import io
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from PIL import Image, PngImagePlugin

try:
    import piexif

    PIEXIF_AVAILABLE = True
except Exception:
    piexif = None  # type: ignore
    PIEXIF_AVAILABLE = False

logger = logging.getLogger(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _json_bytes(metadata: Dict[str, Any]) -> bytes:
    return json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _xmp_packet(metadata: Dict[str, Any]) -> str:
    """
    Store a compact XMP-looking packet in addition to EXIF/UserComment.
    Pillow/piexif do not expose a first-class custom XMP segment writer, so the packet
    is embedded as a metadata value that can be recovered by our readers and external
    DAM tools that inspect textual metadata.
    """
    escaped = (
        json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return (
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description xmlns:changeroom="https://igetdressed.online/ns/metadata/1.0/" '
        f'changeroom:json="{escaped}" />'
        "</rdf:RDF>"
        "</x:xmpmeta>"
    )


def embed_structured_metadata(
    image_bytes: bytes,
    metadata: Dict[str, Any],
    *,
    preferred_format: Optional[str] = None,
) -> bytes:
    """
    Embed structured analysis metadata into JPEG/PNG images.

    JPEG: EXIF ImageDescription + EXIF UserComment + Software marker.
    PNG: textual chunks including the JSON payload, XMP packet, and scalar fields.

    If embedding fails, the original bytes are returned only after logging the failure.
    The caller still receives a valid image and the logs make the loss explicit.
    """
    if not image_bytes:
        raise ValueError("Cannot embed metadata into an empty image")

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image_format = (preferred_format or image.format or "JPEG").upper()
            output = io.BytesIO()
            metadata_payload = {
                **metadata,
                "changeroom:metadataSchema": "https://igetdressed.online/ns/metadata/1.0/",
                "changeroom:embeddedAt": metadata.get("changeroom:embeddedAt") or utc_now_iso(),
            }
            metadata_json = _json_bytes(metadata_payload)
            xmp = _xmp_packet(metadata_payload)

            if image_format in {"JPEG", "JPG"}:
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")

                exif_dict: Dict[str, Any]
                if PIEXIF_AVAILABLE and piexif is not None:
                    try:
                        exif_dict = piexif.load(image_bytes)
                    except Exception:
                        exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}

                    exif_dict.setdefault("0th", {})
                    exif_dict.setdefault("Exif", {})
                    exif_dict["0th"][piexif.ImageIFD.ImageDescription] = metadata_json
                    exif_dict["0th"][piexif.ImageIFD.Software] = b"IGetDressed.Online"
                    exif_dict["Exif"][piexif.ExifIFD.UserComment] = metadata_json
                    # XPComment is UTF-16LE. Keep it short by storing the XMP packet location hint.
                    exif_dict["0th"][piexif.ImageIFD.XPComment] = (
                        "ChangeRoom structured metadata is stored in EXIF UserComment".encode("utf-16le")
                    )
                    exif_bytes = piexif.dump(exif_dict)
                    image.save(output, format="JPEG", quality=95, optimize=True, progressive=True, exif=exif_bytes)
                else:
                    image.save(output, format="JPEG", quality=95, optimize=True, progressive=True)

            elif image_format == "PNG":
                pnginfo = PngImagePlugin.PngInfo()
                pnginfo.add_text("changeroom:metadata", metadata_json.decode("utf-8"))
                pnginfo.add_text("XML:com.adobe.xmp", xmp)
                for key, value in metadata_payload.items():
                    if isinstance(value, (str, int, float, bool)):
                        pnginfo.add_text(str(key), str(value))
                image.save(output, format="PNG", pnginfo=pnginfo, optimize=True)
            else:
                # Normalize uncommon upload formats to JPEG so metadata survives consistently.
                rgb = image.convert("RGB")
                if PIEXIF_AVAILABLE and piexif is not None:
                    exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
                    exif_dict["0th"][piexif.ImageIFD.ImageDescription] = metadata_json
                    exif_dict["0th"][piexif.ImageIFD.Software] = b"IGetDressed.Online"
                    exif_dict["Exif"][piexif.ExifIFD.UserComment] = metadata_json
                    rgb.save(
                        output,
                        format="JPEG",
                        quality=95,
                        optimize=True,
                        progressive=True,
                        exif=piexif.dump(exif_dict),
                    )
                else:
                    rgb.save(output, format="JPEG", quality=95, optimize=True, progressive=True)

            return output.getvalue()
    except Exception as exc:
        logger.error("metadata embedding failed: %s", exc, exc_info=True)
        return image_bytes


def read_structured_metadata_from_bytes(image_bytes: bytes) -> Optional[Dict[str, Any]]:
    if not image_bytes:
        return None

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format == "PNG":
                raw = image.info.get("changeroom:metadata") or image.info.get("clothing_metadata")
                if isinstance(raw, str) and raw.strip():
                    parsed = json.loads(raw)
                    return parsed if isinstance(parsed, dict) else None

            if image.format == "JPEG" and PIEXIF_AVAILABLE and piexif is not None:
                try:
                    exif_dict = piexif.load(image_bytes)
                    for section, tag in (
                        ("Exif", piexif.ExifIFD.UserComment),
                        ("0th", piexif.ImageIFD.ImageDescription),
                    ):
                        raw = exif_dict.get(section, {}).get(tag)
                        if isinstance(raw, bytes):
                            parsed = json.loads(raw.decode("utf-8", errors="ignore"))
                            return parsed if isinstance(parsed, dict) else None
                        if isinstance(raw, str):
                            parsed = json.loads(raw)
                            return parsed if isinstance(parsed, dict) else None
                except Exception:
                    return None
    except Exception:
        return None

    return None
