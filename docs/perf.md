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
| Tracking strip: no `trackingParams` check on arrays either | ±0 | response hook (every filter), 150 KB browse, medians of 4 runs: webOS 3 1.51 → 1.52 ms, webOS 22+ 0.21 → 0.20 ms, both inside the spread | no |
| Emoji walk: a split run copied by for-in, not `Object.assign({}, run, { text })` (webOS 3 has no `Object.assign`; the polyfill builds a key array per source) | 354,303 B (105,835) / 299,732 B (90,482): +11 B / +15 B | response hook (default settings), webOS 3 build, 825 KB browse with an emoji in every title, 4 runs each: overhead 11.28 → 9.08 ms (−19 %, 4 of 4); `node --jitless`, 2 runs each: 22.7 → 19.6 ms (−14 %); 819 KB without emoji, 2 runs each: 7.75 → 7.22 ms | yes |
| DeArrow's fancy-text table (1,361 pairs, `new Map(JSON.parse(…))`) built on first use, not at start-up: only Remove emojis and fancy text reads it; webOS 22+ build only | 354,303 B (105,835) / 299,780 B (90,512): ±0 / +48 B | webOS 22+: compile −0.02 ms (58), run −0.44 ms of 6.08 (92) | yes |
| **Total**, `daa6a5c` → `d37209d` | 354,303 B (105,835) / 299,780 B (90,512): −6.7 % / −7.4 % (gzip −6.2 % / −6.7 %) | webOS 3: compile −0.78 ms (99), run −2.61 ms of 12.53 (97); webOS 22+: compile −0.83 ms (99), run −2.93 ms of 7.98 (98). Response hook, every filter, 150 KB browse, 3 runs each: webOS 3 1.65 → 1.46 ms, webOS 22+ unchanged (0.20 ms); webOS 3, default settings, 825 KB with an emoji in every title: 12.14 → 9.14 ms | |

From the `<style>` row on, `run` also counts the microtasks the top level queued: the one `<style>` is written in one.

Response hook rows marked *default settings*: `hook-bench.cjs` wrote its settings after the bundle had read them, so it measured Ad block and, on webOS 3, the emoji fix, not Tracking Block or the Shorts and live filters. It writes them first now and warns if Tracking Block did not come on.

Not seen in jsdom: on webOS 22+ the polyfill also read the root element's computed style three times and registered three CSS properties at document start.

## Memory

`node bench/leak-soak-test.cjs dist/webOSUserScripts/userScript.js legacy` (or `modern`) visits 70 videos and Home in turn, each Home with 12 tiles never seen before and every fifth with the options panel opened and closed, and fails if listeners, intervals, MutationObservers, pending frames or DOM nodes grow after the first 10 visits; `bench/run-all.sh` runs it on both builds. Over 600 visits (7,200 tiles) the heap grew 3.4 MB on the webOS 3 build and 3.1 MB on the webOS 22+ one, jsdom's own share 1.1 MB, and stopped growing once the caches were full. Each has a limit: thumbnails checked 4,000 per session, qualities known 1,200, thumbnails waiting for their check 1,500, DeArrow's videos 1,000 (its copies 48 MB of blobs, 4 MB of data URLs), emoji texts 500, dislike counts 50, MediaSource URLs 8.

## On a TV

A webOS 25 TV (2025), the webOS 22+ ipk of `daa6a5c` against that of `c07dab8`. Each build reloaded six times under a DevTools trace; the injected `userScript.js` is the longest `EvaluateScript` without a URL.

| | `daa6a5c` | `c07dab8` |
|---|---|---|
| Evaluate, median of 6 (min–max) | 127.6 ms (116.6–144.2) | 77.3 ms (74.6–92.0): −50 ms, −39 % |
| Compile / run, medians | 31.0 / 98.2 ms | 19.8 / 57.6 ms |
| Style recalculations inside it (`UpdateLayoutTree`) | 3, the polyfill's | 0 |
| `<style>` elements on Home | 18: YouTube's 4, ours 14 | 6: YouTube's 4, ours 2 (in both builds the comments fix, built from YouTube's rules at run time, keeps its own) |
| CSS rules on the page | 3,868 | 3,868, the same; ours (197) in the same order |

The slowest new run beat the fastest old one. The webOS 3 build has no TV to run on, so jsdom only.

Also checked on that TV with `c07dab8`: no exceptions in the console through reloads and playback; the panel opens on the green button, arrow keys walk its rows and tabs, Back closes it; OLED care turns the page black and back; DeArrow titles in search; SponsorBlock loaded 19 segments and skipped a self-promotion one.
