# Development Setup

Two ways to develop: **Local** (recommended) or **Dev Container**.

## Option 1: Local Development (Recommended)

Fastest workflow. Docker runs only database services, code runs locally.

### Prerequisites
- Node.js 20+
- Docker Desktop
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### Start Services

```powershell
# 1. Start database + DAB (leave running)
docker compose up -d

# 2. Start app servers (in separate terminals or use start-all.ps1)
cd client && npm run dev
cd chat-api && npm start

# Or use the PowerShell script
.\start-all.ps1
```

### Ports
| Service | Port | URL |
|---------|------|-----|
| Client (Vite) | 5173 | http://localhost:5173 |
| Chat API | 7071 | http://localhost:7071 |
| DAB API | 5000 | http://localhost:5000/api |
| Email API | 7073 | http://localhost:7073 |
| SQL Server | 14330 | localhost,14330 |

### Stop Services
```powershell
.\stop-all.ps1
# or
docker compose down  # stops DB + DAB
```

---

## Option 2: Dev Container (Full Isolation)

Everything runs in containers. Slower but fully isolated.

### When to Use
- CI/CD pipelines
- Onboarding new developers
- Need completely isolated environment
- Testing on different Node/OS versions

### Start
1. Open VS Code in the project folder
2. `Cmd+Shift+P` → "Dev Containers: Reopen in Container"
3. Wait for build (~5-10 min first time, faster on rebuilds)

### Features
- Claude Code CLI pre-installed
- Azure CLI available (`az login`)
- SQL Server MCP configured
- All services auto-start

### Auth Persistence
Claude Code auth persists between container rebuilds via the `claude-config` volume.

### Ports (same as local)
VS Code forwards all ports automatically. Access via localhost in your browser.

---

## Database

Both workflows use the same database schema.

### Run Migrations
```bash
cd scripts && node deploy-db.js
```

### Connect with SQL tools
- Server: `localhost,14330`
- Database: `AccountingDB`
- User: `sa`
- Password: `StrongPassword123!`

---

## Environment Variables

Copy `.env.example` to `.env` and update as needed:
- `SQL_SA_PASSWORD` - Database password
- `EMAIL_ENCRYPTION_KEY` - For email settings encryption

Client env vars go in `client/.env.local` (copy from `client/.env.example`).

---

## Troubleshooting

### Port already in use
```powershell
# Find and kill process on port
netstat -ano | findstr :5173
taskkill /PID <pid> /F
```

### Docker issues
```powershell
docker compose down -v  # Remove volumes too
docker system prune -f  # Clean up
```

### Dev Container won't start
1. `wsl --shutdown`
2. Restart Docker Desktop
3. Try "Rebuild Container" again
