"""
Parser for ESP-IDF Partition Table binary format.
"""

import struct
from pathlib import Path
from typing import BinaryIO

import aiofiles

from .const import (
    PARTITION_ALIGNMENT,
    PARTITION_END_MARKER,
    PARTITION_ENTRY_SIZE,
    PARTITION_MAGIC,
)
from .models import PartitionEntry, PartitionTable


class ParseError(Exception):
    """Exception raised for parsing errors."""

    pass


async def parse_partitions_file(file_path: str | Path | BinaryIO) -> PartitionTable:
    """
    Parse ESP-IDF partition table from binary file (ASYNC VERSION).

    Args:
        file_path: Path to partitions.bin file or file-like object (BinaryIO)

    Returns:
        PartitionTable object with parsed entries

    Raises:
        FileNotFoundError: If file doesn't exist
        ParseError: If file format is invalid
    """
    # Handle file-like object (for backward compatibility)
    if hasattr(file_path, 'read'):
        # File-like object - read data from it
        file_path.seek(0)  # Ensure we're at the beginning
        data = file_path.read()
        if not isinstance(data, bytes):
            data = data.encode() if hasattr(data, 'encode') else bytes(data)
    else:
        # Path string or Path object - use async file I/O
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Partition table file not found: {file_path}")

        # Async file reading using aiofiles
        async with aiofiles.open(path, 'rb') as f:
            data = await f.read()

    # Check minimum file size (at least one entry)
    if len(data) < PARTITION_ENTRY_SIZE:
        raise ParseError(
            f"File too small: {len(data)} bytes, expected at least {PARTITION_ENTRY_SIZE} bytes"
        )

    # Parse partition entries
    table = PartitionTable(md5=None)
    offset = 0

    while True:
        # Check if we have enough data for another entry
        if offset + PARTITION_ENTRY_SIZE > len(data):
            raise ParseError(f"Unexpected end of file at offset {offset}")

        entry_data = data[offset : offset + PARTITION_ENTRY_SIZE]

        # Unpack entry
        # Format: H (magic, 2 bytes) + B (type, 1 byte) + B (subtype, 1 byte) +
        #         I (offset, 4 bytes) + I (size, 4 bytes) + 16s (name, 16 bytes) +
        #         I (flags, 4 bytes)
        try:
            (
                magic,
                type_val,
                subtype,
                offset_val,
                size_val,
                name_bytes,
                flags,
            ) = struct.unpack("<HBBII16sI", entry_data)
        except struct.error as e:
            raise ParseError(f"Failed to unpack entry at offset {offset}: {e}")

        # Check for end marker
        if magic == PARTITION_END_MARKER:
            break

        # Validate magic number
        if magic != PARTITION_MAGIC:
            raise ParseError(
                f"Invalid magic number 0x{magic:04x} at offset {offset}, "
                f"expected 0x{PARTITION_MAGIC:04x}"
            )

        # Extract null-terminated name
        name = name_bytes.rstrip(b"\x00").decode("utf-8", errors="replace")

        # Create partition entry
        entry = PartitionEntry(
            name=name,
            type_val=type_val,
            subtype=subtype,
            offset=offset_val,
            size=size_val,
            flags=flags,
        )

        table.add_entry(entry)
        offset += PARTITION_ENTRY_SIZE

    return table


async def parse_partitions_with_validation(
    file_path: str | Path, validate_overlaps: bool = True
) -> PartitionTable:
    """
    Parse ESP-IDF partition table with validation (ASYNC VERSION).

    Args:
        file_path: Path to partitions.bin file
        validate_overlaps: If True, check for partition overlaps

    Returns:
        PartitionTable object with parsed entries

    Raises:
        FileNotFoundError: If file doesn't exist
        ParseError: If file format is invalid or validation fails
    """
    from .validator import validate_partition_table

    table = await parse_partitions_file(file_path)
    validate_partition_table(table, check_overlaps=validate_overlaps)

    return table
