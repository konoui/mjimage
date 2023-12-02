module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', 
  moduleNameMapper: {
    '^@/(.*)$': '/src/$1',
  },
  testPathIgnorePatterns: [
        "./src/lib/__tests__/utils/","./dist"
  ],
  transform: {
    "^.+\\.svg$": "<rootDir>/src/lib/__tests__/utils/svgTransform.js"
  }
};
