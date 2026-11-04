#!/usr/bin/env node
// npm run package:all -> the two installers in dist/ named in tools/ipk-name.cjs.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const names = require('./ipk-name.cjs');

const built = path.join('dist', names.aresOutput);
const ipk = path.join('dist', names.legacy);
const modern = path.join('dist', names.modern);
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm run build:modern');
run('npm run package');
fs.renameSync(built, modern);
run('npm run build');
run('npm run package');   // leaves dist/ with the legacy build, as `npm run build` does
if (built !== ipk) fs.renameSync(built, ipk);
for (const f of [ipk, modern]) console.log(`${f}  ${fs.statSync(f).size} bytes`);
