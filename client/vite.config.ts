import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:5000'
  const emailApiUrl = env.VITE_EMAIL_API_URL || 'http://localhost:7073'
  const port = parseInt(env.VITE_PORT) || 5173

  const chatApiUrl = env.VITE_CHAT_API_URL || 'http://localhost:8080'

  return {
    plugins: [react()],
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
