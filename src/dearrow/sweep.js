// DeArrow on screen: the rendered tiles brought in line with what is decided
// for their videos, or put back to YouTube's own. A tile is matched to its
// video by the thumbnail it shows (YouTube's URL carries the id, DeArrow's
// small copies are looked up), and only text or images this feature wrote
// are ever put back. The DeArrow badge YouTube draws from the responses
// (tiles.js) gets the logo here, or is hidden while the badge is off; a
// tile YouTube drew before its video's answer gets a copy of a badge.
import { configRead } from '../config.js';
import { TILE_LAYOUTS, VIDEO_ID_RE, BADGE_MARK } from './constants.js';
import logoUrl from './dearrow-logo.png';
import './dearrow.css';
import { videos } from './state.js';
import { thumbOwner } from './thumbs.js';
import { wantsBadge } from './tiles.js';

// The URL inside a CSS background-image value.
const BACKGROUND_URL_RE = /url\("?([^")]+)"?\)/;

/**
 * Replaces an element's text, editing its one text node where it has one: the
 * renderer keeps a handle on that node and reuses the tile for other videos.
 */
function setText(el, text) {
  const first = el.firstChild;
  if (first && first.nodeType === 3 && !first.nextSibling) first.nodeValue = text;
  else el.textContent = text;
}

/** The video a rendered tile shows, from its thumbnail, or undefined. */
function tileVideo(thumbEl) {
  const background = thumbEl && thumbEl.style.backgroundImage;
  if (!background) return undefined;
  const shown = BACKGROUND_URL_RE.exec(background);
  const owner = shown && thumbOwner(shown[1]);
  const match = owner ? null : VIDEO_ID_RE.exec(background);
  return videos.get(owner || (match && match[1]));
}

/** One tile's thumbnail: DeArrow's on top (`want`), or YouTube's back when DeArrow put one there. */
function sweepThumb(thumbEl, video, want) {
  const background = thumbEl.style.backgroundImage;
  if (want) {
    // On top, not just present: Max Thumbnail Quality can layer an upgraded
    // original over whatever the tile shows.
    const at = background.indexOf(want);
    if (at === -1 || at > 5) thumbEl.style.backgroundImage = `url("${want}")`;
    video.shownThumb = want;
  } else if (
    video.shownThumb &&
    video.originalThumb &&
    background.indexOf(video.shownThumb) !== -1
  ) {
    thumbEl.style.backgroundImage = `url("${video.originalThumb}")`;
  }
}

/**
 * A tile's title: the first of its `selector` elements that shows the
 * video's title, YouTube's or DeArrow's. A lockup draws its other lines (a
 * label before the title, the channel, the views) in the same elements.
 */
function titleElement(tile, selector, video) {
  const candidates = tile.querySelectorAll(selector);
  for (let i = 0; i < candidates.length; i++) {
    const text = candidates[i].textContent;
    if (text === video.original || text === video.title || text === video.shownTitle) {
      return candidates[i];
    }
  }
  return null;
}

/** One tile's title: DeArrow's (`want`), or YouTube's back when the text is still DeArrow's. */
function sweepTitle(titleEl, video, want) {
  if (want) {
    if (titleEl.textContent !== want) setText(titleEl, want);
    video.shownTitle = want;
  } else if (video.shownTitle && video.original && titleEl.textContent === video.shownTitle) {
    setText(titleEl, video.original);
  }
}

const BADGE_CLASS = 'ytng-dearrow-badge';
// A badge the sweep added (a tile YouTube drew before the answer).
const COPY_CLASS = 'ytng-dearrow-badge-copy';
// On a badge of YouTube's the sweep hid.
const HIDDEN_ATTR = 'data-ytng-dearrow-hidden';

/** The logo drawn over a mark (an element whose text is BADGE_MARK). */
function drawLogo(el) {
  if (el.classList.contains(BADGE_CLASS)) return;
  el.classList.add(BADGE_CLASS);
  el.style.backgroundImage = `url("${logoUrl}")`;
}

/** Whether `el`, below `meta`, is in a badge the sweep added. */
function inCopy(el, meta) {
  for (let node = el; node && node !== meta; node = node.parentNode) {
    if (node.classList.contains(COPY_CLASS)) return true;
  }
  return false;
}

/**
 * Adds the DeArrow badge to a tile YouTube drew without it: a copy of the
 * tile's last badge ("4K"), after it, or else of the page's first, first in
 * the tile's last row (the views and the age). None without either.
 */
function addCopy(meta, layout) {
  const own = meta.querySelectorAll(layout.BADGE);
  const after = own.length ? own[own.length - 1] : null;
  const rows = meta.querySelectorAll(layout.ROW);
  const model = after || document.querySelector(layout.BADGE);
  if (!model || (!after && !rows.length)) return;
  const badge = model.cloneNode(true);
  // Not one of YouTube's: no id twice on the page, no key its renderer
  // would take it for one of its own by.
  const inner = badge.getElementsByTagName('*');
  for (let i = -1; i < inner.length; i++) {
    const el = i < 0 ? badge : inner[i];
    el.removeAttribute('id');
    el.removeAttribute('idomkey');
    el.removeAttribute(HIDDEN_ATTR);
  }
  badge.style.display = '';
  badge.classList.add(COPY_CLASS);
  let leaf = badge;
  while (leaf.firstElementChild) leaf = leaf.firstElementChild;
  leaf.textContent = BADGE_MARK;
  drawLogo(leaf);
  if (after) {
    after.parentNode.insertBefore(badge, after.nextSibling);
  } else {
    const row = rows[rows.length - 1];
    row.insertBefore(badge, row.firstChild);
  }
}

/**
 * The DeArrow badges in a tile (the text BADGE_MARK): the logo drawn over the
 * mark, or with `hide` the whole badge hidden (DeArrow or its badge off, or
 * not for this video, until YouTube draws the tile again without it). With
 * `copy` (the badge is wanted for the tile's video), a tile YouTube drew
 * without one gets a copy, gone again once YouTube draws its own. What
 * YouTube reused for other text ("4K") loses what was put on it.
 */
function sweepBadges(tile, layout, hide, copy) {
  const meta = tile.querySelector(layout.METADATA);
  if (!meta) return;
  let drawn = false;
  const elements = meta.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.hasAttribute(HIDDEN_ATTR) && el.textContent !== BADGE_MARK) {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.display = '';
    }
    if (el.firstElementChild || el.textContent !== BADGE_MARK) {
      // The logo goes with the mark, the class or (classes reset) the image.
      if (
        el.classList.contains(BADGE_CLASS) ||
        (!el.firstElementChild && el.style.backgroundImage.indexOf(logoUrl) !== -1)
      ) {
        el.classList.remove(BADGE_CLASS);
        el.style.backgroundImage = '';
      }
      continue;
    }
    drawLogo(el);
    if (inCopy(el, meta)) continue;
    drawn = true;
    // The badge itself: the highest element that holds the mark and nothing else.
    let badge = el;
    while (
      badge.parentNode &&
      badge.parentNode !== meta &&
      badge.parentNode.textContent === BADGE_MARK
    ) {
      badge = badge.parentNode;
    }
    badge.style.display = hide ? 'none' : '';
    if (hide) badge.setAttribute(HIDDEN_ATTR, '');
    else badge.removeAttribute(HIDDEN_ATTR);
  }
  const copies = meta.getElementsByClassName(COPY_CLASS);
  if (hide || !copy || drawn || !layout.BADGE) {
    while (copies.length) copies[0].parentNode.removeChild(copies[0]);
  } else if (!copies.length) {
    addCopy(meta, layout);
  }
}

/**
 * Brings every rendered tile in line with what is decided for its video; with
 * `restoreAll`, puts back every original this feature replaced (DeArrow off).
 */
export function sweepTiles(restoreAll) {
  if (videos.size === 0) return;
  const badgeOn = !restoreAll && !!configRead('dearrowShowBadge');
  for (let l = 0; l < TILE_LAYOUTS.length; l++) {
    const layout = TILE_LAYOUTS[l];
    const tiles = document.querySelectorAll(layout.TILE);
    for (let i = 0; i < tiles.length; i++) {
      const thumbEl = tiles[i].querySelector(layout.THUMBNAIL);
      const video = tileVideo(thumbEl);
      // A tile of a video not known keeps the badge YouTube drew, and no copy.
      const show = badgeOn && (!video || wantsBadge(video));
      sweepBadges(tiles[i], layout, !show, show && !!video);
      if (!video) continue;
      sweepThumb(thumbEl, video, restoreAll ? null : video.thumb);
      const titleEl = titleElement(tiles[i], layout.TITLE, video);
      if (titleEl) sweepTitle(titleEl, video, restoreAll ? null : video.title);
    }
  }
}
