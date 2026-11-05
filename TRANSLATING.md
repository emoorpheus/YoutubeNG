# Translating YouTube Next-Gen

[Русская версия](TRANSLATING.ru.md)

The app's own text (settings panel, notifications, SponsorBlock window, first-launch hint) lives in `src/i18n/`. YouTube's interface is not affected: it follows the TV language on its own.

- `src/i18n/template.js`: every English text (about 200 entries). Start a translation from it.
- `src/i18n/ru.js`: Russian, a finished example.

## Add a language

1. Create the file. This command copies the template to `src/i18n/<code>.js`, marks every entry `// TODO` and registers the language in `src/i18n/index.js`:

   ```sh
   node tools/i18n.cjs new de "Deutsch"
   ```

   Use a lower-case language code, the way YouTube writes it: `de`, `fr`, `es`, `pt-br`. With **Auto** the app picks the file that matches YouTube's language.

   Without Node.js: copy `template.js` to `de.js`, set `code: 'de'` and `name: 'Deutsch'`, then add `import de from './de.js';` to `src/i18n/index.js` and add `de` to `LANGUAGES`.

2. Translate the values. An AI chat works well: paste the prompt below and the whole file. Remove every `// TODO` once the line is translated.
3. Check the file:

   ```sh
   npm run i18n:check
   ```

   It reports missing entries, broken placeholders and leftover `// TODO`.
4. Build and try it: `npm run package:all`, install, then settings → **Main** → **Interface** → **Interface language**.

To share it, open a pull request or an issue with the file.

## Rules

- Translate the values (right side) only. Keys (left side) are the English text in the code and stay as they are.
- Keep every placeholder exactly as written; you may move it:

  | Placeholder | Becomes |
  |---|---|
  | `{n}` | a number: `Key {n}` → `Key 5` |
  | `{text}` | text copied as is (an error, a subtitle language) |
  | `{tr}` | text translated with this same file (a quality, a codec mode) |
  | `{category}` | a SponsorBlock category from `categories` |
  | `{Category}` | the same, with a capital first letter |
  | `{categories}` | a list of categories: `a, b and c` |

- Keep it short. The panel is read from a sofa; aim for about the length of the English.
- Leave as they are: YouTube, SponsorBlock, DeArrow, NG, OLED, codec names (AV1, VP9, H.264, H.265).
- `and` is the word before the last item of a list (`sponsor, intro and outro`).
- `categories` are written in lower case, as they appear in the middle of a sentence.
- Save as UTF-8. Inside a value, write an apostrophe as `\'`.

## Prompt for an AI translator

```text
Translate this JavaScript language file of a TV app (YouTube Next-Gen, the
settings panel and notifications of a YouTube app for LG TVs) into <LANGUAGE>.

Rules:
- Change only the string values to the right of each colon. Keep the keys,
  the comments and the structure of the file.
- Set code to '<code>' and name to the name of the language in <LANGUAGE>.
- Keep every {placeholder} ({n}, {text}, {tr}, {category}, {Category},
  {categories}) exactly as written. You may move it within the sentence.
- Short, natural interface wording, about as long as the English. Use the
  same term for the same thing throughout.
- Keep YouTube, SponsorBlock, DeArrow, NG, OLED and codec names (AV1, VP9,
  H.264, H.265) as they are.
- `and` is the word before the last item of a list.
- `categories` are SponsorBlock segment types, in lower case.
- Remove every "// TODO". Write an apostrophe inside a value as \'.
- Reply with the whole file only.
```

To update an existing translation, use the same prompt with "Translate only the lines marked // TODO".

## After the code changes

Developers: when the code shows new text, run `npm run i18n:template` to update `template.js`. Text built at runtime (with a value inside) goes into `patterns` of `template.js` by hand. CI runs `npm run i18n:check`.

Translators: `node tools/i18n.cjs sync de` adds new entries in English marked `// TODO` and drops the ones the app no longer uses. Translate the `// TODO` lines and run the check again.

## How a text is looked up

1. The exact English text in `strings`.
2. Otherwise `patterns`; when several match, the one with the most fixed text wins.
3. Otherwise the English text is shown. A missing entry changes a label, never what the app does.
