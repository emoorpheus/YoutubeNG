// npm run deploy | launch | inspect: the app id and version come from assets/appinfo.json.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { normalize } from 'node:path';

const { id, version } = JSON.parse(readFileSync('assets/appinfo.json', 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);
const target = cmd === 'install' ? normalize(`./dist/${id}_${version}_all.ipk`) : id;

process.exit(
  spawnSync(normalize(`./node_modules/.bin/ares-${cmd}`), [target, ...rest], {
    stdio: 'inherit',
    shell: true
  }).status ?? 0
);
