# Performance

Every optimisation attempt, kept or not, with its numbers. One change at a time, measured against the build right before it; a change stays only if it beats the noise.

## How to measure

- Size: `bash bench/measure.sh <label>` builds both and prints the raw and `gzip -9` bytes of `userScript.js`.
- Startup: `node bench/startup-bench.cjs old.js new.js legacy 100` (and `modern`) loads the two bundles turn about in fresh jsdom pages. `compile` is V8 parsing the bundle, `run` its top-level code. jsdom has no layout and is not a TV: read the difference and how many pairs the new build won, not the milliseconds.
- Response hook: `node bench/hook-bench.cjs dist/webOSUserScripts/userScript.js legacy <label>`.

Keep the old bundles before a change: `cp dist/webOSUserScripts/userScript.js /tmp/old-legacy.js` after `npm run build`, the same after `npm run build:modern`.

## Ledger

| Change | Size, webOS 3 / webOS 22+ (gzip) | Startup in jsdom, new − old (pairs won of 100) | Kept |
|---|---|---|---|
| Baseline, `daa6a5c` | 379,715 B (112,777) / 323,689 B (96,985) | | |
| No spatial-navigation polyfill | 361,598 B (107,385) / 306,830 B (92,002): −4.8 % / −5.2 % | webOS 3: compile −0.54 ms (97), run −0.30 ms (87); webOS 22+: compile −0.46 ms (98), run −0.30 ms (88) | yes |

Not seen in jsdom: on webOS 22+ the polyfill also read the root element's computed style three times and registered three CSS properties at document start.
