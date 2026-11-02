# Перевод YouTube Next-Gen

[English version](TRANSLATING.md)

Тексты самого приложения (панель настроек, уведомления, окно SponsorBlock, подсказка при первом запуске) лежат в `src/i18n/`. Интерфейс YouTube это не затрагивает: он сам берёт язык телевизора.

- `src/i18n/template.js`: все английские тексты (около 170 строк). С него начинается перевод.
- `src/i18n/ru.js`: русский, готовый пример.

## Добавить язык

1. Создайте файл. Команда скопирует шаблон в `src/i18n/<код>.js`, пометит каждую строку `// TODO` и подключит язык в `src/i18n/index.js`:

   ```sh
   node tools/i18n.cjs new de "Deutsch"
   ```

   Код языка пишется строчными буквами, как у YouTube: `de`, `fr`, `es`, `pt-br`. В режиме **Авто** приложение само выберет файл под язык YouTube.

   Без Node.js: скопируйте `template.js` в `de.js`, поставьте `code: 'de'` и `name: 'Deutsch'`, затем в `src/i18n/index.js` добавьте `import de from './de.js';` и `de` в `LANGUAGES`.

2. Переведите значения. Удобно через чат с ИИ: вставьте промпт ниже и весь файл. Переведённые строки освобождайте от `// TODO`.
3. Проверьте файл:

   ```sh
   npm run i18n:check
   ```

   Проверка покажет пропущенные строки, сломанные подстановки и оставшиеся `// TODO`.
4. Соберите и попробуйте: `npm run package:all`, установите, затем настройки → **Основные** → **Интерфейс** → **Язык интерфейса**.

Чтобы поделиться переводом, откройте pull request или issue с файлом.

## Правила

- Переводятся только значения (справа). Ключи (слева) — английский текст из кода, их не меняйте.
- Подстановки оставляйте ровно как написано, переставлять можно:

  | Подстановка | Что в неё попадёт |
  |---|---|
  | `{n}` | число: `Key {n}` → `Кнопка 5` |
  | `{text}` | текст как есть (ошибка, язык субтитров) |
  | `{tr}` | текст, переведённый этим же файлом (качество, режим кодека) |
  | `{category}` | категория SponsorBlock из `categories` |
  | `{Category}` | то же с заглавной буквы |
  | `{categories}` | список категорий: `a, b и c` |

- Коротко. Панель читают с дивана; по длине примерно как английский.
- Не переводятся: YouTube, SponsorBlock, NG, OLED, названия кодеков (AV1, VP9, H.264, H.265).
- `and` — слово перед последним пунктом списка (`спонсорская реклама, вступление и концовка`).
- `categories` пишутся строчными, как в середине фразы.
- Кодировка UTF-8. Апостроф внутри значения пишется как `\'`.

## Промпт для ИИ

Промпт на английском: так модель точнее держит формат. Подставьте язык и код.

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
- Keep YouTube, SponsorBlock, NG, OLED and codec names (AV1, VP9, H.264,
  H.265) as they are.
- `and` is the word before the last item of a list.
- `categories` are SponsorBlock segment types, in lower case.
- Remove every "// TODO". Write an apostrophe inside a value as \'.
- Reply with the whole file only.
```

Чтобы обновить готовый перевод, добавьте к промпту «Translate only the lines marked // TODO».

## Когда меняется код

Разработчикам: если код показывает новый текст, запустите `npm run i18n:template`, он обновит `template.js`. Тексты, которые собираются на лету (со значением внутри), добавляются в `patterns` файла `template.js` вручную. CI запускает `npm run i18n:check`.

Переводчикам: `node tools/i18n.cjs sync de` добавит новые строки по-английски с пометкой `// TODO` и уберёт те, что приложению больше не нужны. Переведите строки с `// TODO` и снова запустите проверку.

## Как ищется перевод

1. Точный английский текст в `strings`.
2. Иначе `patterns`; если подходят несколько, побеждает тот, где больше постоянного текста.
3. Иначе показывается английский текст. Пропущенная строка меняет только надпись, но не поведение приложения.
