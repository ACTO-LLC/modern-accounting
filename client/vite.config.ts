import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import istanbul from 'vite-plugin-istanbul'
import http from 'http'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Vite plugin that buffers and forwards write requests to DAB directly.
// DAB's Kestrel server enforces MinRequestBodyDataRate, and Vite's
// http-proxy streams bodies too slowly, causing 500 errors on writes.
// This plugin intercepts POST/PUT/PATCH/DELETE to /api, buffers the body,
// and sends it as a single chunk directly to DAB.
function dabProxyBufferPlugin(dabUrl: string): Plugin {
  // Always target DAB directly for write ops, bypassing any Express proxy chain
  const target = new URL(dabUrl)

  return {
    name: 'dab-proxy-buffer',
    configureServer(server) {
      // Chat-api routes that should NOT be intercepted (they go to Express, not DAB)
      const chatApiPrefixes = [
        '/api/transactions', '/api/banktransactions', '/api/post-transactions',
        '/api/categorization-rules', '/api/plaid', '/api/qbo',
        '/api/insights', '/api/users', '/api/chat', '/api/tax',
      ]

      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url ?? ''
        // Only intercept write requests destined for DAB (not chat-api)
        const isChatApi = chatApiPrefixes.some(prefix => url.startsWith(prefix))
        const isDabWrite = !isChatApi
          && (url.startsWith('/api') || url.startsWith('/graphql'))
          && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '')
        if (!isDabWrite) return next()

        // Buffer the request body
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          const body = Buffer.concat(chunks)

          // Forward directly to DAB with buffered body
          const proxyReq = http.request({
            hostname: target.hostname,
            port: target.port,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: `${target.hostname}:${target.port}`,
              'content-length': String(body.length),
            },
          }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers)
            proxyRes.pipe(res)
          })

          proxyReq.on('error', (err: any) => {
            console.error('[dab-proxy-buffer] Error:', err.message)
            if (!res.headersSent) {
              res.writeHead(502)
              res.end(JSON.stringify({ error: { code: 'ProxyError', message: err.message, status: 502 } }))
            }
          })

          proxyReq.end(body)
        })
      })
    },
  }
}

// Vite plugin that generates a version.json manifest in the build output.
// The client polls this file to detect new deployments and prompt users to reload.
// The buildId is a timestamp so it changes on every build, even if the version stays the same.
function versionManifestPlugin(version: string): Plugin {
  return {
    name: 'version-manifest',
    apply: 'build',
    closeBundle() {
      const manifest = {
        version,
        buildId: new Date().toISOString(),
      }
      writeFileSync(
        resolve(__dirname, 'dist', 'version.json'),
        JSON.stringify(manifest, null, 2)
      )
      console.log(`[version-manifest] Generated version.json: v${version}, build ${manifest.buildId}`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:5000'
  const emailApiUrl = env.VITE_EMAIL_API_URL || 'http://localhost:7073'
  const port = parseInt(env.VITE_PORT) || 5173

  const chatApiUrl = env.VITE_CHAT_API_URL || 'http://localhost:8080'

  // Read version from root package.json
  const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
  const appVersion =
    typeof rootPkg.version === 'string' && rootPkg.version.trim().length > 0
      ? rootPkg.version
      : '0.0.0'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      // DAB URL - always port 5000 for direct write operations (bypasses Express proxy chain)
      dabProxyBufferPlugin(env.VITE_DAB_URL || 'http://localhost:5000'),
      react(),
      // Generate version.json for cache-busting version detection
      versionManifestPlugin(appVersion),
      ...(process.env.VITE_COVERAGE === 'true'
        ? [istanbul({
            include: 'src/*',
            exclude: ['node_modules', 'tests/'],
            extension: ['.ts', '.tsx', '.js', '.jsx'],
            requireEnv: true,
            forceBuildInstrument: mode === 'production',
          })]
        : []),
    ],
    server: {
      port,
      strictPort: true,
      host: true,
      allowedHosts: ['host.docker.internal'],
      proxy: {
        // Route chat-api endpoints (must come before generic /api catch-all)
        '/api/transactions': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/banktransactions': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/post-transactions': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/categorization-rules': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/plaid': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/qbo': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/insights': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/users': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/chat': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api/tax': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/graphql': {
          target: apiUrl,
          changeOrigin: true,
          ws: true
        },
        '/email-api': {
          target: emailApiUrl,
          changeOrigin: true,
        }
      }
    }
  }
})
