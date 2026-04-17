import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    // So fetchCodeownersRules runs in tests (config reads GITHUB_TOKEN at load time)
    env: {
      GITHUB_TOKEN: 'vitest-test-token',
    },
  },
});
