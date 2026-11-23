import { defineConfig } from 'vite';

// ES2022: main.js uses top-level await to let the loading screen paint
// before the (synchronous) world build.
export default defineConfig({
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
