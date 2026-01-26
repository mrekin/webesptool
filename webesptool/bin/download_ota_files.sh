#!/bin/bash

# Script to download OTA files from Meshtastic ESP32 Unified OTA GitHub repository
# Usage: ./download_ota_files.sh [output_dir]
# Default output directory: current directory

set -e

OUTPUT_DIR="${1:-.}"
REPO="meshtastic/esp32-unified-ota"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

echo "========================================"
echo "Meshtastic ESP32 Unified OTA Downloader"
echo "========================================"
echo "Repository: ${REPO}"
echo "Output directory: ${OUTPUT_DIR}"
echo ""

# Create output directory if it doesn't exist
mkdir -p "${OUTPUT_DIR}"

echo "Fetching release metadata from GitHub API..."
echo "API URL: ${API_URL}"
echo ""

# Download .bin files
echo "Downloading OTA files..."
echo ""

curl -s "${API_URL}" | \
    jq -r '.assets[] | select(.name | endswith(".bin")) | .browser_download_url' | \
    while read -r url; do
        filename=$(basename "$url")
        echo "Downloading: ${filename}"
        wget --tries=3 --timeout=30 --quiet --show-progress \
            -O "${OUTPUT_DIR}/${filename}" \
            "$url"
    done

echo ""
echo "========================================"
echo "Download complete!"
echo "========================================"
echo ""
echo "Downloaded files:"
ls -lh "${OUTPUT_DIR}"/*.bin 2>/dev/null || echo "No .bin files found"
echo ""
echo "========================================"
