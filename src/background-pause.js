/**
 * Pause the video when the app goes to the background (Home, another app).
 *
 * webOS keeps a backgrounded web app running, so the video played on unseen:
 * SponsorBlock skipped, the video ended, autoplay moved on, and on return a
 * different video was playing at 1x (TV test T9). Now it waits, paused, at the
 * same spot and speed; Play continues.
 *
 * YouTube may also unload the video itself right after the app is hidden
 * (time 0, no pause event) and, on return, load it again at the same spot and
 * speed and start it (TV test pre-release03, T8). Then the pause is repeated
 * once, when that reloaded video starts playing.
 *
 * By the time visibilitychange fires, webOS has already stopped the <video>
 * (TV test pre-release04). Mostly without a pause event, and YouTube's player
 * still says "playing", so whether it was playing is asked of the player.
 * Sometimes with one, and the player says "paused", so a pause less than a
 * second before counts as webOS's, not the user's. YouTube's own listener on
 * document suspends the player (state 5) and is registered before this
 * script, so this one listens on window in the capture phase and runs first.
 */
import { getVideo, SELECTORS } from './utils.js';

// How long after the return YouTube's own restart is waited for.
const RETURN_WINDOW_MS = 15000;
// A pause this close before the app is hidden is webOS stopping the video.
const STOP_BEFORE_HIDE_MS = 1000;

let hiddenAt = null; // video time when the app was hidden mid-play
let pausedAt = 0;

document.addEventListener(
  'pause',
  (e) => {
    if (e.target.tagName === 'VIDEO') pausedAt = Date.now();
  },
  true
);

function getPlayer() {
  return document.getElementById(SELECTORS.PLAYER_ID);
}

function isPlaying(video) {
  const player = getPlayer();
  if (player && typeof player.getPlayerState === 'function') {
    const state = player.getPlayerState();
    return state === 1 || state === 3; // playing, buffering
  }
  return !video.paused;
}

function pause(video) {
  // Through the player, so YouTube's own state (and its UI) knows it is paused.
  const player = getPlayer();
  if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
  else video.pause();
}

window.addEventListener('visibilitychange', () => {
  const video = getVideo();
  if (document.hidden) {
    if (!video) return;
    if (!isPlaying(video) && Date.now() - pausedAt > STOP_BEFORE_HIDE_MS) return;
    hiddenAt = video.currentTime;
    pause(video);
    return;
  }
  if (hiddenAt === null) return;
  const at = hiddenAt;
  hiddenAt = null;
  // Still paused where it was left: nothing more to do.
  if (video && video.paused && Math.abs(video.currentTime - at) < 2) return;
  if (video && !video.paused) {
    pause(video);
    return;
  }
  let timer = 0;
  const onPlaying = (e) => {
    if (e.target.tagName !== 'VIDEO') return;
    stop();
    pause(e.target);
  };
  const stop = () => {
    clearTimeout(timer);
    document.removeEventListener('playing', onPlaying, true);
  };
  // Media events do not bubble; the capture phase still sees them.
  document.addEventListener('playing', onPlaying, true);
  timer = setTimeout(stop, RETURN_WINDOW_MS);
}, true);
