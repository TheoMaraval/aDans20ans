import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    environment: 'node',
    environmentMatchGlobs: [['src/ui/**', 'jsdom']],
    coverage: { include: ['src/core/**'], exclude: ['src/core/test-fixtures.ts', '**/*.test.ts'] },
  },
});
