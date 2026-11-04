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
let time = 0;
Object.defineProperty(video, 'currentTime', { configurable: true, get: () => time, set: (v) => { time = v; } });
const player = doc.getElementById('ytlr-player__player-container-player');
const playerCalls = [];
player.pauseVideo = () => { playerCalls.push('pauseVideo'); paused = true; };
player.playVideo = () => { playerCalls.push('playVideo'); paused = false; media('play'); };
let hidden = false;
Object.defineProperty(doc, 'hidden', { configurable: true, get: () => hidden });
// YouTube's own listener, registered before the script: on hide it suspends
// the player (state 5) once ytSuspends is set (as on the TV).
let ytState = 1, ytSuspends = false;
doc.addEventListener('visibilitychange', () => { if (hidden && ytSuspends) ytState = 5; });
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
  // Play, Play/Pause and OK resume in the same press; the key itself is eaten,
  // so YouTube does not toggle a second time (TV test: Play took two presses).
  for (const [name, code] of [['Play', 415], ['Play/Pause', 463], ['OK', 13]]) {
    const before = seen.length;
    key('keydown', code);
    t(name + ' wakes and resumes in one press', !saver() && !paused && playerCalls[playerCalls.length - 1] === 'playVideo', playerCalls);
    key('keyup', code);
    t(name + ' does not reach the player', seen.length === before, seen.slice(before));
    paused = true; media('pause');
    await wait(1300);
    t('paused again: black again', saver());
  }
  const plays = playerCalls.length;
  key('keydown', 19);
  t('Pause only wakes', !saver() && paused && playerCalls.length === plays, playerCalls);
  key('keyup', 19);
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
  const callsBefore = playerCalls.length;
  hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
  const calls = playerCalls.length;
  t('app to the background pauses through the player', calls === callsBefore + 1 && playerCalls[calls - 1] === 'pauseVideo' && paused, playerCalls);
  hidden = false; doc.dispatchEvent(new win.Event('visibilitychange'));
  t('coming back does not resume', playerCalls.length === calls && paused, playerCalls);
  // T8 (pre-release03): YouTube unloads the video right after hiding (time 0,
  // no pause event) and on return loads it again and starts it by itself.
  paused = false; time = 596.5; media('play');
  hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
  paused = true; time = 0;
  const callsHidden = playerCalls.length;
  hidden = false; doc.dispatchEvent(new win.Event('visibilitychange'));
  t('unloaded in the background: nothing yet on return', playerCalls.length === callsHidden, playerCalls);
  paused = false; time = 596.5; media('play'); media('playing');
  t("YouTube's own restart is paused once", playerCalls.length === callsHidden + 1 && playerCalls[playerCalls.length - 1] === 'pauseVideo' && paused, playerCalls);
  player.playVideo(); media('playing');
  t('Play after that plays', !paused && playerCalls[playerCalls.length - 1] === 'playVideo', playerCalls);
  // Back while it already plays again: paused at once, Play then works.
  hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
  paused = false; time = 3;
  hidden = false; doc.dispatchEvent(new win.Event('visibilitychange'));
  t('playing again on return: paused at once', paused && playerCalls[playerCalls.length - 1] === 'pauseVideo', playerCalls);
  player.playVideo(); media('playing');
  t('and Play then plays', !paused, playerCalls);
  // TV (pre-release04): webOS has already stopped the element when
  // visibilitychange fires, YouTube's player still reports "playing" (1).
  ytState = 1; ytSuspends = true;
  player.getPlayerState = () => ytState;
  time = 497.7;
  paused = true;
  hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
  t('element already stopped by webOS, player playing: paused through the player before YouTube suspends it', playerCalls[playerCalls.length - 1] === 'pauseVideo' && ytState === 5, [playerCalls, ytState]);
  time = 0;
  const callsBg = playerCalls.length;
  hidden = false; doc.dispatchEvent(new win.Event('visibilitychange'));
  paused = false; time = 497.4; media('play'); media('playing');
  t('and its restart on return is paused', playerCalls.length === callsBg + 1 && playerCalls[playerCalls.length - 1] === 'pauseVideo' && paused, playerCalls);
  // Paused by the user before Home: nothing to do on return.
  ytState = 2; paused = true;
  const callsPaused = playerCalls.length;
  hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
  hidden = false; doc.dispatchEvent(new win.Event('visibilitychange'));
  media('playing');
  t('paused before Home: left alone', playerCalls.length === callsPaused, playerCalls);
  done();
})();
function done() { console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
