import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load ALL env vars (including non-VITE_ prefixed) from the app directory
  // so the dev proxy can read LANGSMITH_API_KEY without exposing it to the browser.
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/langsmith': {
          target: env.LANGSMITH_ENDPOINT || 'https://eu.api.smith.langchain.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/langsmith/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.LANGSMITH_API_KEY;
              if (key) {
                proxyReq.setHeader('x-api-key', key);
              }
            });
          },
        },
      },
    },
  };
});
