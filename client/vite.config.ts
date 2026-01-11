import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:5000'
  const port = parseInt(env.VITE_PORT) || 5173

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/graphql': {
          target: apiUrl,
          changeOrigin: true,
          ws: true
        }
      }
    }
  }
})
