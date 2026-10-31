FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including SUMO if available
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    sumo \
    sumo-tools \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY packages/ /app/packages/
COPY services/ /app/services/
COPY db/ /app/db/
COPY sumo/ /app/sumo/
COPY apps/api/ /app/apps/api/

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
