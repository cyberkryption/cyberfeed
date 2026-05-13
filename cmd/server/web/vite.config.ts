import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the entire tabler icons package into one file so Vite does not
  // have to scan and resolve all 12,000+ individual icon files on every build.
  optimizeDeps: {
    include: ['@tabler/icons-react', '@tanstack/react-virtual'],
  },
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
