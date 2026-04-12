"""
Firmware Archive Manager.

Interactive CLI tool for archiving firmware versions in repositories.
Creates ZIP archives with optional backup of original files.
"""

from .archiver import (
    backup_files,
    calculate_archive_size,
    create_archive,
    remove_files,
    validate_archive,
)
from .config_loader import get_repositories, load_config
from .version_utils import (
    collect_all_versions,
    filter_versions_below,
    filter_versions_up_to,
    sort_versions,
)

__all__ = [
    # Config
    "load_config",
    "get_repositories",
    # Version utils
    "collect_all_versions",
    "sort_versions",
    "filter_versions_below",
    "filter_versions_up_to",
    # Archiver
    "create_archive",
    "validate_archive",
    "backup_files",
    "remove_files",
    "calculate_archive_size",
]

__version__ = "1.0.0"
