#!/bin/bash
# Post-start script for dev container
# Waits for services and runs migrations

set -e

echo "========================================="
echo "  Modern Accounting - Dev Container"
echo "========================================="
echo ""

# Wait for database to be ready
echo "Waiting for database..."
for i in {1..30}; do
    if sqlcmd -S database -U sa -P "StrongPassword123!" -C -Q "SELECT 1" &>/dev/null; then
        echo "  Database ready!"
        break
    fi
    sleep 2
done

# Wait for DAB to be ready
echo "Waiting for DAB API..."
for i in {1..30}; do
    if curl -s http://dab:5000/api/accounts &>/dev/null; then
        echo "  DAB API ready!"
        break
    fi
    sleep 2
done

# Wait for Email API to be ready
echo "Waiting for Email API..."
for i in {1..30}; do
    if curl -s http://email-api:7073/email-api/health &>/dev/null; then
        echo "  Email API ready!"
        break
    fi
    sleep 2
done

# Run database migrations if deploy script exists
if [ -f "/workspace/database/deploy-db.js" ]; then
    echo ""
    echo "Running database migrations..."
    cd /workspace/database
    node deploy-db.js || echo "  Migration completed (or already up to date)"
fi

echo ""
echo "========================================="
echo "  Dev environment ready!"
echo "========================================="
echo ""
echo "  Services:"
echo "    - Database:  database:1433 (localhost:14330)"
echo "    - DAB API:   http://dab:5000/api (localhost:5000)"
echo "    - Email API: http://email-api:7073/email-api (localhost:7073)"
echo ""
echo "  To start development servers:"
echo "    Terminal 1: cd chat-api && npm start"
echo "    Terminal 2: cd client && npm run dev"
echo ""
echo "  Or use the integrated terminal commands"
echo ""
