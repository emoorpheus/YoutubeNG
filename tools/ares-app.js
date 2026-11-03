// npm run deploy | launch | inspect: the app id comes from assets/appinfo.json. The .ipk is
// named after package.json's version by `npm run package:all` (1.0.0-pre-release02) and after
// appinfo.json's by `npm run package` (1.0.0), so install installs the newer of the two.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { normalize } from 'node:path';

const { id, version } = JSON.parse(readFileSync('assets/appinfo.json', 'utf8'));
const label = JSON.parse(readFileSync('package.json', 'utf8')).version;
const ipk = (v) => normalize(`./dist/${id}_${v}_all.ipk`);
const built = [label, version].map(ipk).filter((f) => existsSync(f));
built.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const [cmd, ...rest] = process.argv.slice(2);
const target = cmd === 'install' ? (built[0] ?? ipk(version)) : id;

process.exit(
  spawnSync(normalize(`./node_modules/.bin/ares-${cmd}`), [target, ...rest], {
    stdio: 'inherit',
    shell: true
  }).status ?? 0
);
