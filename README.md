# Flash Cards

A Hugo-powered, browser-only flashcard platform for certification study and early reading practice.

The app is static, fast, offline-capable, and JSON-driven. It runs entirely in the browser with no backend, no database, and no account system.

## Supported decks

- CompTIA Network+ (N10-009)
- CompTIA Security+ (SY0-701)
- CompTIA Tech+ (FC0-U71)
- Early Reading

Incomplete CompTIA A+ placeholder decks were removed so the catalog contains only complete study material.

## Features

- Static Hugo deployment
- JSON-driven decks
- Fast cached and parallel deck loading
- Global Ctrl+K search across all decks
- Fuzzy instant search with highlighted results
- Keyboard, mouse, and gamepad controls
- Speech synthesis and optional card audio
- Multiple-choice quiz cards
- Right/Wrong recall grading
- SM-2 spaced repetition with Again/Hard/Good/Easy controls
- Due-card review
- Shuffle/random study
- Bookmarks and suspended cards
- Session timer and review summary
- Browser-local progress and scheduling
- Settings dialog with Evangelion + Light/Dark/AMOLED themes
- Persisted welcome dismissal
- Local browser deck editor with JSON export
- Installable PWA with offline support
- Responsive desktop/tablet/mobile layout
- Headless browser smoke tests

## Run locally

From the project root:

```bash
npm run serve
```

Then open:

```text
http://127.0.0.1:3000/
```

Equivalent Hugo command:

```bash
hugo server --bind 127.0.0.1 --port 3000 --baseURL http://127.0.0.1:3000/ --disableFastRender --renderToMemory
```

## Build and validate

```bash
npm test
```

The validation entrypoint runs package/source invariants, deck/menu data checks, `hugo --minify`, generated-export validation, and a headless browser smoke test covering settings, themes, search, editor, reset progress, and card behavior.

Build only:

```bash
npm run build
```

Browser smoke only after building `docs/`:

```bash
npm run browser:smoke
```

## Deployment

GitHub Pages deployment is handled by `.github/workflows/deploy.yml`.

On push to `master`, CI:

1. Checks out the repository.
2. Installs Hugo Extended.
3. Installs Node.js 20.
4. Runs `npm test`.
5. Uploads the validated `docs/` output as a Pages artifact.
6. Deploys with `actions/deploy-pages`.

Deployments fail if validation or browser smoke tests fail.

## Study controls

Keyboard:

- Left/right arrows: previous/next card
- Up/down arrows: flip
- Space/Enter: flip
- X: flip
- Y: speak
- A: right
- B: wrong
- Ctrl+K: global search

Gamepad:

- LT/RT: previous/next
- X: flip
- Y: speak
- A: right
- B: wrong
- D-pad/stick: move focus

Gamepad / Xbox-first navigation:

- LB: focus the Deck / table-of-contents panel from anywhere
- RB: focus the Study panel from anywhere
- D-pad or left stick: move deterministically within the active panel using roving focus
- A in Deck panel: select the focused section and automatically return to Study
- B in Deck panel: return to Study
- LT/RT in Study panel: previous/next card
- X in Study panel: flip
- Y in Study panel: speak
- A/B in Study panel: right/wrong

The active controller panel is highlighted visually, and the command bar updates to show the current Xbox controls. Open dialogs such as Settings, Search, Editor, and Welcome temporarily become the active controller context; D-pad/stick movement stays inside the dialog, A activates the focused control, and B closes the dialog without changing cards.

Spaced repetition:

- Again: forgot; schedule relearning soon
- Hard: remembered with difficulty
- Good: normal successful recall
- Easy: strong recall; longer interval

## Deck format

See `DECK_FORMAT.md`.

## Architecture

See `ARCHITECTURE.md`.

## Study engine

See `STUDY_ENGINE.md`.

## Testing

See `TESTING.md`.

## Contributing

See `CONTRIBUTING.md`.

## Migration notes

See `MIGRATION.md`.

## Python import scripts

The ExamCompass import scripts are developer tools and are not required for runtime. If you need to run them:

```bash
python -m pip install requests beautifulsoup4
```

Then run the specific script and finish with `npm test`.
