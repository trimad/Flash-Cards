# Flash Cards

A Hugo-powered static flash-card site for CompTIA study decks. The site builds routes for each practice test and loads card decks from JSON in `static/assets`.

## Run Locally

From the project root:

```bash
hugo server --bind 127.0.0.1 --port 3000 --baseURL http://127.0.0.1:3000/ --disableFastRender --renderToMemory
```

Then open:

```text
http://127.0.0.1:3000/
```

## Build

```bash
hugo --minify
```

Hugo writes the generated site to `docs/` for GitHub Pages branch-folder deployment.

## GitHub Pages

This repository deploys without a Node.js-based GitHub Actions workflow.

GitHub Pages should be configured to deploy from the `master` branch and the `/docs` folder. Hugo writes there because `hugo.toml` sets `publishDir = "docs"`.

Before pushing source changes, rebuild and commit the generated output:

```bash
hugo --minify
```


## Requirements

- Hugo Extended
- A modern web browser

## Routes

- `/tests/a-plus-220-1001/`
- `/tests/a-plus-220-1002/`
- `/tests/network-plus/`
- `/tests/security-plus/`

The Network+ and Security+ routes currently have card decks. The A+ routes are in place and show their objectives from the shared menu data, but they will remain empty until deck JSON files are added.

## Progress

The table of contents is segmented by chapter and section. Progress is stored in the browser with `localStorage`, keyed per practice test route.

Cards with an `O` option list can also be answered as quiz questions. Select one or more choices, use **Check Answer**, and the app stores graded quiz results alongside study progress in `localStorage`.

## JSON Schema

Scraped decks are wired into the app through `static/assets/menu.json`. Each top-level item is a practice test.

```json
{
  "name": "CompTIA Security+",
  "assetPath": "Security+/",
  "chapter": [
    {
      "color": "#C9476A",
      "file": "security-plus-objectives.json",
      "name": "General Security Concepts",
      "section": [
        {
          "name": "1.1",
          "label": "Compare and contrast various types of security controls."
        }
      ]
    }
  ]
}
```

Practice test fields:

- `name` - Display name. Must match `testName` in the corresponding `content/tests/*.md` file.
- `assetPath` - Optional folder under `static/assets/` where this test's deck files live. Include the trailing slash.
- `chapter` - Ordered list of TOC segments/domains.

Chapter fields:

- `name` - Display name for the TOC segment.
- `color` - Accent color used for that segment and active cards.
- `file` - Deck JSON filename. Relative to `assetPath` when present. Multiple chapters may point to the same deck file.
- `section` - Ordered list of sections inside the chapter.

Section fields:

- `name` - Required key used to find cards in the deck JSON.
- `label` - Optional display text. Use exact exam objective text when available.

Deck files are JSON objects keyed by section name. Each key maps to an array of cards:

```json
{
  "1.1": [
    {
      "Q": "Which of the following answers can be used to describe technical security controls? (Select 3 answers)",
      "A": [
        "Sometimes called logical security controls",
        "Executed by computer systems (instead of people)",
        "Implemented with technology"
      ],
      "O": [
        "Focused on protecting material assets",
        "Sometimes called logical security controls",
        "Executed by computer systems (instead of people)",
        "Also known as administrative controls",
        "Implemented with technology",
        "Primarily implemented and executed by people (as opposed to computer systems)"
      ]
    }
  ]
}
```

Card fields:

- `Q` - Question/prompt text.
- `A` - Array of correct answers shown on the answer side.
- `O` - Optional array of all answer options shown on the question side. Use this for multiple-choice scrape sources.

When scraping a new source, prefer generating one deck object keyed by official objective IDs, such as `1.1` or `4.6`. If the source provides practice tests instead of objective IDs, create a normalized objective-grouped deck and point `menu.json` at that normalized file.

## Project Layout

- `hugo.toml` - Hugo site configuration
- `content/tests/` - practice test routes
- `layouts/` - Hugo templates
- `static/js/flashcards.js` - card state, deck loading, navigation, and progress
- `static/css/flashcards.css` - app styling
- `static/assets/menu.json` - exam/chapter/section menu data
- `static/assets/Network+/` - Network+ deck JSON files
- `static/assets/Security+/` - Security+ objective PDF and deck JSON files
- `.github/workflows/deploy-pages.yml` - GitHub Pages deployment
