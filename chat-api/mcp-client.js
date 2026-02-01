/**
 * Dynamic MCP Client
 *
 * Connects to multiple MCP servers and dynamically discovers their tools.
 * Routes tool calls to the appropriate MCP server based on tool name.
 */

import axios from 'axios';

class McpServer {
    constructor(name, url, options = {}) {
        this.name = name;
        this.url = url;
        this.sessionId = null;
        this.initialized = false;
        this.tools = [];
        this.requestId = 0;
        this.headers = options.headers || {};
    }

    parseSSEResponse(data) {
        const lines = data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    return JSON.parse(line.substring(6));
                } catch (e) {
                    console.error(`[${this.name}] Failed to parse SSE:`, e);
                }
            }
        }
        return null;
    }

    async initialize() {
        if (this.initialized) return true;

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'chat-api', version: '1.0.0' }
            }
        };

        try {
            const response = await axios.post(this.url, payload, {
                headers: { 'Content-Type': 'application/json', ...this.headers },
                transformResponse: [(data) => data],
                timeout: 10000
            });

            const parsed = this.parseSSEResponse(response.data);
            if (parsed?.result) {
                this.sessionId = response.headers['mcp-session-id'];
                this.initialized = true;
                console.log(`[${this.name}] MCP initialized, session:`, this.sessionId);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`[${this.name}] MCP init failed:`, error.message);
            return false;
        }
    }

    async listTools() {
        if (!await this.initialize()) return [];

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'tools/list',
            params: {}
        };

        try {
            const headers = { 'Content-Type': 'application/json', ...this.headers };
            if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

            const response = await axios.post(this.url, payload, {
                headers,
                transformResponse: [(data) => data],
                timeout: 10000
            });

            const parsed = this.parseSSEResponse(response.data);
            this.tools = parsed?.result?.tools || [];
            console.log(`[${this.name}] Discovered ${this.tools.length} tools`);
            return this.tools;
        } catch (error) {
            console.error(`[${this.name}] tools/list failed:`, error.message);
            return [];
        }
    }

    async callTool(toolName, args = {}, authToken = null) {
        if (!await this.initialize()) {
            return { error: `${this.name} MCP not initialized` };
        }

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'tools/call',
            params: { name: toolName, arguments: args }
        };

        try {
            const headers = { 'Content-Type': 'application/json', ...this.headers };
            if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
            // Forward auth token for authenticated requests
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
                // DAB requires X-MS-API-ROLE header to use non-default roles
                headers['X-MS-API-ROLE'] = 'Admin';
            }

            const response = await axios.post(this.url, payload, {
                headers,
                transformResponse: [(data) => data],
                timeout: 60000
            });

            const parsed = this.parseSSEResponse(response.data);

            if (parsed?.error) {
                // Session expired - retry once
                if (parsed.error.code === -32001) {
                    console.log(`[${this.name}] Session expired, reinitializing...`);
                    this.initialized = false;
                    this.sessionId = null;
                    return this.callTool(toolName, args, authToken);
                }
                return { error: parsed.error.message };
            }

            // Parse MCP content response
            const result = parsed?.result;
            if (result?.content?.[0]?.text) {
                try {
                    return JSON.parse(result.content[0].text);
                } catch {
                    return { text: result.content[0].text };
                }
            }
            return result || {};
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`[${this.name}] Session not found, reinitializing...`);
                this.initialized = false;
                this.sessionId = null;
                return this.callTool(toolName, args, authToken);
            }
            console.error(`[${this.name}] Tool call failed:`, error.message);
            return { error: error.message };
        }
    }

    hasTool(toolName) {
        return this.tools.some(t => t.name === toolName);
    }
}

/**
 * Multi-MCP Client Manager
 * Aggregates tools from multiple MCP servers and routes calls appropriately.
 */
class McpClientManager {
    constructor() {
        this.servers = new Map();
        this.toolToServer = new Map();
        this.allTools = [];
    }

    addServer(name, url, options = {}) {
        const server = new McpServer(name, url, options);
        this.servers.set(name, server);
        return server;
    }

    async discoverAllTools() {
        this.toolToServer.clear();
        this.allTools = [];

        for (const [name, server] of this.servers) {
            const tools = await server.listTools();
            for (const tool of tools) {
                // Prefix tool name with server name to avoid conflicts
                const prefixedName = `${name}_${tool.name}`.replace(/_+/g, '_');
                this.toolToServer.set(prefixedName, { server, originalName: tool.name });
                this.toolToServer.set(tool.name, { server, originalName: tool.name }); // Also map unprefixed

                this.allTools.push({
                    type: 'function',
                    function: {
                        name: prefixedName,
                        description: `[${name.toUpperCase()}] ${tool.description}`,
                        parameters: tool.inputSchema || { type: 'object', properties: {} }
                    }
                });
            }
        }

        console.log(`Total tools discovered: ${this.allTools.length}`);
        return this.allTools;
    }

    getToolsForAI() {
        return this.allTools;
    }

    async callTool(toolName, args = {}, authToken = null) {
        const mapping = this.toolToServer.get(toolName);
        if (!mapping) {
            return { error: `Unknown tool: ${toolName}` };
        }

        const { server, originalName } = mapping;
        console.log(`Routing ${toolName} -> ${server.name}::${originalName}`);
        return server.callTool(originalName, args, authToken);
    }

    // Direct access to specific server
    getServer(name) {
        return this.servers.get(name);
    }
}

// Create singleton instance
const mcpManager = new McpClientManager();

export { McpServer, McpClientManager, mcpManager };
