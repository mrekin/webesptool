"""
File system operations for archive manager.

Provides safe file system utilities used by other modules.
"""

import os
import shutil
from pathlib import Path


def ensure_directory(path: str) -> None:
    """
    Create directory if it does not exist.

    Args:
        path: Directory path to create.

    Raises:
        PermissionError: If cannot create directory.
    """
    os.makedirs(path, exist_ok=True)


def get_relative_path(file_path: str, base_path: str) -> str:
    """
    Compute relative path of file_path with respect to base_path.

    Args:
        file_path: Absolute or relative file path.
        base_path: Base directory path.

    Returns:
        Relative path string.
    """
    return os.path.relpath(file_path, base_path)


def get_disk_space(path: str) -> int:
    """
    Get available disk space in bytes at the given path.

    Args:
        path: Filesystem path to check.

    Returns:
        Available disk space in bytes.
    """
    usage = shutil.disk_usage(path)
    return usage.free


def format_size(size_bytes: int) -> str:
    """
    Format byte size into human-readable string.

    Args:
        size_bytes: Size in bytes.

    Returns:
        Formatted size string (e.g., '1.5 MB', '250.0 KB').
    """
    if size_bytes < 0:
        return "0 B"

    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if abs(size_bytes) < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def calculate_total_size(file_paths: list) -> int:
    """
    Calculate total size of files and directories.

    Args:
        file_paths: List of file and directory paths.

    Returns:
        Total size in bytes.
    """
    total = 0
    for path in file_paths:
        if os.path.isfile(path):
            total += os.path.getsize(path)
        elif os.path.isdir(path):
            for dirpath, dirnames, filenames in os.walk(path):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    try:
                        total += os.path.getsize(filepath)
                    except OSError:
                        pass
    return total


def collect_files_in_directory(dir_path: str) -> list:
    """
    Collect all files recursively in a directory.

    Args:
        dir_path: Directory to scan.

    Returns:
        List of absolute file paths.
    """
    files = []
    if not os.path.isdir(dir_path):
        return files

    for dirpath, dirnames, filenames in os.walk(dir_path):
        for filename in filenames:
            files.append(os.path.join(dirpath, filename))
    return files
