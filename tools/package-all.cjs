#!/usr/bin/env node
// npm run package:all -> two installers in dist/:
//   <id>_<version>_all.ipk          any webOS (3.x and newer), with polyfills
//   <id>_<version>_all_webOS22+.ipk webOS 22 and newer (Chrome 87+), smaller and faster
// Same split and naming as upstream youtube-webos releases. <version> is the one in
// package.json, pre-release label included (1.0.0-pre-release02); ares-package names the
// file after appinfo.json, which holds the numbers only.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { id, version } = JSON.parse(fs.readFileSync(path.join('assets', 'appinfo.json'), 'utf8'));
const label = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const built = path.join('dist', `${id}_${version}_all.ipk`);
const ipk = path.join('dist', `${id}_${label}_all.ipk`);
const modern = path.join('dist', `${id}_${label}_all_webOS22+.ipk`);
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm run build:modern');
run('npm run package');
fs.renameSync(built, modern);
run('npm run build');
run('npm run package');   // leaves dist/ with the legacy build, as `npm run build` does
if (built !== ipk) fs.renameSync(built, ipk);
for (const f of [ipk, modern]) console.log(`${f}  ${fs.statSync(f).size} bytes`);
