"""
Formatters for ESP-IDF Partition Table output.
"""

import csv
import json
from io import StringIO
from pathlib import Path

from .models import PartitionTable


def format_json(
    table: PartitionTable, human_readable: bool = True, indent: int = 2
) -> str:
    """
    Format partition table as JSON string.

    Args:
        table: PartitionTable to format
        human_readable: If True, include human-readable sizes and names
        indent: JSON indentation level

    Returns:
        JSON formatted string
    """
    data = table.to_dict(human_readable=human_readable)
    return json.dumps(data, indent=indent)


def format_csv(table: PartitionTable) -> str:
    """
    Format partition table as CSV string.

    Args:
        table: PartitionTable to format

    Returns:
        CSV formatted string (similar to ESP-IDF CSV format)
    """
    output = StringIO()

    writer = csv.writer(output)
    # Write header
    writer.writerow(["Name", "Type", "SubType", "Offset", "Size", "Flags"])

    # Write entries
    for entry in table.entries:
        writer.writerow(
            [
                entry.name,
                entry.type_name,
                entry.subtype_name,
                f"0x{entry.offset:x}",
                f"0x{entry.size:x}",
                f"0x{entry.flags:x}",
            ]
        )

    return output.getvalue()


def write_json(
    table: PartitionTable,
    output_path: str | Path,
    human_readable: bool = True,
    indent: int = 2,
) -> None:
    """
    Write partition table to JSON file.

    Args:
        table: PartitionTable to write
        output_path: Output file path
        human_readable: If True, include human-readable sizes and names
        indent: JSON indentation level
    """
    path = Path(output_path)
    path.write_text(format_json(table, human_readable=human_readable, indent=indent))


def write_csv(table: PartitionTable, output_path: str | Path) -> None:
    """
    Write partition table to CSV file.

    Args:
        table: PartitionTable to write
        output_path: Output file path
    """
    path = Path(output_path)
    path.write_text(format_csv(table))


def format_text(table: PartitionTable, verbose: bool = False) -> str:
    """
    Format partition table as human-readable text.

    Args:
        table: PartitionTable to format
        verbose: If True, show additional details

    Returns:
        Text formatted string
    """
    lines = []

    lines.append(f"Partition Table ({len(table.entries)} entries)")
    lines.append("=" * 80)

    for entry in table.entries:
        lines.append(f"\nPartition: {entry.name}")
        lines.append(f"  Type:      {entry.type_name}")
        lines.append(f"  SubType:   {entry.subtype_name}")
        lines.append(f"  Offset:    0x{entry.offset:x} ({entry.offset_kb:.2f} KB)")
        lines.append(f"  Size:      0x{entry.size:x} ({entry.size_mb:.2f} MB)")
        lines.append(f"  Flags:     0x{entry.flags:02x}")

        if verbose:
            if entry.encrypted:
                lines.append(f"  Encrypted: Yes")

    return "\n".join(lines)


def format_analysis(table: PartitionTable, indent: int = 2) -> str:
    """
    Format partition table analysis as JSON string.

    Provides summary information about the partition table including
    flash size (rounded to powers of 2), partition count, and offsets.

    Args:
        table: PartitionTable to analyze
        indent: JSON indentation level

    Returns:
        JSON formatted string with analysis data
    """
    # Find partition with maximum (offset + size) instead of using last entry
    if table.entries:
        last_entry = max(table.entries, key=lambda e: e.offset + e.size)
        flash_size_bytes = last_entry.offset + last_entry.size
    else:
        flash_size_bytes = 0

    flash_size_mb = flash_size_bytes / (1024 * 1024)

    # Round to nearest power of 2 (2, 4, 8, 16 MB)
    # Round UP to ensure flash size is >= last partition
    for power in [2, 4, 8, 16]:
        if flash_size_mb <= power:
            flash_size_str = f"{power}MB"
            break
    else:
        # Fallback for larger sizes - round up to nearest MB
        flash_size_str = f"{int(flash_size_mb) + (1 if flash_size_mb % 1 else 0)}MB"

    # Build partitions dict: {name: offset_hex}
    partitions_dict = {entry.name: entry.offset_hex for entry in table.entries}

    # Build analysis data
    analysis = {
        "flash_size_mb": flash_size_str,
        "flash_size_bytes": flash_size_bytes,
        "partition_count": len(table.entries),
        "partitions": partitions_dict,
    }

    return json.dumps(analysis, indent=indent)
