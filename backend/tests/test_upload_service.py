"""Unit tests for Upload Service."""

import os
import io
import tempfile
import pytest
from fastapi import HTTPException, UploadFile
from app.services.upload_service import (
    save_upload, delete_stored_file, UPLOAD_BASE, MAX_FILE_SIZE
)


def _make_upload(filename: str, content: bytes = b"hello world") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(content))


class TestValidateFile:
    @pytest.mark.parametrize("ext", [".pdf", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"])
    @pytest.mark.asyncio
    async def test_allowed_extensions(self, ext):
        upload = _make_upload(f"document{ext}")
        result = await save_upload(upload)
        assert result["file_name"] == f"document{ext}"
        # Cleanup
        delete_stored_file(result["stored_name"])

    @pytest.mark.asyncio
    async def test_rejected_extension(self):
        upload = _make_upload("script.exe")
        with pytest.raises(HTTPException) as exc:
            await save_upload(upload)
        assert exc.value.status_code == 400
        assert "không được hỗ trợ" in exc.value.detail.lower()

    @pytest.mark.asyncio
    async def test_no_filename(self):
        upload = _make_upload("")
        with pytest.raises(HTTPException) as exc:
            await save_upload(upload)
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_file_too_large(self):
        upload = _make_upload("test.pdf", content=b"x" * (MAX_FILE_SIZE + 1))
        with pytest.raises(HTTPException) as exc:
            await save_upload(upload)
        assert exc.value.status_code == 400
        assert "10mb" in exc.value.detail.lower()


class TestSaveAndDelete:
    @pytest.mark.asyncio
    async def test_save_returns_expected_keys(self):
        upload = _make_upload("report.pdf")
        result = await save_upload(upload)
        try:
            assert "file_name" in result
            assert "stored_name" in result
            assert "file_type" in result
            assert "file_size" in result
            assert "file_url" in result
            assert result["file_name"] == "report.pdf"
            assert result["file_type"] == "pdf"
            assert result["file_url"].startswith("/api/uploads/todos/")
        finally:
            delete_stored_file(result["stored_name"])

    @pytest.mark.asyncio
    async def test_save_creates_file_on_disk(self):
        content = b"PDF content here"
        upload = _make_upload("test.pdf", content=content)
        result = await save_upload(upload)
        file_path = os.path.join(UPLOAD_BASE, result["stored_name"])
        try:
            assert os.path.exists(file_path)
            with open(file_path, "rb") as f:
                assert f.read() == content
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

    def test_delete_existing_file(self):
        os.makedirs(UPLOAD_BASE, exist_ok=True)
        stored_name = "_test_delete_me.pdf"
        file_path = os.path.join(UPLOAD_BASE, stored_name)
        with open(file_path, "wb") as f:
            f.write(b"data")

        assert delete_stored_file(stored_name) is True
        assert not os.path.exists(file_path)

    def test_delete_nonexistent_file(self):
        assert delete_stored_file("_nonexistent_file.xyz") is False
