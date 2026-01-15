#!/bin/bash
# Start all development services

echo "Starting development services..."

# Kill any existing instances
pkill -f "vite" 2>/dev/null
pkill -f "chat-api/server.js" 2>/dev/null
sleep 1

# Start client (Vite)
echo "Starting client on port 5173..."
cd /workspace/client && npm run dev -- --host > /tmp/client.log 2>&1 &
CLIENT_PID=$!

# Start chat-api
echo "Starting chat-api on port 7071..."
cd /workspace/chat-api && npm run dev > /tmp/chat-api.log 2>&1 &
CHATAPI_PID=$!

# Wait for services to start
sleep 3

# Check status
echo ""
echo "========================================="
echo "  Services Started"
echo "========================================="
echo ""

if kill -0 $CLIENT_PID 2>/dev/null; then
    CLIENT_PORT=$(grep -oP 'localhost:\K[0-9]+' /tmp/client.log | head -1)
    echo "  Client:   http://localhost:${CLIENT_PORT:-5173}/ (PID: $CLIENT_PID)"
else
    echo "  Client:   FAILED - check /tmp/client.log"
fi

if kill -0 $CHATAPI_PID 2>/dev/null; then
    echo "  Chat API: http://localhost:7071/ (PID: $CHATAPI_PID)"
else
    echo "  Chat API: FAILED - check /tmp/chat-api.log"
fi

echo ""
echo "Logs: /tmp/client.log, /tmp/chat-api.log"
echo "Stop: pkill -f vite && pkill -f 'chat-api/server.js'"
echo ""
