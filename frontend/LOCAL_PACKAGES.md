# Local Meshtastic Packages

Этот проект использует локально собранные версии пакетов `@meshtastic/core` и `@meshtastic/transport-web-serial`.

## Зачем локальные пакеты?

Локальные пакеты позволяют:
- Использовать последние изменения из репозитория meshtastic/web
- Избегать ошибок в опубликованных версиях
- Вносить изменения в библиотеки для тестирования

## Структура

```
frontend/
├── local-packages/
│   └── @meshtastic/
│       ├── core/              # Локальная версия @meshtastic/core
│       │   ├── dist/          # Собранные файлы
│       │   └── package.json
│       └── transport-web-serial/  # Локальная версия @meshtastic/transport-web-serial
│           ├── dist/          # Собранные файлы
│           └── package.json
└── scripts/
    └── build-meshtastic-packages.sh  # Скрипт для сборки пакетов
```

## Обновление пакетов

Для обновления пакетов до последней версии из репозитория:

```bash
# Из директории frontend
pnpm run build:meshtastic
pnpm install
```

Скрипт выполнит следующие действия:
1. Клонироврует или обновит репозиторий https://github.com/meshtastic/web
2. Установит зависимости
3. Соберёт пакеты @meshtastic/core и @meshtastic/transport-web-serial
4. Скопирует собранные файлы в `local-packages/`

## Внесение изменений в библиотеки

Если нужно внести изменения в библиотеки:

1. Отредактируйте файлы в `/tmp/meshtastic-web/packages/`
2. Пересоберите нужный пакет:
   ```bash
   cd /tmp/meshtastic-web/packages/core  # или transport-web-serial
   pnpm run build:npm
   ```
3. Скопируйте собранные файлы:
   ```bash
   # Вернитесь в frontend директорию
   rm -rf local-packages/@meshtastic/core/dist
   cp -r /tmp/meshtastic-web/packages/core/dist local-packages/@meshtastic/core/
   ```
4. Переустановите зависимости:
   ```bash
   pnpm install
   ```

## Примечания

- Директория `local-packages/` добавлена в `.gitignore` и не коммитится в репозиторий
- При установке зависимостей через `pnpm install` будет предупреждение о build scripts - это нормально, пакеты уже собраны
- Если TypeScript не видит типы, убедитесь что в `package.json` локального пакета правильно указан путь к `types`
