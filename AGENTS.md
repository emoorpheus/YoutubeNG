# AGENTS.md

Guide for coding agents (Codex, Claude Code, Cursor and others) working on this repository. People may find it useful too.

## What this is

YouTube Next-Gen: a YouTube app for LG webOS TVs, a fork of [youtube-webos](https://github.com/NicholasBly/youtube-webos). The app opens `youtube.com/tv` and injects `dist/webOSUserScripts/userScript.js`, which adds ad blocking, SponsorBlock, Return YouTube Dislike, playback speed, OLED mode and its own settings panel. App ID `youtube.nextgen` (`assets/appinfo.json`). GPL-3.0-only.

## Layout

| Path | What |
|---|---|
| `src/userScript.js` | entry injected into YouTube; imports every feature |
| `src/index.js`, `src/index.html` | launcher page |
| `src/config.js` | settings: `configOptions` (key → default, `desc`), `configRead` / `configWrite` / change listeners |
| `src/ui.js`, `src/ui-minimal.css` | settings panel; the minimal skin overrides `ui.css` |
| `src/settings-entry.js`, `src/welcome.js` | "YouTube Next-Gen" item in YouTube's Settings; first-launch hint |
| `src/i18n/` | translations: `index.js` (engine + language list), `ru.js`, `template.js` (all English text) |
| `src/playback-speed.js`, `src/speed/`, `src/speed-cap.js` | playback speed (WebCodecs, webOS 23+); `src/speed/` is vendor code |
| `src/adblock.js`, `src/sponsorblock*.js`, `src/return-dislike.js`, `src/video-quality.js`, ... | features, one file each |
| `src/polyfills.js`, `src/spatial-navigation-polyfill.js` | what webOS 3 (Chrome 38) lacks; legacy build only |
| `assets/` | `appinfo.json`, icons, splash (generated, see Icons) |
| `design/icons/generate.py` | draws icon variants A–I and all shipped images |
| `tools/` | `package-all.cjs`, `i18n.cjs`, `ares-app.js`, `sync-version.cjs` |
| `bench/` | headless tests and benchmarks against the built bundle |
| `docs/upstream.md` | what is ported from upstream and what is not yet |

## Commands

```sh
npm ci
npm run build            # legacy: webOS 3+ (ES5 + polyfills)
npm run build:modern     # webOS 22+ (Chrome 87)
npm run package:all      # both installers into dist/: *_all.ipk and *_all_webOS22+.ipk
npm run i18n:check       # translations match the source (CI runs it)
npm run i18n:template    # rewrite src/i18n/template.js after UI text changes
npm run lint
```

Bench (jsdom is not a dependency, install it without saving):

```sh
npm i --no-save jsdom
bash bench/run-all.sh mylabel   # builds legacy + modern and runs the suite
node bench/speed-cap-test.cjs dist/webOSUserScripts/userScript.js
```

Known failures in `run-all.sh`, present before this fork: dependency telemetry (1), dislike timing (2), module behaviour (3). `bench/speed-test.cjs` and `bench/settings-speed-test.cjs` target an older speed implementation and are not in the suite.

Do not run `npm run type-check` (`tsc -b`); it is not part of the build. Do not edit `node_modules/` or `dist/`.

## Rules

- **Two builds.** Code runs on webOS 3 (Chrome 38) in the legacy build. Use only APIs `src/polyfills.js` provides there; no `Object.hasOwn`, no `structuredClone`. Check both builds when you touch shared code.
- **Line endings.** Most older files are CRLF (`src/ui.js`, `config.js`, `userScript.js`, `utils.js`, `adblock.js`, `sponsorblock.js`, `video-quality.js`, `ui.css`, `assets/appinfo.json`, `package.json`, ...); newer ones (`src/i18n/`, `src/speed/`, `playback-speed.js`, `ui-minimal.css`, `tools/`) are LF. Check with `file <path>` and keep each file's line endings; edit CRLF files byte-safe.
- **Text on screen** goes through `t()` from `src/i18n/index.js` (or `createElement(..., { text })`, `showNotification`, a config `desc`, which call it). Never pass config keys or values through `t()`. After adding text: `npm run i18n:template`, add the Russian to `src/i18n/ru.js` (`node tools/i18n.cjs sync ru` adds it marked `// TODO`), `npm run i18n:check`. A message with a value inside needs a pattern in `template.js` (see `TRANSLATING.md`).
- **Settings**: add a key to `configOptions` in `src/config.js` with a default and an English `desc`; the panel row goes in `src/ui.js`.
- **Icons**: do not edit images in `assets/` by hand. `python3 design/icons/generate.py [A-I]` (default C) writes every icon, the preview, the splash and the Settings picture, then `npm run package:all`.
- **Version**: `package.json` is the source; `npm version <x.y.z>` syncs `assets/appinfo.json`. The panel heading shows it (`__YTNG_VERSION__`, webpack DefinePlugin). Update `CHANGELOG.md`.
- **Upstream**: port changes by hand and record them in `docs/upstream.md`; credit the PR in the ported file.
- **Docs**: `README.md` and `README.ru.md` (also `TRANSLATING.md` / `TRANSLATING.ru.md`) say the same thing; change both.
- Keep changes small and in one place; verify (build both, run the relevant bench or headless test) before calling something done.

## Testing on a TV

Developer Mode: `npm run deploy -- -d tv`, `npm run launch -- -d tv`, `npm run inspect -- -d tv` for the web inspector. Rooted TV: copy the ipk to `/tmp` and install with `luna-send` (see `README.md`). The playback speed controller is exposed as `window.ytngSpeed` for debugging.
