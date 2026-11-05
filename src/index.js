import { extractLaunchParams, handleLaunch } from './launch.js';

function main() {
  handleLaunch(extractLaunchParams());
}

// Leave for YouTube once this page has been painted (grey, index.html). Left
// before that, webOS 25 showed black for a moment between its splash and
// YouTube's start-up screen at nearly every launch. A page that gets no frames
// goes after 200 ms.
let started = false;
function start() {
  if (started) return;
  started = true;
  main();
}
if (window.requestAnimationFrame) window.requestAnimationFrame(() => setTimeout(start, 0));
setTimeout(start, 200);