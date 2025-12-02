/**
 * Jest Configuration for Neural Augmentation Unit Tests
 */

module.exports = {
  displayName: 'neural',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/neural.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
  moduleFileExtensions: ['js', 'json', 'node'],
  collectCoverageFrom: [
    'src/neural/**/*.js',
    '!src/neural/neural.worker.js',
  ],
  coverageDirectory: 'coverage/neural',
  verbose: true,
  testTimeout: 30000,
};
