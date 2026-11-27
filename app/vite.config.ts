import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const coreProxy = {
  target: 'http://127.0.0.1:17893',
  changeOrigin: false
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/rpc': coreProxy,
      '/dialog': coreProxy,
      '/app': coreProxy,
      '/api': coreProxy
    }
  }
})
