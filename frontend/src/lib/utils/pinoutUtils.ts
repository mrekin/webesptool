import type {
    PinoutData,
    PinInfo,
    PinCategory,
    BoardVariant,
    PinDefines,
    ConfigInfo,
    PinoutCatalogFile,
    PinoutVariant
} from '$lib/types';
import { isNRF52Device } from './deviceTypeUtils';
import type { DeviceType } from '$lib/types';

// NOTE: Vite requires the first argument of import.meta.glob to be a string
// literal, so the catalog path cannot be moved elsewhere. This comment is the
// single canonical reference for the pinouts catalog location.
const pinoutCatalogModules = import.meta.glob('/src/lib/config/pinouts/*.json', {
    eager: true,
    import: 'default'
}) as Record<string, PinoutData>;

// Cache for the sorted catalog (array of files)
let catalogCache: PinoutCatalogFile[] | null = null;

// Load pinout catalog from all JSON files in pinouts/. Returns an alphabetically
// sorted (by bare filename, code-point ASCII) array of { fileName, data }.
// Eager-glob from src means a broken JSON fails the build at parse time (CI
// catches it); the defensive shape check below is a safety net for files that
// parse but do not match the PinoutData structure.
export async function loadPinoutData(): Promise<PinoutCatalogFile[]> {
    if (catalogCache) return catalogCache;

    const files: PinoutCatalogFile[] = [];
    for (const [fullPath, data] of Object.entries(pinoutCatalogModules)) {
        // Defensive shape check; src-bundled JSON reaches here only if it parsed.
        if (!data || typeof data !== 'object' || !data.variants) {
            console.warn(`[pinout] skipping file with invalid shape: ${fullPath}`);
            continue;
        }
        const fileName = fullPath.split('/').pop() ?? fullPath;
        files.push({ fileName, data });
    }
    // Deterministic code-point sort by bare filename (NOT localeCompare, which
    // depends on the host locale and can diverge across CI machines).
    files.sort((a, b) =>
        a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0
    );

    catalogCache = files;
    return files;
}

// Run the 4-strategy cascade over a single variants map. Returns the matched
// BoardVariant directly so callers do not need to know where variants came from.
function matchVariantInVariants(
    devicePioTarget: string,
    variants: PinoutVariant
): { variant: BoardVariant; board: string } | null {
    // Strategy 1: Direct match (new structure v2.0)
    if (variants[devicePioTarget]) {
        return { variant: variants[devicePioTarget], board: devicePioTarget };
    }

    // Strategy 2: Case-insensitive match
    for (const [boardName, v] of Object.entries(variants)) {
        if (boardName.toLowerCase() === devicePioTarget.toLowerCase()) {
            return { variant: v, board: boardName };
        }
    }

    // Strategy 3: Partial match (for "t-deck" -> "tdeck")
    for (const [boardName, v] of Object.entries(variants)) {
        const normalizedBoard = boardName.toLowerCase().replace(/[-_]/g, '');
        const normalizedDevice = devicePioTarget.toLowerCase().replace(/[-_]/g, '');

        if (
            normalizedBoard.includes(normalizedDevice) ||
            normalizedDevice.includes(normalizedBoard)
        ) {
            return { variant: v, board: boardName };
        }
    }

    // Strategy 4: Manual mapping for special cases
    const manualMapping: Record<string, { board: string }> = {
        // Add as needed
    };

    const manual = manualMapping[devicePioTarget];
    if (manual && variants[manual.board]) {
        return { variant: variants[manual.board], board: manual.board };
    }

    return null;
}

// File-major search: iterate catalog files (already alphabetically sorted by
// loadPinoutData) and run the full strategy cascade against each file's
// variants independently. First non-null match wins.
// WARNING: a naive "merge all variants first-wins by board key" is NOT
// equivalent — see RSR Q-B counterexample (tdeck / t-deck).
export function mapDeviceToPinout(
    devicePioTarget: string,
    catalog: PinoutCatalogFile[]
): { variant: BoardVariant; board: string } | null {
    for (const file of catalog) {
        const match = matchVariantInVariants(devicePioTarget, file.data.variants);
        if (match) return match;
    }
    return null;
}

// Parse C expressions for pins: "11", "-1", "(11)", "(-1)", "(0 + 13)",
// "((0 + 13))". C macros (variant.h) frequently wrap pin numbers in parens,
// e.g. `#define PIN_LED (11)`, so the meshcore catalog stores values as
// "(11)" rather than "11". Floats like "(3.0)" (AREF_VOLTAGE) are NOT pin
// numbers and must be rejected — therefore after stripping parens we accept
// only integers and integer sums, never Number() (which would coerce 3.0
// into pin 3).
function parsePinExpression(expr: string): number | null {
    if (!expr) return null;

    // Bare value (no parens): keep existing behavior, including the Number()
    // coercion used historically for the meshtastic catalog. Bare sums like
    // "0 + 13" fall through and are handled below.
    const simpleNum = Number(expr);
    if (!isNaN(simpleNum)) return simpleNum;

    // Strip any number of surrounding paren layers introduced by C macros.
    let stripped = expr.trim();
    while (stripped.startsWith('(') && stripped.endsWith(')')) {
        stripped = stripped.slice(1, -1).trim();
    }

    // Integer pin number (also handles negative sentinels like "-1").
    if (/^-?\d+$/.test(stripped)) {
        return parseInt(stripped, 10);
    }

    // Sum of two integers, e.g. "0 + 13" or "(0 + 13)".
    const sumMatch = stripped.match(/^(\d+)\s*\+\s*(\d+)$/);
    if (sumMatch) {
        return parseInt(sumMatch[1], 10) + parseInt(sumMatch[2], 10);
    }

    return null;
}

// Format pin number based on device type
// For NRF52: format P<port>.<pin>, where port = pinNumber // 32, pin = pinNumber % 32
// For others: decimal number as string
function formatPinNumber(pinNumber: number, deviceType: DeviceType | null): string {
    if (deviceType && isNRF52Device(deviceType)) {
        const port = Math.floor(pinNumber / 32);
        const pin = pinNumber % 32;
        // Add leading zero for pin < 10
        return `P${port}.${pin.toString().padStart(2, '0')}`;
    }
    return pinNumber.toString();
}

// Resolve pin value - supports chain of references (e.g. KB_INT -> TCA8418_INT -> 15)
function resolvePinValue(
    pinValue: string,
    pinData: PinDefines,
    visited: Set<string> = new Set()
): string | null {
    // Check for circular references
    if (visited.has(pinValue)) {
        console.warn(
            `Circular reference detected: ${Array.from(visited).join(' -> ')} -> ${pinValue}`
        );
        return null;
    }

    // If value is a number or expression, return as is
    const simpleNum = Number(pinValue);
    if (!isNaN(simpleNum)) return pinValue;

    // Check if value is a reference to another pin
    // Search in all categories
    for (const [_category, categoryDefines] of Object.entries(pinData)) {
        if (!categoryDefines) continue;

        if (pinValue in categoryDefines) {
            const resolvedValue = categoryDefines[pinValue];
            // Recursively resolve further
            visited.add(pinValue);
            const result = resolvePinValue(resolvedValue, pinData, visited);
            visited.delete(pinValue);
            return result;
        }
    }

    // If it's an expression (not a number and not a reference), return as is
    return pinValue;
}

// Extract pins from board variant data
export function extractPinsFromVariant(
    variant: BoardVariant,
    deviceType: DeviceType | null = null
): PinInfo[] {
    const pins: PinInfo[] = [];
    const { pins: pinData } = variant;

    for (const [category, categoryDefines] of Object.entries(pinData)) {
        if (!categoryDefines) continue;

        for (const [pinName, pinValue] of Object.entries(categoryDefines)) {
            // Resolve pin value (may be a reference to another pin)
            const resolvedValue = resolvePinValue(pinValue as string, pinData);
            if (!resolvedValue) continue;

            // Parse pin value (may be an expression like "(0 + 13)")
            const parsedPin = parsePinExpression(resolvedValue);
            if (parsedPin === null) {
                continue;
            }

            pins.push({
                name: pinName,
                pinNumber: formatPinNumber(parsedPin, deviceType),
                category: category as PinCategory,
                description: getPinDescription(pinName, category as PinCategory)
            });
        }
    }

    // Sort by numeric value for correct display
    return pins.sort((a, b) => {
        const numA = parseInt(a.pinNumber.replace(/\D/g, '') || a.pinNumber);
        const numB = parseInt(b.pinNumber.replace(/\D/g, '') || b.pinNumber);
        return numA - numB;
    });
}

// Extract configs from board variant data
export function extractConfigsFromVariant(variant: BoardVariant): ConfigInfo[] {
    const configs: ConfigInfo[] = [];
    const { config } = variant;

    if (!config) return configs;

    for (const [category, categoryConfigs] of Object.entries(config)) {
        if (!categoryConfigs) continue;

        for (const [name, value] of Object.entries(categoryConfigs)) {
            configs.push({ name, value: value as string, category });
        }
    }

    return configs;
}

// Get human-readable description for pin
function getPinDescription(pinName: string, category: PinCategory): string {
    const descriptions: Record<string, string> = {
        LORA_SCK: 'LoRa SPI Clock',
        LORA_MISO: 'LoRa SPI MISO',
        LORA_MOSI: 'LoRa SPI MOSI',
        LORA_CS: 'LoRa Chip Select',
        LORA_DIO1: 'LoRa DIO1',
        LORA_DIO2: 'LoRa DIO2',
        LORA_RESET: 'LoRa Reset',
        BUTTON_PIN: 'User Button',
        LED_PIN: 'Status LED',
        I2C_SDA: 'I2C Data',
        I2C_SCL: 'I2C Clock',
        BATTERY_PIN: 'Battery Voltage ADC',
        RX_PIN: 'UART RX',
        TX_PIN: 'UART TX'
    };

    return descriptions[pinName] || `${category} pin`;
}

// Get color for pin category
export function getCategoryColor(category: PinCategory): string {
    const colors: Record<PinCategory, string> = {
        button: '#f59e0b', // orange
        lora: '#3b82f6', // blue
        lora_power: '#8b5cf6', // purple
        power: '#ef4444', // red
        led: '#eab308', // yellow
        audio: '#ec4899', // pink
        i2c: '#14b8a6', // teal
        uart: '#06b6d4', // cyan
        gps: '#22c55e', // green
        gps_config: '#84cc16', // lime
        led_config: '#fbbf24', // amber
        spi: '#a855f7', // violet
        other: '#6b7280' // gray
    };

    return colors[category] || colors.other;
}
