import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Activating @vitejs/plugin-react switches Vite/esbuild to the new automatic
// JSX runtime so JSX files don't need to `import React from 'react'`.
// Without this, production bundles crash with `ReferenceError: React is not
// defined` at runtime.
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev proxy is env-gated; only active when VITE_BACKEND_URL is set, so the
    // standalone/frontend-only mode has no backend assumption.
    proxy: process.env.VITE_BACKEND_URL
      ? {
          '/api/v1': {
            target: process.env.VITE_BACKEND_URL,
            changeOrigin: true
          }
        }
      : undefined
  }
});
