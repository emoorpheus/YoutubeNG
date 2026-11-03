#!/usr/bin/env node
// Homebrew Channel manifest for dist/<id>_<version>_all.ipk.
// iconUri / sourceUrl are added only when package.json has a GitHub "homepage".

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const appinfo = require('../assets/appinfo.json');
const pkg = require('../package.json');
const ipkfile = `${appinfo.id}_${pkg.version}_all.ipk`; // named by tools/package-all.cjs
const outfile = process.argv[2] || path.join('dist', `${appinfo.id}.manifest.json`);
const ipkhash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join('dist', ipkfile)))
  .digest('hex');
const repo = /^https:\/\/github\.com\/([^/]+\/[^/#]+)/.exec(pkg.homepage || '');

fs.writeFileSync(
  outfile,
  JSON.stringify({
    id: appinfo.id,
    version: appinfo.version,
    type: appinfo.type,
    title: appinfo.title,
    iconUri: repo
      ? `https://raw.githubusercontent.com/${repo[1]}/main/assets/largeIcon.png`
      : undefined,
    sourceUrl: repo ? `https://github.com/${repo[1]}` : undefined,
    rootRequired: false,
    ipkUrl: ipkfile,
    ipkHash: {
      sha256: ipkhash
    }
  })
);
