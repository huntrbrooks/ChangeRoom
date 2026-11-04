"""Delivered previews retain a safe AI-edit label, never source metadata."""
import base64
import io
import random
import xml.etree.ElementTree as ET

import piexif
import pytest
from PIL import Image

from services.tryon_jobs import private_jpeg


SOURCE_TYPE = (
    "http://cv.iptc.org/newscodes/digitalsourcetype/"
    "compositeWithTrainedAlgorithmicMedia"
)
SOURCE_TAG = "{http://iptc.org/std/Iptc4xmpExt/2008-02-29/}DigitalSourceType"


def inline_image(image, format="PNG", **kwargs):
    raw = io.BytesIO()
    image.save(raw, format, **kwargs)
    return f"data:image/{format.lower()};base64," + base64.b64encode(raw.getvalue()).decode()


def assert_ai_edit_label(image):
    # Parse the delivered XMP as a consumer would; do not import the writer's bytes.
    root = ET.fromstring(image.info["xmp"])
    source_types = root.findall(f".//{SOURCE_TAG}")
    assert len(source_types) == 1
    assert source_types[0].text == SOURCE_TYPE


@pytest.mark.parametrize("trial", [False, True])
@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
def test_delivered_jpeg_has_ai_edit_label_for_paid_and_trial(trial, format):
    value = inline_image(Image.new("RGB", (640, 480), "white"), format)
    result = private_jpeg(value, trial)
    assert len(result) <= 2_500_000
    with Image.open(io.BytesIO(result)) as image:
        image.load()
        assert image.format == "JPEG" and image.size == (640, 480)
        assert_ai_edit_label(image)
        # Existing trial strip remains; paid images receive no visible watermark.
        bottom_right = image.getpixel((630, 470))
        assert all(channel < 60 if trial else channel > 240 for channel in bottom_right)


@pytest.mark.parametrize("trial", [False, True])
def test_private_source_metadata_is_removed_and_orientation_preserved(trial):
    exif = piexif.dump({
        "0th": {
            piexif.ImageIFD.Orientation: 6,
            piexif.ImageIFD.Artist: b"PRIVATE SOURCE PERSON",
        },
        "Exif": {piexif.ExifIFD.UserComment: b"PRIVATE SOURCE PROMPT"},
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"S",
            piexif.GPSIFD.GPSLatitude: ((37, 1), (48, 1), (0, 1)),
            piexif.GPSIFD.GPSLongitudeRef: b"E",
            piexif.GPSIFD.GPSLongitude: ((144, 1), (58, 1), (0, 1)),
        },
    })
    value = inline_image(
        Image.new("RGB", (640, 480), "white"), "JPEG",
        exif=exif, comment=b"PRIVATE SOURCE COMMENT",
        icc_profile=b"PRIVATE SOURCE ICC",
        xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/">PRIVATE SOURCE XMP</x:xmpmeta>',
    )
    source_bytes = base64.b64decode(value.partition(",")[2])
    with Image.open(io.BytesIO(source_bytes)) as source:
        assert source.getexif().get(34853) is not None  # The fixture really has GPS.
        assert source.info["comment"] == b"PRIVATE SOURCE COMMENT"
        assert "xmp" in source.info and "icc_profile" in source.info

    result = private_jpeg(value, trial)
    assert b"PRIVATE SOURCE" not in result
    with Image.open(io.BytesIO(result)) as image:
        image.load()
        assert image.size == (480, 640)
        assert not image.getexif()
        assert "comment" not in image.info and "icc_profile" not in image.info
        assert_ai_edit_label(image)


def test_label_is_included_in_delivery_size_budget_after_resize():
    # A noisy result exercises recompression rather than only a tiny solid fixture.
    source = Image.frombytes("RGB", (2000, 2000), random.Random(0).randbytes(12_000_000))
    result = private_jpeg(inline_image(source), False)
    assert len(result) <= 2_500_000
    with Image.open(io.BytesIO(result)) as image:
        image.load()
        assert image.size == (1800, 1800)
        assert_ai_edit_label(image)
