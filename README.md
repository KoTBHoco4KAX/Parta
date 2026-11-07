# ПАРТА — Учебная платформа для мессенджера MAX

## Сборка и запуск в Docker

### 1. Сборка образа
```bash
docker build -t parta .
```

### 2. Запуск контейнера
```bash
docker run -d \
  --name parta \
  --restart unless-stopped \
  -p 8080:8080 \
  -e MAX_BOT_TOKEN="your_bot_token_here" \
  parta
```

После запуска сервис доступен по адресу: http://localhost:8080