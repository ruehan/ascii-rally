import { defineConfig } from 'vite';

// ES2022: main.js uses top-level await to let the loading screen paint
// before the (synchronous) world build.
export default defineConfig({
  // Relative asset URLs: the build works from a sub-path (GitHub Pages serves
  // the site at /<repo>/) as well as from a domain root.
  base: './',
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
