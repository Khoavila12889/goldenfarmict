"""
Test JWT token với OnlyOffice Document Server
Chạy: python backend/test_onlyoffice_jwt.py
"""

import os
import jwt as pyjwt
import time
import requests
from dotenv import load_dotenv

load_dotenv()

ONLYOFFICE_URL = os.environ.get('ONLYOFFICE_URL', 'http://10.0.0.119:8082')
ONLYOFFICE_SECRET = os.environ.get('ONLYOFFICE_SECRET', 'MySuperSecret123456')

print("=" * 60)
print("OnlyOffice JWT Token Test")
print("=" * 60)
print()

# Tạo một document config giống như backend
test_config = {
    "document": {
        "fileType": "docx",
        "key": "test_doc_key_" + str(int(time.time())),
        "title": "test.docx",
        "url": "http://10.0.0.9:8088/api/documents/onlyoffice/download?token=dummy",
        "permissions": {
            "edit": False,
            "download": True,
            "print": True,
        }
    },
    "editorConfig": {
        "lang": "vi",
        "mode": "view",
        "user": {
            "id": "test_user",
            "name": "Test User"
        }
    },
    "documentType": "word",
}

# Sign token
token = pyjwt.encode(test_config, ONLYOFFICE_SECRET, algorithm="HS256")
test_config["token"] = token

print("Test config:")
print(f"Document Key: {test_config['document']['key']}")
print(f"JWT Token (first 50 chars): {token[:50]}...")
print()

# Verify token locally
print("Local JWT verification:")
try:
    decoded = pyjwt.decode(token, ONLYOFFICE_SECRET, algorithms=["HS256"])
    print("✅ Token decoded successfully locally")
    print(f"Document type: {decoded.get('documentType')}")
except Exception as e:
    print(f"❌ Error: {e}")
print()

print("=" * 60)
print("Kết luận:")
print("=" * 60)
print(f"OnlyOffice URL: {ONLYOFFICE_URL}")
print(f"JWT Secret: {ONLYOFFICE_SECRET}")
print()
print("Để kiểm tra OnlyOffice có yêu cầu JWT không:")
print("1. Mở module Tài liệu")
print("2. Click vào file .docx hoặc .xlsx")
print("3. Mở Browser Console (F12 > Console)")
print("4. Xem logs bắt đầu bằng [OnlyOffice]")
print()
print("Nếu OnlyOffice không load:")
print("- Kiểm tra OnlyOffice server có bật JWT_ENABLED không")
print("- Kiểm tra JWT_SECRET trong OnlyOffice config")
print("- Nếu OnlyOffice không yêu cầu JWT, có thể bỏ qua token")
