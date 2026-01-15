#!/bin/bash
# Dev Container Setup Script
# Installs dependencies, MCP servers, and configures the environment

set -e

echo "========================================="
echo "  Setting up Dev Container"
echo "========================================="

# Install Claude Code CLI
echo ""
echo "[1/6] Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# Install pipx and MCP servers
echo ""
echo "[2/6] Installing pipx and MCP servers..."
pip install --user pipx
pipx ensurepath
pipx install mssql-mcp-server
pipx install azure-mcp

# Install ODBC drivers for SQL Server
echo ""
echo "[3/6] Installing ODBC drivers..."
if ! command -v sqlcmd &> /dev/null; then
    curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
    curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
    sudo apt-get update
    sudo ACCEPT_EULA=Y apt-get install -y msodbcsql18 mssql-tools18 unixodbc-dev
fi

# Install Node.js dependencies
echo ""
echo "[4/6] Installing Node.js dependencies..."
cd /workspace
npm install

cd /workspace/client
npm install
cp -n .env.example .env.local 2>/dev/null || true

cd /workspace/chat-api
npm install

# Install QBO MCP server dependencies
echo ""
echo "[5/6] Setting up QBO MCP server..."
cd /workspace/qbo-mcp-http-server
npm install
cp -n .env.example .env 2>/dev/null || true

# Create MCP config for container
echo ""
echo "[6/6] Creating MCP configuration..."
cat > /workspace/.mcp.json << 'MCPEOF'
{
  "mcpServers": {
    "mssql": {
      "type": "stdio",
      "command": "/home/vscode/.local/bin/mssql-mcp-server",
      "env": {
        "MSSQL_HOST": "database,1433",
        "MSSQL_DATABASE": "AccountingDB",
        "MSSQL_USER": "sa",
        "MSSQL_PASSWORD": "StrongPassword123!"
      }
    },
    "azure": {
      "type": "stdio",
      "command": "/home/vscode/.local/bin/azure-mcp"
    },
    "qbo": {
      "type": "http",
      "url": "http://localhost:8001/mcp"
    }
  }
}
MCPEOF

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "  MCP servers configured:"
echo "    - mssql: SQL Server (database:1433)"
echo "    - azure: Azure CLI integration"
echo "    - qbo:   QuickBooks Online (localhost:8001)"
echo ""
echo "  To use Azure, run: az login"
echo "  To start QBO MCP: cd qbo-mcp-http-server && npm start"
echo ""
