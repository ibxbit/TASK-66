const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const config = require('../config');

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex');

const toCsv = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const raw = value === null || value === undefined ? '' : String(value);
    const escaped = raw.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  }
  return lines.join('\n');
};

const writeArtifactAtomic = async ({ subdir, fileName, content }) => {
  const baseDir = config.reporting.reconciliationDir;
  const targetDir = path.join(baseDir, subdir);
  await ensureDir(targetDir);

  const tmpName = `${fileName}.tmp`;
  const finalPath = path.join(targetDir, fileName);
  const tmpPath = path.join(targetDir, tmpName);
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, finalPath);

  const checksum = sha256(content);
  const checksumPath = `${finalPath}.sha256`;
  await fs.writeFile(checksumPath, `${checksum}\n`, 'utf8');

  const relativePath = path.posix.join('reconciliation', subdir, fileName);
  return {
    artifactPath: relativePath,
    checksumSha256: checksum
  };
};

module.exports = {
  toCsv,
  writeArtifactAtomic
};
