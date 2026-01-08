# Деплой на Windows Server 2025

## Требования

- Windows Server 2025
- Node.js LTS
- NSSM или встроенный `sc` для службы
- Обратный прокси (Nginx или IIS) для SSL и проксирования WebSocket

## Порты

- 3001: API + WebSocket (внутренний)
- 80/443: внешний доступ через reverse proxy

## Установка

1. Скопируйте папки `server/` и `client/` на сервер.
2. Установите зависимости:
   ```powershell
   cd server
   npm install
   ```
3. Запустите сервер как службу (NSSM):
   ```powershell
   nssm install rc-server "C:\Program Files\nodejs\node.exe" "C:\rc\server\index.js"
   nssm set rc-server AppEnvironmentExtra "PORT=3001"
   nssm start rc-server
   ```

## Reverse proxy + SSL (Nginx)

```nginx
server {
  listen 443 ssl;
  server_name your-domain.example;

  ssl_certificate     C:/certs/fullchain.pem;
  ssl_certificate_key C:/certs/privkey.pem;

  location / {
    root C:/rc/client;
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }

  location /ws {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

## Firewall

```powershell
New-NetFirewallRule -DisplayName "RC HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443
```

## Проверка

- `https://your-domain.example` открывает клиент.
- WebSocket подключается по `/ws`.
- API работает через `/api`.
- Для VDS повторите проверку с внешней сети и убедитесь, что голосовые каналы и демонстрация экрана работают через UDP/TCP.
