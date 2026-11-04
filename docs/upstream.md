# Upstream

YouTube Next-Gen is built on [youtube-webos](https://github.com/NicholasBly/youtube-webos) by NicholasBly (0.8.4, `e0c70f3`) with playback speed from the [Schmiddisen fork](https://github.com/Schmiddisen/youtube-webos) (`2c4af3c`).

```sh
git remote add nb https://github.com/NicholasBly/youtube-webos.git   # once
git fetch nb --tags
```

## From 0.8.5 beta 2 (`v0.8.5-b2`), ported

| Upstream | What it fixes | Here |
|---|---|---|
| PR #197 | SponsorBlock stopped after switching to another app and back: a plain relaunch navigated to `#/` | `src/userScript.js` (relaunch without `target`/`contentTarget` returns early) |
| PR #196 | With Reduce Telemetry, home rows lost their tracking params and YouTube dropped them | `src/adblock.js` (`KEEP_TRACKING_PARAMS`), `bench/adblock-test.cjs` |
| PR #198 | Frozen video after a video screensaver took the decoder | `src/decoder-stall.js` (from `screensaver-fix.js`), `bench/screensaver-test.cjs` |
| speed engine | fragment sample guard, object URL cleanup, append errors, 60 s audio back-buffer, buffers freed on destroy | `src/speed/{containers,mse-hook,audio-engine}.js` (vendor files as in b2) |
| speed cap | above 1x (upstream: 1.25x): Force Max Quality waits instead of forcing 2160p; next video capped to 1080p once it plays; after a speed reload the position is restored (webOS 25 starts ~25 s early) and the cap set again | `src/speed-cap.js`, `src/playback-speed.js`, `src/video-quality.js`, `bench/speed-cap-test.cjs` |
| version in the panel | the settings heading shows the version | `webpack.config.js` (`__YTNG_VERSION__`), `src/ui.js` |
| PR #200 (@magicsk) | DeArrow: crowd-sourced titles and thumbnails instead of clickbait, off by default, its own tab | `src/dearrow/`, `src/vendor/dearrow/` (b2's DeArrow code, unchanged), `src/adblock.js` (runs in the response hook), `bench/dearrow-test.cjs` |
| #203 | Display Time: Off / Time / Date and time; the old checkbox carries over (on → Time) | `src/watch.js`, `src/config.js` (`clockModes`, `upgrade`), `bench/clock-test.cjs` |
| ad-block filters | the filters under Ad block do nothing while Ad block is off | `src/adblock.js` (`trackingBlockWanted`), `src/ui.js` |
| dislikes | 999,950 and up reads as 1m, not 1000k | `src/return-dislike.js` |

## Not ported yet

Planned for a rebase onto 0.8.5 final, not the beta:

- **Restructure**: `src/core`, `features`, `ui`, `vendor`; own keyboard navigation instead of the spatial-navigation polyfill; one `<style>` instead of css loaders; terser `passes: 2`. This is where most of b2's smaller legacy build comes from.
- **Tests**: the `tests/` suite, codemap and bundle budget.
- Focus ring fix: likely not needed — the minimal skin (`src/ui-minimal.css`) marks focus with a background fill, not a ring that can be cut off; check on the TV.

## How to bring a change over

1. `git log --oneline v0.8.4..nb/main` (or between tags) and read the PR.
2. Port by hand: since b2 the paths differ (`src/features/...` there, flat `src/` here). Keep our app ID, branding and minimal skin.
3. New text on screen goes through `t()`; then `npm run i18n:template`, add the Russian to `src/i18n/ru.js`, `npm run i18n:check`.
4. Credit the PR in a comment at the top of the ported code, list it in the table above and in `CHANGELOG.md`.
5. Build both installers and run the bench (see `AGENTS.md`).
