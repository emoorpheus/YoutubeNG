/**
 * Memory-leak guard: a session of watch and browse visits, one video after
 * another, with the bundle's features on (SponsorBlock, Return YouTube
 * Dislike, thumbnail upgrades, DeArrow on the webOS 22+ build) and the options
 * panel opened every fifth visit. After a
 * warm-up, what the app has attached must not grow with the visits: event
 * listeners (on window, document, <body>, the <video> and elsewhere),
 * intervals, MutationObservers, pending animation frames, DOM nodes. The heap
 * is printed, not checked: the app's caches fill up to their limits first.
 * Usage: node bench/leak-soak-test.cjs <bundle> [legacy|modern] [visits]
 */
/* eslint-disable no-await-in-loop -- the visits come one after another, as a viewer's do */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundle = fs.readFileSync(process.argv[2] || 'dist/webOSUserScripts/userScript.js', 'utf8');
const mode = process.argv[3] || 'legacy';
const WARM = 10, N = +(process.argv[4] || 60);
const GREEN = 404;
let panelOpened = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const id = (i) => ('v' + String(i).padStart(10, '0')).slice(0, 11);
let gc = global.gc;
if (!gc) { require('v8').setFlagsFromString('--expose-gc'); gc = require('vm').runInNewContext('gc'); }

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(String(e && e.message).slice(0, 160)));
const dom = new JSDOM('<!doctype html><html><head></head><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app><div id="tiles"></div>' +
  '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>',
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: vc, pretendToBeVisual: true });
const win = dom.window, doc = win.document;
setUserAgent(win, mode === 'modern' ? UA.webos23 : UA.webos3);
win.launchParams = '{}';
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
// Thumbnail checks (HEAD) answer at once: a big enough image.
win.XMLHttpRequest = class {
  open() {} setRequestHeader() {} addEventListener() {} abort() {}
  send() { setTimeout(() => { this.status = 200; if (this.onload) this.onload(); }, 2); }
  getResponseHeader(h) { return /content-length/i.test(h) ? '20000' : null; }
};
win.localStorage.setItem('ytng-configuration', JSON.stringify({
  enableSponsorBlock: true, sbMode_sponsor: 'auto_skip', firstRunHintShown: true, enableReturnYouTubeDislike: true,
  enableDeArrow: mode === 'modern', upgradeThumbnails: true, enableAutoLogin: false
}));
const nativeRemove = win.Element.prototype.remove;
if (mode !== 'modern') applyChrome38Downgrade(win);
win.Element.prototype.remove = nativeRemove; // ChildNode#remove is Chrome 23: webOS 3 has it

// What the app has attached, counted as it attaches and lets go.
const intervals = new Set();
const { setInterval: si, clearInterval: ci } = win;
win.setInterval = function (...a) { const h = si.apply(this, a); intervals.add(h); return h; };
win.clearInterval = function (h) { intervals.delete(h); return ci.call(this, h); };
let frames = 0;
const raf = win.requestAnimationFrame;
win.requestAnimationFrame = function (cb) { frames++; return raf.call(this, (t) => { frames--; cb(t); }); };
const cancelRaf = win.cancelAnimationFrame;
const listeners = new Map();
const fnIds = new WeakMap();
let nextFn = 1;
const key = (type, fn, opt) => {
  if (!fnIds.has(fn)) fnIds.set(fn, nextFn++);
  return type + '|' + fnIds.get(fn) + '|' + (typeof opt === 'boolean' ? opt : !!(opt && opt.capture));
};
const ET = win.EventTarget.prototype, add = ET.addEventListener, remove = ET.removeEventListener;
ET.addEventListener = function (type, fn, opt) {
  if (fn) { let s = listeners.get(this); if (!s) listeners.set(this, (s = new Set())); s.add(key(type, fn, opt)); }
  return add.call(this, type, fn, opt);
};
ET.removeEventListener = function (type, fn, opt) {
  const s = listeners.get(this); if (s && fn) s.delete(key(type, fn, opt));
  return remove.call(this, type, fn, opt);
};
const observers = new Set();
const MO = win.MutationObserver;
win.MutationObserver = class extends MO {
  observe(t, o) { observers.add(this); return super.observe(t, o); }
  disconnect() { observers.delete(this); return super.disconnect(); }
};
let cur = id(0);
win.fetch = (url) => {
  url = String(url);
  const body = url.indexOf('/skipSegments/') !== -1
    ? [{ videoID: cur, segments: [{ category: 'sponsor', actionType: 'skip', segment: [30, 40], UUID: 'u' + cur, videoDuration: 600 }] }]
    : url.indexOf('/votes') !== -1 ? { id: cur, likes: 1000, dislikes: 50, viewCount: 99999, rating: 4.8 }
    : url.indexOf('/branding') !== -1 ? { titles: [{ title: 'A better title', original: false, votes: 3, locked: false }], thumbnails: [], randomTime: 0.4, videoDuration: 600 }
    : null;
  if (!body) return Promise.reject(new Error('offline'));
  const text = JSON.stringify(body);
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(JSON.parse(text)), text: () => Promise.resolve(text), clone() { return this; } });
};

// The player's <video> stays for the session, as YouTube's does.
const video = doc.querySelector('video');
const st = { t: 0, paused: true };
const def = (p, get, set) => Object.defineProperty(video, p, { configurable: true, get, set });
def('currentTime', () => st.t, (v) => { st.t = v; });
def('duration', () => 600); def('paused', () => st.paused); def('readyState', () => 4);
def('videoWidth', () => 1920); def('videoHeight', () => 1080);
video.play = () => { st.paused = false; return Promise.resolve(); };
video.pause = () => { st.paused = true; };
win.eval(bundle);

const fire = (t, type) => t.dispatchEvent(new win.Event(type));
// A browse page: 12 tiles never seen before, in the DOM and in a response.
function browse(i) {
  const box = doc.getElementById('tiles');
  box.textContent = '';
  const items = [];
  for (let k = 0; k < 12; k++) {
    const v = id(i * 100 + k), title = 'Clickbait ' + v + ' \u200B\uD83D\uDE00\u200C';
    const tile = doc.createElement('ytlr-tile-renderer');
    const img = doc.createElement('img'); img.src = 'https://i.ytimg.com/vi/' + v + '/hqdefault.jpg';
    const t = doc.createElement('yt-formatted-string'); t.textContent = title;
    tile.appendChild(img); tile.appendChild(t); box.appendChild(tile);
    items.push({ tileRenderer: { contentId: v, contentType: 'TILE_CONTENT_TYPE_VIDEO', style: 'TILE_STYLE_YTLR_DEFAULT',
      metadata: { tileMetadataRenderer: { title: { simpleText: title } } },
      header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/' + v + '/hqdefault.jpg', width: 480, height: 360 }] } } },
      onSelectCommand: { watchEndpoint: { videoId: v } } } });
  }
  win.JSON.parse(JSON.stringify({ responseContext: {}, contents: { sectionListRenderer: { contents: [
    { shelfRenderer: { title: { runs: [{ text: 'Shelf ' + i }] }, content: { horizontalListRenderer: { items } } } }] } } }));
}
// A watch visit: plays a while, opens the description, back to browse.
async function visit(i) {
  cur = id(i);
  win.location.hash = '#/watch?v=' + cur;
  doc.body.className = 'WEB_PAGE_TYPE_WATCH';
  await sleep(5);
  for (const e of ['loadstart', 'loadedmetadata', 'durationchange', 'canplay']) fire(video, e);
  await video.play(); fire(video, 'play'); fire(video, 'playing');
  for (let s = 0; s < 6; s++) { st.t = s * 8; fire(video, 'timeupdate'); await sleep(4); }
  const panel = doc.createElement('ytlr-structured-description-content-renderer');
  panel.innerHTML = '<div class="ytLrVideoDescriptionHeaderRendererFactoidContainer"><div class="ytLrVideoDescriptionHeaderRendererFactoid" idomkey="factoid-0" aria-label="1.2M Likes"><span class="ytLrVideoDescriptionHeaderRendererValue">1.2M</span><span class="ytLrVideoDescriptionHeaderRendererLabel">Likes</span></div></div>';
  doc.querySelector('ytlr-app').appendChild(panel);
  await sleep(15);
  panel.parentNode.removeChild(panel);
  video.pause(); fire(video, 'pause');
  win.location.hash = '#/';
  doc.body.className = 'WEB_PAGE_TYPE_BROWSE';
  browse(i);
  await sleep(15);
  if (i % 5 === 0) { // the options panel: open, another tab, closed
    press(GREEN);
    await sleep(40);
    const tabs = doc.querySelectorAll('.ytng-ui-container .ytng-tab-btn');
    if (tabs.length) { panelOpened++; tabs[(i / 5) % tabs.length].click(); }
    await sleep(10);
    press(GREEN);
    await sleep(10);
  }
}
function press(code) {
  const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code, configurable: true });
  doc.body.dispatchEvent(e);
}
function count() {
  gc(); gc();
  const c = { window: 0, document: 0, body: 0, video: 0, elsewhere: 0 };
  for (const [t, s] of listeners) {
    const where = t === win ? 'window' : t === doc ? 'document' : t === doc.body ? 'body' : t === video ? 'video' : 'elsewhere';
    // A listener on a node that has left the page goes with the node.
    if (where === 'elsewhere' && t.nodeType && !t.isConnected) continue;
    c[where] += s.size;
  }
  return { 'listeners on window': c.window, 'listeners on document': c.document, 'listeners on <body>': c.body,
    'listeners on <video>': c.video, 'listeners elsewhere': c.elsewhere, intervals: intervals.size,
    'MutationObservers': observers.size, 'pending frames': frames, 'DOM nodes': doc.getElementsByTagName('*').length,
    heapKB: Math.round(process.memoryUsage().heapUsed / 1024) };
}

(async () => {
  await sleep(300);
  for (let i = 1; i <= WARM; i++) await visit(i);
  await sleep(200);
  const a = count();
  for (let i = WARM + 1; i <= WARM + N; i++) await visit(i);
  await sleep(200);
  const b = count();
  let fail = 0;
  for (const k of Object.keys(a)) {
    if (k === 'heapKB') continue;
    const ok = b[k] <= a[k];
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${k}: ${a[k]} after ${WARM} visits, ${b[k]} after ${WARM + N}`);
  }
  // The panel must really have opened, or the visits checked less than they say.
  const panelOk = panelOpened === Math.floor((WARM + N) / 5);
  if (!panelOk) fail++;
  console.log(`${panelOk ? 'PASS' : 'FAIL'} options panel opened ${panelOpened} times of ${Math.floor((WARM + N) / 5)}`);
  console.log(`info heap: ${a.heapKB} KB -> ${b.heapKB} KB (jsdom's own share included)`);
  if (errors.length) console.log('info page errors:', errors.length, [...new Set(errors)].slice(0, 3).join(' | '));
  if (cancelRaf) win.close();
  console.log(fail ? `\n${fail} failed (${mode})` : `\nall ${Object.keys(a).length} leak checks passed (${mode})`);
  process.exit(fail ? 1 : 0);
})();
