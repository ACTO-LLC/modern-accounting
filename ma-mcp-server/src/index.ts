import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

import { sessionStore } from './session-store.js';
import { tools, getTool, zodToJsonSchema } from './tools/index.js';
import { ensureTablesExist, closePool } from './db-client.js';
import { loadFeatures } from './feature-loader.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.MA_MCP_PORT || '5002');

app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['mcp-session-id']
}));
app.use(express.json());

// MCP Protocol version
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'ma-mcp-server';
const SERVER_VERSION = '1.0.0';

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// MCP endpoint
app.post('/mcp', async (req: Request, res: Response) => {
  const request: JsonRpcRequest = req.body;
  let sessionId = req.headers['mcp-session-id'] as string;

  console.log(`[MCP] ${request.method}`, request.params ? JSON.stringify(request.params).substring(0, 100) : '');

  try {
    let response: JsonRpcResponse;

    switch (request.method) {
      case 'initialize':
        // Create new session
        sessionId = uuidv4();
        sessionStore.createSession(sessionId);

        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION
            },
            capabilities: {
              tools: {}
            }
          }
        };

        // Set session ID header
        res.setHeader('mcp-session-id', sessionId);
        break;

      case 'tools/list':
        // Validate session
        if (!sessionId || !sessionStore.getSession(sessionId)) {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32001,
              message: 'Invalid or expired session'
            }
          };
          break;
        }

        // Return tool definitions
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: zodToJsonSchema(tool.schema)
            }))
          }
        };
        break;

      case 'tools/call':
        // Validate session
        if (!sessionId || !sessionStore.getSession(sessionId)) {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32001,
              message: 'Invalid or expired session'
            }
          };
          break;
        }

        const { name, arguments: args } = request.params;
        const tool = getTool(name);

        if (!tool) {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          };
          break;
        }

        try {
          // Validate arguments
          const validatedArgs = tool.schema.parse(args || {});

          // Execute tool
          const result = await tool.handler(sessionId, validatedArgs);

          response = {
            jsonrpc: '2.0',
            id: request.id,
            result
          };
        } catch (err: any) {
          if (err.name === 'ZodError') {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32602,
                message: 'Invalid parameters',
                data: err.errors
              }
            };
          } else {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
                isError: true
              }
            };
          }
        }
        break;

      case 'notifications/initialized':
        // Client notification that initialization is complete
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {}
        };
        break;

      default:
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Unknown method: ${request.method}`
          }
        };
    }

    // Send as SSE format (matching QBO MCP pattern)
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify(response)}\n\n`);
    res.end();

  } catch (err: any) {
    console.error('[MCP] Error:', err);
    const errorResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: err.message
      }
    };
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
    res.end();
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    featuresLoaded: loadFeatures().size
  });
});

// Feature list endpoint (for direct HTTP access, debugging)
app.get('/features', (_req: Request, res: Response) => {
  const features = loadFeatures();
  res.json({
    count: features.size,
    features: Array.from(features.values()).map(f => ({
      key: f.key,
      name: f.name,
      category: f.category,
      difficulty: f.difficulty
    }))
  });
});

// Startup
async function start() {
  try {
    // Load features to validate YAML files
    const features = loadFeatures();
    console.log(`[MA-MCP] Loaded ${features.size} feature definitions`);

    // Ensure database tables exist
    await ensureTablesExist();
    console.log('[MA-MCP] Database tables verified');

    app.listen(PORT, () => {
      console.log(`[MA-MCP] Server running on http://localhost:${PORT}`);
      console.log(`[MA-MCP] MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`[MA-MCP] Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('[MA-MCP] Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[MA-MCP] Shutting down...');
  sessionStore.destroy();
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[MA-MCP] Shutting down...');
  sessionStore.destroy();
  await closePool();
  process.exit(0);
});

start();
