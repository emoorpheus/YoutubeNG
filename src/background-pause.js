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
 */
import { getVideo, SELECTORS } from './utils.js';

// How long after the return YouTube's own restart is waited for.
const RETURN_WINDOW_MS = 15000;

let hiddenAt = null; // video time when the app was hidden mid-play

function pause(video) {
  // Through the player, so YouTube's own state (and its UI) knows it is paused.
  const player = document.getElementById(SELECTORS.PLAYER_ID);
  if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
  else video.pause();
}

document.addEventListener('visibilitychange', () => {
  const video = getVideo();
  if (document.hidden) {
    if (!video || video.paused) return;
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
});
