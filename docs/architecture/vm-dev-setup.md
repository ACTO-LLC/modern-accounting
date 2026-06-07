# Dev VM Setup — Modern Accounting

Quick-start guide for running Modern Accounting on the ACTO dev VM with real prod data.

## VM Details

| Field | Value |
|-------|-------|
| Host | `ehalsey-dev01.westus2.cloudapp.azure.com` |
| IP | `4.154.42.33` |
| User | `ehalsey` |
| OS | Ubuntu Pro 24.04 LTS |
| Projects | `/mnt/data/projects/` |
| Docker data | `/mnt/data/docker-volumes/` |
| Auto-shutdown | 8 PM UTC daily |
| SSH Key | Azure Key Vault `acto-infra-kv`, secret `ehalsey-dev01-vm-ssh-key` |
| Subscription | Microsoft Azure Sponsorship (`d487e16b-c758-4893-b0e9-a77c6e02e5f3`) |

## Prerequisites

- Azure CLI (`az`) logged in with access to the subscription
- GitHub access to `ACTO-LLC/modern-accounting` (token or SSH key)

## 1. Start the VM (if shut down)

The VM auto-shuts down at 8 PM UTC. Start it with:

```bash
az vm start -g EHALSEY-DEV01-RG -n ehalsey-dev01-vm \
  --subscription "d487e16b-c758-4893-b0e9-a77c6e02e5f3"
```

## 2. Whitelist Your IP

Get your public IP and add it to the NSG:

```bash
MY_IP=$(curl -s ifconfig.me)

# Add your IP to the SSH rule (keep existing IPs)
az network nsg rule update \
  --nsg-name ehalsey-dev01-vm-nsg \
  -g EHALSEY-DEV01-RG \
  --subscription "d487e16b-c758-4893-b0e9-a77c6e02e5f3" \
  --name SSH \
  --source-address-prefixes "$MY_IP" "98.147.230.90"

# Open app ports for browser access
az network nsg rule create \
  --nsg-name ehalsey-dev01-vm-nsg \
  -g EHALSEY-DEV01-RG \
  --subscription "d487e16b-c758-4893-b0e9-a77c6e02e5f3" \
  --name ModernAccounting \
  --priority 310 --access Allow --protocol TCP --direction Inbound \
  --source-address-prefixes "$MY_IP" "98.147.230.90" \
  --destination-port-ranges 5173 8080 5000
```

## 3. Get the SSH Key

The SSH private key is stored in Azure Key Vault, not on disk:

```bash
az keyvault secret show \
  --vault-name acto-infra-kv \
  --subscription "d487e16b-c758-4893-b0e9-a77c6e02e5f3" \
  --name ehalsey-dev01-vm-ssh-key \
  --query "value" -o tsv > ~/.ssh/ehalsey-dev01-vm_key.pem

chmod 600 ~/.ssh/ehalsey-dev01-vm_key.pem
```

**Windows/Git Bash note:** Prefix SSH commands with `MSYS_NO_PATHCONV=1` to prevent path mangling:

```bash
MSYS_NO_PATHCONV=1 ssh -i ~/.ssh/ehalsey-dev01-vm_key.pem ehalsey@ehalsey-dev01.westus2.cloudapp.azure.com
```

## 4. First-Time VM Setup (Tools)

Skip this section if tools are already installed. SSH in and run:

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# .NET SDK 8 + SqlPackage (needed for db:deploy and db:clone)
sudo apt-get install -y dotnet-sdk-8.0
dotnet tool install -g microsoft.sqlpackage
echo 'export PATH="$PATH:$HOME/.dotnet/tools"' >> ~/.bashrc

# SqlPackage case-sensitivity fix (scripts check for capital-S "SqlPackage")
sudo ln -sf ~/.dotnet/tools/sqlpackage /usr/local/bin/SqlPackage
```

## 5. Clone the Repo

```bash
sudo mkdir -p /mnt/data/projects && sudo chown $USER:$USER /mnt/data/projects
cd /mnt/data/projects

# Use a GitHub token (gh auth token, PAT, etc.)
git clone https://x-access-token:$GITHUB_TOKEN@github.com/ACTO-LLC/modern-accounting.git
```

## 6. Create Environment Files

Three env files are needed (all gitignored):

```bash
cd /mnt/data/projects/modern-accounting

# Root .env — used by Docker Compose for SQL password
cat > .env << 'EOF'
SQL_SA_PASSWORD=YourStrongPasswordHere123!
BYPASS_AUTH=true
EOF

# Chat API
cat > chat-api/.env << 'EOF'
PORT=8080
BYPASS_AUTH=true
EOF

# Client
cat > client/.env.local << 'EOF'
VITE_API_URL=http://localhost:8080
VITE_BYPASS_AUTH=true
EOF
```

## 7. Start Docker Services

```bash
cd /mnt/data/projects/modern-accounting

# Core services (DB, DAB, MCPs, email) — schema auto-deploys via db-init
docker compose up -d

# Full stack (adds chat-api + React client)
docker compose --profile app up -d
```

### Docker Compose Override (Required on VM)

The client container needs the root `package.json` mounted (vite.config.ts reads `../package.json` for the app version). Create this file on the VM:

```bash
cat > docker-compose.override.yml << 'EOF'
services:
  client:
    volumes:
      - ./package.json:/package.json:ro
EOF
```

### Expected Containers

| Container | Port | Purpose |
|-----------|------|---------|
| `accounting-db` | 14330 | SQL Server 2022 |
| `accounting-dab` | 5000 | Data API Builder |
| `accounting-chat-api` | 8080 | Express API |
| `accounting-client` | 5173 | Vite/React |
| `accounting-ma-mcp` | 5002 | MA MCP Server |
| `accounting-qbo-mcp` | 8001 | QBO MCP Server |
| `accounting-email-api` | 7073 | Email API |

## 8. Load Prod Data

The db-init container creates an empty schema via migrations. To get real prod data, clone the Azure SQL database:

### Option A: Clone directly from Azure (needs `az login`)

```bash
az login
SQL_SA_PASSWORD="YourStrongPasswordHere123!" npm run db:clone
```

### Option B: Import an existing .bacpac (faster)

If you already have a `.bacpac` export (e.g., from a local machine):

```bash
# SCP the bacpac to the VM (from your local machine)
scp -i ~/.ssh/ehalsey-dev01-vm_key.pem \
  database/backups/AccountingDB-prod-*.bacpac \
  ehalsey@ehalsey-dev01.westus2.cloudapp.azure.com:/mnt/data/projects/modern-accounting/database/backups/

# On the VM: drop the empty DB created by db-init, then import
docker exec accounting-db /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "YourStrongPasswordHere123!" -N -C \
  -Q "ALTER DATABASE AccountingDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE AccountingDB;"

SQL_SA_PASSWORD="YourStrongPasswordHere123!" npm run db:clone:quick
```

After importing, restart DAB to pick up the new data:

```bash
docker restart accounting-dab
```

### Deploying Schema Updates

If the sqlproj has view/table changes not yet in the cloned DB:

```bash
SQL_SA_PASSWORD="YourStrongPasswordHere123!" npm run db:deploy
docker restart accounting-dab
```

> **Note:** `npm run db:deploy` uses the Node.js fallback (migrations only) unless the .dacpac can be built. For full schema sync (views, triggers, indexes), ensure `dotnet build` works on the sqlproj or use SqlPackage with a pre-built .dacpac.

## 9. Vite Allowed Hosts

Vite blocks requests from unrecognized hostnames. Add the VM hostname to `client/vite.config.ts` on the VM:

```ts
// In server config:
allowedHosts: ['host.docker.internal', 'ehalsey-dev01.westus2.cloudapp.azure.com'],
```

> This change is on the VM only (bind-mounted). Don't commit it to the repo unless the hostname should be permanent.

## 10. Smoke Test

```bash
# DAB
curl -s http://localhost:5000/api/accounts | python3 -c \
  "import sys,json; print(f'Accounts: {len(json.load(sys.stdin).get(\"value\",[]))}')"

# Chat API
curl -s http://localhost:8080/api/health

# Client
curl -s -o /dev/null -w "Client: HTTP %{http_code}\n" http://localhost:5173
```

Browser access: `http://ehalsey-dev01.westus2.cloudapp.azure.com:5173`

## Troubleshooting

### chat-api returns `ECONNREFUSED 127.0.0.1:5000`

The chat-api container can't reach DAB via `localhost` — inside Docker, services use container network hostnames. The `docker-compose.yml` sets `DAB_URL=http://dab:5000`, `DAB_MCP_URL=http://dab:5000/mcp`, etc. If these env vars are missing, chat-api falls back to localhost defaults. Check with:

```bash
docker exec accounting-chat-api env | grep DAB
```

### DAB exits with "Invalid object name"

DAB can't find tables/views. Usually means db-init didn't finish before DAB started, or the prod DB clone hasn't been imported yet. Fix: `docker restart accounting-dab`

### Client exits with "ENOENT: /package.json"

The client's vite.config.ts reads `../package.json` for the version. With the bind mount (`./client:/app`), `../package.json` resolves to `/package.json` which doesn't exist in the container. Fix: create `docker-compose.override.yml` per step 7.

### SqlPackage not found (case sensitivity)

On Linux, the `sqlpackage` binary is lowercase but the npm scripts check for `SqlPackage`. Fix: `sudo ln -sf ~/.dotnet/tools/sqlpackage /usr/local/bin/SqlPackage`

### VM is shut down

Auto-shutdown is at 8 PM UTC. Start with: `az vm start -g EHALSEY-DEV01-RG -n ehalsey-dev01-vm --subscription "d487e16b-c758-4893-b0e9-a77c6e02e5f3"`
