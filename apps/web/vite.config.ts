import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@impulso/chain': path.resolve(__dirname, '../../packages/chain/src/index.ts'),
      '@impulso/state': path.resolve(__dirname, '../../packages/state/src/index.ts'),
      '@impulso/sim': path.resolve(__dirname, '../../packages/sim/src/index.ts'),
    },
  },
  // Pre-bundle Phaser so the first match does not wait for an on-demand optimisation.
  optimizeDeps: { include: ['phaser'] },
  server: { port: 5173, strictPort: true },
});
