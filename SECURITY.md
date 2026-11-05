# Security

## Reporting a problem

Please do not open a public issue. Report it privately on GitHub: the repository's **Security** tab → **Report a vulnerability**. Say what an attacker could do, on which app version and installer, and how to reproduce it. Leave your own private data out (cookies, tokens, account names).

This is a spare-time project: expect an answer within two weeks. A fix goes out with the next release or pre-release, and the report is credited unless you would rather not.

## Supported versions

Fixes go into the latest release and pre-release only.

## Scope

In scope: the code in this repository, that is the launcher page, the script the app injects into `youtube.com/tv`, and the build and release workflows.

Out of scope: YouTube, webOS, and the services the app talks to (SponsorBlock, DeArrow, Return YouTube Dislike); please report those to their owners. Developer Mode and root access on the TV are the owner's choice and outside the app.

## What the app sends, and where

Settings stay on the TV, in the app's storage for youtube.com. The app has no analytics and no server of its own; it reads YouTube's language cookie to pick its own language and sends it nowhere. Besides YouTube's own servers (thumbnails from i.ytimg.com, logos from www.gstatic.com), these are all it talks to, over HTTPS and without YouTube's cookies; like any request, each shows the TV's IP address to the server.

| Feature | Sent | To |
|---|---|---|
| SponsorBlock (on by default) | the first 4 characters of the video ID's SHA-256: the answer covers many videos and the app picks its own, so the server is not told which one plays | sponsorblock.inf.re, sponsor.ajay.app if that fails |
| Return YouTube Dislike (on by default) | the ID of the video being watched | returnyoutubedislikeapi.com |
| DeArrow (off by default) | the IDs of the videos on screen | sponsor.ajay.app, dearrow-thumb.ajay.app |
| Fonts (webOS 4 and older) | requests for fonts for Arabic and maths, which these versions lack | fonts.googleapis.com, fonts.gstatic.com |
| Emoji + Characters Fix (webOS 4 and older, on by default) | requests for the emoji pictures on screen | cdnjs.cloudflare.com |

What comes back is used as data: text is shown as text, segment times only as numbers, and nothing from a server is run or turned into HTML or CSS.

Other apps on the TV, and phones casting over the local network (DIAL), can start the app with a link. It opens only YouTube's TV page, `https://www.youtube.com/tv`: of a link to another youtube.com page only the query is kept, so `/watch?v=...` still opens that video, and anything else is read as query parameters (`bench/launch-test.cjs`).

The installer holds the launcher page and the script built from this repository, with three packages from npm: @twemoji/api, tiny-sha256 and whatwg-fetch. What `npm audit` reports in the build tools (webpack, eslint, the webOS CLI) concerns the computer that builds the app, not the TV.
