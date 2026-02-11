# Multi-stage Dockerfile
# Optimized variant with build and runtime stages separation
# Image size: ~198MB

FROM python:3.14-slim AS builder

ARG dir=/home/webesptool

# Install build dependencies
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Build wheels for all dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir --upgrade pip setuptools wheel && \
    pip3 wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# Runtime stage
FROM python:3.14-slim

ARG dir=/home/webesptool

# Copy wheels from builder and install
COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip3 install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt && \
    rm -rf /wheels

# Create directories
RUN mkdir -p ${dir} ${dir}/log ${dir}/data ${dir}/bin

# Copy application code
COPY *.py ${dir}
ADD utils ${dir}/utils
ADD config ${dir}/config
ADD apps ${dir}/apps
ADD templates/admin ${dir}/templates/admin
ADD bin ${dir}/bin

WORKDIR ${dir}
CMD ["sh", "-c", "uvicorn service:app --host 0.0.0.0 --port 8000 ${ROOT_PATH:+--root-path $ROOT_PATH}"]
