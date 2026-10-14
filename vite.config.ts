import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // single-file build (scripts/artifact.mjs) inlines the pixel fonts as data URIs
    assetsInlineLimit: process.env.NORNS_SINGLE ? 1e8 : 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as never);
