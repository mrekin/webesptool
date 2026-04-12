"""
Archive creation and management for archive manager.

Handles ZIP archive creation, validation, backup and file removal.
"""

import os
import shutil
import zipfile
from zipfile import ZIP_DEFLATED

from .const import ARCHIVE_DIR, BACKUP_DIR
from .file_operations import (
    calculate_total_size,
    collect_files_in_directory,
    ensure_directory,
    format_size,
)


def create_archive(files: list, archive_path: str, repo_root: str) -> bool:
    """
    Create a ZIP archive containing the specified files.

    Files are stored with their relative paths from repo_root,
    preserving the directory structure.

    Args:
        files: List of absolute file paths to include.
        archive_path: Destination path for the ZIP archive.
        repo_root: Root directory for computing relative paths.

    Returns:
        True if archive was created successfully, False otherwise.
    """
    try:
        ensure_directory(os.path.dirname(archive_path))

        with zipfile.ZipFile(
            archive_path,
            mode='w',
            compression=ZIP_DEFLATED,
            compresslevel=9,
        ) as zf:
            total = len(files)
            for idx, file_path in enumerate(files, 1):
                arcname = os.path.relpath(file_path, repo_root)
                zf.write(file_path, arcname)
                # Progress indicator
                if total > 100 and idx % 50 == 0:
                    print(f"  Progress: {idx}/{total} files...")
                elif total > 10 and idx % 10 == 0:
                    print(f"  Progress: {idx}/{total} files...")

        return True
    except Exception as e:
        print(f"Error creating archive: {e}")
        # Remove partially created archive
        if os.path.isfile(archive_path):
            os.remove(archive_path)
        return False


def validate_archive(archive_path: str) -> bool:
    """
    Validate ZIP archive integrity using testzip().

    Args:
        archive_path: Path to the ZIP archive.

    Returns:
        True if archive is valid, False otherwise.
    """
    try:
        with zipfile.ZipFile(archive_path, 'r') as zf:
            result = zf.testzip()
            if result is not None:
                print(f"Corrupted file in archive: {result}")
                return False
        return True
    except zipfile.BadZipFile:
        print("Error: Invalid ZIP file format")
        return False
    except Exception as e:
        print(f"Archive validation failed: {e}")
        return False


def backup_files(version_dirs: list, repo_root: str) -> bool:
    """
    Move version directories to backup location.

    Preserves the directory structure relative to repo_root.

    Args:
        version_dirs: List of version directory paths to back up.
        repo_root: Root directory of the repository.

    Returns:
        True if all operations succeeded, False otherwise.
    """
    backup_root = os.path.join(repo_root, BACKUP_DIR)
    ensure_directory(backup_root)

    try:
        for src_path in version_dirs:
            rel_path = os.path.relpath(src_path, repo_root)
            dst_path = os.path.join(backup_root, rel_path)

            ensure_directory(os.path.dirname(dst_path))

            if os.path.exists(dst_path):
                # If backup destination already exists, remove it first
                shutil.rmtree(dst_path)

            shutil.move(src_path, dst_path)
            print(f"  Backed up: {rel_path}")

        return True
    except Exception as e:
        print(f"Error during backup: {e}")
        return False


def remove_files(version_dirs: list) -> bool:
    """
    Remove version directories.

    Args:
        version_dirs: List of directory paths to remove.

    Returns:
        True if all removals succeeded, False otherwise.
    """
    try:
        for dir_path in version_dirs:
            rel_path = os.path.basename(dir_path)
            shutil.rmtree(dir_path)
            print(f"  Removed: {rel_path}")

        return True
    except Exception as e:
        print(f"Error during removal: {e}")
        return False


def calculate_archive_size(files: list) -> int:
    """
    Estimate the size of files to be archived.

    Args:
        files: List of file paths.

    Returns:
        Total size in bytes.
    """
    return calculate_total_size(files)
