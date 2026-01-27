"""
Validation for ESP-IDF Partition Table.
"""

from .const import PARTITION_ALIGNMENT
from .models import PartitionTable
from .parser import ParseError


class ValidationError(ParseError):
    """Exception raised for validation errors."""

    pass


def validate_partition_table(
    table: PartitionTable, check_overlaps: bool = True
) -> None:
    """
    Validate partition table.

    Args:
        table: PartitionTable to validate
        check_overlaps: If True, check for partition overlaps

    Raises:
        ValidationError: If validation fails
    """
    if not table.entries:
        raise ValidationError("Partition table is empty")

    # Validate each entry
    for i, entry in enumerate(table.entries):
        _validate_entry(entry, i)

    # Check for overlaps if requested
    if check_overlaps:
        _check_overlaps(table)


def _validate_entry(entry, index: int) -> None:
    """
    Validate a single partition entry.

    Args:
        entry: PartitionEntry to validate
        index: Entry index for error messages

    Raises:
        ValidationError: If entry is invalid
    """
    # Check name
    if not entry.name:
        raise ValidationError(f"Entry {index}: empty partition name")

    if len(entry.name) > 16:
        raise ValidationError(
            f"Entry {index} ({entry.name}): name too long ({len(entry.name)} > 16)"
        )

    # Check alignment
    if entry.offset % PARTITION_ALIGNMENT != 0:
        raise ValidationError(
            f"Entry {index} ({entry.name}): offset {entry.offset} is not aligned to {PARTITION_ALIGNMENT} bytes"
        )

    if entry.size % PARTITION_ALIGNMENT != 0 and entry.size != 0xFFFFFFFF:
        raise ValidationError(
            f"Entry {index} ({entry.name}): size {entry.size} is not aligned to {PARTITION_ALIGNMENT} bytes"
        )


def _check_overlaps(table: PartitionTable) -> None:
    """
    Check for partition overlaps.

    Args:
        table: PartitionTable to check

    Raises:
        ValidationError: If overlaps are found
    """
    # Sort entries by offset
    sorted_entries = sorted(
        [e for e in table.entries if e.offset > 0], key=lambda e: e.offset
    )

    for i in range(len(sorted_entries) - 1):
        current = sorted_entries[i]
        next_entry = sorted_entries[i + 1]

        current_end = current.offset + current.size

        # Handle "rest of flash" size (0xFFFFFFFF)
        if current.size == 0xFFFFFFFF:
            continue

        # Check if current partition overlaps with next
        if current_end > next_entry.offset:
            raise ValidationError(
                f"Partition overlap: '{current.name}' (offset={current.offset:#x}, "
                f"size={current.size:#x}, end={current_end:#x}) overlaps with "
                f"'{next_entry.name}' (offset={next_entry.offset:#x})"
            )


def check_alignment(value: int, alignment: int = PARTITION_ALIGNMENT) -> bool:
    """
    Check if a value is aligned to the specified boundary.

    Args:
        value: Value to check
        alignment: Alignment boundary (default 4KB)

    Returns:
        True if aligned, False otherwise
    """
    return value % alignment == 0


def format_size(size_bytes: int) -> str:
    """
    Format size in human-readable format.

    Args:
        size_bytes: Size in bytes

    Returns:
        Formatted size string (e.g., "1.5 MB", "512 KB")
    """
    if size_bytes == 0xFFFFFFFF:
        return "rest of flash"

    mb = size_bytes / (1024 * 1024)
    kb = size_bytes / 1024

    if mb >= 1:
        return f"{mb:.2f} MB"
    elif kb >= 1:
        return f"{kb:.2f} KB"
    else:
        return f"{size_bytes} bytes"
