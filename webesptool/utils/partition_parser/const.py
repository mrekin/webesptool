"""
Constants for ESP-IDF Partition Table format.
"""

# Magic numbers (after little-endian unpacking)
PARTITION_MAGIC = 0x50AA  # Actual value after unpacking from bytes 0xAA, 0x50
PARTITION_END_MARKER = 0xEBEB  # End marker after unpacking from bytes 0xEB, 0xEB

# Partition entry size in bytes
PARTITION_ENTRY_SIZE = 32
# MD5 checksum size in bytes
MD5_SIZE = 16

# Partition types
PARTITION_TYPE_APP = 0x00
PARTITION_TYPE_DATA = 0x01

# App subtypes
PARTITION_SUBTYPE_APP_FACTORY = 0x00
PARTITION_SUBTYPE_APP_OTA_0 = 0x10
PARTITION_SUBTYPE_APP_OTA_1 = 0x11
PARTITION_SUBTYPE_APP_OTA_2 = 0x12
PARTITION_SUBTYPE_APP_OTA_3 = 0x13
PARTITION_SUBTYPE_APP_OTA_4 = 0x14
PARTITION_SUBTYPE_APP_OTA_5 = 0x15
PARTITION_SUBTYPE_APP_OTA_6 = 0x16
PARTITION_SUBTYPE_APP_OTA_7 = 0x17
PARTITION_SUBTYPE_APP_OTA_8 = 0x18
PARTITION_SUBTYPE_APP_OTA_9 = 0x19
PARTITION_SUBTYPE_APP_OTA_10 = 0x1A
PARTITION_SUBTYPE_APP_OTA_11 = 0x1B
PARTITION_SUBTYPE_APP_OTA_12 = 0x1C
PARTITION_SUBTYPE_APP_OTA_13 = 0x1D
PARTITION_SUBTYPE_APP_OTA_14 = 0x1E
PARTITION_SUBTYPE_APP_OTA_15 = 0x1F
PARTITION_SUBTYPE_APP_TEST = 0x20

# Data subtypes
PARTITION_SUBTYPE_DATA_OTA = 0x00
PARTITION_SUBTYPE_DATA_PHY = 0x01
PARTITION_SUBTYPE_DATA_NVS = 0x02
PARTITION_SUBTYPE_DATA_NVS_KEYS = 0x03
PARTITION_SUBTYPE_DATA_EFUSE = 0x04
PARTITION_SUBTYPE_DATA_UNDEFINED = 0x05
PARTITION_SUBTYPE_DATA_ESPHTTPD = 0x06
PARTITION_SUBTYPE_DATA_FAT = 0x07
PARTITION_SUBTYPE_DATA_SPIFFS = 0x08
PARTITION_SUBTYPE_DATA_LITTLEFS = 0x09  # Added for littlefs support
PARTITION_SUBTYPE_DATA_DESCRIPTORS = 0x10  # Changed from 0x09 to 0x10
PARTITION_SUBTYPE_DATA_COREDUMP = 0xFE

# Type and subtype name mappings
TYPE_NAMES = {
    PARTITION_TYPE_APP: "app",
    PARTITION_TYPE_DATA: "data",
}

APP_SUBTYPE_NAMES = {
    PARTITION_SUBTYPE_APP_FACTORY: "factory",
    PARTITION_SUBTYPE_APP_TEST: "test",
    **{PARTITION_SUBTYPE_APP_OTA_0 + i: f"ota_{i}" for i in range(16)},
}

DATA_SUBTYPE_NAMES = {
    PARTITION_SUBTYPE_DATA_OTA: "ota",
    PARTITION_SUBTYPE_DATA_PHY: "phy",
    PARTITION_SUBTYPE_DATA_NVS: "nvs",
    PARTITION_SUBTYPE_DATA_NVS_KEYS: "nvs_keys",
    PARTITION_SUBTYPE_DATA_EFUSE: "efuse",
    PARTITION_SUBTYPE_DATA_UNDEFINED: "undefined",
    PARTITION_SUBTYPE_DATA_ESPHTTPD: "esphttpd",
    PARTITION_SUBTYPE_DATA_FAT: "fat",
    PARTITION_SUBTYPE_DATA_SPIFFS: "spiffs",
    PARTITION_SUBTYPE_DATA_LITTLEFS: "littlefs",  # Added for littlefs support
    PARTITION_SUBTYPE_DATA_DESCRIPTORS: "descriptors",
    PARTITION_SUBTYPE_DATA_COREDUMP: "coredump",
    # Custom/legacy values found in some partition tables
    0x82: "spiffs",  # spiffs with flag bit set
    0x03: "coredump",  # Legacy coredump value
}

# Alignment
PARTITION_ALIGNMENT = 0x1000  # 4KB

# Flags
PARTITION_FLAG_ENCRYPTED = 0x01


def get_subtype_name(partition_type: int, subtype: int) -> str:
    """
    Get human-readable subtype name.

    Args:
        partition_type: Partition type (app or data)
        subtype: Partition subtype value

    Returns:
        Human-readable subtype name or hex value if unknown
    """
    if partition_type == PARTITION_TYPE_APP:
        return APP_SUBTYPE_NAMES.get(subtype, f"0x{subtype:02x}")
    elif partition_type == PARTITION_TYPE_DATA:
        return DATA_SUBTYPE_NAMES.get(subtype, f"0x{subtype:02x}")
    return f"0x{subtype:02x}"


def get_type_name(partition_type: int) -> str:
    """
    Get human-readable type name.

    Args:
        partition_type: Partition type value

    Returns:
        Human-readable type name or hex value if unknown
    """
    return TYPE_NAMES.get(partition_type, f"0x{partition_type:02x}")
