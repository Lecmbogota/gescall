#!/usr/bin/env python3
"""
Piper TTS HTTP API compatible con GesCall (POST /tts JSON: text, format wav|sln).
No devuelve 503 por "cola llena": usa semáforo y espera turno (evita rechazar tráfico bajo carga).
"""
import asyncio
import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel, Field

PIPER_BIN = os.environ.get("PIPER_BIN", "/opt/piper/piper")
MODEL = os.environ.get(
    "PIPER_MODEL",
    "/opt/piper/voices/es_MX-claude-high.onnx",
)
# Concurrencia de síntesis; subir si hay CPU/RAM (cada piper es pesado).
MAX_CONCURRENT = max(1, int(os.environ.get("TTS_MAX_CONCURRENT", "4")))
REQUEST_TIMEOUT = int(os.environ.get("TTS_REQUEST_TIMEOUT_SEC", "120"))

_sem = asyncio.Semaphore(MAX_CONCURRENT)
app = FastAPI(title="GesCall Piper TTS")


class TtsBody(BaseModel):
    text: str = ""
    format: str = Field(default="wav", description="wav o sln (PCM 8k mono para Asterisk)")


def _run_piper_to_wav(text: str) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out_path = f.name
    try:
        r = subprocess.run(
            [PIPER_BIN, "--model", MODEL, "--output_file", out_path],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=REQUEST_TIMEOUT,
            check=False,
        )
        if r.returncode != 0:
            err = (r.stderr or b"").decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"piper exit {r.returncode}: {err}")
        return Path(out_path).read_bytes()
    finally:
        Path(out_path).unlink(missing_ok=True)


def _wav_to_sln(wav: bytes) -> bytes:
    r = subprocess.run(
        [
            "sox",
            "-t",
            "wav",
            "-",
            "-t",
            "raw",
            "-r",
            "8000",
            "-e",
            "signed-integer",
            "-b",
            "16",
            "-c",
            "1",
            "-",
        ],
        input=wav,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if r.returncode != 0:
        err = (r.stderr or b"").decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"sox failed: {err}")
    return r.stdout


@app.get("/health")
async def health():
    ok = Path(PIPER_BIN).is_file() and Path(MODEL).is_file()
    return {"status": "ok" if ok else "degraded", "piper": PIPER_BIN, "model": MODEL}


@app.post("/tts")
async def tts(body: TtsBody):
    text = body.text.strip()
    if not text:
        return Response(status_code=400, content=b'{"error":"missing text"}')

    fmt = body.format.lower()
    if fmt not in ("wav", "sln"):
        return Response(status_code=400, content=b'{"error":"format must be wav or sln"}')

    async with _sem:
        try:
            wav = await asyncio.to_thread(_run_piper_to_wav, text)
        except subprocess.TimeoutExpired:
            return Response(status_code=504, content=b'{"error":"piper timeout"}')
        except Exception as e:
            return Response(
                status_code=500,
                content=str(e).encode("utf-8"),
                media_type="text/plain",
            )

    if not wav:
        return Response(status_code=500, content=b"empty audio")

    if fmt == "sln":
        try:
            sln = await asyncio.to_thread(_wav_to_sln, wav)
        except Exception as e:
            return Response(
                status_code=500,
                content=str(e).encode("utf-8"),
                media_type="text/plain",
            )
        return Response(content=sln, media_type="application/octet-stream")

    return Response(content=wav, media_type="audio/wav")
