import type { PinoutData, PinInfo, PinCategory, BoardVariant, PinDefines } from '$lib/types';
import { isNRF52Device } from './deviceTypeUtils';
import type { DeviceType } from '$lib/types';
import pinoutJson from '$lib/config/my_pinout.json';

// Cache для pinout данных
let pinoutCache: PinoutData | null = null;

// Загрузка pinout данных из JSON файла
export async function loadPinoutData(): Promise<PinoutData> {
  if (pinoutCache) return pinoutCache;

  try {
    // Используем импортированные данные напрямую
    const data = pinoutJson as PinoutData;
    pinoutCache = data;
    return pinoutCache;
  } catch (error) {
    console.error('Error loading pinout data:', error);
    throw error;
  }
}

// Маппинг devicePioTarget на (variant, board) из my_pinout.json
// Решает проблему, что devicePioTarget не всегда совпадает с board name
export function mapDeviceToPinout(devicePioTarget: string, pinoutData: PinoutData): { variant: string; board: string } | null {
  const { variants } = pinoutData;

  // Стратегия 1: Прямое совпадение (новая структура v2.0)
  if (variants[devicePioTarget]) {
    return { variant: devicePioTarget, board: devicePioTarget };
  }

  // Стратегия 2: Case-insensitive совпадение
  for (const [boardName] of Object.entries(variants)) {
    if (boardName.toLowerCase() === devicePioTarget.toLowerCase()) {
      return { variant: boardName, board: boardName };
    }
  }

  // Стратегия 3: Частичное совпадение (для "t-deck" → "tdeck")
  for (const [boardName] of Object.entries(variants)) {
    const normalizedBoard = boardName.toLowerCase().replace(/[-_]/g, '');
    const normalizedDevice = devicePioTarget.toLowerCase().replace(/[-_]/g, '');

    if (normalizedBoard.includes(normalizedDevice) || normalizedDevice.includes(normalizedBoard)) {
      return { variant: boardName, board: boardName };
    }
  }

  // Стратегия 4: Ручной маппинг для специальных случаев
  const manualMapping: Record<string, { variant: string; board: string }> = {
    // Добавлять по мере необходимости
  };

  if (manualMapping[devicePioTarget]) {
    return manualMapping[devicePioTarget];
  }

  return null;
}

// Парсинг C-выражений для пинов (например "(0 + 13)", "(32 + 4)")
function parsePinExpression(expr: string): number | null {
  if (!expr) return null;

  // Если это простое число
  const simpleNum = Number(expr);
  if (!isNaN(simpleNum)) return simpleNum;

  // Парсим выражения типа "(0 + 13)", "(32 + 4)"
  // Убираем пробелы и проверяем на паттерн (число + число)
  const cleaned = expr.replace(/\s+/g, '');
  const match = cleaned.match(/^\(?(\d+)\s*\+\s*(\d+)\)?$/);

  if (match) {
    const num1 = parseInt(match[1]);
    const num2 = parseInt(match[2]);
    return num1 + num2;
  }

  return null;
}

// Форматирование номера пина в зависимости от типа устройства
// Для NRF52: формат P<port>.<pin>, где port = pinNumber // 32, pin = pinNumber % 32
// Для других: десятичный номер как строка
function formatPinNumber(pinNumber: number, deviceType: DeviceType | null): string {
  if (deviceType && isNRF52Device(deviceType)) {
    const port = Math.floor(pinNumber / 32);
    const pin = pinNumber % 32;
    // Добавляем ведущий ноль для pin < 10
    return `P${port}.${pin.toString().padStart(2, '0')}`;
  }
  return pinNumber.toString();
}

// Резолвинг значения пина - поддерживает цепочки ссылок (например KB_INT -> TCA8418_INT -> 15)
function resolvePinValue(
  pinValue: string,
  pinData: PinDefines,
  visited: Set<string> = new Set()
): string | null {
  // Проверка на циклические ссылки
  if (visited.has(pinValue)) {
    console.warn(`Circular reference detected: ${Array.from(visited).join(' -> ')} -> ${pinValue}`);
    return null;
  }

  // Если значение - число или выражение, возвращаем как есть
  const simpleNum = Number(pinValue);
  if (!isNaN(simpleNum)) return pinValue;

  // Проверяем, является ли значение ссылкой на другой пин
  // Ищем во всех категориях
  for (const [_category, categoryDefines] of Object.entries(pinData)) {
    if (!categoryDefines) continue;

    if (pinValue in categoryDefines) {
      const resolvedValue = categoryDefines[pinValue];
      // Рекурсивно резолвим дальше
      visited.add(pinValue);
      const result = resolvePinValue(resolvedValue, pinData, visited);
      visited.delete(pinValue);
      return result;
    }
  }

  // Если это выражение (не число и не ссылка), возвращаем как есть
  return pinValue;
}

// Извлечение пинов из данных варианта платы
export function extractPinsFromVariant(variant: BoardVariant, deviceType: DeviceType | null = null): PinInfo[] {
  const pins: PinInfo[] = [];
  const { pins: pinData } = variant;

  for (const [category, categoryDefines] of Object.entries(pinData)) {
    if (!categoryDefines) continue;

    for (const [pinName, pinValue] of Object.entries(categoryDefines)) {
      // Резолвим значение пина (может быть ссылкой на другой пин)
      const resolvedValue = resolvePinValue(pinValue as string, pinData);
      if (!resolvedValue) continue;

      // Парсим значение пина (может быть выражением типа "(0 + 13)")
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

  // Сортировка по числовому значению для корректного отображения
  return pins.sort((a, b) => {
    const numA = parseInt(a.pinNumber.replace(/\D/g, '') || a.pinNumber);
    const numB = parseInt(b.pinNumber.replace(/\D/g, '') || b.pinNumber);
    return numA - numB;
  });
}

// Получение человекочитаемого описания для пина
function getPinDescription(pinName: string, category: PinCategory): string {
  const descriptions: Record<string, string> = {
    'LORA_SCK': 'LoRa SPI Clock',
    'LORA_MISO': 'LoRa SPI MISO',
    'LORA_MOSI': 'LoRa SPI MOSI',
    'LORA_CS': 'LoRa Chip Select',
    'LORA_DIO1': 'LoRa DIO1',
    'LORA_DIO2': 'LoRa DIO2',
    'LORA_RESET': 'LoRa Reset',
    'BUTTON_PIN': 'User Button',
    'LED_PIN': 'Status LED',
    'I2C_SDA': 'I2C Data',
    'I2C_SCL': 'I2C Clock',
    'BATTERY_PIN': 'Battery Voltage ADC',
    'RX_PIN': 'UART RX',
    'TX_PIN': 'UART TX'
  };

  return descriptions[pinName] || `${category} pin`;
}

// Получение цвета для категории пина
export function getCategoryColor(category: PinCategory): string {
  const colors: Record<PinCategory, string> = {
    button: '#f59e0b',      // orange
    lora: '#3b82f6',        // blue
    lora_power: '#8b5cf6',  // purple
    power: '#ef4444',       // red
    led: '#eab308',         // yellow
    audio: '#ec4899',       // pink
    i2c: '#14b8a6',         // teal
    uart: '#06b6d4',        // cyan
    gps: '#22c55e',         // green
    gps_config: '#84cc16',  // lime
    led_config: '#fbbf24',  // amber
    spi: '#a855f7',         // violet
    other: '#6b7280'        // gray
  };

  return colors[category] || colors.other;
}
