const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { DateTime } = require('../backend/node_modules/luxon');
const { shouldRunNow, retryBackoffMs } = require('../backend/src/services/reports');

test('report scheduler trigger boundary matches configured local minute', () => {
  const definition = {
    active: true,
    schedule: { time: '02:00', timezone: 'America/New_York' },
    last_scheduled_run_date: '2026-03-27'
  };

  const shouldRun = shouldRunNow(definition, DateTime.fromISO('2026-03-28T06:00:00Z'));
  const shouldNotRunMinute = shouldRunNow(definition, DateTime.fromISO('2026-03-28T06:01:00Z'));

  assert.equal(shouldRun, true);
  assert.equal(shouldNotRunMinute, false);
});

test('report scheduler does not re-run when date already marked complete', () => {
  const definition = {
    active: true,
    schedule: { time: '02:00', timezone: 'America/New_York' },
    last_scheduled_run_date: '2026-03-28'
  };

  const shouldRun = shouldRunNow(definition, DateTime.fromISO('2026-03-28T06:00:00Z'));
  assert.equal(shouldRun, false);
});

test('report retry backoff is 1m then 5m', () => {
  assert.equal(retryBackoffMs(1), 60 * 1000);
  assert.equal(retryBackoffMs(2), 5 * 60 * 1000);
});

test('artifact writer persists checksum sidecar', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recon-test-'));
  const configPath = require.resolve('../backend/src/config');
  const reconciliationPath = require.resolve('../backend/src/services/reconciliation');
  const previousDir = process.env.RECONCILIATION_DIR;

  delete require.cache[configPath];
  delete require.cache[reconciliationPath];
  process.env.RECONCILIATION_DIR = tempDir;

  try {
    const { writeArtifactAtomic } = require('../backend/src/services/reconciliation');
    const content = 'checksum-content';
    const artifact = await writeArtifactAtomic({
      subdir: 'reports',
      fileName: 'sample.txt',
      content
    });

    assert.equal(artifact.artifactPath, 'reconciliation/reports/sample.txt');

    const artifactPath = path.join(tempDir, 'reports', 'sample.txt');
    const checksumPath = `${artifactPath}.sha256`;
    const diskContent = await fs.readFile(artifactPath, 'utf8');
    const checksumSidecar = await fs.readFile(checksumPath, 'utf8');
    const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');

    assert.equal(diskContent, content);
    assert.equal(checksumSidecar.trim(), expectedChecksum);
    assert.equal(artifact.checksumSha256, expectedChecksum);
  } finally {
    if (previousDir === undefined) {
      delete process.env.RECONCILIATION_DIR;
    } else {
      process.env.RECONCILIATION_DIR = previousDir;
    }
    delete require.cache[configPath];
    delete require.cache[reconciliationPath];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
