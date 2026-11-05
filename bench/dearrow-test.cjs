/**
 * DeArrow (src/dearrow, upstream 0.8.5 b2 #200) against the built bundle: a
 * response goes through the JSON.parse hook, branding comes from a stubbed
 * API, and the rendered tiles end up with the right title and thumbnail:
 * crowdsourced ones when trusted (a downvoted title is not), the thumbnail
 * drawn as a copy as wide as Max Thumbnail Quality makes the tiles (480 off,
 * 1280 Original and Fast, never upscaled, a 4:3 frame cropped to 16:9), the
 * copies' memory budget, the random frame asked for at the server's time
 * (from a 404's body too) with the auto-generated frame standing in, a known
 * video rewritten inside the parse, the Blank and Original fallbacks, a
 * settings change deciding again, the badge, and DeArrow switched off in the
 * panel putting back exactly what it replaced, on screen and in the stored
 * responses. Title formatting is in the webOS 22+ build only.
 *
 * Adapted from b2's tests/behaviour/dearrow-test.cjs to this bench (own boot,
 * our panel's classes).
 *
 * Run: node bench/dearrow-test.cjs [bundle] [legacy|modern]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
const modern = process.argv[3] === 'modern';

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 1000);
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() >= deadline) return false;
    // eslint-disable-next-line no-await-in-loop -- polling, one step at a time
    await wait(10);
  }
}
const KEYS = { LEFT: 37, RIGHT: 39, DOWN: 40, GREEN: 404 };
function press(win, code, target) {
  const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code, configurable: true });
  (target || win.document.activeElement || win.document.body).dispatchEvent(e);
  return e;
}
/** The cycle row of the options panel whose label reads `label`, inside `pageSel`. */
function cycleRow(win, label, pageSel) {
  const rows = Array.from(win.document.querySelectorAll(pageSel + ' .shortcut-control-row'));
  return rows.find((row) => {
    const l = row.querySelector('.shortcut-label');
    return l && l.textContent.trim() === label;
  }) || null;
}
/** Opens the options panel (green) and builds every page. */
function openPanel(p) {
  press(p.win, KEYS.GREEN, p.win.document.body);
  for (let i = 0; i < 20; i++) p.pump();
}
const openDeArrowTab = (win) => Array.from(win.document.querySelectorAll('.ytng-tab-btn'))
  .find((x) => x.textContent === 'DeArrow');

const BRANDING = {
  // A crowdsourced title (with a ">" marker the formatter takes out) and thumbnail.
  custom00001: {
    titles: [{ title: 'the >iPhone review', original: false, votes: 2, locked: false }],
    thumbnails: [{ timestamp: 12.5, original: false, votes: 1, locked: false }],
    randomTime: 0.3,
    videoDuration: 100
  },
  // A downvoted title and no thumbnail: the original title, the random frame fallback.
  downvoted01: {
    titles: [{ title: 'Bad', original: false, votes: -1, locked: false }],
    thumbnails: [],
    randomTime: 0.5,
    videoDuration: 200
  },
  // No random time from the server: no random frame, the auto-generated one stays.
  norandom001: { titles: [], thumbnails: [], randomTime: null, videoDuration: 300 },
  // Nobody submitted anything: a 404, whose body still carries the random time
  // and the exact length the shared frame cache is keyed on.
  nosubmit001: { titles: [], thumbnails: [], randomTime: 0.25, videoDuration: 123.456 },
  // A crowdsourced title only, for a tile whose metadata has no badge yet.
  custom00002: {
    titles: [{ title: 'Honest title', original: false, votes: 1, locked: false }],
    thumbnails: [],
    randomTime: 0.4,
    videoDuration: 50
  },
  // No length from the server: the random frame's time needs the tile's own.
  lockdur0001: { titles: [], thumbnails: [], randomTime: 0.5 }
};

/** A video tile as YouTube sends it. */
function tile(id, title) {
  return {
    tileRenderer: {
      contentId: id,
      contentType: 'TILE_CONTENT_TYPE_VIDEO',
      header: {
        tileHeaderRenderer: {
          thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] }
        }
      },
      metadata: { tileMetadataRenderer: { title: { simpleText: title } } }
    }
  };
}

/** A response with `tiles`, padded past the parse hook's size gate. */
const response = (tiles) =>
  JSON.stringify({ responseContext: {}, contents: tiles, padding: 'x'.repeat(600) });

/**
 * A browse page with DeArrow on (plus `cfg`), the branding API stubbed, images that load (submitted
 * frames, YouTube's) or not (random frames still rendering: the server's 204), and a canvas that
 * records the downscale and hands back a data URL naming its source, as long as a real one of that
 * size; with `blob`, a canvas with toBlob (webOS 5 and later) and blob URLs.
 */
function boot(cfg, blob) {
  const fetched = [];
  const images = [];
  const draws = [];
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, modern ? UA.webos23 : UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.localStorage.setItem('ytng-configuration', win.JSON.stringify(Object.assign({
    enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false,
    enableDeArrow: true, dearrowTitleFormatting: 'disable',
    // The first-run hint would take the keys the tests press (welcome.js).
    firstRunHintShown: true
  }, cfg)));
  if (!modern) applyChrome38Downgrade(win);
  // After the downgrade, which deletes window.fetch (Chrome 38 has none).
      win.fetch = (url) => {
        fetched.push(String(url));
        const id = /videoID=([\w-]{11})/.exec(url)?.[1];
        const body = BRANDING[id] || {
          titles: [],
          thumbnails: [],
          randomTime: 0.5,
          videoDuration: 60
        };
        const none = !body.titles.length && !body.thumbnails.length;
        return Promise.resolve({
          ok: !none,
          status: none ? 404 : 200,
          json: () => Promise.resolve(JSON.parse(JSON.stringify(body)))
        });
      };
      win.Image = class {
        set src(url) {
          images.push(url);
          this._src = url;
          const ytimg = url.indexOf('i.ytimg.com') !== -1;
          const ok = ytimg || url.indexOf('time=12.5') !== -1;
          // DeArrow serves 1280x720 frames, YouTube's hq1 to hq3 are 480x360 (4:3).
          this.naturalWidth = ytimg ? 480 : 1280;
          this.naturalHeight = ytimg ? 360 : 720;
          setTimeout(() => (ok ? this.onload && this.onload() : this.onerror && this.onerror()), 0);
        }
      };
      win.HTMLCanvasElement.prototype.getContext = function () {
        const canvas = this;
        return {
          drawImage: (img, ...args) => {
            canvas._src = img._src;
            draws.push({ w: canvas.width, h: canvas.height, src: img._src, args });
          }
        };
      };
      if (blob) {
        // A JPEG blob of about 0.15 bytes a pixel, its URL naming its source here.
        win.HTMLCanvasElement.prototype.toBlob = function (done) {
          const blobOf = { size: Math.round(this.width * this.height * 0.15), src: this._src };
          setTimeout(() => done(blobOf), 0);
        };
        win.URL.createObjectURL = (b) =>
          'blob:https://www.youtube.com/SMALL#' + encodeURIComponent(b.src);
        win.URL.revokeObjectURL = () => {};
      } else {
        // No toBlob, as on webOS 3 and 4: the data URL path, which names its source here,
        // as long as a real JPEG data URL of that size (about 0.3 characters a pixel).
        win.HTMLCanvasElement.prototype.toBlob = undefined;
        win.HTMLCanvasElement.prototype.toDataURL = function () {
          const body = 'A'.repeat(Math.round(this.width * this.height * 0.3));
          return 'data:image/jpeg;base64,' + body + 'SMALL#' + encodeURIComponent(this._src);
        };
      }
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, fetched, images, draws, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(Date.now()); } };
}

/** Renders the tiles of a parsed response the way the TV app does: thumbnail as a background, title as text. */
function render(win, data) {
  const app = win.document.querySelector('ytlr-app');
  for (const item of data.contents) {
    const tr = item.tileRenderer;
    const el = win.document.createElement('ytlr-tile-renderer');
    el.setAttribute('data-test-id', tr.contentId);
    el.innerHTML =
      '<ytlr-thumbnail-details></ytlr-thumbnail-details>' +
      '<ytlr-tile-metadata-renderer><div><yt-formatted-string></yt-formatted-string></div></ytlr-tile-metadata-renderer>';
    el.querySelector('ytlr-thumbnail-details').style.backgroundImage =
      `url("${tr.header.tileHeaderRenderer.thumbnail.thumbnails[0].url}")`;
    el.querySelector('yt-formatted-string').textContent =
      tr.metadata.tileMetadataRenderer.title.simpleText;
    app.appendChild(el);
  }
}

/** What a rendered tile shows: its title, its thumbnail (decoded), and whether that is a small copy. */
function shown(win, id) {
  const el = win.document.querySelector(`ytlr-tile-renderer[data-test-id="${id}"]`);
  const thumb = el && el.querySelector('ytlr-thumbnail-details').style.backgroundImage;
  return (
    el && {
      title: el.querySelector('yt-formatted-string').textContent,
      thumb: thumb && decodeURIComponent(thumb),
      small: !!thumb && thumb.indexOf('SMALL#') !== -1
    }
  );
}

(async () => {
  // ---- titles and thumbnails, the lookups, the random frame -------------------------
  const page = boot({});
  const { win, fetched, images, draws } = page;
  await wait(50);
  const text = response([
    tile('custom00001', "You WON'T believe THIS phone"),
    tile('downvoted01', 'Original title'),
    tile('norandom001', 'Another one'),
    tile('nosubmit001', 'No submissions'),
    // More than four videos whose random frames never render: the retries
    // must not hold the lookups.
    ...Array.from({ length: 8 }, (_, i) => tile('filler00000' + i, 'Filler ' + i))
  ]);
  render(win, win.JSON.parse(text));
  await waitFor(() => fetched.length === 12 && shown(win, 'custom00001').small, 3000);
  await wait(400);

  t(
    'one branding request per video, past the four at a time',
    fetched.length === 12,
    JSON.stringify(fetched)
  );
  t(
    'the requests ask by video id, as the extension does for tiles',
    fetched.every((u) => u.indexOf('/api/branding?videoID=') !== -1)
  );
  const a = shown(win, 'custom00001');
  t(
    'the crowdsourced title, its ">" marker taken out',
    a && a.title === 'the iPhone review',
    a && a.title
  );
  t(
    'the submitted thumbnail is shown',
    a && a.thumb.indexOf('getThumbnail?videoID=custom00001&time=12.5') !== -1,
    a && a.thumb
  );
  t('as a small copy, not the 1280x720 frame', a && a.small, a && a.thumb);
  t(
    "as data URLs (webOS 3 and 4) every copy is hqdefault's size (480x270)",
    draws.length > 0 &&
      draws.every((d) => d.w === 480 && d.h === 270 && d.args[6] === 480 && d.args[7] === 270),
    JSON.stringify(draws.slice(0, 2).map((d) => [d.w, d.h]))
  );
  const hq = draws.find((d) => d.args[2] === 480 && d.args[3] === 270);
  t(
    'a 4:3 auto-generated frame is cropped to 16:9 (letterbox off)',
    !!hq && hq.args[1] === 45,
    JSON.stringify(draws.map((d) => d.args.slice(0, 4)))
  );

  const b = shown(win, 'downvoted01');
  t('a downvoted title is not used', b && b.title === 'Original title', b && b.title);
  t(
    'the random frame not rendered yet: the auto-generated start frame stands in',
    b && b.small && b.thumb.indexOf('/vi/downvoted01/hq1.jpg') !== -1,
    b && b.thumb
  );
  t(
    'the random frame is asked for at randomTime x length, with generateNow',
    images.some((u) => u.indexOf('videoID=downvoted01&time=100&generateNow=true') !== -1)
  );
  const c = shown(win, 'norandom001');
  t(
    'no random time: the auto-generated frame, and no random frame asked for',
    c &&
      c.small &&
      c.thumb.indexOf('/vi/norandom001/hq1.jpg') !== -1 &&
      !images.some((u) => u.indexOf('getThumbnail?videoID=norandom001') !== -1),
    images.filter((u) => u.indexOf('norandom001') !== -1).join(' ')
  );
  t(
    "a 404's body still gives the random frame its time",
    images.some((u) => u.indexOf('videoID=nosubmit001&time=' + 0.25 * 123.456) !== -1),
    images.filter((u) => u.indexOf('nosubmit001') !== -1).join(' ')
  );

  // A later response with a known video is rewritten before it renders.
  const again = win.JSON.parse(text);
  t(
    'a known video is rewritten inside JSON.parse',
    again.contents[0].tileRenderer.metadata.tileMetadataRenderer.title.simpleText ===
      'the iPhone review' &&
      again.contents[0].tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.indexOf(
        'SMALL#'
      ) !== -1
  );
  t(
    'and asked about only once',
    fetched.filter((u) => u.indexOf('custom00001') !== -1).length === 1
  );

  // ---- switched off in the panel: everything put back ------------------------------
  openPanel(page);
  const tab = openDeArrowTab(win);
  t('the panel has a DeArrow tab', !!tab);
  if (tab) tab.click();
  const formatRow = !!cycleRow(win, 'Title formatting', '#ytng-page-dearrow');
  t(
    modern
      ? 'webOS 22+: the page has the title formatting row'
      : 'legacy build: no title formatting row (no formatter in it)',
    formatRow === modern
  );
  const enable = win.document.querySelector('#ytng-page-dearrow input[type="checkbox"]');
  enable.click();
  // Past the sweep delay: a sweep scheduled earlier must not apply it again.
  await wait(400);
  const off = shown(win, 'custom00001');
  t(
    'off: the original title is back',
    off && off.title === "You WON'T believe THIS phone",
    off && off.title
  );
  t(
    'off: the original thumbnail is back',
    off && off.thumb.indexOf('/vi/custom00001/hqdefault.jpg') !== -1,
    off && off.thumb
  );
  const kept = again.contents[0].tileRenderer;
  t(
    "off: YouTube's stored response is put back too",
    kept.metadata.tileMetadataRenderer.title.simpleText === "You WON'T believe THIS phone" &&
      kept.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.indexOf(
        '/vi/custom00001/hqdefault.jpg'
      ) !== -1,
    JSON.stringify(kept.metadata.tileMetadataRenderer.title)
  );
  const rows = Array.from(
    win.document.querySelectorAll('#ytng-page-dearrow label, #ytng-page-dearrow .shortcut-control-row')
  );
  t(
    'off: the option rows are greyed out',
    rows.length > 3 && rows.slice(1).every((r) => r.style.opacity === '0.5'),
    String(rows.length)
  );
  const parsedOff = win.JSON.parse(text);
  t(
    'off: a new response is left as YouTube sent it',
    parsedOff.contents[0].tileRenderer.metadata.tileMetadataRenderer.title.simpleText ===
      "You WON'T believe THIS phone"
  );

  // ---- the Blank and Original fallbacks, and a settings change ----------------------
  {
    const p = boot({ dearrowThumbnailFallback: 'blank' });
    await wait(50);
    render(p.win, p.win.JSON.parse(response([tile('downvoted01', 'Original title')])));
    await waitFor(
      () => (shown(p.win, 'downvoted01').thumb || '').indexOf('data:image/gif') !== -1,
      2000
    );
    const blank = shown(p.win, 'downvoted01');
    t(
      'Blank: a transparent pixel that still names the video',
      blank.thumb.indexOf('data:image/gif') !== -1 &&
        blank.thumb.indexOf('videoID=downvoted01') !== -1,
      blank.thumb
    );
    // A settings change decides again, with the answer already fetched:
    // Blank -> Original through the panel row.
    const before = p.fetched.length;
    openPanel(p);
    openDeArrowTab(p.win).click();
    const row = cycleRow(p.win, 'Without a crowdsourced thumbnail', '#ytng-page-dearrow');
    row.focus();
    press(p.win, KEYS.LEFT, row);
    t(
      'setup: the fallback row now reads Original',
      /Original/.test(row.textContent),
      row.textContent
    );
    await waitFor(
      () => shown(p.win, 'downvoted01').thumb.indexOf('/vi/downvoted01/hqdefault.jpg') !== -1,
      2000
    );
    t(
      "a settings change decides again: Original puts YouTube's thumbnail back",
      shown(p.win, 'downvoted01').thumb.indexOf('/vi/downvoted01/hqdefault.jpg') !== -1,
      shown(p.win, 'downvoted01').thumb
    );
    t(
      'without asking the API again',
      p.fetched.length === before,
      String(p.fetched.length - before)
    );
  }
  {
    const p = boot({ dearrowThumbnailFallback: 'original', dearrowCrowdTitles: false });
    await wait(50);
    render(p.win, p.win.JSON.parse(response([tile('custom00001', 'Keep my title')])));
    await waitFor(() => p.fetched.length === 1, 2000);
    await wait(400);
    const s = shown(p.win, 'custom00001');
    t(
      'Crowdsourced titles off: the title stays; a trusted thumbnail is still shown',
      s.title === 'Keep my title' && s.small,
      JSON.stringify(s)
    );
  }
  {
    const p = boot({ dearrowCrowdThumbnails: false });
    await wait(50);
    render(
      p.win,
      p.win.JSON.parse(response([tile('custom00001', 'X'), tile('downvoted01', 'Original title')]))
    );
    await waitFor(() => shown(p.win, 'custom00001').title === 'the iPhone review', 2000);
    await wait(400);
    const a = shown(p.win, 'custom00001');
    const b = shown(p.win, 'downvoted01');
    t(
      "Crowdsourced thumbnails off: YouTube's thumbnails stay (no random frame either); titles still change",
      a.thumb.indexOf('/vi/custom00001/hqdefault.jpg') !== -1 &&
        b.thumb.indexOf('/vi/downvoted01/hqdefault.jpg') !== -1 &&
        !p.images.length,
      JSON.stringify([a, b, p.images])
    );
  }
  {
    const p = boot({ dearrowThumbnailFallback: 'end' });
    await wait(50);
    render(p.win, p.win.JSON.parse(response([tile('downvoted01', 'Original title')])));
    await waitFor(() => shown(p.win, 'downvoted01').small, 2000);
    t(
      "End frame: YouTube's hq3, and no random frame asked for",
      shown(p.win, 'downvoted01').thumb.indexOf('/vi/downvoted01/hq3.jpg') !== -1 &&
        !p.images.some((u) => u.indexOf('getThumbnail') !== -1),
      shown(p.win, 'downvoted01').thumb
    );
  }
  // ---- the DeArrow badge beside "4K" ---------------------------------------------------
  {
    const MARK = '◉';
    // A tile as YouTube sends it with its metadata lines: the channel, then "4K" and the views.
    const lined = (id, title, fourK) => {
      const x = tile(id, title);
      x.tileRenderer.metadata.tileMetadataRenderer.lines = [
        { lineRenderer: { items: [{ lineItemRenderer: { text: { simpleText: 'Channel' } } }] } },
        {
          lineRenderer: {
            items: (fourK
              ? [
                  {
                    lineItemRenderer: {
                      badge: {
                        metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_SIMPLE', label: '4K' }
                      }
                    }
                  }
                ]
              : []
            ).concat([{ lineItemRenderer: { text: { simpleText: '1.2m views' } } }])
          }
        }
      ];
      return x;
    };
    const p = boot({});
    await wait(50);
    // Parsed before any answer: the badge must reach these stored tiles once the answers land.
    const stored = p.win.JSON.parse(
      response([lined('custom00001', 'Clickbait', true), lined('norandom001', 'Plain', false)])
    );
    // Drawn before the answers, the way webOS 25's YouTube draws a classic tile (captured
    // on the TV): the lines are ytlr-line, "4K" a yt-badge.
    const early = p.win.document.createElement('ytlr-tile-renderer');
    early.innerHTML =
      '<ytlr-thumbnail-details style="background-image: url(&quot;https://i.ytimg.com/vi/custom00001/hqdefault.jpg&quot;)"></ytlr-thumbnail-details>' +
      '<ytlr-tile-metadata-renderer><div><yt-formatted-string>Clickbait</yt-formatted-string></div>' +
      '<ytlr-line><yt-formatted-string>Channel</yt-formatted-string></ytlr-line>' +
      '<ytlr-line><yt-badge><yt-core-attributed-string>4K</yt-core-attributed-string></yt-badge>' +
      '<yt-formatted-string>1.2m views</yt-formatted-string></ytlr-line></ytlr-tile-metadata-renderer>';
    p.win.document.querySelector('ytlr-app').appendChild(early);
    const items = (o, i) =>
      o.contents[i].tileRenderer.metadata.tileMetadataRenderer.lines[1].lineRenderer.items;
    const labels = (list) =>
      list.map((it) =>
        it.lineItemRenderer.badge
          ? it.lineItemRenderer.badge.metadataBadgeRenderer.label
          : it.lineItemRenderer.text.simpleText
      );
    await waitFor(() => labels(items(stored, 0)).indexOf(MARK) !== -1, 2000);
    t(
      'a changed video: the DeArrow badge goes right after "4K", before the views',
      JSON.stringify(labels(items(stored, 0))) === JSON.stringify(['4K', MARK, '1.2m views']),
      JSON.stringify(labels(items(stored, 0)))
    );
    t(
      'with the same style as the "4K" badge YouTube sent',
      items(stored, 0)[1].lineItemRenderer.badge.metadataBadgeRenderer.style ===
        'BADGE_STYLE_TYPE_SIMPLE'
    );
    t(
      'a tile parsed before the answer gets it too, for the next time YouTube draws it',
      labels(items(stored, 0)).indexOf(MARK) === 1
    );
    await wait(300);
    // norandom001 has nothing crowdsourced: its thumbnail is the auto-generated
    // frame, a fallback, which the badge does not mark (it would be on every tile).
    t(
      'a video with only a fallback thumbnail gets no badge',
      labels(items(stored, 1)).indexOf(MARK) === -1 &&
        stored.contents[1].tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.indexOf(
          'SMALL#'
        ) !== -1,
      JSON.stringify(labels(items(stored, 1)))
    );

    // On screen: YouTube draws the badge (a pill around the mark); the sweep draws the logo.
    const tileEl = p.win.document.createElement('ytlr-tile-renderer');
    tileEl.innerHTML =
      '<ytlr-thumbnail-details style="background-image: url(&quot;https://i.ytimg.com/vi/custom00001/hqdefault.jpg&quot;)"></ytlr-thumbnail-details>' +
      '<ytlr-tile-metadata-renderer><div><yt-formatted-string>Clickbait</yt-formatted-string></div>' +
      '<div class="line"><span class="pill"><span class="txt">4K</span></span>' +
      '<span class="pill" id="da"><span class="txt">' +
      MARK +
      '</span></span><span>1.2m views</span></div></ytlr-tile-metadata-renderer>';
    p.win.document.querySelector('ytlr-app').appendChild(tileEl);
    press(p.win, KEYS.DOWN, p.win.document.body);
    await wait(400);
    const leaf = tileEl.querySelector('#da .txt');
    t(
      'on screen the mark gets the logo, drawn over it',
      leaf.classList.contains('ytng-dearrow-badge') &&
        /^url\("?data:image\/png/.test(leaf.style.backgroundImage),
      leaf.className + ' ' + leaf.style.backgroundImage.slice(0, 40)
    );
    t('and the badge shows', tileEl.querySelector('#da').style.display === '');
    const earlyLine = early.querySelectorAll('ytlr-line')[1];
    t(
      'on screen: a tile drawn before the answer gets the title, and the badge after its "4K"',
      early.querySelector('yt-formatted-string').textContent === 'the iPhone review' &&
        earlyLine.children.length === 3 &&
        earlyLine.children[1].tagName === 'YT-BADGE' &&
        earlyLine.children[1].textContent === MARK &&
        earlyLine.children[1].querySelector('.ytng-dearrow-badge') !== null,
      early.querySelector('yt-formatted-string').textContent +
        ' / ' +
        Array.from(earlyLine.children).map((x) => x.tagName + ':' + x.textContent).join(' ')
    );

    // The badge switched off in the panel: hidden at once, and out of the stored responses.
    openPanel(p);
    openDeArrowTab(p.win).click();
    const badgeBox = Array.from(p.win.document.querySelectorAll('#ytng-page-dearrow label')).find(
      (l) => /Show the DeArrow logo/.test(l.textContent)
    );
    t(
      'setup: the page has the badge row, on by default',
      !!badgeBox && badgeBox.querySelector('input').checked
    );
    badgeBox.querySelector('input').click();
    await wait(400);
    t(
      'badge off: the badge on screen is hidden',
      tileEl.querySelector('#da').style.display === 'none'
    );
    t(
      'badge off: the copied badge is gone',
      earlyLine.children.length === 2 && earlyLine.textContent.indexOf(MARK) === -1,
      Array.from(earlyLine.children).map((x) => x.tagName + ':' + x.textContent).join(' ')
    );
    t(
      'badge off: the stored response is back to "4K" and the views',
      JSON.stringify(labels(items(stored, 0))) === JSON.stringify(['4K', '1.2m views']),
      JSON.stringify(labels(items(stored, 0)))
    );
    t(
      'badge off: the DeArrow title stays',
      stored.contents[0].tileRenderer.metadata.tileMetadataRenderer.title.simpleText ===
        'the iPhone review'
    );
  }

  // ---- webOS 25's YouTube: shelves and grids are lockupViewModel ----------------------
  {
    const MARK = '◉';
    /** A video lockup as webOS 25's YouTube sends it (captured on the TV), its length on the thumbnail. */
    const lockup = (id, title, opts) => {
      const o = opts || {};
      const rows = [
        { metadataParts: [{ text: { content: 'Channel' } }] },
        { metadataParts: [{ text: { content: '1.2m views' } }, { text: { content: '1 day ago' } }] }
      ];
      if (o.fourK) {
        rows[1].badges = [
          { badgeViewModel: { badgeText: '4K', badgeStyle: 'BADGE_DEFAULT', trackingParams: 'x' } }
        ];
      }
      const titleObj = { content: title };
      if (o.styled) titleObj.styleRuns = [{ startIndex: 0, length: title.length }];
      return {
        lockupViewModel: {
          contentImage: {
            thumbnailViewModel: {
              image: {
                sources: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 320, height: 180 }]
              },
              overlays: [
                {
                  thumbnailBottomOverlayViewModel: {
                    badges: [{ thumbnailBadgeViewModel: { text: o.length || '1:40' } }]
                  }
                }
              ]
            }
          },
          metadata: {
            lockupMetadataViewModel: {
              title: titleObj,
              metadata: { contentMetadataViewModel: { metadataRows: rows, delimiter: ' • ' } }
            }
          },
          contentId: id,
          contentType: o.type || 'LOCKUP_CONTENT_TYPE_VIDEO',
          rendererContext: {
            commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: id } } } }
          }
        }
      };
    };
    /**
     * Draws a lockup the way webOS 25's YouTube does: <thumbnail><div><image> with the
     * background, the title, the rows with their badges. Made with createElement: the
     * HTML parser would turn <image> into <img>.
     */
    const drawLockup = (win, lv, opts) => {
      const o = opts || {};
      const d = win.document;
      const make = (tag, parent, txt) => {
        const el = d.createElement(tag);
        if (txt !== undefined) el.textContent = txt;
        if (parent) parent.appendChild(el);
        return el;
      };
      const el = make('yt-lockup-view-model');
      el.setAttribute('data-test-id', lv.contentId);
      const image = make('image', make('div', make('thumbnail', el)));
      image.style.backgroundImage = `url("${lv.contentImage.thumbnailViewModel.image.sources[0].url}")`;
      // The horizontal layout (a shelf of wide tiles) wraps the text in a div.
      const outer = make('yt-lockup-metadata-view-model', el);
      const meta = o.horizontal ? make('div', outer) : outer;
      if (o.lead) make('yt-core-attributed-string', meta, o.lead);
      make('yt-core-attributed-string', meta, lv.metadata.lockupMetadataViewModel.title.content);
      const rowsEl = make('yt-content-metadata-view-model', meta);
      lv.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows.forEach((row) => {
        const r = make('yt-metadata-row', rowsEl);
        (row.badges || []).forEach((b) => {
          make('yt-core-attributed-string', make('yt-badge', r), b.badgeViewModel.badgeText);
        });
        row.metadataParts.forEach((part) => {
          make('yt-core-attributed-string', make('yt-metadata-part', r), part.text.content);
        });
      });
      d.querySelector('ytlr-app').appendChild(el);
      return el;
    };
    const onScreen = (el, at) => {
      const bg = el.querySelector('thumbnail image').style.backgroundImage;
      return {
        title: el.querySelectorAll('yt-lockup-metadata-view-model yt-core-attributed-string')[at || 0]
          .textContent,
        thumb: decodeURIComponent(bg),
        small: bg.indexOf('SMALL#') !== -1
      };
    };

    const p = boot({});
    await wait(50);
    const text = response([
      lockup('custom00001', 'Clickbait', { fourK: true, styled: true }),
      lockup('downvoted01', 'Original title'),
      lockup('lockdur0001', 'Length from the badge', { length: '2:00' }),
      lockup('custom00002', 'Plain row', {}),
      lockup('short000001', 'A short', { type: 'LOCKUP_CONTENT_TYPE_SHORT' })
    ]);
    const stored = p.win.JSON.parse(text);
    const lv = (i) => stored.contents[i].lockupViewModel;
    const titleOf = (i) => lv(i).metadata.lockupMetadataViewModel.title;
    const rowBadges = (i) =>
      lv(i).metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows[1].badges;
    const badgeTexts = (i) => (rowBadges(i) || []).map((b) => b.badgeViewModel.badgeText);
    const els = [0, 1, 2, 3].map((i) => drawLockup(p.win, lv(i)));
    // Drawn before the answers too: custom00001 again in a wide shelf, and custom00002
    // behind a label that is not its title.
    const wide = drawLockup(p.win, lv(0), { horizontal: true });
    const led = drawLockup(p.win, lv(3), { lead: 'Up next' });
    // A localized thumbnail (Russian UI): YouTube's /vi_lc/ path, with the id all the same.
    const localized = drawLockup(p.win, lv(0));
    localized.querySelector('thumbnail image').style.backgroundImage =
      'url("https://i.ytimg.com/vi_lc/custom00001/hqdefault_ru.jpg?sqp=CJDf")';
    await waitFor(() => onScreen(els[0]).small && badgeTexts(3).length, 3000);
    await wait(400);

    const a = onScreen(els[0]);
    t('lockup: the crowdsourced title on screen', a.title === 'the iPhone review', a.title);
    t(
      'lockup: the submitted thumbnail on screen, as a small copy',
      a.small && a.thumb.indexOf('getThumbnail?videoID=custom00001&time=12.5') !== -1,
      a.thumb
    );
    t(
      'lockup: the stored response has the title, without the style ranges of the old one',
      titleOf(0).content === 'the iPhone review' && titleOf(0).styleRuns === undefined,
      JSON.stringify(titleOf(0))
    );
    t(
      'lockup: and the thumbnail',
      lv(0).contentImage.thumbnailViewModel.image.sources[0].url.indexOf('SMALL#') !== -1,
      lv(0).contentImage.thumbnailViewModel.image.sources[0].url.slice(0, 60)
    );
    t(
      'lockup: the DeArrow badge goes after "4K", in its style',
      JSON.stringify(badgeTexts(0)) === JSON.stringify(['4K', MARK]) &&
        rowBadges(0)[1].badgeViewModel.badgeStyle === 'BADGE_DEFAULT' &&
        rowBadges(0)[1].badgeViewModel.trackingParams === undefined,
      JSON.stringify(rowBadges(0))
    );
    t(
      'lockup: a row without badges gets the DeArrow badge as its first',
      JSON.stringify(badgeTexts(3)) === JSON.stringify([MARK]) && onScreen(els[3]).title === 'Honest title',
      JSON.stringify(badgeTexts(3)) + ' ' + onScreen(els[3]).title
    );
    t("lockup: a downvoted title stays YouTube's", onScreen(els[1]).title === 'Original title');
    t('lockup: a fallback thumbnail alone gets no badge', rowBadges(1) === undefined);
    t(
      "lockup: the random frame's time uses the length on the thumbnail (0.5 x 2:00)",
      p.images.some((u) => u.indexOf('videoID=lockdur0001&time=60') !== -1),
      p.images.filter((u) => u.indexOf('lockdur0001') !== -1).join(' ')
    );
    t('lockup: Shorts are left alone', !p.fetched.some((u) => u.indexOf('short000001') !== -1));
    const again = p.win.JSON.parse(text);
    t(
      'lockup: a known video is rewritten inside JSON.parse',
      again.contents[0].lockupViewModel.metadata.lockupMetadataViewModel.title.content ===
        'the iPhone review'
    );

    t(
      'lockup: a wide shelf tile (title in a div) gets the title too',
      onScreen(wide).title === 'the iPhone review' && onScreen(wide).small,
      onScreen(wide).title
    );
    t(
      'lockup: a tile with a localized thumbnail (/vi_lc/) gets the title and thumbnail too',
      onScreen(localized).title === 'the iPhone review' && onScreen(localized).small,
      onScreen(localized).title + ' ' + onScreen(localized).thumb.slice(0, 60)
    );
    t(
      'lockup: only the title is replaced, not a label before it',
      onScreen(led, 0).title === 'Up next' && onScreen(led, 1).title === 'Honest title',
      onScreen(led, 0).title + ' / ' + onScreen(led, 1).title
    );
    // Drawn before the answer: YouTube does not draw the tile again, so the badge is a copy
    // of the tile's own "4K" put after it, with the logo.
    const copies = (el) => Array.from(el.querySelectorAll('yt-badge')).filter((b) => b.textContent === MARK);
    const c0 = copies(els[0]);
    const row0 = els[0].querySelectorAll('yt-metadata-row')[1];
    t(
      'lockup on screen: a tile drawn before the answer gets the badge, after its "4K"',
      c0.length === 1 &&
        row0.children[0].textContent === '4K' &&
        row0.children[1] === c0[0] &&
        c0[0].querySelector('.ytng-dearrow-badge') !== null,
      Array.from(row0.children).map((x) => x.tagName + ':' + x.textContent).join(' ')
    );
    const c3 = copies(els[3]);
    const row3 = els[3].querySelectorAll('yt-metadata-row')[1];
    t(
      'lockup on screen: a row without badges gets it first, in a badge of the page',
      c3.length === 1 && row3.firstChild === c3[0],
      Array.from(row3.children).map((x) => x.tagName + ':' + x.textContent).join(' ')
    );
    t('lockup on screen: no badge for a fallback thumbnail alone', copies(els[1]).length === 0);
    for (const x of c0.concat(c3)) x.parentNode.removeChild(x);

    // YouTube draws the badge from the stored response; the sweep puts the logo on it.
    const row = els[0].querySelectorAll('yt-metadata-row')[1];
    const pill = p.win.document.createElement('yt-badge');
    const label = p.win.document.createElement('yt-core-attributed-string');
    label.textContent = MARK;
    pill.appendChild(label);
    row.insertBefore(pill, row.querySelector('yt-metadata-part'));
    press(p.win, KEYS.DOWN, p.win.document.body);
    await wait(400);
    t(
      'lockup: on screen the mark gets the logo',
      label.classList.contains('ytng-dearrow-badge') && pill.style.display === '',
      label.className + ' ' + pill.style.display
    );
    t('lockup: with the badge YouTube drew, no copy is added', copies(els[0]).length === 1);
    // YouTube reuses that badge for other text ("New", another video's): the logo comes off
    // it, and the tile, without a mark now, gets its copy again; drawn again, the copy goes.
    label.textContent = 'New';
    press(p.win, KEYS.DOWN, p.win.document.body);
    await wait(400);
    t(
      'lockup: a badge YouTube reused for other text loses the logo',
      !label.classList.contains('ytng-dearrow-badge') &&
        label.style.backgroundImage === '' &&
        pill.style.display === '',
      label.className + ' ' + label.style.backgroundImage.slice(0, 20) + ' ' + pill.style.display
    );
    t(
      'lockup: and the tile gets its copy again',
      copies(els[0]).length === 1 && copies(els[0])[0] !== pill,
      copies(els[0]).length
    );
    label.textContent = MARK;
    press(p.win, KEYS.DOWN, p.win.document.body);
    await wait(400);
    t(
      'lockup: drawn again by YouTube, the copy goes',
      copies(els[0]).length === 1 &&
        copies(els[0])[0] === pill &&
        label.classList.contains('ytng-dearrow-badge'),
      copies(els[0]).length
    );

    // DeArrow off in the panel: YouTube's own back, on screen and in the stored response.
    openPanel(p);
    openDeArrowTab(p.win).click();
    p.win.document.querySelector('#ytng-page-dearrow input[type="checkbox"]').click();
    await wait(400);
    const off = onScreen(els[0]);
    t("lockup off: YouTube's title back on screen", off.title === 'Clickbait', off.title);
    t(
      'lockup off: and its thumbnail',
      !off.small && off.thumb.indexOf('/vi/custom00001/hqdefault.jpg') !== -1,
      off.thumb
    );
    t('lockup off: the badge on screen is hidden', pill.style.display === 'none');
    t(
      'lockup off: the copied badges are gone',
      copies(els[3]).length === 0 && copies(wide).length === 0,
      copies(els[3]).length + ' ' + copies(wide).length
    );
    t("lockup off: the wide tile's title is back", onScreen(wide).title === 'Clickbait');
    t(
      "lockup off: the stored response is YouTube's again",
      titleOf(0).content === 'Clickbait' &&
        Array.isArray(titleOf(0).styleRuns) &&
        lv(0).contentImage.thumbnailViewModel.image.sources[0].url.indexOf('/vi/custom00001/hqdefault.jpg') !== -1 &&
        JSON.stringify(badgeTexts(0)) === JSON.stringify(['4K']),
      JSON.stringify([titleOf(0), badgeTexts(0), lv(0).contentImage.thumbnailViewModel.image.sources[0].url.slice(0, 50)])
    );
    t('lockup off: a row that had no badges has none again', rowBadges(3) === undefined, JSON.stringify(rowBadges(3)));
    // Off, YouTube reuses the hidden badge for other text: it shows at the next key press.
    label.textContent = '4K';
    press(p.win, KEYS.DOWN, p.win.document.body);
    await wait(400);
    t(
      'lockup off: a hidden badge YouTube reused for other text shows again',
      pill.style.display === '' && !label.classList.contains('ytng-dearrow-badge'),
      pill.style.display + ' ' + label.className
    );
  }

  // ---- data URLs (no toBlob, webOS 3/4): 4 MB of them, then everything starts over ---------
  {
    const p = boot({ dearrowThumbnailFallback: 'start' });
    await wait(50);
    const many = Array.from({ length: 151 }, (_, i) =>
      tile('many' + String(i).padStart(7, '0'), 'Many ' + i)
    );
    render(p.win, p.win.JSON.parse(response(many)));
    await waitFor(() => shown(p.win, 'many0000150').small, 5000);
    t('setup: 151 videos drawn as data URL copies', shown(p.win, 'many0000000').small);
    // The next response finds about 5.9 MB of copies kept: the originals come back first.
    p.win.JSON.parse(response([tile('custom00001', 'Fresh')]));
    t(
      'past 4 MB of data URL copies the next response starts over: originals back on screen',
      shown(p.win, 'many0000000').thumb.indexOf('/vi/many0000000/hqdefault.jpg') !== -1 &&
        !shown(p.win, 'many0000000').small,
      shown(p.win, 'many0000000').thumb
    );
    await waitFor(() => p.fetched.some((u) => u.indexOf('custom00001') !== -1), 2000);
    t(
      "and the response's own video is looked up as new",
      p.fetched.some((u) => u.indexOf('custom00001') !== -1)
    );
  }

  // ---- the copies' size follows Max Thumbnail Quality (blobs, webOS 5 and later) ----------
  {
    /** The sizes drawn for a submitted 1280x720 frame and a 480x360 hq1 under `cfg`. */
    const sizes = async (cfg) => {
      const p = boot(Object.assign({ dearrowThumbnailFallback: 'start' }, cfg), true);
      await wait(50);
      render(
        p.win,
        p.win.JSON.parse(response([tile('custom00001', 'A'), tile('nosubmit001', 'B')]))
      );
      await waitFor(
        () => shown(p.win, 'custom00001').small && shown(p.win, 'nosubmit001').small,
        2000
      );
      const of = (part) =>
        p.draws.filter((d) => d.src.indexOf(part) !== -1).map((d) => d.w + 'x' + d.h);
      return { p, of, frame: of('getThumbnail').join(), hq: of('i.ytimg.com').join() };
    };
    const off = await sizes({});
    t(
      "Max Thumbnail Quality off: copies at hqdefault's size (480x270)",
      off.frame === '480x270' && off.hq === '480x270',
      JSON.stringify([off.frame, off.hq])
    );
    t(
      'as blob URLs where canvas has toBlob',
      shown(off.p.win, 'custom00001').thumb.indexOf('url("blob:') === 0,
      shown(off.p.win, 'custom00001').thumb
    );
    const safe = await sizes({ upgradeThumbnails: true, thumbnailQualityMode: 'safe' });
    t(
      "Original: maxresdefault's size (1280x720)",
      safe.frame === '1280x720',
      JSON.stringify([safe.frame, safe.hq])
    );
    const fast = await sizes({ upgradeThumbnails: true, thumbnailQualityMode: 'eager' });
    t(
      'Fast: 1280x720, and a 480-wide hq1 is never drawn bigger than it is',
      fast.frame === '1280x720' && fast.hq === '480x270',
      JSON.stringify([fast.frame, fast.hq])
    );
    // Max Thumbnail Quality switched off in the panel draws the copies again at its size.
    const w = fast.p.win;
    openPanel(fast.p);
    const mtq = Array.from(w.document.querySelectorAll('#ytng-page-main label')).find(
      (l) => /Max Thumbnail Quality/.test(l.textContent)
    );
    t('setup: the panel has the Max Thumbnail Quality row, on', !!mtq && mtq.querySelector('input').checked);
    if (mtq) mtq.querySelector('input').click();
    await waitFor(() => fast.of('getThumbnail').indexOf('480x270') !== -1, 2000);
    t(
      'Max Thumbnail Quality off draws the copies again at its size (480x270)',
      fast.of('getThumbnail').indexOf('480x270') !== -1,
      fast.of('getThumbnail').join()
    );
  }

  // ---- Title Case on YouTube's own titles (the webOS 22+ build) -----------------------
  if (modern) {
    const p = boot({ dearrowTitleFormatting: 'title_case' });
    await wait(50);
    render(
      p.win,
      p.win.JSON.parse(response([tile('norandom001', 'THIS IS THE BEST GPU EVER!!!')]))
    );
    await waitFor(() => shown(p.win, 'norandom001').title !== 'THIS IS THE BEST GPU EVER!!!', 2000);
    t(
      "Title Case: YouTube's shouting title is formatted as the extension does",
      shown(p.win, 'norandom001').title === 'This Is the Best Gpu Ever',
      shown(p.win, 'norandom001').title
    );
  }
  if (modern) {
    // Remove emojis and fancy text (on by default): the formatter maps the
    // letters through its fancy-text table, built on first use.
    const fancy = '\u{1D413}\u{1D407}\u{1D404} \u{1D401}\u{1D404}\u{1D412}\u{1D413} \u{1D406}\u{1D40F}\u{1D414}';
    const p = boot({ dearrowTitleFormatting: 'title_case' });
    await wait(50);
    render(p.win, p.win.JSON.parse(response([tile('norandom001', fancy)])));
    await waitFor(() => shown(p.win, 'norandom001').title !== fancy, 2000);
    t(
      'Fancy text: mathematical bold letters read as plain ones, then Title Case',
      shown(p.win, 'norandom001').title === 'The Best Gpu',
      shown(p.win, 'norandom001').title
    );
  }
  if (modern) {
    const p = boot({ dearrowTitleFormatting: 'title_case' });
    await wait(50);
    render(p.win, p.win.JSON.parse(response([tile('custom00001', 'Clickbait')])));
    await waitFor(() => shown(p.win, 'custom00001').title !== 'Clickbait', 2000);
    t(
      'Title Case formats crowdsourced titles too, keeping a ">" word as written',
      shown(p.win, 'custom00001').title === 'The iPhone Review',
      shown(p.win, 'custom00001').title
    );
  }
  if (modern) {
    const p = boot({ dearrowTitleFormatting: 'title_case', dearrowCrowdTitles: false });
    await wait(50);
    render(p.win, p.win.JSON.parse(response([tile('custom00001', 'SHOUTING ABOUT PHONES')])));
    await waitFor(() => shown(p.win, 'custom00001').title !== 'SHOUTING ABOUT PHONES', 2000);
    t(
      "Crowdsourced titles off with Title Case: YouTube's own title, formatted",
      shown(p.win, 'custom00001').title === 'Shouting About Phones',
      shown(p.win, 'custom00001').title
    );
  }
  if (!modern) {
    const p = boot({});
    await wait(50);
    openPanel(p);
    const labels = Array.from(
      p.win.document.querySelectorAll(
        '#ytng-page-dearrow .label-content, #ytng-page-dearrow .shortcut-label'
      )
    ).map((x) => x.textContent.trim());
    t(
      'the legacy DeArrow page: no formatting rows',
      labels.indexOf('Title formatting') === -1 &&
        labels.indexOf('Crowdsourced titles') !== -1 &&
        labels.indexOf('Without a crowdsourced thumbnail') !== -1,
      labels.join(' | ')
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
