"""
GPU Inference Client for Skyie Studio VPS Backend.

Provides an async HTTP client (httpx) that the VPS backend uses to
communicate with the RunPod GPU inference server.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)


class GPUClientError(Exception):
    """Raised when a GPU server request fails."""

    def __init__(self, message: str, status_code: int | None = None, detail: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


class GPUClient:
    """
    Async HTTP client for the remote GPU inference server.

    Usage::

        client = GPUClient()
        result = await client.infer(
            endpoint="/infer/tts",
            params={"text": "Hello world", "voice": "default"},
            output_path=Path("./output/speech.wav"),
        )
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: int | None = None,
        upload_timeout: int | None = None,
    ):
        self.base_url = (base_url or settings.GPU_SERVER_URL).rstrip("/")
        self.api_key = api_key or settings.GPU_API_KEY
        self.timeout = timeout or settings.GPU_TIMEOUT_SECONDS
        self.upload_timeout = upload_timeout or settings.GPU_UPLOAD_TIMEOUT

        if not self.base_url:
            logger.warning("GPU_SERVER_URL is not configured — GPU calls will fail")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {"X-API-Key": self.api_key}

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    @staticmethod
    def _check_response(resp: httpx.Response) -> dict:
        """Raise GPUClientError if the response is not 2xx."""
        if resp.status_code >= 400:
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            raise GPUClientError(
                f"GPU server returned {resp.status_code}",
                status_code=resp.status_code,
                detail=body,
            )
        return resp.json()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def health_check(self) -> dict:
        """
        Check whether the GPU server is reachable and healthy.
        Returns the health payload or raises GPUClientError.
        """
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self._url("/health"))
            return self._check_response(resp)

    async def upload_file(self, local_path: str | Path) -> str:
        """
        Upload a local file to the GPU server.
        Returns the remote ``file_id`` string.
        """
        local_path = Path(local_path)
        if not local_path.exists():
            raise FileNotFoundError(f"Local file not found: {local_path}")

        logger.info("Uploading %s to GPU server", local_path.name)
        async with httpx.AsyncClient(timeout=self.upload_timeout) as client:
            with open(local_path, "rb") as f:
                resp = await client.post(
                    self._url("/files/upload"),
                    headers=self._headers(),
                    files={"file": (local_path.name, f)},
                )
            data = self._check_response(resp)

        file_id = data["file_id"]
        logger.info("Uploaded %s -> file_id=%s", local_path.name, file_id)
        return file_id

    async def download_file(self, remote_id: str, local_path: str | Path) -> Path:
        """
        Download a file from the GPU server by its ``file_id``.
        Saves to ``local_path`` and returns the resolved Path.
        """
        local_path = Path(local_path)
        local_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info("Downloading file_id=%s -> %s", remote_id, local_path)
        async with httpx.AsyncClient(timeout=self.upload_timeout) as client:
            resp = await client.get(
                self._url(f"/files/{remote_id}"),
                headers=self._headers(),
            )
            if resp.status_code >= 400:
                raise GPUClientError(
                    f"Failed to download file {remote_id}: HTTP {resp.status_code}",
                    status_code=resp.status_code,
                )
            with open(local_path, "wb") as f:
                f.write(resp.content)

        logger.info("Downloaded %s (%.1f KB)", local_path.name, local_path.stat().st_size / 1024)
        return local_path

    async def infer(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
        input_files: list[str | Path] | None = None,
        output_path: str | Path | None = None,
        timeout: int | None = None,
        model_key: str | None = None,
    ) -> dict[str, Any]:
        """
        Full inference call with automatic file transfer.

        1. Upload any ``input_files`` to the GPU server.
        2. POST to the inference ``endpoint`` with params + file IDs.
        3. If the response contains an ``output_file_id``, download it to
           ``output_path``.
        4. Return the full response dict.
        """
        timeout = timeout or self.timeout
        params = params or {}

        # Step 1: Upload input files
        input_file_ids: list[str] = []
        for file_path in input_files or []:
            fid = await self.upload_file(file_path)
            input_file_ids.append(fid)

        # Step 2: Call inference endpoint
        payload = {
            "params": params,
            "input_file_ids": input_file_ids,
        }
        if model_key:
            payload["model_key"] = model_key

        logger.info("Calling %s with %d input files", endpoint, len(input_file_ids))
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                self._url(endpoint),
                headers=self._headers(),
                json=payload,
            )
            data = self._check_response(resp)

        # Step 3: Download output file if present
        output_file_id = data.get("output_file_id")
        if output_file_id and output_path:
            await self.download_file(output_file_id, output_path)
            data["local_output_path"] = str(output_path)

        logger.info(
            "Inference complete: endpoint=%s elapsed=%.2fs",
            endpoint,
            data.get("elapsed_seconds", 0),
        )
        return data

    async def infer_with_retry(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
        input_files: list[str | Path] | None = None,
        output_path: str | Path | None = None,
        timeout: int | None = None,
        model_key: str | None = None,
        max_retries: int | None = None,
    ) -> dict[str, Any]:
        """
        Same as ``infer()`` but with exponential-backoff retries.
        """
        retries = max_retries if max_retries is not None else settings.GPU_MAX_RETRIES
        last_exc: Exception | None = None

        for attempt in range(retries + 1):
            try:
                return await self.infer(
                    endpoint=endpoint,
                    params=params,
                    input_files=input_files,
                    output_path=output_path,
                    timeout=timeout,
                    model_key=model_key,
                )
            except (GPUClientError, httpx.HTTPError, httpx.TimeoutException) as exc:
                last_exc = exc
                if attempt < retries:
                    delay = 2 ** attempt  # 1s, 2s, 4s, ...
                    logger.warning(
                        "GPU inference attempt %d/%d failed (%s). Retrying in %ds...",
                        attempt + 1,
                        retries + 1,
                        exc,
                        delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "GPU inference failed after %d attempts: %s",
                        retries + 1,
                        exc,
                    )

        raise GPUClientError(
            f"GPU inference failed after {retries + 1} attempts",
            detail=str(last_exc),
        )

    async def load_model(self, model_key: str) -> dict:
        """Ask the GPU server to load a model."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                self._url("/models/load"),
                headers=self._headers(),
                json={"model_key": model_key},
            )
            return self._check_response(resp)

    async def unload_model(self, model_key: str) -> dict:
        """Ask the GPU server to unload a model."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self._url("/models/unload"),
                headers=self._headers(),
                json={"model_key": model_key},
            )
            return self._check_response(resp)

    async def list_models(self) -> dict:
        """List all models and their status on the GPU server."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                self._url("/models"),
                headers=self._headers(),
            )
            return self._check_response(resp)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
gpu_client = GPUClient()
