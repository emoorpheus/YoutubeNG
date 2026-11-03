/**
 * Black screen over a paused video (OLED care).
 *
 * webOS starts its own screensaver only about 3 minutes after a video is
 * paused - a long time for a still frame and the player controls to sit on an
 * OLED panel. After a shorter idle time (1 minute by default, Settings ->
 * Interface) a paused or finished video is covered with black: only a dim
 * clock and the app name, which move every 20 s so no pixel stays lit.
 *
 * Any key or pointer movement brings the video back. The key press is eaten
 * together with its repeats and release, so Back or the arrows do not also act
 * on the player behind. OK, Play and Play/Pause resume a paused video in the
 * same press (we start it, the key itself is eaten too: passed through, Play
 * took two presses on the TV); Pause only wakes. Playback starting or the app
 * going away removes it too. The webOS screensaver still comes at its usual time.
 */
import './pause-screensaver.css';
import { configRead, configAddChangeListener } from './config.js';
import { getVideo, isWatchPage, isShortsPage, SYNTHETIC_KEY_FLAG, SELECTORS } from './utils.js';

const MOVE_MS = 20000;
const FADE_MS = 800;              // matches the transition in pause-screensaver.css
const RELEASE_TIMEOUT_MS = 1500;  // safety net if the release never arrives
const POINTER_SLOP = 8;           // px; the cursor reappearing is not a move
const RESUME_KEYS = [13 /* OK */, 415 /* Play */, 463 /* Play/Pause */, 179 /* MediaPlayPause */];

let overlay = null;
let box = null;
let clock = null;
let idleTimer = null;
let moveTimer = null;
let lastInput = Date.now();
let heldKey = null;
let releaseTimer = null;
let pointer = null;
let eatClickUntil = 0;

function delayMs() {
  const seconds = parseInt(configRead('pauseScreensaver'), 10);
  return seconds > 0 ? seconds * 1000 : 0;
}

function isPausedVideo() {
  if (!isWatchPage() && !isShortsPage()) return false;
  const video = getVideo();
  return !!video && (video.paused || video.ended);
}

function el(className, text) {
  const node = document.createElement('div');
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

function place() {
  if (!box) return;
  const now = new Date();
  clock.textContent = now.getHours() + ':' + pad(now.getMinutes());
  box.style.left = (20 + Math.random() * 60) + '%';
  box.style.top = (20 + Math.random() * 60) + '%';
  box.style.opacity = '1';
}

function move() {
  if (!box) return;
  box.style.opacity = '0';
  setTimeout(place, FADE_MS);
}

function show() {
  if (overlay || !document.body) return;
  overlay = el('ytng-pause-saver');
  box = el('ytng-pause-saver-box');
  clock = el('ytng-pause-saver-clock');
  box.appendChild(clock);
  box.appendChild(el('ytng-pause-saver-name', 'YouTube Next-Gen'));
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  place();
  moveTimer = setInterval(move, MOVE_MS);
}

function hide() {
  if (!overlay) return;
  clearInterval(moveTimer);
  moveTimer = null;
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = box = clock = null;
}

// Counts from the last input; re-checks rather than trusting the timer, so
// input only has to update lastInput.
function arm() {
  clearTimeout(idleTimer);
  idleTimer = null;
  const delay = delayMs();
  if (!delay || overlay || !isPausedVideo()) return;
  const left = delay - (Date.now() - lastInput);
  if (left > 0) idleTimer = setTimeout(arm, left);
  else if (!document.hidden) show();
}

function disarm() {
  clearTimeout(idleTimer);
  idleTimer = null;
  hide();
}

function swallow(evt) {
  evt.preventDefault();
  evt.stopPropagation();
  if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
}

function releaseHeld() {
  clearTimeout(releaseTimer);
  heldKey = null;
}

function wake() {
  hide();
  arm(); // still paused: count again
}

// Through the player, so YouTube's own state (and its UI) knows it plays.
function resume() {
  const video = getVideo();
  if (!video || !video.paused || video.ended) return;
  const player = document.getElementById(SELECTORS.PLAYER_ID);
  if (player && typeof player.playVideo === 'function') player.playVideo();
  else video.play();
}

function onKey(evt) {
  if (evt[SYNTHETIC_KEY_FLAG]) return; // keep-alive / auto-login keys are not the user
  const code = evt.keyCode || evt.which;
  if (heldKey !== null && code === heldKey) {
    swallow(evt); // the rest of the press that woke the screen
    lastInput = Date.now(); // holding the key is still input
    if (evt.type === 'keyup') releaseHeld();
    else { clearTimeout(releaseTimer); releaseTimer = setTimeout(releaseHeld, RELEASE_TIMEOUT_MS); }
    return;
  }
  if (evt.type !== 'keydown') return;
  lastInput = Date.now();
  if (!overlay) return;
  console.info('[PauseSaver] woken by key ' + code);
  wake();
  swallow(evt);
  if (RESUME_KEYS.indexOf(code) !== -1) resume();
  heldKey = code;
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(releaseHeld, RELEASE_TIMEOUT_MS);
}

function onPointer(evt) {
  if (evt.type === 'mouseup' || evt.type === 'click') {
    if (Date.now() < eatClickUntil) swallow(evt); // finish of the click that woke the screen
    return;
  }
  if (evt.type === 'mousemove') {
    const prev = pointer;
    pointer = [evt.screenX, evt.screenY];
    if (prev && Math.abs(pointer[0] - prev[0]) + Math.abs(pointer[1] - prev[1]) <= POINTER_SLOP) return;
  }
  lastInput = Date.now();
  if (!overlay) return;
  wake();
  // A click must not land on whatever was under the cursor behind the black.
  if (evt.type === 'mousedown') {
    swallow(evt);
    eatClickUntil = Date.now() + RELEASE_TIMEOUT_MS;
  }
}

function onMedia(evt) {
  if (!evt.target || evt.target.tagName !== 'VIDEO') return;
  if (evt.type === 'pause' || evt.type === 'ended') arm();
  else disarm();
}

function onVisibility() {
  if (document.hidden) return;
  lastInput = Date.now(); // coming back to the app is activity
  wake();
}

['keydown', 'keypress', 'keyup'].forEach((type) => { window.addEventListener(type, onKey, true); });
['mousemove', 'mousedown', 'mouseup', 'click', 'wheel'].forEach((type) => { window.addEventListener(type, onPointer, true); });
// Media events do not bubble, but a capturing listener still sees them.
['pause', 'ended', 'play', 'playing'].forEach((type) => { document.addEventListener(type, onMedia, true); });
document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('ytng-page-update', () => { disarm(); arm(); });
configAddChangeListener('pauseScreensaver', () => { disarm(); arm(); });
