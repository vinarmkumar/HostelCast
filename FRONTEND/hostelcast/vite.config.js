import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const projectRoot = import.meta.dirname

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
      'livekit-client': path.resolve(projectRoot, 'node_modules/livekit-client/dist/livekit-client.esm.mjs'),
      'socket.io-client': path.resolve(projectRoot, 'node_modules/socket.io-client/build/esm/index.js'),
    },
    dedupe: ['react', 'react-dom', 'livekit-client', 'socket.io-client'],
  },
  optimizeDeps: {
    include: ['livekit-client', 'socket.io-client'],
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
})
