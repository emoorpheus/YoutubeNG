/**
 * Black screen over a paused video (pause-screensaver.js) and the pause when
 * the app goes to the background (background-pause.js). Modern build.
 * Usage: node bench/pause-screensaver-test.cjs dist/webOSUserScripts/userScript.js
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const bundle = process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js');
const vc = new VirtualConsole();
const dom = new JSDOM(`<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>
  <div id="ytlr-player__player-container"><div id="ytlr-player__player-container-player"></div><video></video></div>
  </ytlr-app></body></html>`, { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=abc', virtualConsole: vc, pretendToBeVisual: true });
const win = dom.window;
Object.defineProperty(win.navigator, 'userAgent', { value: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager' });
win.launchParams = '{}';
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
win.fetch = () => Promise.reject(new Error('offline'));
// 1 s instead of a minute; the panel only offers 30 s and up.
win.localStorage.setItem('ytng-configuration', JSON.stringify({ pauseScreensaver: '1', firstRunHintShown: true, enableSponsorBlock: false, enableReturnYouTubeDislike: false }));
const doc = win.document;
const video = doc.querySelector('video');
let paused = true;
Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
const player = doc.getElementById('ytlr-player__player-container-player');
const playerCalls = [];
player.pauseVideo = () => { playerCalls.push('pauseVideo'); paused = true; };
let hidden = false;
Object.defineProperty(doc, 'hidden', { configurable: true, get: () => hidden });
let threw = null;
try { win.eval(fs.readFileSync(bundle, 'utf8')); } catch (e) { threw = e; }

const seen = [];
doc.addEventListener('keydown', (e) => seen.push(e.keyCode), true);
const saver = () => !!doc.querySelector('.ytng-pause-saver');
const key = (type, keyCode) => { const e = new win.KeyboardEvent(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'keyCode', { get: () => keyCode }); doc.body.dispatchEvent(e); return e; };
const media = (type) => video.dispatchEvent(new win.Event(type));
let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  t('bundle loads', !threw, threw && threw.message);
  media('pause');
  await wait(500);
  t('not before the delay', !saver());
  await wait(800);
  t('black screen after the delay', saver());
  t('shows the clock and the name', /\d:\d\d/.test(doc.querySelector('.ytng-pause-saver').textContent) && /YouTube Next-Gen/.test(doc.querySelector('.ytng-pause-saver').textContent));
  const down = key('keydown', 40);
  t('a key wakes the screen', !saver());
  t('the waking key does not reach the player', seen.length === 0 && down.defaultPrevented, seen);
  key('keyup', 40);
  key('keydown', 40);
  t('the next key goes through', seen.length === 1, seen);
  await wait(1300);
  t('still paused: black again after the delay', saver());
  key('keydown', 415);
  t('Play wakes and goes through', !saver() && seen[seen.length - 1] === 415, seen);
  key('keyup', 415);
  await wait(1300);
  t('black again', saver());
  // Held key: the press that wakes the screen repeats for 2 s, longer than the
  // 1.5 s safety net and the 1 s delay; none of it may reach the player.
  const before = seen.length;
  key('keydown', 39);
  let blackDuringHold = 0;
  for (let i = 0; i < 20; i++) { await wait(100); if (saver()) blackDuringHold++; key('keydown', 39); }
  t('a held key wakes only, its repeats stay out', !saver() && seen.length === before, seen.slice(before));
  t('holding the key counts as input', blackDuringHold === 0, blackDuringHold);
  key('keyup', 39);
  key('keydown', 39);
  t('after the release the key goes through', seen.length === before + 1, seen.slice(before));
  key('keyup', 39);
  await wait(1300);
  t('black again after the hold', saver());
  paused = false; media('play');
  t('playback removes it', !saver());
  await wait(1300);
  t('no black screen while playing', !saver());
  hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
  t('app to the background pauses through the player', playerCalls.length === 1, playerCalls);
  hidden = false; doc.dispatchEvent(new win.Event('visibilitychange'));
  t('coming back does not resume', playerCalls.length === 1 && paused, playerCalls);
  done();
})();
function done() { console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
