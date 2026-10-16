/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 45000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  // sanitize-html / htmlparser2 ship ESM; transform for Jest CJS runtime
  transformIgnorePatterns: ['/node_modules/(?!(sanitize-html|htmlparser2|entities|dom-serializer|domelementtype|domhandler|domutils)/)'],
};
