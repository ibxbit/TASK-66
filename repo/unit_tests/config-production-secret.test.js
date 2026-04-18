const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const configPath = path.resolve(__dirname, '../backend/src/config.js');

test('production config guard rejects default/missing SESSION_SECRET', () => {
  const run = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(configPath)})`],
    {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SESSION_SECRET: ''
      },
      encoding: 'utf8'
    }
  );

  assert.notEqual(run.status, 0);
  assert.match((run.stderr || run.stdout || ''), /SESSION_SECRET must be set to a strong non-default value/i);
});

test('production config guard accepts strong SESSION_SECRET', () => {
  const run = spawnSync(
    process.execPath,
    ['-e', `const cfg=require(${JSON.stringify(configPath)}); console.log(cfg.session.secret.length);`],
    {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SESSION_SECRET: 'ProdStrongSecret_UseAtLeast24Chars_2026'
      },
      encoding: 'utf8'
    }
  );

  assert.equal(run.status, 0);
});
