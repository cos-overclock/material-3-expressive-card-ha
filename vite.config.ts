import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// `npm run build` bundles every card (Lit included) into one minified ES module
// that Home Assistant loads as a dashboard resource: /local/material-3-expressive-card.js
// (Not lib mode: Vite skips whitespace minification for ES libraries.)
export default defineConfig({
  define: {
    __M3E_VERSION__: JSON.stringify(version),
  },
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
        entryFileNames: 'material-3-expressive-card.js',
        inlineDynamicImports: true,
      },
    },
  },
});
