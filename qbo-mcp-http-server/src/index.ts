#!/usr/bin/env node
/**
 * QBO MCP HTTP Server
 *
 * Provides QuickBooks Online access via HTTP-based MCP protocol.
 * Supports multi-tenant sessions with per-user OAuth tokens.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { tools, getTool } from './tools/index.js';
import {
    getAuthorizationUrl,
    handleOAuthCallback,
    isSessionConnected,
    getSessionInfo,
    disconnectSession,
    sessionStore
} from './quickbooks-client.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.QBO_MCP_PORT || 8001;

// Track MCP sessions
const mcpSessions = new Map<string, { created: Date; qboSessionId?: string }>();

// ============================================================================
// MCP Protocol Implementation (HTTP/SSE)
// ============================================================================

/**
 * Send SSE-formatted JSON-RPC response
 */
function sendSSEResponse(res: Response, data: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.end();
}

/**
 * Handle MCP JSON-RPC requests
 */
app.post('/mcp', async (req: Request, res: Response) => {
    const { jsonrpc, id, method, params } = req.body;

    // Get or create MCP session
    let mcpSessionId = req.headers['mcp-session-id'] as string;

    if (!mcpSessionId && method !== 'initialize') {
        return sendSSEResponse(res, {
            jsonrpc: '2.0',
            id,
            error: { code: -32001, message: 'Session not initialized' }
        });
    }

    try {
        switch (method) {
            case 'initialize': {
                // Create new MCP session
                mcpSessionId = randomUUID();
                mcpSessions.set(mcpSessionId, { created: new Date() });

                res.setHeader('MCP-Session-Id', mcpSessionId);
                return sendSSEResponse(res, {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: {
                            name: 'QuickBooks Online MCP Server',
                            version: '1.0.0'
                        }
                    }
                });
            }

            case 'tools/list': {
                // Convert zod type to JSON schema type
                const zodToJsonType = (zodDef: any): any => {
                    if (!zodDef) return { type: 'string' };

                    const typeName = zodDef.typeName;

                    // Handle optional - unwrap and get inner type
                    if (typeName === 'ZodOptional') {
                        return zodToJsonType(zodDef.innerType?._def);
                    }

                    // Handle array
                    if (typeName === 'ZodArray') {
                        return {
                            type: 'array',
                            items: zodToJsonType(zodDef.type?._def)
                        };
                    }

                    // Handle object
                    if (typeName === 'ZodObject') {
                        const shape = zodDef.shape?.();
                        if (!shape) return { type: 'object' };
                        return {
                            type: 'object',
                            properties: Object.fromEntries(
                                Object.entries(shape).map(([k, v]: [string, any]) => [
                                    k,
                                    zodToJsonType(v._def)
                                ])
                            )
                        };
                    }

                    // Handle union
                    if (typeName === 'ZodUnion') {
                        // For simple unions, just return string
                        return { type: 'string' };
                    }

                    // Handle enum
                    if (typeName === 'ZodEnum') {
                        return {
                            type: 'string',
                            enum: zodDef.values
                        };
                    }

                    // Handle primitive types
                    const typeMap: Record<string, string> = {
                        'ZodString': 'string',
                        'ZodNumber': 'number',
                        'ZodBoolean': 'boolean',
                        'ZodNull': 'null'
                    };

                    return { type: typeMap[typeName] || 'string' };
                };

                // Return available tools
                const toolList = tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: zodToJsonType(t.schema._def)
                }));

                return sendSSEResponse(res, {
                    jsonrpc: '2.0',
                    id,
                    result: { tools: toolList }
                });
            }

            case 'tools/call': {
                const { name, arguments: args } = params || {};
                const tool = getTool(name);

                if (!tool) {
                    return sendSSEResponse(res, {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Unknown tool: ${name}` }
                    });
                }

                // Get QBO session ID from MCP session or header
                const mcpSession = mcpSessions.get(mcpSessionId);
                let qboSessionId = mcpSession?.qboSessionId || req.headers['x-qbo-session-id'] as string;

                // For connection check, use any session ID
                if (name === 'qbo_get_connection_status' && !qboSessionId) {
                    qboSessionId = mcpSessionId; // Use MCP session as fallback
                }

                if (!qboSessionId && name !== 'qbo_get_connection_status') {
                    return sendSSEResponse(res, {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32002, message: 'QBO session not set. Use X-QBO-Session-Id header.' }
                    });
                }

                // Execute tool
                const result = await tool.handler(qboSessionId || '', { params: args });

                return sendSSEResponse(res, {
                    jsonrpc: '2.0',
                    id,
                    result
                });
            }

            default:
                return sendSSEResponse(res, {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32601, message: `Unknown method: ${method}` }
                });
        }
    } catch (error: any) {
        console.error('MCP error:', error);
        return sendSSEResponse(res, {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: error.message }
        });
    }
});

// ============================================================================
// OAuth Endpoints (for chat-api to use)
// ============================================================================

/**
 * Start OAuth flow - returns authorization URL
 */
app.post('/oauth/connect', (req: Request, res: Response) => {
    const { sessionId, redirectUrl } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    // Create session if needed
    sessionStore.getOrCreate(sessionId);

    // Generate state that includes session ID
    const state = Buffer.from(JSON.stringify({
        sessionId,
        redirectUrl: redirectUrl || 'http://localhost:5173'
    })).toString('base64');

    const authUrl = getAuthorizationUrl(state);

    res.json({ authUrl, state });
});

/**
 * OAuth callback handler
 */
app.get('/oauth/callback', async (req: Request, res: Response) => {
    const { code, realmId, state } = req.query;

    if (!code || !state) {
        return res.status(400).send('Missing code or state');
    }

    try {
        // Decode state
        const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
        const { sessionId, redirectUrl } = stateData;

        // Construct callback URL for OAuth client
        const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

        // Handle OAuth callback
        const session = await handleOAuthCallback(sessionId, callbackUrl);

        // Return HTML that closes the popup and notifies the parent window
        const companyName = session.companyName || 'QuickBooks Company';
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Connected to QuickBooks</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #2CA01C 0%, #1E7813 100%);
                        color: white;
                    }
                    .container {
                        text-align: center;
                        padding: 40px;
                    }
                    .checkmark {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    h1 { margin: 0 0 10px 0; font-size: 24px; }
                    p { margin: 0; opacity: 0.9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="checkmark">✓</div>
                    <h1>Connected!</h1>
                    <p>${companyName}</p>
                    <p style="margin-top: 20px; font-size: 14px;">This window will close automatically...</p>
                </div>
                <script>
                    // Notify parent window of successful connection
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'qbo_connected',
                            companyName: '${companyName.replace(/'/g, "\\'")}'
                        }, '*');
                    }
                    // Close this popup after a brief delay
                    setTimeout(() => {
                        window.close();
                    }, 1500);
                </script>
            </body>
            </html>
        `);
    } catch (error: any) {
        console.error('OAuth callback error:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Connection Error</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>Connection Failed</h1>
                <p>${error.message}</p>
                <button onclick="window.close()">Close</button>
            </body>
            </html>
        `);
    }
});

/**
 * Get connection status
 */
app.get('/oauth/status/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const connected = isSessionConnected(sessionId);
    const session = getSessionInfo(sessionId);

    res.json({
        connected,
        companyName: session?.companyName,
        realmId: session?.realmId
    });
});

/**
 * Disconnect session
 */
app.post('/oauth/disconnect', (req: Request, res: Response) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    disconnectSession(sessionId);
    res.json({ success: true });
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.QBO_ENVIRONMENT || 'sandbox'
    });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
    console.log(`QBO MCP HTTP Server running on http://localhost:${PORT}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  POST /mcp              - MCP JSON-RPC endpoint`);
    console.log(`  POST /oauth/connect    - Start OAuth flow`);
    console.log(`  GET  /oauth/callback   - OAuth callback`);
    console.log(`  GET  /oauth/status/:id - Check connection status`);
    console.log(`  POST /oauth/disconnect - Disconnect session`);
    console.log(`  GET  /health           - Health check`);
    console.log('');
    console.log('Environment:', process.env.QBO_ENVIRONMENT || 'sandbox');
    console.log('Client ID set:', !!process.env.QBO_CLIENT_ID);
});

// Cleanup expired sessions periodically
setInterval(() => {
    sessionStore.cleanup();
}, 60 * 60 * 1000); // Every hour
