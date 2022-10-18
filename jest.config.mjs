export default {
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest'],
  },
  coverageDirectory: 'reports/coverage',
  reporters: ['default', ['jest-junit', { outputName: 'reports/junit/js-test-results.xml' }]],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
};
