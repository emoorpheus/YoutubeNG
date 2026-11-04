#!/usr/bin/env node

const fs = require('fs');

const packageInfo = require('../package.json');
const appinfo = require('../assets/appinfo.json');

const file = 'assets/appinfo.json';
// Keep the file's own line endings (CRLF here), so an unchanged version is no diff.
const eol = fs.readFileSync(file, 'utf8').includes('\r\n') ? '\r\n' : '\n';
const json = JSON.stringify(
  {
    ...appinfo,
    // webOS takes numbers only (x.y.z): 1.0.0-pre-releaseNN -> 1.0.0. The full
    // version goes into the settings heading and the .ipk file names.
    version: packageInfo.version.split('-')[0]
  },
  null,
  2
);
fs.writeFileSync(file, json.replace(/\n/g, eol) + eol);
