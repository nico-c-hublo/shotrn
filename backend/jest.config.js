/**
 * Plain JS so Jest needs no extra TypeScript loader for its own config
 * (constitution I: no dependency without a reason).
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testEnvironment: 'node',
      moduleFileExtensions: ['js', 'json', 'ts'],
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
      setupFiles: ['<rootDir>/test/setup/unit-env.ts'],
    },
    {
      displayName: 'e2e',
      rootDir: '.',
      testEnvironment: 'node',
      moduleFileExtensions: ['js', 'json', 'ts'],
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
      setupFilesAfterEnv: ['<rootDir>/test/setup/e2e-env.ts'],
    },
  ],
};
