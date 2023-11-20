module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', 
  moduleNameMapper: {
    '^@/(.*)$': '/src/$1',
  },
  testPathIgnorePatterns: [
        "./src/__tests__/utils/"
  ],
};
