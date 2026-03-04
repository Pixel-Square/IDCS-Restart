import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// __dirname is not available in ESM; derive it from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export default ({ mode }: { mode: string }) => {
  // Load ALL env vars (no prefix filter) so CANVA_* are accessible
  const env = loadEnv(mode, process.cwd(), '');

  const CANVA_APP_ID       = env.CANVA_APP_ID       ?? '';
  const CANVA_BACKEND_HOST = env.CANVA_BACKEND_HOST  ?? 'http://127.0.0.1:8000';
  const HMR_ENABLED        = env.CANVA_HMR_ENABLED  === 'TRUE';

  return defineConfig({
    plugins: [react()],

    // The Canva Apps SDK starter kit puts index.html inside src/.
    root: 'src',
    base: './',

    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },

    // Expose CANVA_APP_ID to the browser bundle as a global constant.
    define: {
      CANVA_APP_ID: JSON.stringify(CANVA_APP_ID),
    },

    server: {
      port: 8080,

      // Canva loads your app inside an iframe — these headers are required.
      headers: {
        'Cross-Origin-Resource-Policy':   'cross-origin',
        'Cross-Origin-Embedder-Policy':   'require-corp',
        'Cross-Origin-Opener-Policy':     'same-origin',
      },

      // HMR over WebSocket (Canva tunnels WS when HMR is enabled in the portal)
      hmr: HMR_ENABLED
        ? { host: 'localhost', protocol: 'ws', port: 8080 }
        : false,

      // Proxy /api calls to the Django backend so CORS never fires.
      proxy: {
        '/api': {
          target: CANVA_BACKEND_HOST,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  });
};
