const { execSync } = require('child_process');
const path = require('path');

const env = process.argv[2] || 'qa';
const extraEnv = process.argv[3] || '';

// Ensure local node_modules/.bin is on PATH so cross-env, cucumber-js, ts-node resolve
const binPath = path.resolve(__dirname, '..', 'node_modules', '.bin');
const execOpts = {
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${binPath}${path.delimiter}${process.env.PATH}`,
  },
};

const cucumberCmd = extraEnv
  ? `cross-env ENV=${env} ${extraEnv} cucumber-js`
  : `cross-env ENV=${env} cucumber-js`;

let testExitCode = 0;

try {
  execSync(cucumberCmd, execOpts);
} catch (e) {
  testExitCode = e.status || 1;
}

try {
  execSync(`cross-env ENV=${env} ts-node --transpile-only report.ts`, execOpts);
} catch (_) {}

try {
  execSync(`cross-env ENV=${env} ts-node --transpile-only scripts/jira-sync.ts`, execOpts);
} catch (_) {}

process.exit(testExitCode);
