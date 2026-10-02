import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Pre-bundle Phaser so the first match does not wait for an on-demand optimisation.
  optimizeDeps: { include: ['phaser'] },
  server: { port: 5173, strictPort: true },
});
