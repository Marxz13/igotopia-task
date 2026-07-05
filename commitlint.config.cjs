/**
 * Conventional Commits rules for commit messages.
 * Scopes are warned, not blocked.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['db', 'api', 'worker', 'ui', 'contract', 'deploy', 'providers']],
  },
};
