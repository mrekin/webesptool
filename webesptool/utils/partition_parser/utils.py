"""
Utility functions for ESP-IDF Partition Table.
"""

from typing import Optional

from .models import PartitionTable


def find_partition_by_type(
    table: PartitionTable, type_val: int, subtypes: list[int]
) -> Optional[int]:
    """
    Find partition offset by type_val and list of subtypes.

    This function searches for partition entries matching the specified type_val
    and any of the provided subtypes. Results are prioritized by subtype order
    and then by minimal offset.

    Analogous to findBestMatch() from frontend/src/lib/utils/esp.ts:236-256

    Args:
        table: PartitionTable object to search
        type_val: Partition type (0x00=APP, 0x01=DATA)
        subtypes: List of subtypes in priority order

    Returns:
        Partition offset or None if not found

    Example:
        >>> table = parse_partitions_file("partitions.bin")
        >>> # Find factory app partition (ota_0 priority, then factory)
        >>> offset = find_partition_by_type(table, 0x00, [0x10, 0x00])
        >>> # Find littlefs partition (littlefs priority, then spiffs, then custom)
        >>> offset = find_partition_by_type(table, 0x01, [0x09, 0x08, 0x82])
    """
    if not table or not table.entries:
        return None

    # Filter entries by type_val and subtype
    matches = [
        entry for entry in table.entries
        if entry.type_val == type_val and entry.subtype in subtypes
    ]

    if not matches:
        return None

    # Sort by subtype priority (index in subtypes list), then by minimal offset
    prioritized = sorted(
        matches,
        key=lambda e: (subtypes.index(e.subtype), e.offset)
    )

    return prioritized[0].offset
