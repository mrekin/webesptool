#!/usr/bin/env python3
"""
CLI interface for firmware archive manager.

Interactive console script for archiving firmware versions.

Usage:
    cd webesptool/utils/archive_manager/
    ./cli.py

Or run as module:
    cd webesptool/
    python -m utils.archive_manager.cli
"""

import os
import sys

# Fix imports when running script directly
if __name__ == "__main__" and __package__ is None:
    # Add parent directory to path for imports
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))
    __package__ = "webesptool.utils.archive_manager"

from .archiver import (
    backup_files,
    calculate_archive_size,
    create_archive,
    remove_files,
    validate_archive,
)
from .config_loader import (
    get_repositories,
    get_repository_path,
    get_repository_type,
    load_config,
)
from .const import (
    ARCHIVE_DIR,
    EXIT_ERROR_ARCHIVE_CREATE,
    EXIT_ERROR_ARCHIVE_VALIDATION,
    EXIT_ERROR_CONFIG,
    EXIT_ERROR_DISK_SPACE,
    EXIT_ERROR_NO_REPOS,
    EXIT_ERROR_NO_VERSIONS,
    EXIT_ERROR_USER_CANCEL,
    EXIT_SUCCESS,
)
from .file_operations import (
    collect_files_in_directory,
    ensure_directory,
    format_size,
    get_disk_space,
)
from .version_utils import (
    collect_all_versions,
    filter_versions_below,
    filter_versions_up_to,
    get_version_range_name,
    sort_versions,
)


def select_repository(repos: list) -> dict:
    """
    Display available repositories and let user select one.

    Args:
        repos: List of repository dicts.

    Returns:
        Selected repository dict, or None if cancelled.
    """
    print("\nAvailable repositories:")
    print("-" * 40)
    for idx, repo in enumerate(repos, 1):
        path = repo.get('path', '')
        src = repo.get('src', '') or path
        desc = repo.get('desc', '')
        repo_type = repo.get('type', 'meshtastic')
        label = f"  {idx}. {src}"
        if desc:
            label += f" - {desc}"
        label += f" [{repo_type}]"
        print(label)
    print()

    while True:
        try:
            choice = input("Select repository (number) or 'q' to quit: ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            return None

        if choice.lower() == 'q':
            return None

        try:
            idx = int(choice) - 1
            if 0 <= idx < len(repos):
                return repos[idx]
            print(f"Please enter a number between 1 and {len(repos)}")
        except ValueError:
            print("Please enter a valid number or 'q' to quit")


def select_versions(sorted_versions: list) -> list:
    """
    Let user select versions for archiving.

    Offers two modes:
    1. All versions up to and including a specified version (by number)
    2. Specific versions by number

    Args:
        sorted_versions: List of version strings sorted descending.

    Returns:
        List of selected version strings, or None if cancelled.
    """
    print("\nAvailable versions (newest first):")
    print("-" * 40)
    for idx, ver in enumerate(sorted_versions, 1):
        print(f"  {idx}. {ver}")
    print()

    while True:
        try:
            mode = input(
                "Select mode:\n"
                "  1. All versions up to (including) specified version\n"
                "  2. Select specific versions\n"
                "Choice (1/2) or 'q' to quit: "
            ).strip()
        except (KeyboardInterrupt, EOFError):
            print()
            return None

        if mode.lower() == 'q':
            return None

        if mode == '1':
            return _select_below_threshold(sorted_versions)
        elif mode == '2':
            return _select_specific(sorted_versions)
        else:
            print("Please enter 1 or 2")


def _select_below_threshold(sorted_versions: list) -> list:
    """
    Select all versions up to and including a user-specified version.

    Args:
        sorted_versions: All available versions sorted descending.

    Returns:
        List of filtered versions, or None if cancelled.
    """
    print(f"\nNewest version: {sorted_versions[0]}")
    print(f"Oldest version: {sorted_versions[-1]}")

    while True:
        try:
            idx_input = input(
                "Enter version number from the list above (this and all older will be selected),\n"
                "or 'q' to quit: "
            ).strip()
        except (KeyboardInterrupt, EOFError):
            print()
            return None

        if idx_input.lower() == 'q':
            return None

        if not idx_input:
            print("Please enter a number")
            continue

        try:
            idx = int(idx_input) - 1  # Convert to 0-based index
            if idx < 0 or idx >= len(sorted_versions):
                print(f"Please enter a number between 1 and {len(sorted_versions)}")
                continue
        except ValueError:
            print("Please enter a valid number")
            continue

        threshold = sorted_versions[idx]
        filtered = filter_versions_up_to(sorted_versions, threshold)
        if not filtered:
            print(f"No versions found below '{threshold}'")
            continue

        print(f"\nSelected {len(filtered)} version(s) below '{threshold}':")
        for v in filtered:
            print(f"  - {v}")

        return filtered


def _select_specific(sorted_versions: list) -> list:
    """
    Select specific versions by number.

    Supports individual numbers and ranges (e.g., '1 2 3' or '1-5 8').

    Args:
        sorted_versions: All available versions sorted descending.

    Returns:
        List of selected versions, or None if cancelled.
    """
    while True:
        try:
            raw = input(
                "Enter version numbers (e.g., '1 2 3' or '1-5 8'),\n"
                "or 'q' to quit: "
            ).strip()
        except (KeyboardInterrupt, EOFError):
            print()
            return None

        if raw.lower() == 'q':
            return None

        if not raw:
            print("Please enter at least one number")
            continue

        indices = _parse_number_input(raw, len(sorted_versions))
        if indices is None:
            continue

        selected = [sorted_versions[i] for i in indices]
        print(f"\nSelected {len(selected)} version(s):")
        for v in selected:
            print(f"  - {v}")

        return selected


def _parse_number_input(raw: str, max_count: int) -> list:
    """
    Parse user input with numbers and ranges.

    Args:
        raw: Raw user input string.
        max_count: Maximum valid index + 1.

    Returns:
        Sorted list of unique 0-based indices, or None on error.
    """
    indices = set()
    try:
        for part in raw.split():
            if '-' in part:
                # Range: '1-5'
                start, end = part.split('-', 1)
                start = int(start)
                end = int(end)
                if start < 1 or end < 1 or start > max_count or end > max_count:
                    print(f"Range {part} is out of bounds (1-{max_count})")
                    return None
                lo, hi = min(start, end), max(start, end)
                indices.update(range(lo - 1, hi))
            else:
                idx = int(part)
                if idx < 1 or idx > max_count:
                    print(f"Number {idx} is out of bounds (1-{max_count})")
                    return None
                indices.add(idx - 1)
    except ValueError:
        print("Invalid input. Use numbers and ranges like '1 2 3' or '1-5 8'")
        return None

    if not indices:
        print("No valid selections")
        return None

    return sorted(indices)


def display_preview(selected_versions: list, version_map: dict, repo_root: str) -> int:
    """
    Display preview of files that will be archived.

    Args:
        selected_versions: List of selected version strings.
        version_map: Dict mapping version to list of directory paths.
        repo_root: Root path of the repository.

    Returns:
        Total number of files to be archived.
    """
    print("\n" + "=" * 60)
    print("PREVIEW: Files to be archived")
    print("=" * 60)

    all_files = []
    for ver in selected_versions:
        dirs = version_map.get(ver, [])
        if not dirs:
            continue

        print(f"\nVersion: {ver}")
        for d in dirs:
            rel = os.path.relpath(d, repo_root)
            files = collect_files_in_directory(d)
            print(f"  {rel}/ ({len(files)} file(s))")
            all_files.extend(files)

    total_size = calculate_archive_size(all_files)

    print("\n" + "-" * 60)
    print(f"Total: {len(all_files)} file(s), {format_size(total_size)}")
    print(f"Archive name: {get_version_range_name(selected_versions)}.zip")
    print("-" * 60)

    return len(all_files)


def confirm_action(prompt: str) -> bool:
    """
    Ask user for confirmation with Y/n prompt.

    Args:
        prompt: Prompt message to display.

    Returns:
        True if confirmed (Y/Enter), False if rejected.
    """
    try:
        answer = input(f"{prompt} (Y/n): ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print()
        return False

    return answer in ('', 'y', 'yes')


def display_success(archive_path: str) -> None:
    """
    Display success message with archive details.

    Args:
        archive_path: Path to the created archive.
    """
    archive_size = os.path.getsize(archive_path)
    print("\n" + "=" * 60)
    print("Archive created successfully!")
    print(f"  Path: {archive_path}")
    print(f"  Size: {format_size(archive_size)}")
    print("=" * 60)


def main() -> int:
    """
    Main CLI entry point.

    Returns:
        Exit code (see const.py for codes).
    """
    try:
        print("=" * 60)
        print("Firmware Archive Manager")
        print("=" * 60)
        print()
        print("Usage: cd webesptool/utils/archive_manager/ && ./cli.py")
        print("   Or:  cd webesptool/ && python -m utils.archive_manager.cli")
        print()

        # Load configuration
        try:
            config = load_config()
        except FileNotFoundError as e:
            print(f"Error: {e}")
            return EXIT_ERROR_CONFIG
        except Exception as e:
            print(f"Error loading configuration: {e}")
            return EXIT_ERROR_CONFIG

        # Get repositories
        repos = get_repositories(config)
        if not repos:
            print("Error: No repositories found in configuration")
            return EXIT_ERROR_NO_REPOS

        # Select repository
        repo = select_repository(repos)
        if repo is None:
            print("Operation cancelled")
            return EXIT_ERROR_USER_CANCEL

        repo_root = get_repository_path(repo)
        repo_type = get_repository_type(repo)
        print(f"\nSelected: {repo.get('src', repo.get('path', ''))} [{repo_type}]")

        if not os.path.isdir(repo_root):
            print(f"Error: Repository path does not exist: {repo_root}")
            return EXIT_ERROR_CONFIG

        # Collect all versions
        print("\nScanning repository for firmware versions...")
        version_map = collect_all_versions(repo_root)

        if not version_map:
            print("No firmware versions found in repository")
            return EXIT_ERROR_NO_VERSIONS

        # Sort versions
        sorted_versions = sort_versions(list(version_map.keys()))
        print(f"Found {len(sorted_versions)} unique version(s)")

        # Select versions for archiving
        selected = select_versions(sorted_versions)
        if selected is None:
            print("Operation cancelled")
            return EXIT_ERROR_USER_CANCEL

        if not selected:
            print("No versions selected")
            return EXIT_ERROR_NO_VERSIONS

        # Collect files for selected versions
        all_dirs = []
        all_files = []
        for ver in selected:
            dirs = version_map.get(ver, [])
            all_dirs.extend(dirs)
            for d in dirs:
                all_files.extend(collect_files_in_directory(d))

        if not all_files:
            print("No files found for selected versions")
            return EXIT_ERROR_NO_VERSIONS

        # Display preview
        display_preview(selected, version_map, repo_root)

        # Confirm operation
        if not confirm_action("\nProceed with archiving?"):
            print("Operation cancelled")
            return EXIT_ERROR_USER_CANCEL

        # Check disk space
        estimated_size = calculate_archive_size(all_files)
        available_space = get_disk_space(repo_root)
        if estimated_size > available_space:
            print(
                f"Error: Insufficient disk space. "
                f"Need {format_size(estimated_size)}, "
                f"available {format_size(available_space)}"
            )
            return EXIT_ERROR_DISK_SPACE

        # Create archive
        archive_name = get_version_range_name(selected) + ".zip"
        archive_dir = os.path.join(repo_root, ARCHIVE_DIR)
        archive_path = os.path.join(archive_dir, archive_name)

        # Check if archive already exists
        if os.path.isfile(archive_path):
            if not confirm_action(f"Archive {archive_name} already exists. Overwrite?"):
                print("Operation cancelled")
                return EXIT_ERROR_USER_CANCEL

        print(f"\nCreating archive: {archive_path}")
        if not create_archive(all_files, archive_path, repo_root):
            print("Error: Failed to create archive")
            return EXIT_ERROR_ARCHIVE_CREATE

        # Validate archive
        print("Validating archive integrity...")
        if not validate_archive(archive_path):
            print("Error: Archive integrity check failed")
            # Remove corrupted archive
            if os.path.isfile(archive_path):
                os.remove(archive_path)
            return EXIT_ERROR_ARCHIVE_VALIDATION

        print("Archive integrity verified")

        # Ask about backup
        if confirm_action("Create backup of original files?"):
            print("\nBacking up original files...")
            if not backup_files(all_dirs, repo_root):
                print("Warning: Backup encountered errors. Archive is safe.")
        else:
            print("\nRemoving original files...")
            if not remove_files(all_dirs):
                print("Warning: Some files could not be removed. Archive is safe.")

        # Display success
        display_success(archive_path)

        return EXIT_SUCCESS

    except KeyboardInterrupt:
        print("\n\nOperation interrupted by user")
        return EXIT_ERROR_USER_CANCEL


if __name__ == "__main__":
    sys.exit(main())
