/**
 * Playback speed above 1.25x: the 1080p cap before the reload, the position
 * restore after it (webOS 25 starts up to ~25 s early), the cap on the next
 * video, and no cap back at 1x. Modern build (needs AudioDecoder).
 * Usage: node bench/speed-cap-test.cjs dist/webOSUserScripts/userScript.js
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const bundle = process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js');
const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(e.message));
const dom = new JSDOM(`<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>
  <div id="ytlr-player__player-container"><div id="ytlr-player__player-container-player"></div><video></video></div>
  </ytlr-app></body></html>`, { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=abc', virtualConsole: vc, pretendToBeVisual: true });
const win = dom.window;
Object.defineProperty(win.navigator, 'userAgent', { value: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager' });
win.launchParams = '{}';
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
win.fetch = () => Promise.reject(new Error('offline'));
win.AudioDecoder = function () {};
win.AudioContext = function () {};
if (!win.MediaSource) win.MediaSource = function () {};
win.localStorage.setItem('ytng-configuration', JSON.stringify({ enablePlaybackSpeed: true, forceHighResVideo: false, enableSponsorBlock: false, enableReturnYouTubeDislike: false }));
const calls = [];
const p = win.document.getElementById('ytlr-player__player-container-player');
let state = 3, now = 0, quality = 'hd2160';
Object.assign(p, {
  getCurrentTime: () => now, getVideoData: () => ({ video_id: 'abc' }),
  loadVideoById: (id, at) => { calls.push(['load', id, at]); now = at - 25; state = 3; },
  setPlaybackQualityRange: (a, b) => calls.push(['range', a, b]),
  getPlayerState: () => state, seekTo: (t) => { calls.push(['seek', t]); now = t; },
  getPlaybackQuality: () => quality, getPlaybackRate: () => 1, setPlaybackRate: () => {}
});
let threw = null;
try { win.eval(fs.readFileSync(bundle, 'utf8')); } catch (e) { threw = e; }
let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  t('bundle loads', !threw, threw && threw.message);
  const c = win.ytngSpeed;
  t('speed controller exposed', !!c);
  if (!c) return done();
  now = 100;
  c.setSpeed(1.5, { immediate: true });
  t('1.5x caps to 1080p before reload', JSON.stringify(calls[0]) === JSON.stringify(['range', 'hd1080', 'hd1080']), calls);
  t('reload at position', calls.some((x) => x[0] === 'load' && x[2] === 100), calls);
  state = 1; await wait(400);
  t('webOS 25 early start re-seeks to position', calls.some((x) => x[0] === 'seek' && x[1] === 100), calls);
  t('cap re-applied after reload', calls.filter((x) => x[0] === 'range' && x[1] === 'hd1080').length >= 2, calls);
  calls.length = 0; quality = 'hd2160';
  win.dispatchEvent(new win.CustomEvent('yt-player-state-change', { detail: { state: 1 } }));
  t('next video at 2160p capped once it plays', calls.some((x) => x[0] === 'range' && x[1] === 'hd1080'), calls);
  calls.length = 0; quality = 'hd1080';
  win.dispatchEvent(new win.CustomEvent('yt-player-state-change', { detail: { state: 1 } }));
  t('already 1080p: no extra call', calls.length === 0, calls);
  calls.length = 0; now = 50;
  c.setSpeed(1, { immediate: true });
  t('back to 1x lifts the cap (auto)', calls.some((x) => x[0] === 'range' && x[1] === 'auto'), calls);
  calls.length = 0; quality = 'hd2160';
  state = 1; await wait(400);
  win.dispatchEvent(new win.CustomEvent('yt-player-state-change', { detail: { state: 1 } }));
  t('1x: next video not capped', !calls.some((x) => x[0] === 'range' && x[1] === 'hd1080'), calls);
  done();
})();
function done() { console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
