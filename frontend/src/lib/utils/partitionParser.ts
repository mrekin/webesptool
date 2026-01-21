// ======== Constants ========
const PARTITION_MAGIC = 0x50AA;
const PARTITION_END_MARKER = 0xEBEB;
const PARTITION_ENTRY_SIZE = 32;
const MD5_SIZE = 16;
const PARTITION_ALIGNMENT = 0x1000; // 4KB
const PARTITION_FLAG_ENCRYPTED = 0x01;

// Partition types
const PARTITION_TYPE_APP = 0x00;
const PARTITION_TYPE_DATA = 0x01;

// App subtypes
const PARTITION_SUBTYPE_APP_FACTORY = 0x00;
const PARTITION_SUBTYPE_APP_TEST = 0x20;

// Data subtypes
const PARTITION_SUBTYPE_DATA_OTA = 0x00;
const PARTITION_SUBTYPE_DATA_PHY = 0x01;
const PARTITION_SUBTYPE_DATA_NVS = 0x02;
const PARTITION_SUBTYPE_DATA_NVS_KEYS = 0x03;
const PARTITION_SUBTYPE_DATA_EFUSE = 0x04;
const PARTITION_SUBTYPE_DATA_UNDEFINED = 0x05;
const PARTITION_SUBTYPE_DATA_ESPHTTPD = 0x06;
const PARTITION_SUBTYPE_DATA_FAT = 0x07;
const PARTITION_SUBTYPE_DATA_SPIFFS = 0x08;
const PARTITION_SUBTYPE_DATA_DESCRIPTORS = 0x09;
const PARTITION_SUBTYPE_DATA_COREDUMP = 0xFE;

// Type and subtype name mappings
const TYPE_NAMES: Record<number, string> = {
    [PARTITION_TYPE_APP]: "app",
    [PARTITION_TYPE_DATA]: "data",
};

const APP_SUBTYPE_NAMES: Record<number, string> = {
    [PARTITION_SUBTYPE_APP_FACTORY]: "factory",
    [PARTITION_SUBTYPE_APP_TEST]: "test",
};

// Generate OTA subtype names (ota_0 through ota_15)
for (let i = 0; i < 16; i++) {
    APP_SUBTYPE_NAMES[0x10 + i] = `ota_${i}`;
}

const DATA_SUBTYPE_NAMES: Record<number, string> = {
    [PARTITION_SUBTYPE_DATA_OTA]: "ota",
    [PARTITION_SUBTYPE_DATA_PHY]: "phy",
    [PARTITION_SUBTYPE_DATA_NVS]: "nvs",
    [PARTITION_SUBTYPE_DATA_EFUSE]: "efuse",
    [PARTITION_SUBTYPE_DATA_UNDEFINED]: "undefined",
    [PARTITION_SUBTYPE_DATA_ESPHTTPD]: "esphttpd",
    [PARTITION_SUBTYPE_DATA_FAT]: "fat",
    [PARTITION_SUBTYPE_DATA_SPIFFS]: "spiffs",
    [PARTITION_SUBTYPE_DATA_DESCRIPTORS]: "descriptors",
    [PARTITION_SUBTYPE_DATA_COREDUMP]: "coredump",
    // Custom/legacy values found in some partition tables
    0x82: "spiffs", // spiffs with flag bit set
};

// Note: 0x03 is used for both nvs_keys and legacy coredump in different tables
// We check it dynamically in getSubtypeName

// ======== Types ========
export interface PartitionEntry {
    name: string;
    type_val: number;
    subtype: number;
    offset: number;
    size: number;
    flags: number;
}

export interface PartitionTable {
    md5: string | null;
    entries: PartitionEntry[];
}

export interface PartitionAnalysis {
    flash_size_mb: string;
    flash_size_bytes: number;
    partition_count: number;
    partitions: Record<string, string>;
}

// ======== Error Classes ========
export class ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ParseError";
    }
}

export class ValidationError extends ParseError {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

// ======== Helper Functions ========
function getTypeName(type_val: number): string {
    return TYPE_NAMES[type_val] || `0x${type_val.toString(16).padStart(2, '0')}`;
}

function getSubtypeName(type_val: number, subtype: number): string {
    if (type_val === PARTITION_TYPE_APP) {
        return APP_SUBTYPE_NAMES[subtype] || `0x${subtype.toString(16).padStart(2, '0')}`;
    }
    if (type_val === PARTITION_TYPE_DATA) {
        // Special handling for 0x03 which can be either nvs_keys or legacy coredump
        // Use coredump for legacy tables as per Python implementation
        if (subtype === 0x03) {
            return "coredump"; // Legacy value
        }
        if (subtype === PARTITION_SUBTYPE_DATA_NVS_KEYS) {
            return "nvs_keys";
        }
        return DATA_SUBTYPE_NAMES[subtype] || `0x${subtype.toString(16).padStart(2, '0')}`;
    }
    return `0x${subtype.toString(16).padStart(2, '0')}`;
}

function getOffsetHex(offset: number): string {
    return `0x${offset.toString(16)}`;
}

function getSizeMb(size: number): number {
    return Math.round((size / (1024 * 1024)) * 100) / 100;
}

function getSizeKb(size: number): number {
    return Math.round((size / 1024) * 100) / 100;
}

function isEncrypted(flags: number): boolean {
    return (flags & PARTITION_FLAG_ENCRYPTED) !== 0;
}

// ======== Parser ========
/**
 * Parse ESP-IDF partition table from binary data.
 *
 * @param data - ArrayBuffer or Uint8Array containing partition table binary data
 * @returns PartitionTable object with parsed entries
 * @throws ParseError if data format is invalid
 */
export function parsePartitions(data: ArrayBuffer | Uint8Array): PartitionTable {
    // Convert to Uint8Array if needed
    let uint8Array: Uint8Array;
    if (data instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(data);
    } else {
        uint8Array = data;
    }

    // Check minimum data size (at least one entry)
    if (uint8Array.length < PARTITION_ENTRY_SIZE) {
        throw new ParseError(
            `Data too small: ${uint8Array.length} bytes, expected at least ${PARTITION_ENTRY_SIZE} bytes`
        );
    }

    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const table: PartitionTable = {
        md5: null,
        entries: [],
    };

    let offset = 0;

    while (true) {
        // Check if we have enough data for another entry
        if (offset + PARTITION_ENTRY_SIZE > uint8Array.length) {
            throw new ParseError(`Unexpected end of data at offset ${offset}`);
        }

        // Read magic number (little-endian)
        const magic = dataView.getUint16(offset, true);

        // Check for end marker
        if (magic === PARTITION_END_MARKER) {
            // Try to read MD5 checksum (next 16 bytes)
            const md5Offset = offset + PARTITION_ENTRY_SIZE;
            if (md5Offset + MD5_SIZE <= uint8Array.length) {
                const md5Bytes = uint8Array.slice(md5Offset, md5Offset + MD5_SIZE);
                const allFF = md5Bytes.every(b => b === 0xFF);

                if (!allFF) {
                    table.md5 = Array.from(md5Bytes)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                }
            }
            break;
        }

        // Validate magic number
        if (magic !== PARTITION_MAGIC) {
            throw new ParseError(
                `Invalid magic number 0x${magic.toString(16).padStart(4, '0')} at offset ${offset}, ` +
                `expected 0x${PARTITION_MAGIC.toString(16).padStart(4, '0')}`
            );
        }

        // Read entry fields
        const type_val = dataView.getUint8(offset + 2);
        const subtype = dataView.getUint8(offset + 3);
        const offset_val = dataView.getUint32(offset + 4, true);
        const size_val = dataView.getUint32(offset + 8, true);

        // Extract name (16 bytes, null-terminated)
        const nameBytes = uint8Array.slice(offset + 12, offset + 28);
        const nullIndex = nameBytes.indexOf(0);
        const nameBytesSlice = nullIndex === -1 ? nameBytes : nameBytes.slice(0, nullIndex);
        const name = new TextDecoder('utf-8').decode(nameBytesSlice);

        const flags = dataView.getUint32(offset + 28, true);

        // Create partition entry
        const entry: PartitionEntry = {
            name,
            type_val,
            subtype,
            offset: offset_val,
            size: size_val,
            flags,
        };

        table.entries.push(entry);
        offset += PARTITION_ENTRY_SIZE;
    }

    return table;
}

// ======== Validator ========
/**
 * Validate partition table.
 *
 * @param table - PartitionTable to validate
 * @param checkOverlaps - If true, check for partition overlaps (default: true)
 * @throws ValidationError if validation fails
 */
export function validatePartitionTable(table: PartitionTable, checkOverlaps: boolean = true): void {
    if (table.entries.length === 0) {
        throw new ValidationError("Partition table is empty");
    }

    // Validate each entry
    for (let i = 0; i < table.entries.length; i++) {
        const entry = table.entries[i];

        // Check name
        if (!entry.name) {
            throw new ValidationError(`Entry ${i}: empty partition name`);
        }

        if (entry.name.length > 16) {
            throw new ValidationError(
                `Entry ${i} (${entry.name}): name too long (${entry.name.length} > 16)`
            );
        }

        // Check alignment (4KB = 0x1000)
        if (entry.offset % PARTITION_ALIGNMENT !== 0) {
            throw new ValidationError(
                `Entry ${i} (${entry.name}): offset ${entry.offset} is not aligned to ${PARTITION_ALIGNMENT} bytes`
            );
        }

        if (entry.size !== 0xFFFFFFFF && entry.size % PARTITION_ALIGNMENT !== 0) {
            throw new ValidationError(
                `Entry ${i} (${entry.name}): size ${entry.size} is not aligned to ${PARTITION_ALIGNMENT} bytes`
            );
        }
    }

    // Check for overlaps if requested
    if (checkOverlaps) {
        const sortedEntries = table.entries
            .filter(e => e.offset > 0)
            .sort((a, b) => a.offset - b.offset);

        for (let i = 0; i < sortedEntries.length - 1; i++) {
            const current = sortedEntries[i];
            const next = sortedEntries[i + 1];

            if (current.size === 0xFFFFFFFF) continue;

            const currentEnd = current.offset + current.size;
            if (currentEnd > next.offset) {
                throw new ValidationError(
                    `Partition overlap: '${current.name}' (offset=0x${current.offset.toString(16)}, ` +
                    `size=0x${current.size.toString(16)}, end=0x${currentEnd.toString(16)}) overlaps with ` +
                    `'${next.name}' (offset=0x${next.offset.toString(16)})`
                );
            }
        }
    }
}

// ======== Formatters ========
/**
 * Format partition table as JSON string.
 *
 * @param table - PartitionTable to format
 * @param humanReadable - If true, include human-readable sizes and names (default: true)
 * @param indent - JSON indentation level (default: 2)
 * @returns JSON formatted string
 */
export function formatJson(table: PartitionTable, humanReadable: boolean = true, indent: number = 2): string {
    const partitions = table.entries.map(entry => {
        const result: Record<string, any> = {
            name: entry.name,
            type: getTypeName(entry.type_val),
            subtype: getSubtypeName(entry.type_val, entry.subtype),
            offset: entry.offset,
            size: entry.size,
            flags: entry.flags,
        };

        if (humanReadable) {
            result.offset_hex = getOffsetHex(entry.offset);
            result.size_hex = `0x${entry.size.toString(16)}`;
            result.size_kb = getSizeKb(entry.size);
            result.size_mb = getSizeMb(entry.size);
            result.encrypted = isEncrypted(entry.flags);
        }

        return result;
    });

    const output: Record<string, any> = { partitions };

    if (table.md5) {
        output.md5 = table.md5;
    }

    return JSON.stringify(output, null, indent);
}

/**
 * Format partition table as CSV string.
 *
 * @param table - PartitionTable to format
 * @returns CSV formatted string (similar to ESP-IDF CSV format)
 */
export function formatCsv(table: PartitionTable): string {
    const lines: string[] = [];

    // Header
    lines.push('Name,Type,SubType,Offset,Size,Flags');

    // Entries
    for (const entry of table.entries) {
        lines.push([
            entry.name,
            getTypeName(entry.type_val),
            getSubtypeName(entry.type_val, entry.subtype),
            `0x${entry.offset.toString(16)}`,
            `0x${entry.size.toString(16)}`,
            `0x${entry.flags.toString(16)}`,
        ].join(','));
    }

    return lines.join('\n');
}

/**
 * Format partition table as human-readable text.
 *
 * @param table - PartitionTable to format
 * @param verbose - If true, show additional details (default: false)
 * @returns Text formatted string
 */
export function formatText(table: PartitionTable, verbose: boolean = false): string {
    const lines: string[] = [];

    lines.push(`Partition Table (${table.entries.length} entries)`);
    lines.push('='.repeat(80));

    for (const entry of table.entries) {
        lines.push(`\nPartition: ${entry.name}`);
        lines.push(`  Type:      ${getTypeName(entry.type_val)}`);
        lines.push(`  SubType:   ${getSubtypeName(entry.type_val, entry.subtype)}`);
        lines.push(`  Offset:    ${getOffsetHex(entry.offset)} (${getSizeKb(entry.offset).toFixed(2)} KB)`);
        lines.push(`  Size:      0x${entry.size.toString(16)} (${getSizeMb(entry.size).toFixed(2)} MB)`);
        lines.push(`  Flags:     0x${entry.flags.toString(16).padStart(2, '0')}`);

        if (verbose && isEncrypted(entry.flags)) {
            lines.push(`  Encrypted: Yes`);
        }
    }

    return lines.join('\n');
}

/**
 * Format partition table analysis as object or JSON string.
 *
 * Provides summary information about the partition table including
 * flash size, partition count, and partition list with offsets.
 *
 * @param table - PartitionTable to analyze
 * @param indent - JSON indentation level (default: 2)
 * @param returnAsString - If true, return JSON string; if false, return object (default: true for backward compatibility)
 * @returns PartitionAnalysis object or JSON formatted string
 */
export function formatAnalysis(
    table: PartitionTable,
    returnAsString: boolean = true,
    indent: number = 2
): PartitionAnalysis | string {
    let flashSizeBytes = 0;

    if (table.entries.length > 0) {
        const lastEntry = table.entries[table.entries.length - 1];
        flashSizeBytes = lastEntry.offset + lastEntry.size;
    }

    // Round up to nearest power of 2 MB
    flashSizeBytes = ceilingToPowerOf2(flashSizeBytes);

    const flashSizeMb = Math.floor(flashSizeBytes / (1024 * 1024));
    const flashSizeStr = `${flashSizeMb}MB`;

    const partitions: Record<string, string> = {};
    for (const entry of table.entries) {
        partitions[entry.name] = getOffsetHex(entry.offset);
    }

    const analysis: PartitionAnalysis = {
        flash_size_mb: flashSizeStr,
        flash_size_bytes: flashSizeBytes,
        partition_count: table.entries.length,
        partitions,
    };

    // Backward compatibility: return JSON string if requested (default)
    if (returnAsString) {
        return JSON.stringify(analysis, null, indent);
    }

    return analysis;
}

/**
 * Round bytes up to nearest power of 2 megabytes.
 *
 * @param bytes - Size in bytes
 * @returns Size rounded up to nearest power of 2 MB
 */
function ceilingToPowerOf2(bytes: number): number {
    if (bytes === 0) return 0;

    const mb = bytes / (1024 * 1024);

    // Find next power of 2
    const powerOf2 = Math.pow(2, Math.ceil(Math.log2(mb)));

    return Math.round(powerOf2 * 1024 * 1024);
}

// ======== Convenience Function ========
/**
 * Parse ESP-IDF partition table with validation.
 *
 * @param data - ArrayBuffer or Uint8Array containing partition table binary data
 * @param validateOverlaps - If true, check for partition overlaps (default: true)
 * @returns PartitionTable object with parsed entries
 * @throws ParseError if data format is invalid or validation fails
 */
export function parsePartitionsWithValidation(
    data: ArrayBuffer | Uint8Array,
    validateOverlaps: boolean = true
): PartitionTable {
    const table = parsePartitions(data);
    validatePartitionTable(table, validateOverlaps);
    return table;
}
