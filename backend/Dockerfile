# Build from the backend directory (not the monorepo root).
FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ENVIRONMENT=production PORT=8080
WORKDIR /app
COPY requirements.txt /tmp/requirements.txt
# The manylinux pillow-heif wheel carries its native HEIF decoder. Refuse a
# quiet fallback to a source build without its native libraries.
RUN python -m pip install --no-cache-dir --only-binary=Pillow,pillow-heif,psycopg-binary -r /tmp/requirements.txt \
    && groupadd --gid 10001 worker && useradd --uid 10001 --gid worker --no-create-home worker
COPY main.py container_entrypoint.py /app/backend/
COPY services/*.py /app/backend/services/
USER 10001:10001
RUN python -c "import io; from PIL import Image; from backend.main import app, ensure_heif_registered, normalize_image_bytes; assert ensure_heif_registered(); b=io.BytesIO(); Image.new('RGB',(48,64)).save(b,format='HEIF'); assert normalize_image_bytes(b.getvalue())[1:]==('image/jpeg',48,64)"
EXPOSE 8080
ENTRYPOINT ["python", "-m", "backend.container_entrypoint"]
