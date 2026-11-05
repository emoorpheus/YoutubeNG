/**
 * Startup cost of the built userScript.js: what the TV pays before YouTube's
 * own page gets the main thread back.
 *
 *   compile   new vm.Script() - V8 parses the whole bundle (functions lazily)
 *   run       the top-level code (polyfills, config, CSS, hooks, observers)
 *             and the microtasks it queued, such as a deferred style write
 *   reads     getComputedStyle / getBoundingClientRect calls during the run,
 *             each one a forced style or layout pass on the TV
 *
 * Every run uses a fresh jsdom page and a unique source string, so V8's
 * compilation cache never serves a run. Reports the median and the spread
 * (25th-75th percentile) of N runs after 3 warm-ups. Given two bundles, it
 * alternates them run by run (A B A B ...), so drift in the machine's speed
 * hits both alike, and reports how often B beat A in a pair.
 *
 * Run: node bench/startup-bench.cjs [bundle] [bundleB] [legacy|modern] [N]
 */
const fs = require('fs');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const args = process.argv.slice(2);
const bundles = args.filter((a) => /\.js$/.test(a));
if (!bundles.length) bundles.push('dist/webOSUserScripts/userScript.js');
const legacy = !args.includes('modern');
const N = Number(args.find((a) => /^\d+$/.test(a))) || 40;
const WARMUP = 3;
const codes = bundles.map((b) => fs.readFileSync(b, 'utf8'));

const HTML = '<!doctype html><html><head><title>YouTube</title></head>' +
  '<body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app><ytlr-tv-surface-content></ytlr-tv-surface-content></ytlr-app></body></html>';

async function once(code, i) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: vc, pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, legacy ? UA.webos3 : UA.webos23);
  win.launchParams = '{}';
  win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
  win.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {} };
  if (legacy) applyChrome38Downgrade(win);

  let styleReads = 0, rectReads = 0;
  const gcs = win.getComputedStyle;
  win.getComputedStyle = function () { styleReads++; return gcs.apply(this, arguments); };
  const gbcr = win.Element.prototype.getBoundingClientRect;
  win.Element.prototype.getBoundingClientRect = function () { rectReads++; return gbcr.call(this); };

  const src = code + '\n//# run ' + i;
  const t0 = process.hrtime.bigint();
  const script = new vm.Script(src, { filename: 'userScript.js' });
  const t1 = process.hrtime.bigint();
  script.runInContext(dom.getInternalVMContext());
  // A microtask queued by the top level runs before these continuations.
  for (let k = 0; k < 5; k++) await null;
  const t2 = process.hrtime.bigint();
  const r = { compile: Number(t1 - t0) / 1e6, run: Number(t2 - t1) / 1e6, styleReads, rectReads,
    styles: win.document.querySelectorAll('style').length };
  win.close();
  return r;
}

const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
(async () => {
const runs = codes.map(() => []);
for (let i = 0; i < WARMUP + N; i++) {
  for (let k = 0; k < codes.length; k++) {
    const r = await once(codes[k], i);
    if (i >= WARMUP) runs[k].push(r);
  }
}
const stat = (xs) => `median ${q(xs, 0.5).toFixed(2).padStart(7)} ms   p25-p75 ${q(xs, 0.25).toFixed(2)}-${q(xs, 0.75).toFixed(2)} ms`;
console.log(`${legacy ? 'webOS 3' : 'webOS 22+'}, ${N} runs each`);
bundles.forEach((b, k) => {
  const last = runs[k][runs[k].length - 1];
  console.log(`${k ? 'B' : 'A'} ${b}: ${codes[k].length} chars`);
  console.log(`  compile  ${stat(runs[k].map((r) => r.compile))}`);
  console.log(`  run      ${stat(runs[k].map((r) => r.run))}`);
  console.log(`  reads    getComputedStyle ${last.styleReads}   getBoundingClientRect ${last.rectReads}   <style> ${last.styles}`);
});
if (codes.length === 2) {
  for (const k of ['compile', 'run']) {
    const d = runs[0].map((r, i) => runs[1][i][k] - r[k]);
    const wins = d.filter((x) => x < 0).length;
    console.log(`B - A ${k.padEnd(8)} median ${q(d, 0.5).toFixed(2)} ms   B faster in ${wins}/${d.length} pairs`);
  }
}
process.exit(0);
})();
