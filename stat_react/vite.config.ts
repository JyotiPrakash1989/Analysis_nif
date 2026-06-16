import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.NIFTYOPTIMA_PORT || env.PROXY_PORT || process.env.NIFTYOPTIMA_PORT || process.env.PROXY_PORT || '3200';
  const apiOrigin = `http://localhost:${apiPort}`;
  const ghPages = process.env.GITHUB_PAGES === '1';

  return {
    base: ghPages ? '/Analysis_nif/' : '/',
    plugins: [react()],
    server: {
      proxy: {
        '/socket.io': {
          target: apiOrigin,
          ws: true,
          changeOrigin: true,
        },
        // All /api/* including /api/mstock/auth-status, session-token → local Express (not broker)
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});
