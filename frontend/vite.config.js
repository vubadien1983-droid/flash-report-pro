import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the vendor code the app needs on FIRST PAINT (react, firebase)
        // away from everything else, so the browser can cache them across
        // deploys. The export libraries are not listed here on purpose —
        // they are dynamically imported and Rollup gives them their own
        // chunks automatically, which is what keeps them off the critical path.
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/firestore'],
        },
      },
    },
    // The lazy export chunks are legitimately large; the number that matters
    // for field use is the initial load, which this config keeps small.
    chunkSizeWarningLimit: 900,
  }
});
