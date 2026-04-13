"""
Archive creation and management for archive manager.

Handles ZIP and 7z archive creation, validation, backup and file removal.
"""

import os
import shutil
import zipfile
from zipfile import ZIP_DEFLATED

import py7zr

from .const import ARCHIVE_DIR, BACKUP_DIR, DEFAULT_FORMAT
from .file_operations import (
    calculate_total_size,
    collect_files_in_directory,
    ensure_directory,
    format_size,
)


def create_archive(files: list, archive_path: str, repo_root: str, archive_format: str = None) -> bool:
    """
    Create an archive (ZIP or 7z) containing the specified files.

    Files are stored with their relative paths from repo_root,
    preserving the directory structure.

    Args:
        files: List of absolute file paths to include.
        archive_path: Destination path for the archive.
        repo_root: Root directory for computing relative paths.
        archive_format: Archive format ('7z' or 'zip'). Defaults to DEFAULT_FORMAT.

    Returns:
        True if archive was created successfully, False otherwise.
    """
    fmt = archive_format or DEFAULT_FORMAT

    if fmt == '7z':
        return _create_archive_7z(files, archive_path, repo_root)
    else:
        return _create_archive_zip(files, archive_path, repo_root)


def _create_archive_zip(files: list, archive_path: str, repo_root: str) -> bool:
    """
    Create a ZIP archive containing the specified files.

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


def _create_archive_7z(files: list, archive_path: str, repo_root: str) -> bool:
    """
    Create a 7z archive containing the specified files using py7zr.

    Uses FILTER_LZMA2 with maximum compression preset.

    Args:
        files: List of absolute file paths to include.
        archive_path: Destination path for the 7z archive.
        repo_root: Root directory for computing relative paths.

    Returns:
        True if archive was created successfully, False otherwise.
    """
    try:
        ensure_directory(os.path.dirname(archive_path))

        # Build list of (file_path, arcname) tuples
        arc_files = []
        for file_path in files:
            arcname = os.path.relpath(file_path, repo_root)
            arc_files.append((file_path, arcname))

        total = len(arc_files)

        # Use maximum compression (LZMA2, preset 9)
        filters = [{'id': py7zr.FILTER_LZMA2, 'preset': 9}]
        with py7zr.SevenZipFile(archive_path, mode='w', filters=filters) as zf:
            for idx, (file_path, arcname) in enumerate(arc_files, 1):
                zf.write(file_path, arcname)
                # Progress indicator
                if total > 100:
                    if idx % 50 == 0:
                        print(f"  Progress: {idx}/{total} files...")
                elif total > 10:
                    if idx % 10 == 0:
                        print(f"  Progress: {idx}/{total} files...")

        return True
    except Exception as e:
        print(f"Error creating 7z archive: {e}")
        # Remove partially created archive
        if os.path.isfile(archive_path):
            os.remove(archive_path)
        return False


def validate_archive(archive_path: str) -> bool:
    """
    Validate archive integrity by testing it.

    Supports both ZIP and 7z formats based on file extension.

    Args:
        archive_path: Path to the archive.

    Returns:
        True if archive is valid, False otherwise.
    """
    ext = os.path.splitext(archive_path)[1].lower()

    if ext == '.7z':
        return _validate_7z(archive_path)
    else:
        return _validate_zip(archive_path)


def _validate_zip(archive_path: str) -> bool:
    """Validate ZIP archive integrity using testzip()."""
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


def _validate_7z(archive_path: str) -> bool:
    """Validate 7z archive integrity using py7zr test()."""
    try:
        print(f"  Opening archive: {archive_path}")
        with py7zr.SevenZipFile(archive_path, mode='r') as zf:
            # Display archive info
            print(f"  Archive info: {zf.archiveinfo()}")

            # List files in archive
            files = zf.list()
            print(f"  Files in archive: {len(files)}")

            # Check CRC in files
            print("  Checking CRC for files:")
            crc_count = 0
            for f in files[:10]:  # Check first 10 files
                crc = f.crc if hasattr(f, 'crc') else None
                if crc:
                    crc_count += 1
                print(f"    {f.filename if hasattr(f, 'filename') else '?'}: CRC={crc}")

            print(f"  Files with CRC (first 10): {crc_count}/10")

            # Show first few files as sample
            print("  Sample files (first 5):")
            for f in files[:5]:
                print(f"    - {f.filename if hasattr(f, 'filename') else f}")

            # Run integrity test
            print("  Running integrity test...")
            result = zf.test()
            print(f"  Test result: {result}")

            # test() returns True (CRC OK), False (CRC error), or None (no CRC)
            # Both True and None mean success, only False means failure
            return result is not False
    except Exception as e:
        print(f"7z archive validation failed: {e}")
        import traceback
        traceback.print_exc()
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
