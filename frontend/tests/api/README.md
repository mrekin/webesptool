# API Manifest Endpoint Tests

Тесты для ендпоинта `/api/manifest`.

## Файлы

- `test_manifest_endpoint.py` - основной тестовый скрипт
- `manifest_baseline.json` - baseline данных (создаётся автоматически при первом запуске)

## Использование

### Первый запуск (создание baseline)

```bash
python3 frontend/tests/api/test_manifest_endpoint.py
```

При первом запуске скрипт:
1. Получит список устройств из `https://mrekin.duckdns.org/flasher/api/availableFirmwares?src=Official%20repo`
2. Выберет 30 устройств (минимум 20 esp32)
3. Для каждого устройства выберет 2 последние стабильные версии (без daily)
4. Сохранит список тестовых случаев и ответы API в `manifest_baseline.json`

### Повторные запуски (сравнение с baseline)

```bash
python3 frontend/tests/api/test_manifest_endpoint.py
```

Скрипт загрузит список устройств из baseline и сравнит текущие ответы API с сохранёнными.

## Что тестируется

- **Устройств:** 30 (минимум 20 esp32 + остальные nrf52/rp2040)
- **Версий на устройство:** 2 последние стабильные
- **Значений параметра u:** 1 (update), 2 (install), 4 (ota)
- **Итого тестовых случаев:** ~180 запросов к `/api/manifest`

## Формат вывода

```
Testing /api/manifest endpoint
Base URL: https://mrekin.duckdns.org/flasher/api
Source: Official repo
Baseline file: /path/to/manifest_baseline.json

Loaded 30 devices from baseline
✓ diy_esp32_v2.7.18.fb3bf78_u1: matches
✗ heltec-v3_v2.6.2.abc123_u2: DIFFERS
    Value differs: builds.0.parts.1.offset (baseline: 1572864, current: 1572865)

============================================================
Summary:
  Total: 180
  Passed: 179
  Failed: 1
  Errors: 0
============================================================
```

## Обновление baseline

Чтобы обновить baseline (например, после изменений в firmware), удалите файл `manifest_baseline.json` и запустите скрипт заново:

```bash
rm frontend/tests/api/manifest_baseline.json
python3 frontend/tests/api/test_manifest_endpoint.py
```

## Зависимости

- Python 3.7+
- aiohttp (уже есть в `webesptool/requirements.txt`)
