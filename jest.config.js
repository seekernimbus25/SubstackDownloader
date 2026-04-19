const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({
  testEnvironment: 'node',
  // Avoid haste-map "naming collision" with nested worktree copies of package.json
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
})
