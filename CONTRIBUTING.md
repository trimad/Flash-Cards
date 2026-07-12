# Contributing

## Requirements

- Hugo Extended
- Node.js 20+
- Chrome, Chromium, or Edge for browser smoke tests
- Python 3 only if running scraper/import scripts

## Development workflow

Start the local server:

```bash
npm run serve
```

Run the full validation suite:

```bash
npm test
```

Run only the browser smoke tests after a build:

```bash
npm run browser:smoke
```

Build only:

```bash
npm run build
```

## Quality gates

Before submitting changes, run `npm test`. The validation suite checks:

- package script invariants
- theme source invariants
- reset progress invariants
- deck/menu/content consistency
- Hugo production build
- generated export links/assets
- browser smoke tests for settings, search, editor, controller panel focus, reset progress, and card animations

## Deck changes

When editing decks:

1. Keep files under `static/assets/<DeckFolder>/`.
2. Update `static/assets/menu.json`.
3. Update or add the corresponding `content/tests/*.md` route when adding a deck.
4. Run `node scripts/validate-deck-data.js`.
5. Run `npm test` before committing.

## Generated output

`docs/` is the committed Hugo publish directory. Running `npm test` or `npm run build` regenerates it.

`public/` is obsolete for local development and should not be committed.

## Import scripts

The ExamCompass import scripts require Python packages not used by the runtime app:

```bash
python -m pip install requests beautifulsoup4
```

These scripts modify deck data and should be run intentionally, followed by full validation.
