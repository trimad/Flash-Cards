# Deck Format

Flash Cards uses static JSON files for deck data.

## Menu file

`static/assets/menu.json` is the deck catalog.

Each top-level item is a deck:

```json
{
  "name": "CompTIA Network+ (N10-009)",
  "assetPath": "Network+/",
  "chapter": []
}
```

Fields:

- `name`: display name and route match key.
- `assetPath`: folder under `static/assets/`.
- `chapter`: ordered chapter/domain list.

## Chapter

```json
{
  "color": "#6E298D",
  "file": "1-networking-concepts.json",
  "name": "1.0 Networking Concepts",
  "section": []
}
```

Fields:

- `color`: six-digit hex accent color.
- `file`: deck JSON filename, relative to `assetPath`.
- `name`: chapter/domain title.
- `section`: ordered sections.

## Section

```json
{
  "name": "1.1",
  "label": "Explain the purposes and uses of ports and protocols."
}
```

The `name` must match a key in the referenced deck JSON file.

## Q/A card schema

```json
{
  "Q": "What is DNS?",
  "A": ["Domain Name System", "Maps names to IP addresses"],
  "O": ["Domain Name System", "Dynamic Network Service", "Data Name Store"],
  "questionType": "multiple_choice"
}
```

Fields:

- `Q`: required question/prompt.
- `A`: required answer string or answer array. Must not be blank.
- `O`: optional answer-option array. When present, `questionType` is required.
- `questionType`: option-card interaction schema. Use `true_false` for the canonical True/False pair, `single_choice` for one-answer questions, or `multiple_choice` for questions with multiple correct answers.
- `frontAudio`: optional audio URL/path.
- `backAudio`: optional audio URL/path.

## Imported/simple deck schema

Used by Early Reading decks and the local editor export.

```json
{
  "id": "oo-words",
  "name": "\"OO\" Words",
  "description": "20 simple words that contain the oo sound.",
  "cards": [
    {
      "front": { "text": "zoo" },
      "back": { "text": "We saw lions at the zoo." }
    }
  ]
}
```

Optional audio fields:

```json
{
  "front": { "text": "zoo", "audio": "audio/zoo.mp3" },
  "back": { "text": "We saw lions at the zoo.", "audio": "audio/zoo-sentence.mp3" }
}
```

## Validation

Run:

```bash
node scripts/validate-deck-data.js
```

The validator checks JSON parseability, menu references, route indexes, card schema, blank questions, and blank answers.
