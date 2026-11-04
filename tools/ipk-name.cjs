// Installer file names in dist/, in one place for package-all, gen-manifest and ares-app:
//   <id>_<label>_all.ipk           any webOS (3.x and newer), with polyfills
//   <id>_<label>_all_webOS22+.ipk  webOS 22 and newer (Chrome 87+), smaller and faster
// Same split and naming as upstream youtube-webos releases. <label> is package.json's
// version, pre-release label included (1.0.0-pre-releaseNN). ares-package names its output
// after appinfo.json's version, which holds the numbers only (1.0.0).

const { id, version } = require('../assets/appinfo.json');
const label = require('../package.json').version;
const name = (v, suffix = '') => `${id}_${v}_all${suffix}.ipk`;

module.exports = {
  id,
  aresOutput: name(version),
  legacy: name(label),
  modern: name(label, '_webOS22+')
};
