#!/usr/bin/env node
// Release notes for a version: its section of CHANGELOG.md, without the heading.
// Usage: node tools/release-notes.cjs [version or tag]   (default: package.json's)
// 1.0.0-pre-release06 or v1.0.0-pre-release06 -> the "## 1.0.0 pre-release06" section.
// Exits 1 when CHANGELOG.md has no such section, so a release never goes out
// without notes (.github/workflows/release.yml).
const fs = require('fs');
const path = require('path');

/** The CHANGELOG heading of a version: 1.0.0-pre-release06 -> 1.0.0 pre-release06. */
function heading(version) {
  return String(version).replace(/^v/, '').replace('-', ' ');
}

/** The text under "## <heading>" up to the next "## ", trimmed; null if absent. */
function notesFor(changelog, version) {
  const want = '## ' + heading(version);
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === want);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) end = lines.length;
  const text = lines.slice(start + 1, end).join('\n').trim();
  return text ? text + '\n' : null;
}

module.exports = { heading, notesFor };

if (require.main === module) {
  const version = process.argv[2] || require('../package.json').version;
  const notes = notesFor(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), version);
  if (!notes) {
    console.error('CHANGELOG.md has no "## ' + heading(version) + '" section with text');
    process.exit(1);
  }
  process.stdout.write(notes);
}
