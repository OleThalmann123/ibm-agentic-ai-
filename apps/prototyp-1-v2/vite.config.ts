import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Monorepo-Root: .env liegt typischerweise neben package.json, nicht unter apps/prototyp-1-v2.
const monorepoRoot = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  // Alle Variablen (inkl. LANGSMITH_API_KEY ohne VITE_) für den Dev-Proxy + import.meta.env
  const env = loadEnv(mode, monorepoRoot, '')

  return {
    envDir: monorepoRoot,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/langsmith': {
          target: (env.LANGSMITH_ENDPOINT || 'https://eu.api.smith.langchain.com').replace(
            /\/+$/,
            '',
          ),
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/langsmith/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.LANGSMITH_API_KEY;
              if (key) {
                proxyReq.setHeader('x-api-key', key);
              }
              const ws = env.LANGSMITH_WORKSPACE_ID;
              if (ws) {
                proxyReq.setHeader('x-tenant-id', ws);
              }
            });
          },
        },
      },
    },
  };
});
