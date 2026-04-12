"""
Version utilities for archive manager.

Handles collection, sorting and filtering of firmware versions.
Uses CustomLooseVersion for consistent version sorting.
"""

import json
import os
from typing import Optional

from ..version import CustomLooseVersion

from .const import VER_INFO_FILE


def parse_version_info(ver_info_path: str) -> Optional[dict]:
    """
    Parse a ver.info file.

    Args:
        ver_info_path: Path to ver.info file.

    Returns:
        Parsed JSON dict, or None if file cannot be read.
    """
    try:
        with open(ver_info_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def collect_versions(repo_path: str, device_name: str) -> list:
    """
    Collect firmware versions for a specific device in a repository.

    Scans the device directory for subdirectories containing ver.info files.

    Args:
        repo_path: Root path of the repository.
        device_name: Name of the device subdirectory.

    Returns:
        List of version strings found for the device.
    """
    versions = []
    device_path = os.path.join(repo_path, device_name)

    if not os.path.isdir(device_path):
        return versions

    for entry in os.listdir(device_path):
        entry_path = os.path.join(device_path, entry)
        if not os.path.isdir(entry_path):
            continue

        # Check for ver.info file
        ver_info_path = os.path.join(entry_path, VER_INFO_FILE)
        version_name = entry

        if os.path.isfile(ver_info_path):
            info = parse_version_info(ver_info_path)
            if info and info.get('version'):
                version_name = info['version']

        versions.append(version_name)

    return versions


def collect_all_versions(repo_path: str) -> dict:
    """
    Collect all firmware versions across all devices in a repository.

    Args:
        repo_path: Root path of the repository.

    Returns:
        Dict mapping version string to list of device paths:
            {
                'v1.10.0.abc123': ['/repo/device1/v1.10.0.abc123', ...],
                ...
            }
    """
    version_map = {}

    if not os.path.isdir(repo_path):
        return version_map

    # Iterate over device directories
    for device_entry in sorted(os.listdir(repo_path)):
        device_path = os.path.join(repo_path, device_entry)
        if not os.path.isdir(device_path):
            continue

        # Skip special directories
        if device_entry.startswith('_') or device_entry in ('archive', 'backup'):
            continue

        # Iterate over version directories within device
        for version_entry in sorted(os.listdir(device_path)):
            version_dir = os.path.join(device_path, version_entry)
            if not os.path.isdir(version_dir):
                continue

            # Determine version name from ver.info if available
            ver_info_path = os.path.join(version_dir, VER_INFO_FILE)
            version_name = version_entry

            if os.path.isfile(ver_info_path):
                info = parse_version_info(ver_info_path)
                if info and info.get('version'):
                    version_name = info['version']

            if version_name not in version_map:
                version_map[version_name] = []
            version_map[version_name].append(version_dir)

    return version_map


def sort_versions(versions: list) -> list:
    """
    Sort versions using CustomLooseVersion in descending order.

    Args:
        versions: List of version strings.

    Returns:
        Sorted list (newest first).
    """
    return sorted(versions, key=CustomLooseVersion, reverse=True)


def filter_versions_below(versions: list, threshold: str) -> list:
    """
    Filter versions that are strictly below the given threshold.

    Args:
        versions: List of version strings.
        threshold: Version threshold string (e.g., 'v1.10.0').

    Returns:
        List of versions below the threshold, sorted descending.
    """
    threshold_ver = CustomLooseVersion(threshold)
    filtered = [v for v in versions if CustomLooseVersion(v) < threshold_ver]
    return sort_versions(filtered)


def filter_versions_up_to(versions: list, threshold: str) -> list:
    """
    Filter versions up to and including the given threshold.

    Args:
        versions: List of version strings.
        threshold: Version threshold string (e.g., 'v1.10.0').

    Returns:
        List of versions up to and including the threshold, sorted descending.
    """
    threshold_ver = CustomLooseVersion(threshold)
    filtered = [v for v in versions if CustomLooseVersion(v) <= threshold_ver]
    return sort_versions(filtered)


def get_version_range_name(versions: list) -> str:
    """
    Generate archive name from version range.

    The name follows the pattern: {min_version}-{max_version}.zip
    where min_version is the oldest and max_version is the newest.

    Args:
        versions: List of version strings.

    Returns:
        Archive name string (without .zip extension).
    """
    if not versions:
        return "empty"

    min_version = min(versions, key=CustomLooseVersion)
    max_version = max(versions, key=CustomLooseVersion)
    return f"{min_version}-{max_version}"
