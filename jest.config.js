module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', 
  moduleNameMapper: {
    '^@/(.*)$': '/src/$1',
  },
};
