import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':   ['react', 'react-dom'],
          'mantine-vendor': ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
          'icons-vendor':   ['@tabler/icons-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8888',
    },
  },
})
