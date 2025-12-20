# Развертывание с динамическим base path (внешний Caddy)

## Преимущества нового подхода

- **Один Docker образ для всех окружений** - больше не нужно пересобирать frontend при изменении base path
- **Гибкость в рантайме** - base path можно изменить через конфигурацию Caddy
- **Относительные пути** - приложение работает под любым префиксом
- **Универсальная сборка** - Docker образ не зависит от пути развертывания

## Архитектура

```
Внешний Caddy (ваш сервер) → Docker контейнеры (192.168.1.115)
                         → Frontend :5550
                         → Backend  :8000
```

## Развертывание

### 1. Запуск контейнеров

```bash
# Запускаем контейнеры на сервере 192.168.1.115
cd /home/vardas/webesptool_dev
docker-compose -f docker-compose-simple.yml up -d --build

# Проверяем работоспособность
curl http://localhost:5550/health
```

### 2. Настройка внешнего Caddy

Добавьте в вашу основную Caddy конфигурацию один из вариантов:

#### Вариант 1: Корневое развертывание
```caddy
# Ваш текущий вариант
reverse_proxy /frontend* http://192.168.1.115:5550
```

#### Вариант 2: С префиксом /esp-tools/
```caddy
reverse_proxy /esp-tools* http://192.168.1.115:5550 {
    # Удаляем префикс перед проксированием
    rewrite /esp-tools{path} {path}
}

# API запросы
reverse_proxy /api/* http://192.168.1.115:5550
```

#### Вариант 3: С оптимизациями
```caddy
reverse_proxy /esp-tools* http://192.168.1.115:5550 {
    rewrite /esp-tools{path} {path}

    # Оптимизация для статических файлов
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2 *.ttf *.eot
    }
    header_down @static Cache-Control "public, max-age=31536000, immutable"

    # Health check
    health_path /esp-tools/health
    health_interval 30s
    health_timeout 10s
}
```

### 3. Переменные окружения (опционально)

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `ROOT_PATH` | Путь для ESP tool backend | `/flasher` |

```bash
# С кастомным ROOT_PATH
ROOT_PATH=/custom-path docker-compose -f docker-compose-simple.yml up -d
```

## Изменения в коде

### Что было изменено:
1. **svelte.config.js**: `relative: true` вместо жесткого `base: process.env.VITE_BASE_PATH`
2. **vite.config.ts**: Убрана зависимость от `VITE_BASE_PATH`
3. **hooks.server.ts**: Упрощена логика обработки API путей (только `/api/`)
4. **Dockerfile**: Убран `ARG VITE_BASE_PATH` - теперь универсальная сборка

### Как это работает:
- **Frontend** собирается с относительными путями
- **Внешний Caddy** обрабатывает base path и делает rewrite
- **API** запросы проксируются transparently

## Проверка работоспособности

```bash
# Проверка контейнеров
curl http://192.168.1.115:5550/health
curl http://192.168.1.115:5550/api/status

# Через Caddy (после настройки)
curl http://your-caddy-server/frontend/health
curl http://your-caddy-server/esp-tools/health
```

## Примеры конфигураций Caddy

### Для домена esp-tools.example.com:
```caddy
esp-tools.example.com {
    reverse_proxy /frontend* http://192.168.1.115:5550
    reverse_proxy /api/* http://192.168.1.115:5550

    # Автоматический HTTPS
    encode zstd gzip

    # Заголовки безопасности
    header X-Content-Type-Options nosniff
    header X-Frame-Options DENY
    header -Server
}
```

### Для подпути /esp-tools/:
```caddy
your-domain.com {
    handle /esp-tools/* {
        reverse_proxy http://192.168.1.115:5550 {
            rewrite /esp-tools{path} {path}
        }
    }

    handle /api/* {
        reverse_proxy http://192.168.1.115:5550
    }

    # Другие пути...
    root * /var/www/html
    file_server
}
```

## Откат к старой системе

Если нужно вернуться к VITE_BASE_PATH:

```bash
git checkout HEAD~1 -- frontend/svelte.config.js frontend/vite.config.ts frontend/src/hooks.server.ts frontend/Dockerfile
# Пересобрать с VITE_BASE_PATH
docker build --build-arg VITE_BASE_PATH=/your/path frontend/
```

## Преимущества для вашей архитектуры

- **Централизованная маршрутизация** через ваш Caddy
- **Универсальные контейнеры** не зависят от пути развертывания
- **Простое тестирование** - можно изменить путь без пересборки
- **Оптимизация** через один reverse proxy для всех сервисов