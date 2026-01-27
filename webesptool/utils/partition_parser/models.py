"""
Data models for ESP-IDF Partition Table.
"""

from dataclasses import dataclass, field
from typing import Optional

from .const import get_type_name, get_subtype_name


@dataclass
class PartitionEntry:
    """
    Represents a single partition entry in ESP-IDF partition table.

    Attributes:
        name: Partition name (max 16 characters)
        type_val: Raw partition type value (app=0x00, data=0x01)
        subtype: Raw partition subtype value
        offset: Partition offset in flash (bytes)
        size: Partition size (bytes)
        flags: Partition flags
    """

    name: str
    type_val: int
    subtype: int
    offset: int
    size: int
    flags: int

    @property
    def type_name(self) -> str:
        """Get human-readable partition type name."""
        return get_type_name(self.type_val)

    @property
    def subtype_name(self) -> str:
        """Get human-readable partition subtype name."""
        return get_subtype_name(self.type_val, self.subtype)

    @property
    def offset_hex(self) -> str:
        """Get offset as hex string (0xXXXXXX)."""
        return f"0x{self.offset:x}"

    @property
    def size_hex(self) -> str:
        """Get size as hex string (0xXXXXXX)."""
        return f"0x{self.size:x}"

    @property
    def offset_kb(self) -> float:
        """Get offset in kilobytes."""
        return self.offset / 1024

    @property
    def size_kb(self) -> float:
        """Get size in kilobytes."""
        return self.size / 1024

    @property
    def size_mb(self) -> float:
        """Get size in megabytes."""
        return self.size / (1024 * 1024)

    @property
    def encrypted(self) -> bool:
        """Check if partition is encrypted."""
        return bool(self.flags & 0x01)

    def to_dict(self, human_readable: bool = False) -> dict:
        """
        Convert partition entry to dictionary.

        Args:
            human_readable: If True, include human-readable sizes and names

        Returns:
            Dictionary representation of partition entry
        """
        result = {
            "name": self.name,
            "type": self.type_name,
            "subtype": self.subtype_name,
            "offset": self.offset,
            "size": self.size,
            "flags": self.flags,
        }

        if human_readable:
            result.update(
                {
                    "offset_hex": self.offset_hex,
                    "size_hex": self.size_hex,
                    "size_kb": round(self.size_kb, 2),
                    "size_mb": round(self.size_mb, 2),
                    "encrypted": self.encrypted,
                }
            )

        return result


@dataclass
class PartitionTable:
    """
    Represents ESP-IDF partition table.

    Attributes:
        md5: MD5 checksum of partition table (None if not present)
        entries: List of partition entries
    """

    md5: Optional[bytes]
    entries: list[PartitionEntry] = field(default_factory=list)

    def add_entry(self, entry: PartitionEntry) -> None:
        """Add a partition entry to the table."""
        self.entries.append(entry)

    def get_by_name(self, name: str) -> Optional[PartitionEntry]:
        """
        Find partition entry by name.

        Args:
            name: Partition name to search for

        Returns:
            PartitionEntry if found, None otherwise
        """
        for entry in self.entries:
            if entry.name == name:
                return entry
        return None

    def to_dict(self, human_readable: bool = False) -> dict:
        """
        Convert partition table to dictionary.

        Args:
            human_readable: If True, include human-readable sizes and names

        Returns:
            Dictionary representation of partition table
        """
        result = {
            "partitions": [entry.to_dict(human_readable) for entry in self.entries],
        }

        if self.md5:
            result["md5"] = self.md5.hex()

        return result
