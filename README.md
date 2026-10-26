# DEVI – Women Safety App

| Folder | What it is |
|---|---|
| [backend/](backend/) | Node.js Express REST API + WebSocket (port 5005) |
| [frontend/](frontend/) | Flutter user app (Android / iOS / Web) |
| [web/](web/) | React + Vite admin dashboard & public live tracking page |
| [deploy/nginx/](deploy/nginx/) | Hostinger NGINX configs (API + web) |
| [docs/](docs/) | System architecture & end-to-end flow |

Full details, setup and local development: [docs/DEVI_SYSTEM_ARCHITECTURE.md](docs/DEVI_SYSTEM_ARCHITECTURE.md).

## Deploy (Hostinger)

```bash
cd /var/www/DEVI_APP
git pull
cd backend && npm install && <restart Node process>
cd ../web && npm install && npm run build   # served from web/dist
```

NGINX configs in `deploy/nginx/` are reference copies. After editing one, copy it to the server's NGINX config folder and reload NGINX.
