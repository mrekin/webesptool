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
SHOULD_PUSH=""

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

# Get version from package.json
get_package_version() {
    if [ -f "$FRONTEND_DIR/package.json" ]; then
        local pkg_version=$(grep '"version"' "$FRONTEND_DIR/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
        if [ -n "$pkg_version" ]; then
            # Add 'v' prefix if not present
            if [[ ! $pkg_version =~ ^v ]]; then
                pkg_version="v$pkg_version"
            fi
            echo "$pkg_version"
            return 0
        fi
    fi
    return 1
}

# Compare two versions (returns 0 if $1 > $2, 1 if $1 <= $2)
compare_versions() {
    local v1=$1
    local v2=$2

    # Remove 'v' prefix for comparison
    v1=${v1#v}
    v2=${v2#v}

    # Split versions into arrays
    IFS='.' read -ra v1_parts <<< "$v1"
    IFS='.' read -ra v2_parts <<< "$v2"

    # Compare major, minor, patch
    for i in 0 1 2; do
        local n1=${v1_parts[$i]:-0}
        local n2=${v2_parts[$i]:-0}

        if ((n1 > n2)); then
            return 0  # v1 > v2
        elif ((n1 < n2)); then
            return 1  # v1 < v2
        fi
    done

    return 1  # Versions are equal
}

# Version prompt function with default from package.json
prompt_version() {
    local pkg_version=""
    local latest_version=""
    local suggested_version=""
    local suggestion_reason=""

    # Get version from package.json
    pkg_version=$(get_package_version)

    # Get latest version from registry
    latest_version=$(get_latest_version)
    if [ "$latest_version" = "None found" ]; then
        latest_version=""
    fi

    # Determine suggested version
    if [ -n "$pkg_version" ]; then
        if [ -n "$latest_version" ]; then
            # Compare package version with latest registry version
            if compare_versions "$pkg_version" "$latest_version"; then
                suggested_version="$pkg_version"
                suggestion_reason="newer than latest registry version ($latest_version)"
            else
                suggested_version="$latest_version"
                suggestion_reason="package.json version ($pkg_version) is not newer than latest ($latest_version)"
            fi
        else
            suggested_version="$pkg_version"
            suggestion_reason="from package.json (no existing versions in registry)"
        fi
    elif [ -n "$latest_version" ]; then
        # Try to increment latest version's patch number
        local major=$(echo "$latest_version" | sed 's/v\([0-9]*\)\..*/\1/')
        local minor=$(echo "$latest_version" | sed 's/v[0-9]*\.\([0-9]*\)\..*/\1/')
        local patch=$(echo "$latest_version" | sed 's/v[0-9]*\.[0-9]*\.\([0-9]*\)/\1/')
        patch=$((patch + 1))
        suggested_version="v${major}.${minor}.${patch}"
        suggestion_reason="incremented from latest registry version ($latest_version)"
    fi

    while true; do
        echo
        if [ -n "$suggested_version" ]; then
            echo -e "  Suggested: ${GREEN}$suggested_version${NC} ($suggestion_reason)"
        fi

        local prompt_text="Enter version in format v1.0.0"
        if [ -n "$suggested_version" ]; then
            prompt_text="$prompt_text [$suggested_version]"
        fi
        read -p "$prompt_text: " version

        # Use suggested version if empty
        if [ -z "$version" ] && [ -n "$suggested_version" ]; then
            version="$suggested_version"
        fi

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

# Function to get latest version from registry (silent)
get_latest_version() {
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
        read -p "Tag this version as latest? (Y/n): " latest_confirm

        if [[ $latest_confirm =~ ^[Nn]$ ]]; then
            SHOULD_TAG_LATEST="no"
            break
        else
            SHOULD_TAG_LATEST="yes"
            break
        fi
    done

    if [ "$SHOULD_TAG_LATEST" = "yes" ]; then
        success "Will tag $APP_VERSION as latest"
    else
        warning "Will NOT tag $APP_VERSION as latest"
    fi
}

# Function to prompt for registry push
prompt_push_to_registry() {
    echo
    while true; do
        read -p "Push image to registry after build? (Y/n): " push_confirm

        if [[ $push_confirm =~ ^[Nn]$ ]]; then
            SHOULD_PUSH="no"
            break
        else
            SHOULD_PUSH="yes"
            break
        fi
    done

    if [ "$SHOULD_PUSH" = "yes" ]; then
        success "Will push to registry $REGISTRY"
    else
        warning "Will NOT push to registry"
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

    # Ask about registry push
    prompt_push_to_registry

    # Build confirmation
    echo
    echo -e "${BLUE}Build configuration:${NC}"
    echo -e "  Version:   ${GREEN}$APP_VERSION${NC}"
    echo -e "  Latest:    ${GREEN}$SHOULD_TAG_LATEST${NC}"
    echo -e "  Push:      ${GREEN}$SHOULD_PUSH${NC}"
    echo -e "  Base Path: ${YELLOW}Can be set at runtime with -e VITE_BASE_PATH=/path${NC}"
    echo

    warning "Start building image $REGISTRY/$IMAGE_NAME:$APP_VERSION ?"
    read -p "Continue? (Y/n): " confirm

    if [[ $confirm =~ ^[Nn]$ ]]; then
        warning "Build cancelled"
        exit 0
    fi

    echo
    info "Starting build process..."
    echo

    # Build
    build_image

    # Display information
    show_image_info

    # Push to registry (based on earlier choice)
    if [ "$SHOULD_PUSH" = "yes" ]; then
        echo
        push_image
        success "Process completed successfully!"
    else
        echo
        warning "Image built but not pushed to registry"
        info "To push manually: docker push $REGISTRY/$IMAGE_NAME:$APP_VERSION"
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