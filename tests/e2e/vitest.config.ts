import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@chess-platform/shared-domain': path.resolve(
        repoRoot,
        'packages/shared-domain/dist/index.js',
      ),
      '@web': path.resolve(repoRoot, 'apps/web/src'),
    },
  },
  test: {
    environment: 'node',
    root: repoRoot,
    include: ['tests/e2e/suites/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
