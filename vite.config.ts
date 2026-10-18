import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  build:
    mode === 'artifact'
      ? // одна страница без внешних файлов: JS и CSS встраиваются скриптом scripts/inline-artifact.ts
        { target: 'es2022', outDir: 'dist-artifact', cssCodeSplit: false, chunkSizeWarningLimit: 1200, rollupOptions: { output: { inlineDynamicImports: true } } }
      : { target: 'es2022', chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
