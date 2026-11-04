# Third-party code

Code written outside this project, kept as its authors wrote it so it can be
compared with (and updated from) the original. Changes made here are marked
`[ytaf]` in the files (upstream's marker). ESLint skips this folder
(`eslint.config.ts`); the code that uses it lives in `src/dearrow/`.

| Folder | What | From | License |
| --- | --- | --- | --- |
| `dearrow/` | DeArrow's title formatter (Title Case, Sentence case, emoji and fancy-text cleanup) | [ajayyy/DeArrow](https://github.com/ajayyy/DeArrow) `src/titles/titleFormatter.ts` @ 482cf997, types stripped; vendored by @magicsk in NicholasBly/youtube-webos#200, taken from upstream 0.8.5 b2 | GPL-3.0 |
