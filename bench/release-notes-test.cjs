/**
 * Release notes come from CHANGELOG.md (tools/release-notes.cjs, used by
 * .github/workflows/release.yml). Also checks that package.json's version
 * has its section, so a tagged release always has notes.
 * Usage: node bench/release-notes-test.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { heading, notesFor } = require('../tools/release-notes.cjs');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools/release-notes.cjs');
let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); };
const run = (args) => { try { return { code: 0, out: execFileSync('node', [tool, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: String(e.stdout), err: String(e.stderr) }; } };

t('tag and version map to the heading', heading('v1.0.0-pre-release06') === '1.0.0 pre-release06' && heading('1.0.0') === '1.0.0' && heading('v1.2.3') === '1.2.3',
  [heading('v1.0.0-pre-release06'), heading('1.0.0'), heading('v1.2.3')]);

const sample = '# Changelog\n\nIntro.\n\n## Unreleased\n\n- c\n\n## 1.0.0 pre-release02\r\n\r\nFixes.\r\n\r\n- b\r\n\r\n## 1.0.0 pre-release01\n\n- a\n';
const mid = notesFor(sample, '1.0.0-pre-release02');
t('a section: its text, no heading, up to the next one (CRLF too)', mid === 'Fixes.\n\n- b\n', mid);
t('the last section runs to the end', notesFor(sample, 'v1.0.0-pre-release01') === '- a\n', notesFor(sample, 'v1.0.0-pre-release01'));
t('no section: null', notesFor(sample, '9.9.9') === null && notesFor('## 1.0.0\n\n## 0.9\n- x\n', '1.0.0') === null);

const pkg = require('../package.json');
const cur = run([]);
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
t("package.json's version has notes (" + pkg.version + ')', cur.code === 0 && cur.out.length > 0 && cur.out === notesFor(changelog, pkg.version) && !/^## /m.test(cur.out),
  [cur.code, (cur.out || '').slice(0, 80)]);
const missing = run(['v0.0.1-nothing']);
t('a tag without notes fails the release', missing.code === 1 && /no "## 0\.0\.1 nothing" section/.test(missing.err || ''), [missing.code, missing.err]);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
