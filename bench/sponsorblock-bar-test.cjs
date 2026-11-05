/**
 * SponsorBlock while YouTube's progress bar is missing (src/sponsorblock.js).
 *
 * The segments are drawn next to YouTube's progress bar. While it is not on
 * the page (the start of a video, a replay) SponsorBlock looks for it every
 * 250 ms for 10 s, and an observer of the whole app waits for the bar's
 * container. Each look added another such observer: 82 ten seconds into a
 * video, every one woken by every change in the app, and every one leaving
 * an observer of its own on the container once the bar came, for the rest
 * of the video. One waits now.
 *
 * 1. No bar on the page: the observers of the app do not grow in number.
 * 2. The bar comes: the segments are drawn, on the element of the first of
 *    the six selectors even if another one comes first in the page, and one
 *    observer watches the bar's container.
 *
 * The six selectors stay six queries: in Chromium one query of the six as a
 * list was about three times slower (docs/perf.md).
 * Usage: node bench/sponsorblock-bar-test.cjs <bundle> [legacy|modern]
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundle = fs.readFileSync(process.argv[2] || 'dist/webOSUserScripts/userScript.js', 'utf8');
const mode = process.argv[3] || 'legacy';
const VIDEO_ID = 'gX2AKjiZPoM';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return fn(); }
let fail = 0, checks = 0;
const check = (ok, what) => { checks++; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };

const dom = new JSDOM('<!doctype html><html><head></head><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app><div id="chrome"></div><video></video></ytlr-app></body></html>',
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=' + VIDEO_ID, virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
const win = dom.window, doc = win.document;
setUserAgent(win, mode === 'modern' ? UA.webos23 : UA.webos3);
win.launchParams = '{}';
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
win.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {} };
win.localStorage.setItem('ytng-configuration', JSON.stringify({
  enableSponsorBlock: true, firstRunHintShown: true, enableReturnYouTubeDislike: false, enableDeArrow: false, enableAutoLogin: false
}));
const nativeRemove = win.Element.prototype.remove;
if (mode !== 'modern') applyChrome38Downgrade(win);
win.Element.prototype.remove = nativeRemove;
win.fetch = (url) => Promise.resolve({
  ok: true, status: 200, headers: { get: () => null },
  json: () => Promise.resolve(String(url).indexOf('/skipSegments/') !== -1
    ? [{ videoID: VIDEO_ID, segments: [{ category: 'sponsor', actionType: 'skip', segment: [55, 110], UUID: 'u1', videoDuration: 600 }] }]
    : [])
});
const video = doc.querySelector('video');
Object.defineProperty(video, 'duration', { configurable: true, get: () => 600 });
Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
video.play = () => Promise.resolve();
video.pause = () => {};
// A page the size of YouTube's player chrome, without the bar.
let filler = '';
for (let i = 0; i < 400; i++) filler += `<div class="c${i}" idomkey="k${i}"><span>${i}</span></div>`;
doc.getElementById('chrome').innerHTML = filler;
// Every MutationObserver and the nodes it observes.
const RealMO = win.MutationObserver;
const observing = new Map();
win.MutationObserver = function (cb) {
  const o = new RealMO(cb);
  const observe = o.observe, disconnect = o.disconnect;
  o.observe = function (node, opts) { if (!observing.has(o)) observing.set(o, []); observing.get(o).push(node); return observe.call(o, node, opts); };
  o.disconnect = function () { observing.delete(o); return disconnect.call(o); };
  return o;
};
win.MutationObserver.prototype = RealMO.prototype;
const observersOf = (node) => { let n = 0; for (const nodes of observing.values()) if (nodes.indexOf(node) !== -1) n++; return n; };
win.eval(bundle);

(async () => {
  const ready = await waitFor(() => win.sponsorblock && win.sponsorblock.segments && win.sponsorblock.segments.length === 1, 4000);
  check(ready, 'segments loaded');
  if (!ready) process.exit(1);
  const sb = win.sponsorblock;
  let lookups = 0;
  const orig = sb.checkForProgressBar;
  sb.checkForProgressBar = function () { lookups++; return orig.apply(this, arguments); };
  const app = doc.querySelector('ytlr-app');
  const appObservers = observersOf(app);
  await sleep(1100);
  check(lookups >= 3, `lookups while the bar is missing (${lookups} in 1.1 s)`);
  check(observersOf(app) <= appObservers, `observers of the app do not grow in number while the bar is missing (${appObservers} -> ${observersOf(app)})`);

  // The bar comes, its plainer form first in the page.
  const chrome = doc.getElementById('chrome');
  chrome.insertAdjacentHTML('afterbegin', '<ytlr-progress-bar><div idomkey="slider"></div></ytlr-progress-bar>' +
    '<ytlr-multi-markers-player-bar-renderer><div idomkey="segment"></div></ytlr-multi-markers-player-bar-renderer>');
  const segment = chrome.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="segment"]');
  const drawn = await waitFor(() => sb.overlay && sb.overlay.isConnected, 2000);
  check(drawn, 'segments drawn once the bar is there');
  check(sb.progressBar === segment, 'drawn on the first selector\'s element, not the first in the page');
  check(observersOf(chrome) === 1, `one observer on the bar's container (${observersOf(chrome)})`);
  console.log(fail ? `\n${fail} failed (${mode})` : `\nall ${checks} progress-bar checks passed (${mode})`);
  process.exit(fail ? 1 : 0);
})();
