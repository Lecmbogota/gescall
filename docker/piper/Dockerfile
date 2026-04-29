FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates sox libatomic1 \
    && rm -rf /var/lib/apt/lists/*

ARG PIPER_VERSION=2023.11.14-2
RUN wget -qO /tmp/piper.tgz \
    "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_amd64.tar.gz" \
    && mkdir -p /opt/piper /tmp/piper-extract \
    && tar -xzf /tmp/piper.tgz -C /tmp/piper-extract \
    && if [ -d /tmp/piper-extract/piper ]; then cp -r /tmp/piper-extract/piper/* /opt/piper/; else cp -r /tmp/piper-extract/* /opt/piper/; fi \
    && rm -rf /tmp/piper-extract /tmp/piper.tgz

# Voz por defecto (cambiar con volumen o PIPER_MODEL)
ARG VOICE_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium
RUN mkdir -p /opt/piper/voices \
    && wget -qO /opt/piper/voices/es_ES-sharvard-medium.onnx "${VOICE_BASE}/es_ES-sharvard-medium.onnx" \
    && wget -qO /opt/piper/voices/es_ES-sharvard-medium.onnx.json "${VOICE_BASE}/es_ES-sharvard-medium.onnx.json"

ENV PIPER_BIN=/opt/piper/piper
ENV PIPER_MODEL=/opt/piper/voices/es_ES-sharvard-medium.onnx

WORKDIR /opt/piper
COPY requirements.txt tts_server.py ./
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000
CMD ["uvicorn", "tts_server:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "1"]
