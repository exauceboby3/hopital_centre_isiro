module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
};
