import { DeviceType } from '$lib/types';

/**
 * Маппинг категорий из API в DeviceType
 */
export function mapCategoryToDeviceType(category: string): DeviceType {
  switch (category) {
    case 'esp':
      return DeviceType.ESP32;
    case 'uf2':
      return DeviceType.NRF52;  // Сохраняем текущую логику
    case 'rp2040':
      return DeviceType.RP2040;
    default:
      return DeviceType.ESP32;  // fallback
  }
}

/**
 * Обратный маппинг для API
 */
export function mapDeviceTypeToCategory(deviceType: DeviceType): string {
  switch (deviceType) {
    case DeviceType.ESP32:
      return 'esp';
    case DeviceType.NRF52:
      return 'uf2';
    case DeviceType.RP2040:
      return 'rp2040';
    default:
      return 'esp'; // fallback
  }
}

/**
 * Константы для UI текстов названий устройств
 */
export const DEVICE_TYPE_LABELS = {
  [DeviceType.ESP32]: 'ESP32',
  [DeviceType.NRF52]: 'NRF52',
  [DeviceType.RP2040]: 'RP2040'
} as const;

/**
 * Константы для UI текстов групп устройств
 */
export const DEVICE_GROUP_LABELS = {
  [DeviceType.ESP32]: 'ESP32 DEVICES',
  [DeviceType.NRF52]: 'NRF52 DEVICES',
  [DeviceType.RP2040]: 'RP2040 DEVICES'
} as const;

/**
 * Получить label для типа устройства
 */
export function getDeviceTypeLabel(deviceType: DeviceType): string {
  return DEVICE_TYPE_LABELS[deviceType];
}

/**
 * Получить label для группы устройств
 */
export function getDeviceGroupLabel(deviceType: DeviceType): string {
  return DEVICE_GROUP_LABELS[deviceType];
}

/**
 * Проверить, является ли устройство ESP32
 */
export function isESP32Device(deviceType: DeviceType): boolean {
  return deviceType === DeviceType.ESP32;
}

/**
 * Проверить, является ли устройство NRF52
 */
export function isNRF52Device(deviceType: DeviceType): boolean {
  return deviceType === DeviceType.NRF52;
}

/**
 * Проверить, является ли устройство RP2040
 */
export function isRP2040Device(deviceType: DeviceType): boolean {
  return deviceType === DeviceType.RP2040;
}

/**
 * Проверить, поддерживает ли устройство UF2 файлы
 */
export function supportsUF2(deviceType: DeviceType): boolean {
  return deviceType === DeviceType.NRF52 || deviceType === DeviceType.RP2040;
}

/**
 * Проверить, поддерживает ли устройство ESP Web Tools
 */
export function supportsESPWebTools(deviceType: DeviceType): boolean {
  return deviceType === DeviceType.ESP32;
}