import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        /** Chrome caches dev responses aggressively; avoid stale JS/HTML vs Safari */
        headers: {
          'Cache-Control': 'no-store',
        },
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
            configure: (proxy) => {
              proxy.on('proxyRes', (proxyRes) => {
                proxyRes.headers['cache-control'] = 'no-store, max-age=0, must-revalidate';
              });
            },
          },
        },
      },
      preview: {
        headers: {
          'Cache-Control': 'no-store',
        },
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
            configure: (proxy) => {
              proxy.on('proxyRes', (proxyRes) => {
                proxyRes.headers['cache-control'] = 'no-store, max-age=0, must-revalidate';
              });
            },
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
