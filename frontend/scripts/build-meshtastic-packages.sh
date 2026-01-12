#!/bin/bash
set -e

MESHTASTIC_REPO_PATH="/tmp/meshtastic-web"
LOCAL_PACKAGES_PATH="./local-packages"

echo "🔧 Building Meshtastic packages locally..."

# Clone or update repository
if [ -d "$MESHTASTIC_REPO_PATH" ]; then
  echo "📦 Updating existing repository..."
  cd "$MESHTASTIC_REPO_PATH"
  git pull
else
  echo "📦 Cloning meshtastic/web repository..."
  git clone --depth 1 https://github.com/meshtastic/web.git "$MESHTASTIC_REPO_PATH"
  cd "$MESHTASTIC_REPO_PATH"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build core
echo "🔨 Building @meshtastic/core..."
cd "$MESHTASTIC_REPO_PATH/packages/core"
pnpm run build:npm

# Build transport-web-serial
echo "🔨 Building @meshtastic/transport-web-serial..."
cd "$MESHTASTIC_REPO_PATH/packages/transport-web-serial"
pnpm run build:npm

# Copy to local packages
echo "📋 Copying built packages to $LOCAL_PACKAGES_PATH..."
cd "$(dirname "$0")/.."  # Return to frontend root

rm -rf "$LOCAL_PACKAGES_PATH"
mkdir -p "$LOCAL_PACKAGES_PATH/@meshtastic/core"
mkdir -p "$LOCAL_PACKAGES_PATH/@meshtastic/transport-web-serial"

# Copy core
cp -r "$MESHTASTIC_REPO_PATH/packages/core/dist" "$LOCAL_PACKAGES_PATH/@meshtastic/core/"
cp "$MESHTASTIC_REPO_PATH/packages/core/package.json" "$LOCAL_PACKAGES_PATH/@meshtastic/core/"

# Copy transport-web-serial
cp -r "$MESHTASTIC_REPO_PATH/packages/transport-web-serial/dist" "$LOCAL_PACKAGES_PATH/@meshtastic/transport-web-serial/"
cp "$MESHTASTIC_REPO_PATH/packages/transport-web-serial/package.json" "$LOCAL_PACKAGES_PATH/@meshtastic/transport-web-serial/"

echo "✅ Meshtastic packages built successfully!"
echo "📦 Packages are available in $LOCAL_PACKAGES_PATH/@meshtastic/"
echo "🔄 Run 'pnpm install' to use the updated packages."
