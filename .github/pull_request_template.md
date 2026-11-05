## What and why

<!-- What changes, and the problem it solves. Link the issue if there is one. -->

## Checked

- [ ] `bash bench/run-all.sh <label>` ends with `all passed`
- [ ] New behaviour has a test in `bench/` that fails without the change
- [ ] Shared code: both builds (webOS 3 legacy, webOS 22+)
- [ ] Text on screen goes through `t()`; Russian added; `npm run i18n:check` passes
- [ ] `CHANGELOG.md`: a line under `## Unreleased`
- [ ] Docs: `README.md` and `README.ru.md` changed together
- [ ] On a TV: webOS version and year, or "not tried on a TV"
- [ ] No private data in the code, docs or commits (IP addresses, serial numbers, accounts, tokens, local paths)
