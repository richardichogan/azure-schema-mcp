import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8', // Changed from c8 to v8
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'build/',
        '**/*.config.{js,ts}',
        '**/test-*.js',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    testTimeout: 30000, // 30s for Azure API calls
    hookTimeout: 30000,
  },
});
