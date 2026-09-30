import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `allowedHosts: true` keeps the app usable when it is served behind a proxy
// (online preview hosts) as well as on plain localhost.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, allowedHosts: true, strictPort: false },
  preview: { host: true, port: 4173, allowedHosts: true },
  build: { chunkSizeWarningLimit: 1500 },
});
