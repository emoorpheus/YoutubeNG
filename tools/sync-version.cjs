#!/usr/bin/env node

const fs = require('fs');

const packageInfo = require('../package.json');
const appinfo = require('../assets/appinfo.json');

fs.writeFileSync(
  'assets/appinfo.json',
  `${JSON.stringify(
    {
      ...appinfo,
      // webOS takes numbers only (x.y.z): 1.0.0-pre-release02 -> 1.0.0. The full
      // version goes into the settings heading and the .ipk file names.
      version: packageInfo.version.split('-')[0]
    },
    null,
    2
  )}\n`
);
