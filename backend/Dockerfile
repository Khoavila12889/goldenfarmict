# Optimized Dockerfile for FastAPI + PostgreSQL
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# 1. Tạo trước các thư mục cần thiết
RUN mkdir -p /app/data /app/logs /app/templates /app/temp_pdf_gen /app/storage/private_formulas

# 2. Phân quyền toàn bộ thư mục /app cho user nobody
RUN chown -R nobody:nogroup /app

# Switch to non-root user for security
USER nobody

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Production: không dùng --reload. Reloader có thể chờ vô hạn khi WebSocket
# chat còn mở, khiến healthcheck và đăng nhập cùng bị treo.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
