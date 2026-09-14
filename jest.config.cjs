module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts','tsx','js','jsx','json','node'],
  testMatch: ['**/__tests__/**/*.test.ts','**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
};
