# Build from the backend directory (not the monorepo root).
FROM python:3.11-slim-bookworm@sha256:94a8fee35252d06ab75856f15f12c7bae67b10e8a6da93c7fded82b2610926cd
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ENVIRONMENT=production PORT=8080
WORKDIR /app
COPY requirements.lock /tmp/requirements.lock
# The manylinux pillow-heif wheel carries its native HEIF decoder. Refuse a
# quiet fallback to a source build without its native libraries.
RUN python -m pip install --no-cache-dir --only-binary=Pillow,pillow-heif,psycopg-binary -r /tmp/requirements.lock \
    && python -m pip check \
    && python -m pip uninstall --yes pip setuptools wheel \
    && groupadd --gid 10001 worker && useradd --uid 10001 --gid worker --no-create-home worker
COPY main.py container_entrypoint.py /app/backend/
COPY services/*.py /app/backend/services/
USER 10001:10001
RUN python -c "import io; from PIL import Image; from backend.main import app, ensure_heif_registered, normalize_image_bytes; assert ensure_heif_registered(); b=io.BytesIO(); Image.new('RGB',(48,64)).save(b,format='HEIF'); assert normalize_image_bytes(b.getvalue())[1:]==('image/jpeg',48,64)"
EXPOSE 8080
ENTRYPOINT ["python", "-m", "backend.container_entrypoint"]
