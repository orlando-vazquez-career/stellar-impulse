import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    force: true,
    include: ['phaser'],
  },
  server: { port: 5173, strictPort: true },
});
