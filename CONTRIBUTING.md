# Contributing

Bug reports, ideas, translations and code are welcome, in English or Russian.

- **A bug or an idea**: open an issue with the template. Give the app version (the settings heading shows it), the installer (webOS 22+ or any webOS), the webOS version and the TV's year.
- **A translation**: see [TRANSLATING.md](TRANSLATING.md).
- **A security problem**: do not open an issue; see [SECURITY.md](SECURITY.md).

Leave private data out of issues, logs, screenshots and commits: no IP addresses, host names, serial numbers, firmware builds, account names, cookies, tokens or local paths. "A webOS 25 TV (2025)" says enough.

## Code

[AGENTS.md](AGENTS.md) has the layout, the commands and the rules; they apply to people as much as to coding agents. In short:

1. Node.js 22+, then `npm ci`.
2. One change at a time, kept small and in one place. The code runs on webOS 3 (Chrome 38) in the legacy build: use only what `src/polyfills.js` provides there, and check both builds when you touch shared code.
3. Keep each file's line endings (many older files are CRLF; `file <path>` tells).
4. Text on screen goes through `t()`; add the Russian and run `npm run i18n:check`.
5. New behaviour gets a test in `bench/` that fails without the change and passes with it. A performance change gets before and after numbers in `docs/perf.md`.
6. `bash bench/run-all.sh <label>` ends with `all passed` (CI runs it too).
7. A line in `CHANGELOG.md` under `## Unreleased`, for the people who install the app.
8. `README.md` and `README.ru.md` say the same thing: change both.

On a TV in Developer Mode: `npm run deploy -- -d tv`, `npm run launch -- -d tv`, `npm run inspect -- -d tv`.

## Pull requests

Say what changes and why, paste the end of `bench/run-all.sh`, and whether it was tried on a TV (webOS version and year) or not. The template has the checklist.

## Releases

The version lives in `package.json` (`npm version <x.y.z> --no-git-tag-version` also writes `assets/appinfo.json`). Rename `## Unreleased` in `CHANGELOG.md` to the version, for example `## 1.0.0 pre-release07` for `1.0.0-pre-release07`, then push a tag `v<version>`: the release workflow builds both installers and publishes them with that section as the release notes (`tools/release-notes.cjs`) and a `SHA256SUMS` file. Tags with a `-` are marked as pre-releases.

## Licence

Contributions are accepted under the project's licence, GPL-3.0-only (see `LICENSE`).
