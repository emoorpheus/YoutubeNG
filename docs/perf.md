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
| One `<style>` for every stylesheet (b2) | 354,292 B (105,855) / 299,716 B (90,475): −2.0 % / −2.3 % | webOS 3: compile −0.27 ms (80), run −2.32 ms (92); webOS 22+: compile −0.42 ms (93), run −2.42 ms (94) | yes |
| terser `passes: 2` (b2) | not tried: ours is 4, and b2 measured passes past two at some 50 bytes | | |
| terser `reduce_funcs: false` (b2: a single-use helper inlined into a loop became a closure per item on Chromium 38) | 355,156 B (105,881) / 300,331 B (90,924): +864 B / +615 B | response hook (default settings), webOS 3 build, 150 KB browse, 3 runs each: overhead 1.52 → 1.50 ms; `node --jitless`, 2 runs each: 3.12 → 3.08 ms (−1.4 %, inside the spread) | no; node is not Chromium 38, worth a try on a webOS 3 TV |
| Emoji walk (webOS 3 and 4): no text-field check on arrays, which JSON.parse never gives one | 354,292 B (105,853) / 299,717 B (90,479): ±0 | response hook (default settings), webOS 3 build, 150 KB browse, 4 runs each: overhead 1.52 → 1.40 ms (−8 %, 4 of 4); `node --jitless`, 2 runs each: 3.18 → 2.87 ms (−10 %) | yes |

From the `<style>` row on, `run` also counts the microtasks the top level queued: the one `<style>` is written in one.

Response hook rows marked *default settings*: `hook-bench.cjs` wrote its settings after the bundle had read them, so it measured Ad block and, on webOS 3, the emoji fix, not Tracking Block or the Shorts and live filters. It writes them first now and warns if Tracking Block did not come on.

Not seen in jsdom: on webOS 22+ the polyfill also read the root element's computed style three times and registered three CSS properties at document start.
