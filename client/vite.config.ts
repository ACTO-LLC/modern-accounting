import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import istanbul from 'vite-plugin-istanbul'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

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
  const chatApiUrl = env.VITE_API_URL || env.VITE_CHAT_API_URL || 'http://localhost:8080'
  const emailApiUrl = env.VITE_EMAIL_API_URL || 'http://localhost:7073'
  const port = parseInt(env.VITE_PORT) || 5173

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
        // All /api and /graphql traffic goes through chat-api, which handles
        // mutations via axios (with audit logging) and proxies GETs to DAB.
        '/api': {
          target: chatApiUrl,
          changeOrigin: true,
        },
        '/graphql': {
          target: chatApiUrl,
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
