/**
 * Pause the video when the app goes to the background (Home, another app).
 *
 * webOS keeps a backgrounded web app running, so the video played on unseen:
 * SponsorBlock skipped, the video ended, autoplay moved on, and on return a
 * different video was playing at 1x (TV test T9). Now it waits, paused, at the
 * same spot and speed; Play continues.
 */
import { getVideo, SELECTORS } from './utils.js';

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const video = getVideo();
  if (!video || video.paused) return;
  // Through the player, so YouTube's own state (and its UI) knows it is paused.
  const player = document.getElementById(SELECTORS.PLAYER_ID);
  if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
  else video.pause();
});
