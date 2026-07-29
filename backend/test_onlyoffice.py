"""
Script test kết nối OnlyOffice Document Server
Chạy: python backend/test_onlyoffice.py
"""

import os
import sys
import requests

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

ONLYOFFICE_URL = os.environ.get('ONLYOFFICE_URL', 'http://10.0.0.119:8082')
ONLYOFFICE_PUBLIC_URL = os.environ.get('ONLYOFFICE_PUBLIC_URL', 'https://office.goldenfarm.vn')
ONLYOFFICE_SECRET = os.environ.get('ONLYOFFICE_SECRET', 'MySuperSecret123456')

print("=" * 60)
print("OnlyOffice Document Server - Connection Test")
print("=" * 60)
print()

# Test 1: Check healthcheck
print("Test 1: Healthcheck internal URL")
print(f"URL: {ONLYOFFICE_URL}/healthcheck")
try:
    response = requests.get(f"{ONLYOFFICE_URL}/healthcheck", timeout=5)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:100]}")
    print("✅ Internal URL accessible")
except Exception as e:
    print(f"❌ Error: {e}")
print()

# Test 2: Check public URL
print("Test 2: Check public URL API script")
print(f"URL: {ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js")
try:
    response = requests.get(f"{ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js", timeout=5)
    print(f"Status: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    if response.status_code == 200:
        print("✅ Public URL accessible, API script loadable")
    else:
        print("❌ Public URL not accessible")
except Exception as e:
    print(f"❌ Error: {e}")
print()

# Test 3: Check JWT configuration
print("Test 3: Check JWT configuration")
print(f"JWT Secret configured: {ONLYOFFICE_SECRET}")
print(f"JWT Secret length: {len(ONLYOFFICE_SECRET)} bytes")
if len(ONLYOFFICE_SECRET) < 32:
    print("⚠️  Warning: JWT secret should be at least 32 bytes for SHA256")
else:
    print("✅ JWT secret length OK")
print()

# Test 4: Test document conversion (optional, requires OnlyOffice to be fully functional)
print("Test 4: Check converter service")
print(f"URL: {ONLYOFFICE_URL}/ConvertService.ashx")
try:
    response = requests.get(f"{ONLYOFFICE_URL}/ConvertService.ashx", timeout=5)
    print(f"Status: {response.status_code}")
    if response.status_code in [200, 400, 405]:  # 400/405 means service is running but wrong method
        print("✅ Converter service is running")
    else:
        print("⚠️  Converter service may not be running")
except Exception as e:
    print(f"❌ Error: {e}")
print()

print("=" * 60)
print("Configuration Summary")
print("=" * 60)
print(f"Internal URL (backend):  {ONLYOFFICE_URL}")
print(f"Public URL (frontend):   {ONLYOFFICE_PUBLIC_URL}")
print(f"JWT Secret:              {ONLYOFFICE_SECRET}")
print()
print("Next steps:")
print("1. Nếu internal URL không accessible, kiểm tra OnlyOffice container có chạy không")
print("2. Nếu public URL không accessible, kiểm tra NPM proxy config")
print("3. Nếu JWT secret sai, update trong .env và restart backend")
print("4. Test mở file .docx/.xlsx trong module Tài liệu")
print("5. Xem browser console (F12) để debug OnlyOffice loading")
