import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const websocketProxyPort = Number(process.env.WS_PROXY_TARGET_PORT ?? 3001)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${websocketProxyPort}`,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
