# Development Setup

## Quick Start (Local Development)

```powershell
# 1. Start all services
.\dev.ps1

# 2. Open the URL shown in the output (usually http://localhost:5173)
```

## Architecture

```
┌─────────────────────────────────────┐
│  Docker (database services)         │
│  - SQL Server (14330)               │
│  - DAB API (5000)                   │
│  - Email API (7073)                 │
└─────────────────────────────────────┘
              ↑
┌─────────────────────────────────────┐
│  Local Node.js                      │
│  - Client/Vite (5173+)              │
│  - Chat API (7071)                  │
└─────────────────────────────────────┘
```

## Scripts

| Script | Purpose |
|--------|---------|
| `.\dev.ps1` | Start everything, show status |
| `.\dev.ps1 -Stop` | Stop all services |
| `.\dev.ps1 -Status` | Check what's running |
| `.\dev.ps1 -Reset` | Full reset (stop, clean, restart) |

## Ports

| Service | Default Port | Notes |
|---------|--------------|-------|
| Client (Vite) | 5173 | Auto-increments if busy (5174, 5175...) |
| Chat API | 7071 | |
| DAB API | 5000 | GraphQL at /graphql, REST at /api |
| Email API | 7073 | |
| SQL Server | 14330 | Connect: `localhost,14330` |

## Manual Commands

```powershell
# Start Docker services only
docker compose up -d

# Start client only
cd client && npm run dev

# Start chat-api only
cd chat-api && npm start

# Stop everything
docker compose down
```

## Database

### Connection
- Server: `localhost,14330`
- Database: `AccountingDB`
- User: `sa`
- Password: `StrongPassword123!`

### Run Migrations
```powershell
cd scripts && node deploy-db.js
```

## Environment Variables

Copy example files and customize:
- `.env.example` → `.env` (root)
- `client/.env.example` → `client/.env.local`

## Troubleshooting

### Port Already in Use
The `dev.ps1` script handles this automatically. For manual cleanup:
```powershell
# Find process on port
netstat -ano | findstr :5173
# Kill it
taskkill /PID <pid> /F
```

### Docker Issues
```powershell
.\dev.ps1 -Reset   # Full reset
# or manually:
docker compose down -v
docker system prune -f
```

### Client Shows Wrong Port
Vite auto-selects an available port. Check the terminal output for the actual URL.

---

## Dev Container (Alternative)

For full isolation, use the dev container:
1. Open VS Code
2. `Cmd+Shift+P` → "Dev Containers: Reopen in Container"
3. Wait for build (~5-10 min first time)

Claude Code auth persists between rebuilds via the `claude-config` volume.
