import { defineConfig } from 'vite';

// `npm run build` bundles every card (Lit included) into one minified ES module
// that Home Assistant loads as a dashboard resource: /local/m3e-cards.js
// (Not lib mode: Vite skips whitespace minification for ES libraries.)
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    modulePreload: false,
    rollupOptions: {
      input: 'src/index.ts',
      preserveEntrySignatures: false,
      output: {
        format: 'es',
        entryFileNames: 'm3e-cards.js',
        inlineDynamicImports: true,
      },
    },
  },
});
