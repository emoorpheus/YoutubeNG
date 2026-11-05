# Changelog

Until the first GitHub release, 1.0.0, test builds are numbered 1.0.0 pre-release01, pre-release02 and so on. webOS takes numbers only, so on the TV each of them is 1.0.0; the settings heading and the file names carry the full name.

## Unreleased

- Start-up screen in OLED mode: it turns black in step with the logo's move, over the same 0.45 s. YouTube's logo picture has a grey of its own round it, so the whole screen is filtered as one: the grey goes to black round the logo and in its box alike, white and red stay as they are. It is grey until the app's script is in, as before: the webOS splash is a fixed picture, and the launcher page and YouTube's own start-up screen are drawn before the setting can be read. Without OLED mode nothing changes. A filter animation, which the compositor runs like the logo's move; each build is 0.6 KB bigger.
- Links from other apps and from casts open only YouTube's TV page. A link to another youtube.com page, a sign-out or a redirect to another site, used to open that page in the app; now only its query is kept, so a `/watch?v=...` link still opens the video. Such links come from other apps on the TV and from phones on the local network (DIAL). Each build is 0.1 KB bigger.
- webOS 3+ build: Google Fonts is asked for its Arabic and maths fonts only on webOS 4 and older, which lack them. On a newer webOS this build asked at every launch, for fonts it never used. 0.1 KB bigger.
- Playback speed: the hook that hands each video's MediaSource to the speed engine kept every one it was told of until YouTube revoked its URL; if YouTube never does, every video of the session stayed in memory, at a changed speed with its audio engine. It now keeps the 8 newest: it needs one only until the video takes it, moments later. Whether YouTube revokes is to be checked on a TV.
- Every video added a stylesheet to the page and removed it on leaving, Return YouTube Dislike's, even with RYD off; each time the TV collected the page's rules again and restyled it. Those rules are now in the app's one stylesheet, written at start-up, and match only the stats row RYD marks while its count is in. With OLED mode on, True Black kept every stylesheet it had swept, old ones included: with SponsorBlock's "time with skips" on, each video left one behind. Now they can go. The webOS 3+ build is 85 B smaller, the webOS 22+ one 46 B bigger.
- Comments fix: until it finds YouTube's rule for a closing panel it looks again every second, for up to 30 s, and each look read all of YouTube's style rules (some 3,700) again and rewrote its stand-in style. Now a look reads only stylesheets that are new or have grown, and the stand-in is written once. That counts in the first seconds, before YouTube's styles are in, and for the whole 30 s should YouTube rename its classes. 0.1 KB bigger.
- SponsorBlock: while the progress bar is not on the page (the start of a video, a replay), the app looks for it every 250 ms for 10 s, and each look added another observer of the whole app: 82 by the end, every one woken by every change on the screen, and each leaving an observer of its own on the bar's container for the rest of the video. One waits now. 0.2 KB bigger.
- Tests: `bench/start-screen-test.cjs` covers OLED mode (both builds); `bench/launch-test.cjs` checks that every launch ends on youtube.com/tv; new `bench/google-fonts-test.cjs`; new `bench/leak-soak-test.cjs` (both builds): 70 visits to videos and Home, with SponsorBlock, Return YouTube Dislike, thumbnail upgrades and DeArrow on, after which listeners, intervals, MutationObservers, frames and DOM nodes are as many as after the first 10; `bench/speed-engine-test.cjs` checks that 50 videos leave at most 8 MediaSources alive; new `bench/stylesheet-churn-test.cjs` (both builds): no stylesheet comes and goes with each video, and with OLED mode on the ones a video replaced are let go. New `bench/comments-fix-test.cjs` (both builds): the comments fix finds a closing rule that comes late, in a new stylesheet or in one already there, and its retries read an unchanged stylesheet once in all. New `bench/sponsorblock-bar-test.cjs` (both builds): while the progress bar is missing, the observers of the app do not grow in number; once it comes, the segments are drawn on its most specific form, with one observer on its container.
- Repository: a contributing guide, a security policy that also lists what the app sends where, issue and pull request templates. terser-webpack-plugin, which the build imports, is a declared dev dependency now: newer webpack no longer brings it along, so updating the build tools broke the build. A release's notes are its section of this file, and it carries a `SHA256SUMS` of the installers; CI also runs `bench/run-all.sh`. The docs no longer name the test TV's model or firmware.

## 1.0.0 pre-release06

Fixes from the pre-release05 test on a webOS 25 TV.

- "Who's watching?": on a TV with no account, a video opened from outside the app (a link, a cast) now plays as guest; the screen used to open Google sign-in, because OK landed on "Add account". OK is pressed only once the focus is on the guest button or on the account being resumed; if it never gets there, the screen is left to the remote. While it is skipped the screen is transparent rather than removed, so Down reaches the guest button: before, Down went nowhere and a guest on a TV with accounts was signed in to the first one. On webOS 25 a guest is recognised as one, so Guest Mode: Hide Sign-in Buttons is offered again.
- SponsorBlock: on webOS 25 a skip takes 0.5 to 2.5 s to finish, the longer ones at 1.25×, and the check that covers a lost `seeked` event gave up on it after 1.5 s: it logged "'seeked' never fired after skip" and reset the skip while the seek was still under way. It now waits as long as the video is still seeking, up to 10 s. The skips themselves land on the segment's end, at 1× and at 1.25× alike.
- Start-up: grey from the first frame. The webOS splash is YouTube's start-up grey (#282828), not black, and so is the app's launcher page, which now leaves for YouTube only once it has been painted. Before, the screen was black for 0.6 to 0.75 s at every launch, until YouTube drew its logo; now a short black flash is left in about half the launches, where webOS swaps its splash for the app's window (in nearly every launch if the page leaves before it is painted). Then YouTube's start-up screen grows into the app's: the logo moves up and shrinks to three quarters, and NEXT-GEN comes in under it. YouTube draws its logo some 0.4 s before the app's script is in, so the screen starts as YouTube's own; one YouTube draws another way is left alone. Only transform and opacity animate; Home comes as soon as before (median 2.1 s after launch, before and after). Each build is 5.7 KB bigger, 3.6 KB of that the NEXT-GEN picture.
- Tests: new `bench/auto-login-test.cjs`, `bench/sponsorblock-skip-test.cjs` and `bench/start-screen-test.cjs` (all on both builds); `bench/launch-test.cjs` checks when the launcher page leaves.

## 1.0.0 pre-release05

Brought over from youtube-webos 0.8.5 beta 2, plus small fixes.

- DeArrow (new tab, off by default): crowd-sourced titles and thumbnails instead of clickbait, from dearrow.ajay.app. Titles can be re-cased (Title Case, Sentence case and others) and cleaned of emoji; where there is no crowd thumbnail it shows a frame from the video (random, start, middle or end), the original thumbnail or a blank; an optional badge marks what DeArrow replaced. Here it also works on the newer tiles webOS 25's YouTube draws in search and on Home, tiles already on screen when the answer comes included.
- Display Time (Main → Interface): Off, Time, or Date + Time. The clock moves to the next minute on time and is right again after the app comes back. The old on/off setting carries over (on → Time). The clock is off by default.
- Ad block: the filters that depend on it (Tracking Block, Shorts, live streams and the others greyed out with it) now really are off while Ad block is off; before, some of them still worked.
- Return YouTube Dislike: 999,950 and up reads as 1m, not 1000k.
- Settings panel, arrow keys: Down from the SponsorBlock or DeArrow tab lands on the tab's own checkbox, the first row; before, it skipped the checkbox rows and went to the first setting with arrows (Sponsor, Title formatting). Down from the right-hand column of Cosmetic Filtering goes to the row right below it, not to Force Video Codec. A move measures a checkbox by its whole row, not by its small box. Up from the DeArrow tab goes round to the page's last row; it stayed on the tab.
- Startup: the spatial-navigation polyfill is gone (nothing used it since the settings panel moves its own focus), and every stylesheet goes into the page in one `<style>`, not one each. On webOS 22+, DeArrow's fancy-text table is built when a title first needs it, not at start-up. The webOS 3 build is 25 KB smaller, the webOS 22+ one 24 KB (see `docs/perf.md`).
- Emoji fix (webOS 3 and 4): the walk over a response no longer looks for text in arrays, which never have any, and a title split around an emoji is copied without `Object.assign` (webOS 3 has none of its own). The response hook costs some 8 % less, a fifth less on a page with emoji in every title.
- Tools: the installer names live in `tools/ipk-name.cjs`; `npm run version:sync` keeps `assets/appinfo.json`'s line endings, so it no longer rewrites the whole file.
- Tests: new `bench/clock-test.cjs`, `bench/dearrow-test.cjs` and `bench/panel-nav-test.cjs` (all on both builds); the thumbnail tests follow the response hook; `bench/run-all.sh` passes.

## 1.0.0 pre-release04

Fixes from the pre-release03 test on a webOS 25 TV.

- Back from Home or another app the video waits paused, also when YouTube unloads it in the background. YouTube drops the video right after the app is hidden and on return loads it again, at the same spot and speed, and starts it; that restart is now paused once. Play continues. webOS stops the video a moment before the app is hidden, and YouTube suspends its player on hide before the app's own listener ran; both hid that it had been playing.
- Docs: what NG stands for (new-gen); the project is built with AI coding agents, their instructions are in `AGENTS.md` and `CLAUDE.md`.

## 1.0.0 pre-release03

Fixes from the pre-release02 test on a webOS 25 TV.

- Playback speed holds on 50 fps VP9 videos. Only appends that start an init segment are parsed now; media chunks go to the TV untouched. They are cut anywhere, and about 2 % of WebM ones read as an impossible element size, which dropped the speed to 1× with "Playback speed not available".
- Back from Home or another app the video waits paused, at the same spot and speed. If the speed engine loses its audio decoder or AudioContext in the background, it is rebuilt on return; before, that counted as a failure: the speed went to 1× and the reload started the video playing. A decoder the browser reclaims is rebuilt the same way (three times a minute at most). The cause of any fall back to 1× is now in the TV console (`[Speed] …`).
- Screensaver on pause: OK, Play and Play/Pause resume the video in the same press (Play took two); other keys only bring the picture back. The key that woke it is logged (`[PauseSaver] woken by key …`).
- Start-up: black, then YouTube's own start-up screen (grey with its logo) as YouTube draws it, then the home screen. YouTube's page paints that screen before the app's script is in, so it cannot be changed; the NG picture around it (webOS splash and the recoloured screen) made the launch switch looks twice. The webOS splash is plain black, the OLED mode leaves YouTube's start-up screen alone.
- Icon: red button with a white triangle (variant J). In Hearth's "dark mono" style it is a solid button with the triangle cut out.
- Tests: `bench/run-all.sh` fails when a test fails or crashes (after a fresh `npm ci` every test crashed on the missing jsdom and the run still passed); jsdom is a dev dependency; new `bench/speed-engine-test.cjs`.

## 1.0.0 pre-release02

Fixes from the pre-release01 test on a webOS 25 TV. On the TV this build showed version 1.1.0.

- OLED mode covers the player: the progress bar is red with a lighter buffered part, the round buttons, pills, search box and keyboard keys are near-black #1a1a1a instead of grey #373737; focus still turns them white. Colours are swapped inside YouTube's own rules, so nothing depends on its class names.
- Start-up screen: with OLED mode on, YouTube's grey loading screen is black with the YouTube Next-Gen logo and name; the webOS splash image is the same picture.
- Screensaver on pause (Main → Interface): after 1 minute (30 s, 1, 2, 5 min or off) a paused or finished video is covered with black showing only a dim clock and the app name, moving every 20 s. Any key brings the video back without acting on it; Play / Pause resume at once. The webOS screensaver used to take about 3 minutes.
- The video pauses when the app goes to the background (Home, another app). It used to play on unseen: autoplay moved on and a different video was showing on return.
- Icon: the play triangle has a red rim and is 25 % bigger, so in Hearth's "dark mono" style it stays a clean outlined triangle instead of breaking into pixels. The launcher mock-up in `design/icons/` shows that style too.
- Playback speed: 1.25× is held at 1080p as well (before: only above 1.25×) — 2160p at 50/60 fps could not keep up there and YouTube fell back to 480p.

## 1.0.0 pre-release01

First version of YouTube Next-Gen, built on youtube-webos (NicholasBly 0.8.4) with playback speed from the Schmiddisen fork.

- Separate app: ID `youtube.nextgen`, title "YouTube Next-Gen"; installs next to the official YouTube.
- Interface in English and Russian: settings, notifications, SponsorBlock, first-launch hint. Follows YouTube's language by default; **Interface language** in Main → Interface switches it at once.
- "YouTube Next-Gen" item at the top of YouTube's own Settings opens the panel, so colour buttons are not needed.
- One-time first-launch hint showing where the settings are; no per-launch toast.
- Remote **Back** closes the settings panel (as do Esc and the green button).
- OLED true-black mode and a minimal settings panel.
- New icon (variant C, "OLED outline"); nine variants and a launcher mock-up in `design/icons/`, one script draws them all.
- Translations are plain data files: `src/i18n/template.js` has every English text, `tools/i18n.cjs` starts a new language, syncs and checks it (`npm run i18n:check`, also in CI); how to translate with an AI chat in `TRANSLATING.md`.
- The settings heading shows the version.
- From youtube-webos 0.8.5 beta 2 (NicholasBly; see `docs/upstream.md`):
  - SponsorBlock keeps working after switching to another app and back (PR #197).
  - Home screen rows are no longer dropped with Reduce Telemetry (PR #196).
  - A video frozen after a video screensaver recovers in seconds (PR #198).
  - Playback speed: above 1.25× Force Max Quality waits and the next video is held at 1080p too; after a speed change the position is kept on webOS 25; fixes in the speed engine (audio memory, cleanup, errors).
- Two installers: `_all.ipk` (webOS 3+) and `_all_webOS22+.ipk` (webOS 22+, smaller); `npm run package:all` builds both.
- Smaller package: images re-encoded (preview 29 → 9 KB, splash 11 KB → 0.3 KB, Settings picture 13 → 2.5 KB); 146 KB → 119 KB, 92 KB for webOS 22+.
