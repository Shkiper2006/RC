# RC Server

Минимальный сервер для регистрации пользователей, комнат, каналов и WebRTC-сигналинга.

## Запуск

```bash
npm install
npm start
```

## API

- `POST /api/register` → `{ username }`
- `GET /api/rooms` (Bearer token)
- `POST /api/rooms` → `{ name }`
- `GET /api/rooms/:roomId/channels`
- `POST /api/rooms/:roomId/channels` → `{ name, type }`
- `GET /api/rooms/:roomId/channels/:channelId/messages`
- `POST /api/rooms/:roomId/channels/:channelId/messages` → `{ text, emoji, attachments }`
- `POST /api/uploads` (multipart `file`)

## WebSocket

`ws://localhost:3001/ws?token=...`

Сообщения клиента:
- `{ type: "join", roomId, channelId }`
- `{ type: "signal", channelId, payload }`

Серверные события:
- `joined`
- `chat`
- `signal`
