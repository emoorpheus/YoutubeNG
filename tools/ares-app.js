// npm run deploy | launch | inspect. `npm run package:all` and `npm run package` name the
// .ipk differently (tools/ipk-name.cjs: legacy vs aresOutput), so install installs the newer.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { normalize } from 'node:path';
import names from './ipk-name.cjs';

const ipk = (file) => normalize(`./dist/${file}`);
const built = [names.legacy, names.aresOutput].map(ipk).filter((f) => existsSync(f));
built.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const [cmd, ...rest] = process.argv.slice(2);
const target = cmd === 'install' ? (built[0] ?? ipk(names.aresOutput)) : names.id;

process.exit(
  spawnSync(normalize(`./node_modules/.bin/ares-${cmd}`), [target, ...rest], {
    stdio: 'inherit',
    shell: true
  }).status ?? 0
);
