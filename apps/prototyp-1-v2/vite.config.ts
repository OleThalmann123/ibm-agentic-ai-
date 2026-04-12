import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Monorepo-Root: .env liegt typischerweise neben package.json, nicht unter apps/prototyp-1-v2.
const monorepoRoot = path.resolve(__dirname, '../..')

function envTruthy(v: string | undefined): boolean {
  if (v === undefined || v === '') return false
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'on'
}

export default defineConfig(({ mode }) => {
  // Alle Variablen (inkl. LANGSMITH_API_KEY ohne VITE_) für den Dev-Proxy + import.meta.env
  const env = loadEnv(mode, monorepoRoot, '')

  const langSmithTracing = envTruthy(env.LANGSMITH_TRACING)
  const langSmithProject =
    (env.LANGSMITH_PROJECT || env.VITE_LANGSMITH_PROJECT || 'HSG Agentic').trim() ||
    'HSG Agentic'
  const langSmithEndpoint = (env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com').replace(
    /\/+$/,
    '',
  )

  return {
    envDir: monorepoRoot,
    // Wie LangSmith-Doku: LANGSMITH_TRACING / LANGSMITH_PROJECT im Client lesbar (ohne API-Keys).
    define: {
      'process.env.LANGSMITH_TRACING': JSON.stringify(langSmithTracing ? 'true' : ''),
      'process.env.LANGSMITH_PROJECT': JSON.stringify(langSmithProject),
      'process.env.LANGSMITH_ENDPOINT': JSON.stringify(langSmithEndpoint),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/langsmith': {
          target: (env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com').replace(
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
