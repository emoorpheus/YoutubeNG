#!/bin/bash
# Full verification + benchmark suite. Usage: bench/run-all.sh <label>
cd "$(dirname "$0")/.."
LABEL="${1:-run}"
# A test that fails or crashes makes the whole run fail (exit 1), not just print.
set -o pipefail
FAILED=0
trap 'FAILED=$((FAILED+1)); echo "!!! the step above FAILED"' ERR
echo "==================== $LABEL ===================="
echo "--- release notes from CHANGELOG.md ---"; node bench/release-notes-test.cjs 2>&1 | tail -1
npx webpack --mode=production > /tmp/leg.log 2>&1
E=$(grep -c "^ERROR" /tmp/leg.log || true); [ "$E" != "0" ] && { echo "LEGACY BUILD ERRORS: $E"; grep "^ERROR" /tmp/leg.log | head -5; }
echo "--- polyfill conformance ---";  node bench/polyfill-conformance.cjs 2>&1 | tail -2
echo "--- playback speed engine (src/speed) ---"; node bench/speed-engine-test.cjs 2>/dev/null | tail -1
echo "--- launcher URL cases ---";    node bench/launch-test.cjs 2>&1 | tail -2
echo "--- bundle smoke (webOS 3) ---"; node bench/smoke.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -2
echo "--- adblock filters (webOS 3) ---"; node bench/adblock-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -2
echo "--- screensaver stall nudge (webOS 3) ---"; node bench/screensaver-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- modern build smoke (webOS 23+) ---"
npx webpack --mode=production --env modern > /tmp/mod.log 2>&1
ME=$(grep -c "^ERROR" /tmp/mod.log || true); [ "$ME" != "0" ] && { echo "MODERN BUILD ERRORS: $ME"; grep "^ERROR" /tmp/mod.log | head -3; }
node bench/modern-smoke.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- playback speed 1080p cap (webOS 23+) ---"; node bench/speed-cap-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- OLED palette sweep leaves YouTube's #loader rule (webOS 23+) ---"; node bench/oled-start-screen-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- DeArrow (webOS 22+ build) ---"; node bench/dearrow-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
echo "--- pause screensaver / background pause (webOS 23+) ---"; node bench/pause-screensaver-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- options panel arrow keys (webOS 22+ build) ---"; node bench/panel-nav-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
echo "--- Who's watching? bypass (webOS 23+) ---"; node bench/auto-login-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
echo "--- SponsorBlock skip watchdog (webOS 23+) ---"; node bench/sponsorblock-skip-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
echo "--- start-up screen (webOS 23+) ---"; node bench/start-screen-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
echo "--- memory: 70 visits, nothing piles up (webOS 22+ build) ---"; node bench/leak-soak-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
echo "--- stylesheets: none comes and goes per video (webOS 22+ build) ---"; node bench/stylesheet-churn-test.cjs dist/webOSUserScripts/userScript.js modern 2>&1 | tail -1
npx webpack --mode=production > /dev/null 2>&1   # back to legacy for the rest
echo "--- new features (logo/live/guide/panel) ---"; node bench/new-features-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- DeArrow (webOS 3 build) ---"; node bench/dearrow-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- feature dependencies ---";        node bench/dependency-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- thumbnail / dislike hot paths ---"; node bench/module-hotpath-bench.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "getBoundingClientRect|closest\(\)"
echo "--- clock: Off / Time / Date + Time ---"; node bench/clock-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- dislike fetch/render timing ---";   node bench/dislike-timing-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- thumbnail / dislike behaviour ---";  node bench/module-behaviour-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- options panel build cost ---";   node bench/panel-bench.cjs dist/webOSUserScripts/userScript.js 2>&1 | grep -E "IN the handler|wall time|deferred to"
echo "--- options panel behaviour ---";     node bench/panel-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- options panel arrow keys (webOS 3 build) ---"; node bench/panel-nav-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- Who's watching? bypass (webOS 3) ---"; node bench/auto-login-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- SponsorBlock skip watchdog (webOS 3) ---"; node bench/sponsorblock-skip-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- start-up screen (webOS 3) ---"; node bench/start-screen-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- emoji observer convergence ---"; node bench/emoji-loop-test.cjs dist/webOSUserScripts/userScript.js 40 2>&1 | tail -1
echo "--- emoji amplification ---";        node bench/emoji-amplify-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- Google Fonts only on webOS 4 and older ---"; node bench/google-fonts-test.cjs dist/webOSUserScripts/userScript.js 2>&1 | tail -1
echo "--- memory: 70 visits, nothing piles up (webOS 3 build) ---"; node bench/leak-soak-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- stylesheets: none comes and goes per video (webOS 3 build) ---"; node bench/stylesheet-churn-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -1
echo "--- JSON hook perf (webOS 3) ---"; node bench/hook-bench.cjs dist/webOSUserScripts/userScript.js legacy "$LABEL" 2>&1 | grep -v "^JSON:"
echo "--- perf_mon build (--env perf) ---"
npx webpack --mode=production --env perf > /tmp/perf.log 2>&1
PE=$(grep -c "^ERROR" /tmp/perf.log || true); [ "$PE" != "0" ] && { echo "PERF BUILD ERRORS: $PE"; grep -A3 "^ERROR" /tmp/perf.log | head -8; }
node bench/perfmon-test.cjs dist/webOSUserScripts/userScript.js legacy 2>&1 | tail -2
npx webpack --mode=production > /dev/null 2>&1   # leave dist as the normal build
trap - ERR
if [ "$FAILED" != 0 ]; then echo "==================== $FAILED step(s) FAILED ===================="; exit 1; fi
echo "==================== all passed ===================="
