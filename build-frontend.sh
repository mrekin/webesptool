#!/bin/bash

# Docker image build script for frontend with versioning
# Author: Claude Code
# Purpose: Build and push image to registry.mrekin.ru

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
IMAGE_NAME="webesptool-frontend"
REGISTRY="registry.mrekin.ru"
FRONTEND_DIR="./frontend"

# Global variables
APP_VERSION=""
SHOULD_TAG_LATEST=""

# Information output functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Version validation function
validate_version() {
    local version=$1
    if [[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    else
        return 1
    fi
}

# Version prompt function
prompt_version() {
    while true; do
        echo
        read -p "Enter version in format v1.0.0: " version

        if [ -z "$version" ]; then
            error "Version cannot be empty"
            continue
        fi

        if validate_version "$version"; then
            success "Version $version accepted"
            APP_VERSION=$version
            break
        else
            error "Invalid version format. Use format: v1.0.0 (e.g. v1.2.3)"
        fi
    done
}

# Docker check function
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not available"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        error "Docker daemon is not running or no permissions"
        exit 1
    fi

    success "Docker is available and running"
}

# Directory check function
check_frontend_dir() {
    if [ ! -d "$FRONTEND_DIR" ]; then
        error "Directory $FRONTEND_DIR not found"
        exit 1
    fi

    if [ ! -f "$FRONTEND_DIR/Dockerfile" ]; then
        error "Dockerfile not found in $FRONTEND_DIR"
        exit 1
    fi

    success "Frontend directory verified"
}

# Image build function
build_image() {
    info "Starting Docker image build..."
    info "Image: $REGISTRY/$IMAGE_NAME:$APP_VERSION"

    # Get current date in YYYYMMDD format
    BUILD_DATE=$(date +%Y%m%d)

    # Prepare version for build (version + date)
    BUILD_VERSION="${APP_VERSION}.${BUILD_DATE}"

    # Build tags
    local build_tags="-t $REGISTRY/$IMAGE_NAME:$APP_VERSION"

    if [ "$SHOULD_TAG_LATEST" = "yes" ]; then
        build_tags="$build_tags -t $REGISTRY/$IMAGE_NAME:latest"
        info "Will also tag as latest"
    else
        info "Will NOT tag as latest"
    fi

    # Build image
    docker build \
        --build-arg APP_VERSION="$BUILD_VERSION" \
        $build_tags \
        "$FRONTEND_DIR"

    if [ $? -eq 0 ]; then
        success "Build completed successfully"
    else
        error "Image build failed"
        exit 1
    fi
}

# Image size retrieval function
get_image_size() {
    local image_id=$(docker images -q "$REGISTRY/$IMAGE_NAME:$APP_VERSION")
    if [ -n "$image_id" ]; then
        # Get image size information in bytes
        local size_bytes=$(docker image inspect "$image_id" --format='{{.Size}}')
        # Convert to MB for easy display
        local size_mb=$((size_bytes / 1024 / 1024))
        echo "${size_mb}MB"
    else
        echo "N/A"
    fi
}

# Registry push function
push_image() {
    info "Pushing images to registry..."

    # Always push version
    info "Pushing $REGISTRY/$IMAGE_NAME:$APP_VERSION"
    docker push "$REGISTRY/$IMAGE_NAME:$APP_VERSION"

    if [ $? -ne 0 ]; then
        error "Failed to push version $APP_VERSION"
        exit 1
    fi

    # Push latest only if tagged
    if [ "$SHOULD_TAG_LATEST" = "yes" ]; then
        info "Pushing $REGISTRY/$IMAGE_NAME:latest"
        docker push "$REGISTRY/$IMAGE_NAME:latest"

        if [ $? -ne 0 ]; then
            error "Failed to push latest"
            exit 1
        fi
    else
        warning "Skipping latest tag push (not requested)"
    fi

    success "Images successfully pushed to registry"
}

# Function to get latest version from registry
get_latest_version() {
    info "Checking for existing versions in registry..."

    # Try to get latest tag info from registry
    local latest_info=$(docker manifest inspect "$REGISTRY/$IMAGE_NAME:latest" 2>/dev/null)

    if [ $? -eq 0 ] && [ -n "$latest_info" ]; then
        # Get the actual version tag from latest manifest
        local version_from_manifest=$(echo "$latest_info" | grep -o '"v[0-9]\+\.[0-9]\+\.[0-9]\+"' | head -1 | tr -d '"')

        if [ -n "$version_from_manifest" ]; then
            echo "$version_from_manifest"
            return 0
        fi
    fi

    # Fallback: try to list local images
    local local_latest=$(docker images "$REGISTRY/$IMAGE_NAME" --format "table {{.Tag}}" | grep "^v[0-9]" | sort -V | tail -1)

    if [ -n "$local_latest" ]; then
        echo "$local_latest"
        return 0
    fi

    echo "None found"
}

# Function to show existing versions
show_existing_versions() {
    echo
    info "Existing versions in registry/local:"

    # Get latest version
    LATEST_VERSION=$(get_latest_version)

    if [ "$LATEST_VERSION" != "None found" ]; then
        echo -e "  Latest:   ${GREEN}$LATEST_VERSION${NC}"

        # Get size of latest image if available locally
        if docker images -q "$REGISTRY/$IMAGE_NAME:$LATEST_VERSION" &>/dev/null; then
            local latest_size=$(get_image_size_for_tag "$LATEST_VERSION")
            echo -e "  Size:     ${YELLOW}$latest_size${NC}"
        fi
    else
        echo -e "  Latest:   ${RED}No existing versions found${NC}"
    fi

    # Show all local versions
    local local_versions=$(docker images "$REGISTRY/$IMAGE_NAME" --format "table {{.Tag}}" | grep "^v[0-9]" | sort -V)
    if [ -n "$local_versions" ]; then
        echo -e "  Local:    ${YELLOW}$(echo "$local_versions" | tr '\n' ', ' | sed 's/,$//')${NC}"
    fi
    echo
}

# Function to get image size for specific tag
get_image_size_for_tag() {
    local tag=$1
    local image_id=$(docker images -q "$REGISTRY/$IMAGE_NAME:$tag")
    if [ -n "$image_id" ]; then
        local size_bytes=$(docker image inspect "$image_id" --format='{{.Size}}' 2>/dev/null)
        if [ -n "$size_bytes" ] && [ "$size_bytes" != "0" ]; then
            local size_mb=$((size_bytes / 1024 / 1024))
            echo "${size_mb}MB"
        else
            echo "Size unknown"
        fi
    else
        echo "Not available locally"
    fi
}

# Information display function
show_image_info() {
    echo
    info "Built image information:"
    echo -e "  Name:     ${GREEN}$REGISTRY/$IMAGE_NAME${NC}"
    echo -e "  Version:  ${GREEN}$APP_VERSION${NC}"
    echo -e "  Size:     ${GREEN}$(get_image_size)${NC}"
    echo

    # Additional information
    local image_id=$(docker images -q "$REGISTRY/$IMAGE_NAME:$APP_VERSION")
    if [ -n "$image_id" ]; then
        echo -e "  Image ID: ${GREEN}${image_id:0:12}${NC}"

        # Show creation date
        local created=$(docker image inspect "$image_id" --format='{{.Created}}' | cut -d'.' -f1 | sed 's/T/ /')
        echo -e "  Created:  ${GREEN}$created${NC}"
    fi
}

# Function to prompt for latest tag
prompt_latest_tag() {
    echo
    while true; do
        read -p "Tag this version as latest? (y/N): " latest_confirm

        if [ -z "$latest_confirm" ]; then
            SHOULD_TAG_LATEST="no"
            break
        fi

        if [[ $latest_confirm =~ ^[Yy]$ ]]; then
            SHOULD_TAG_LATEST="yes"
            break
        elif [[ $latest_confirm =~ ^[Nn]$ ]]; then
            SHOULD_TAG_LATEST="no"
            break
        else
            warning "Please enter 'y' or 'n'"
        fi
    done

    if [ "$SHOULD_TAG_LATEST" = "yes" ]; then
        success "Will tag $APP_VERSION as latest"
    else
        warning "Will NOT tag $APP_VERSION as latest"
    fi
}

# Main function
main() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}Frontend Docker Image Build${NC}"
    echo -e "${BLUE}================================${NC}"
    echo

    # Checks
    check_docker
    check_frontend_dir

    # Show existing versions first
    show_existing_versions

    # Version prompt
    prompt_version

    # Ask about latest tag
    prompt_latest_tag

    # Build confirmation
    echo
    echo -e "${BLUE}Build configuration:${NC}"
    echo -e "  Version:   ${GREEN}$APP_VERSION${NC}"
    echo -e "  Latest:    ${GREEN}$SHOULD_TAG_LATEST${NC}"
    echo -e "  Base Path: ${YELLOW}Can be set at runtime with -e VITE_BASE_PATH=/path${NC}"
    echo

    warning "Start building image $REGISTRY/$IMAGE_NAME:$APP_VERSION ?"
    read -p "Continue? (y/N): " confirm

    if [[ $confirm =~ ^[Yy]$ ]]; then
        echo
        info "Starting build process..."
        echo

        # Build
        build_image

        # Display information
        show_image_info

        # Push to registry
        echo
        warning "Push image to registry $REGISTRY ?"
        read -p "Continue? (y/N): " push_confirm

        if [[ $push_confirm =~ ^[Yy]$ ]]; then
            push_image
            success "Process completed successfully!"
        else
            warning "Image built but not pushed to registry"
            info "To push manually: docker push $REGISTRY/$IMAGE_NAME:$APP_VERSION"
        fi
    else
        warning "Build cancelled"
        exit 0
    fi

    echo
    info "To run the image:"
    echo -e "  docker run -p 3000:3000 $REGISTRY/$IMAGE_NAME:$APP_VERSION"
    echo
    info "With custom base path:"
    echo -e "  docker run -p 3000:3000 -e VITE_BASE_PATH=/your/path $REGISTRY/$IMAGE_NAME:$APP_VERSION"
    echo

    # Show tag info
    if [ "$SHOULD_TAG_LATEST" = "yes" ]; then
        info "Also available as latest:"
        echo -e "  docker run -p 3000:3000 $REGISTRY/$IMAGE_NAME:latest"
    fi
    echo
}

# Run
main "$@"