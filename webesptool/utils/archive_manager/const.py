"""
Constants for the archive manager module.
"""

# Directory names
ARCHIVE_DIR = "archive"
BACKUP_DIR = "backup"

# File names
VER_INFO_FILE = "ver.info"

# Exit codes
EXIT_SUCCESS = 0
EXIT_ERROR_CONFIG = 1          # Error loading config
EXIT_ERROR_NO_REPOS = 2        # No available repositories
EXIT_ERROR_NO_VERSIONS = 3     # No versions for archiving
EXIT_ERROR_DISK_SPACE = 4      # Insufficient disk space
EXIT_ERROR_ARCHIVE_CREATE = 5  # Error creating archive
EXIT_ERROR_ARCHIVE_VALIDATION = 6  # Archive integrity error
EXIT_ERROR_USER_CANCEL = 130   # Cancelled by user
