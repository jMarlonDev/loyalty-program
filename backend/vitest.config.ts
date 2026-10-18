import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['tooling', 'unit', 'integration', 'e2e'].map((name) => ({
      test: {
        name,
        environment: 'node',
        include: [`tests/${name}/**/*.test.ts`],
        testTimeout: name === 'integration' || name === 'e2e' ? 15000 : 5000,
      },
    })),
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
