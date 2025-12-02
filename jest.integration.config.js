/**
 * Jest Configuration for Integration Tests (Puppeteer)
 */

module.exports = {
  displayName: 'integration',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'json', 'node'],
  coverageDirectory: 'coverage/integration',
  verbose: true,
  testTimeout: 120000, // 2 minutes for browser tests
  maxWorkers: 1, // Run serially for browser tests
  globals: {
    PUPPETEER_HEADLESS: process.env.PUPPETEER_HEADLESS !== 'false',
    TEST_URL: process.env.TEST_URL || 'http://localhost:3000',
  },
};
