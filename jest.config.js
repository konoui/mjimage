module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', 
  moduleNameMapper: {
    '^@/(.*)$': '/src/$1',
  },
  testPathIgnorePatterns: [
        "./src/__tests__/utils/",
  ],
  transform: {
    "^.+\\.svg$": "<rootDir>/src/__tests__/utils/svgTransform.js"
  }
};
