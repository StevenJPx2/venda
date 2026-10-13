import { defineConfig } from 'tsdown';

// One self-contained file: the workspace packages and their dependencies are
// all devDependencies, so they are bundled in.
export default defineConfig({
  entry: { venda: 'src/main.ts' },
  platform: 'node',
  format: 'esm',
  fixedExtension: true,
  clean: true,
  deps: { onlyBundle: false },
  outDir: process.env.VENDA_CLI_OUTPUT_DIR ?? 'dist'
});
