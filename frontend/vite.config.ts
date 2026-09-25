/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies the backend so `/:code` redirects and `/api` behave as in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      // Single-segment alphanumeric paths of exactly 13 chars are short codes, not SPA routes.
      '^/[0-9A-Za-z]{13}$': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.tsx'],
  },
});
