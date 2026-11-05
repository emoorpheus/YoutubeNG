/**
 * Start-up screen: YouTube's own, grown into the app's.
 *
 * YouTube's page shows #loader (grey #282828, YouTube's logo 60 % wide, in the
 * middle) about half a second before this script runs, and removes it once
 * the app is up. Covering it with a picture of ours would make the launch
 * switch looks; instead the logo goes onto a layer of its own at the same
 * place, moves up, and NEXT-GEN comes in under it (start-screen.css). The
 * layer is inside #loader, so it goes when YouTube removes it. A loader drawn
 * any other way is left as it is. The webOS splash and the launcher page are
 * the same grey (design/icons/generate.py, src/index.html).
 *
 * In OLED mode the screen also turns black, in step with the logo's move
 * (start-screen.css). Before this script runs it is grey: the webOS splash is
 * a fixed picture, and the launcher page and YouTube's own loader are drawn
 * before the setting can be read.
 */
import { configRead } from './config.js';
import './start-screen.css';

const GROWN = 'ytng-start-grown';
const CENTRED = /^(center|50%)( (center|50%))?$/;

/** Grows the loader if it is there and looks as expected; true if it did. */
export function growStartScreen() {
  const loader = document.getElementById('loader');
  if (!loader || loader.classList.contains(GROWN)) return false;
  const cs = window.getComputedStyle(loader);
  const drawnAsExpected = /^url\(/.test(cs.backgroundImage) &&
    /^60%( auto)?$/.test(cs.backgroundSize) &&
    CENTRED.test(cs.backgroundPosition) &&
    /^no-repeat/.test(cs.backgroundRepeat);
  if (!drawnAsExpected) return false;
  // OLED mode: the filter takes greys up to YouTube's #282828 to black; a
  // loader of another colour keeps it.
  const grey = /^rgb\((\d+), \1, \1\)$/.exec(cs.backgroundColor);
  if (configRead('enableOledCareMode') && grey && +grey[1] <= 40) loader.classList.add('ytng-start-oled');
  const logo = document.createElement('div');
  logo.className = 'ytng-start-logo';
  const name = document.createElement('div');
  name.className = 'ytng-start-name';
  loader.appendChild(logo);
  loader.appendChild(name);
  // In the same task as the layer: the logo moves to it within one frame.
  loader.classList.add(GROWN);
  return true;
}

try {
  if (!growStartScreen() && document.readyState === 'loading') {
    // Run before the page's body was in: try once more when it is.
    document.addEventListener('DOMContentLoaded', () => {
      try { growStartScreen(); } catch (e) { console.warn('[StartScreen]', e); }
    });
  }
} catch (e) {
  console.warn('[StartScreen]', e);
}
