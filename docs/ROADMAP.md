# Roadmap

What is left to do, most urgent first. Done items move to `CHANGELOG.md`.

## 1. Check 1.0.0 pre-release07 on a TV (COMPLETED)

Verified on LG OLED TV (webOS 24):

- [x] Install both ipks (webOS 3+ and webOS 22+); settings survive the update.
- [x] OLED start screen: turns black with the logo's move; without OLED mode nothing changes. Cold launches with OLED on and off, and from a deep link.
- [x] Deep links and casts: a `/watch?v=...` link still opens the video; a link to another youtube.com page opens the TV page.
- [x] webOS 22+: no request to Google Fonts at launch (DevTools Network); webOS 4 and older still get the Arabic and maths fonts.
- [x] Playback speed across a long session: does YouTube revoke its MediaSource URLs (the map is now capped at 8)? Speed still holds after 10+ videos.
- [x] Return YouTube Dislike: the count shows on the stats row and goes with RYD off; no `<style>` added or removed per video (Elements panel).
- [x] Comments and Description panels: rows keep their height after close and reopen; how many start-up retries the comments fix makes on a TV.
- [x] SponsorBlock: trace a video start and a replay. Progress bar lookup optimized, 1 observer while waiting, segments drawn and skips exact.
- [x] DevTools trace of a video change, before and after, for the restyles saved (stylesheet churn, comments fix).

## 2. TV checks never finished in earlier test runs

From the pre-release03 to pre-release06 runs, cut short or skipped:

- [ ] T5, T6, T9, T11, T12, T13, T14 of the TV test plan.
- [ ] T8 (background and return) through Hearth's own feed and after 10 minutes away.
- [ ] Network cut for 30 s at a changed speed (10 s passed).
- [ ] 50 fps video: back at 1x after a speed ladder it stayed at 720p for over a minute; check whether that is YouTube's choice.
- [ ] Physical HOME button (Hearth's home hook stops webOS Home; tested only by launching Hearth).
- [ ] First Green press after a long idle sometimes does not reach the app; one Green after Back on Home did not open the panel (not reproduced).
- [ ] Questions for the user from the reports (marked 👤): icon in Hearth's feed, start screen look.

Known, not ours: a deep link on a TV with no account lands on YouTube's "Add account" screen; webOS unloads web apps while its browser is open (the video position is lost).

## 3. Releases and repository

- [ ] The tag `v1.0.0-pre-release07` did not create a GitHub release: check that Actions are on for this repository and that `release.yml` ran.
- [ ] Turn on GitHub private vulnerability reporting (SECURITY.md points to it).
- [ ] Decide whether to rewrite old commit messages that name the test TV's model.
- [ ] Update the build tooling for `npm audit` (49 advisories, build only): webpack 5.112 needs `terser-webpack-plugin` declared (done); the bundles change, so it needs a TV check.
- [ ] Lint debt: `no-var` in `perf_mon.js` and `buffer-limit.js`; `prefer-object-has-own` conflicts with Chrome 38; `no-useless-assignment` and `no-empty` in `return-dislike.js`.

## 4. Later

- [ ] Profile SponsorBlock's work during playback on a TV (in jsdom it is half of the session's script time, mostly the bar lookup while the bar is missing).
- [ ] Keep `docs/perf.md` going: one change at a time, before and after numbers, kept or not.
