#!/usr/bin/env python
"""Annotate every option card with its explicit questionType schema value.

Classification:
- true_false: exactly two canonical True/False options
- single_choice: one correct answer
- multiple_choice: more than one correct answer
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "static" / "assets"
VALID_TYPES = {"true_false", "single_choice", "multiple_choice"}


def normalized_option(value: object) -> str:
    return str(value).strip().lower().rstrip(".?!")


def question_type(card: dict) -> str:
    options = card["O"]
    answers = card["A"] if isinstance(card["A"], list) else [card["A"]]
    option_values = {normalized_option(option) for option in options}

    if len(options) == 2 and option_values == {"true", "false"}:
        return "true_false"
    if len(answers) == 1:
        return "single_choice"
    return "multiple_choice"


def annotate(value: object, counts: dict[str, int]) -> None:
    if isinstance(value, dict):
        if isinstance(value.get("O"), list) and value["O"]:
            value["questionType"] = question_type(value)
            counts[value["questionType"]] += 1
        for child in value.values():
            annotate(child, counts)
    elif isinstance(value, list):
        for child in value:
            annotate(child, counts)


def main() -> None:
    counts = {kind: 0 for kind in VALID_TYPES}
    files_changed = 0

    for path in sorted(ASSETS.rglob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        before = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        annotate(data, counts)
        after = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        if after != before:
            path.write_text(after, encoding="utf-8", newline="\n")
            files_changed += 1

    print(
        f"Annotated {sum(counts.values())} option cards across {files_changed} asset files: "
        + ", ".join(f"{kind}={counts[kind]}" for kind in sorted(counts))
    )


if __name__ == "__main__":
    main()
