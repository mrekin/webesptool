"""
ESP-IDF Partition Table Parser.

This module provides functionality for parsing ESP-IDF partition table binary files
and extracting partition information in various formats.

Example usage:
    from partition_parser import parse_partitions_file, format_json

    table = parse_partitions_file("partitions.bin")
    json_output = format_json(table)
    print(json_output)
"""

from .formatters import format_analysis, format_csv, format_json, format_text
from .models import PartitionEntry, PartitionTable
from .parser import ParseError, parse_partitions_file
from .utils import find_partition_by_type
from .validator import ValidationError, validate_partition_table

__all__ = [
    # Models
    "PartitionEntry",
    "PartitionTable",
    # Parser
    "parse_partitions_file",
    "ParseError",
    # Validator
    "validate_partition_table",
    "ValidationError",
    # Formatters
    "format_json",
    "format_csv",
    "format_text",
    "format_analysis",
    # Utils
    "find_partition_by_type",
]

__version__ = "1.0.0"
