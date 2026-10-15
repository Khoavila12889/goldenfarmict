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

# ArtCraft converters (branch wordcraft-viewer): xem docx/xlsx không cần OnlyOffice.
# Ping versions trong ENV để dependabot/cache dễ thấy khi nâng cấp.
ENV WORDCRAFT_VER=0.7.0 GRIDRAFT_VER=0.7.0
RUN mkdir -p /opt/craft/bin /app/storage/craft-cache && \
    curl -sL --max-time 120 -o /tmp/wc.tar.gz \
      https://github.com/storytold/wordcraft/releases/download/v${WORDCRAFT_VER}/wordcraft-${WORDCRAFT_VER}-linux-x86_64.tar.gz && \
    tar xzf /tmp/wc.tar.gz -C /tmp wordcraft-${WORDCRAFT_VER}-linux-x86_64/bin/wordcraft-cli && \
    mv /tmp/wordcraft-${WORDCRAFT_VER}-linux-x86_64/bin/wordcraft-cli /opt/craft/bin/ && \
    curl -sL --max-time 120 -o /tmp/gc.tar.gz \
      https://github.com/storytold/gridcraft/releases/download/v${GRIDRAFT_VER}/gridcraft-${GRIDRAFT_VER}-linux-x86_64.tar.gz && \
    tar xzf /tmp/gc.tar.gz -C /tmp gridcraft-${GRIDRAFT_VER}-linux-x86_64/bin/gridcraft-cli && \
    mv /tmp/gridcraft-${GRIDRAFT_VER}-linux-x86_64/bin/gridcraft-cli /opt/craft/bin/ && \
    rm -rf /tmp/wc.tar.gz /tmp/gc.tar.gz /tmp/wordcraft-* /tmp/gridcraft-* && \
    chmod +x /opt/craft/bin/* && /opt/craft/bin/wordcraft-cli --version && /opt/craft/bin/gridcraft-cli --version
ENV WORDCRAFT_CLI=/opt/craft/bin/wordcraft-cli GRIDRAFT_CLI=/opt/craft/bin/gridcraft-cli

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
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--ws-max-size", "65536", "--ws-max-queue", "16"]
