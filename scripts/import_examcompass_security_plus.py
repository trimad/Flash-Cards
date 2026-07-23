#!/usr/bin/env python3
"""Scrape the complete ExamCompass Security+ SY0-701 practice and acronym quizzes.

The scraper advances through ExamCompass's normal quiz flow without answering the
questions, then parses the final review page where ExamCompass marks correct
answers. A cache in the system temp directory makes interrupted imports resumable.
"""
from __future__ import annotations

import argparse
import json
import re
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, cast
from urllib.parse import urljoin

import bs4
import requests

ROOT = Path(__file__).resolve().parents[1]
TEST_NAME = "CompTIA Security+ (SY0-701)"
LANDING_URL = "https://www.examcompass.com/comptia/security-plus-certification/free-security-plus-practice-tests"
DECK_RELATIVE_PATH = "Security+/examcompass-sy0-701-practice-tests.json"
DECK_PATH = ROOT / "static" / "assets" / DECK_RELATIVE_PATH
DOCS_DECK_PATH = ROOT / "docs" / "assets" / DECK_RELATIVE_PATH
MENU_PATH = ROOT / "static" / "assets" / "menu.json"
CACHE_PATH = Path(tempfile.gettempdir()) / "examcompass-security-plus-sy0-701-cache.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "close",
}
AJAX_HEADERS = {
    **HEADERS,
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}


@dataclass(frozen=True)
class QuizLink:
    title: str
    url: str
    group: str
    sort_key: tuple[int, int]
    section_name: str
    label: str


def clean_text(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split()).strip()


def request_with_retry(session: requests.Session, method: str, url: str, **kwargs) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(10):
        try:
            response = getattr(session, method)(url, timeout=45, **kwargs)
            response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001 - transient site failures are expected
            last_error = exc
            wait = min(30.0, 1.5 * (attempt + 1))
            print(f"  {method.upper()} retry {attempt + 1}/10 after {exc!r}; sleeping {wait:.1f}s")
            time.sleep(wait)
    raise RuntimeError(f"{method.upper()} {url} failed after retries") from last_error


def classify_link(title: str) -> tuple[str, tuple[int, int], str, str] | None:
    title = clean_text(title)
    practice = re.fullmatch(r"Security\+ Practice Test\s+(\d+)", title, flags=re.I)
    if practice:
        number = int(practice.group(1))
        return "practice", (0, number), f"Practice Test {number}", title

    acronym = re.fullmatch(r"SY0-701 Exam Acronyms Quiz pt\.\s*(\d+)", title, flags=re.I)
    if acronym:
        number = int(acronym.group(1))
        return "acronyms", (1, number), f"Acronyms {number}", title

    return None


def extract_quiz_links() -> list[QuizLink]:
    session = requests.Session()
    session.headers.update(HEADERS)
    response = request_with_retry(session, "get", LANDING_URL)
    soup = bs4.BeautifulSoup(response.text, "html.parser")

    links: dict[str, QuizLink] = {}
    for anchor in soup.find_all("a", href=True):
        title = clean_text(anchor.get_text(" ", strip=True))
        classified = classify_link(title)
        if not classified:
            continue
        group, sort_key, section_name, label = classified
        url = urljoin(LANDING_URL, cast(str, anchor["href"]))
        links[url] = QuizLink(title, url, group, sort_key, section_name, label)

    result = sorted(links.values(), key=lambda item: item.sort_key)
    practice = [link for link in result if link.group == "practice"]
    acronyms = [link for link in result if link.group == "acronyms"]
    expected_practice = [f"Practice Test {number}" for number in range(1, 25)]
    expected_acronyms = [f"Acronyms {number}" for number in range(1, 11)]
    if [link.section_name for link in practice] != expected_practice:
        raise RuntimeError(f"Expected 24 Security+ practice tests, found {[link.section_name for link in practice]}")
    if [link.section_name for link in acronyms] != expected_acronyms:
        raise RuntimeError(f"Expected 10 Security+ acronym quizzes, found {[link.section_name for link in acronyms]}")
    return result


def hidden_inputs(form: bs4.Tag) -> dict[str, str]:
    values: dict[str, str] = {}
    for input_tag in form.find_all("input"):
        name = cast(str, input_tag.get("name", ""))
        input_type = cast(str, input_tag.get("type", "")).lower()
        if not name or input_type in {"radio", "checkbox"}:
            continue
        values[name] = cast(str, input_tag.get("value", ""))
    return values


def post_data(values: dict[str, str]) -> list[tuple[str, str]]:
    return [(key, "response.next" if key == "task" else value) for key, value in values.items()]


def infer_question_type(options: list[str], answers: list[str]) -> str:
    if len(options) == 2 and {option.casefold() for option in options} == {"true", "false"}:
        return "true_false"
    return "single_choice" if len(answers) == 1 else "multiple_choice"


def parse_review_cards(review_html: str) -> list[dict[str, object]]:
    soup = bs4.BeautifulSoup(review_html, "html.parser")
    cards: list[dict[str, object]] = []
    for panel in soup.select("div.panel.panel-default"):
        title = panel.select_one(".panel-heading .panel-title")
        if not title:
            continue
        question = clean_text(title.get_text(" ", strip=True))
        options: list[str] = []
        answers: list[str] = []
        for choice in panel.select("li.choice-answer"):
            choice_copy = bs4.BeautifulSoup(str(choice), "html.parser").find("li")
            if not choice_copy:
                continue
            for unwanted in choice_copy.select("i, span.text-error, span.text-success"):
                unwanted.decompose()
            option_text = clean_text(choice_copy.get_text(" ", strip=True))
            if not option_text:
                continue
            options.append(option_text)
            if choice.select_one('i.fa-check[title="Correct answer"], i.fa-check[data-original-title="Correct answer"]'):
                answers.append(option_text)
        if not question:
            continue
        # The review markup also includes a "Your Final Report" panel without quiz choices.
        if not options and not answers:
            continue
        if not answers or not options:
            raise RuntimeError(f"Review page contained an incomplete card: {question!r}")
        cards.append({"Q": question, "A": answers, "O": options, "questionType": infer_question_type(options, answers)})
    return cards


def scrape_quiz(link: QuizLink) -> list[dict[str, object]]:
    print(f"Scraping {link.section_name}: {link.title}")
    session = requests.Session()
    session.headers.update(AJAX_HEADERS)
    response = request_with_retry(session, "get", link.url)
    soup = bs4.BeautifulSoup(response.text, "html.parser")
    form = soup.find("form", id="adminForm") or soup.find("form", class_="quiz-form")
    if not form or not form.get("action"):
        raise RuntimeError(f"Could not find quiz form for {link.url}")

    action = urljoin(link.url, cast(str, form["action"]))
    post_url = action + ("&" if "?" in action else "?") + "format=json"
    state = hidden_inputs(form)
    page_count = 0
    while True:
        page_count += 1
        json_response = request_with_retry(
            session,
            "post",
            post_url,
            data=post_data(state),
            headers={"Referer": link.url, **AJAX_HEADERS},
        ).json()
        if not json_response.get("success") or "data" not in json_response:
            raise RuntimeError(f"Unexpected quiz response for {link.url}: {json_response}")
        data = json_response["data"]
        if data.get("finished"):
            cards = parse_review_cards(data.get("html") or "")
            break
        fragment = bs4.BeautifulSoup("<form>" + (data.get("html") or "") + "</form>", "html.parser")
        if not fragment.form:
            raise RuntimeError(f"Missing follow-up form fragment for {link.url}")
        state.update(hidden_inputs(fragment.form))
        if data.get("responseId"):
            state["rid"] = str(data["responseId"])
        if page_count > 80:
            raise RuntimeError(f"Too many pages while scraping {link.url}")
        time.sleep(0.04)

    if len(cards) < 5:
        raise RuntimeError(f"Too few cards extracted from {link.url}: {len(cards)}")
    print(f"  extracted {len(cards)} cards across {page_count} pages")
    return cards


def load_cache() -> dict[str, list[dict[str, object]]]:
    return json.loads(CACHE_PATH.read_text(encoding="utf-8")) if CACHE_PATH.exists() else {}


def save_cache(cache: dict[str, list[dict[str, object]]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_deck(links: Iterable[QuizLink], cache: dict[str, list[dict[str, object]]]) -> dict[str, list[dict[str, object]]]:
    return {link.section_name: cache[link.url] for link in links}


def chapter_for_group(name: str, color: str, sections: list[QuizLink]) -> dict[str, object]:
    return {
        "color": color,
        "file": Path(DECK_RELATIVE_PATH).name,
        "name": name,
        "section": [{"name": link.section_name, "label": link.label, "source": link.url} for link in sections],
    }


def update_menu(links: list[QuizLink]) -> None:
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8"))
    security = next((item for item in menu if item.get("name") == TEST_NAME), None)
    if security is None:
        raise RuntimeError(f"Could not find {TEST_NAME} in menu.json")
    practice = [link for link in links if link.group == "practice"]
    acronyms = [link for link in links if link.group == "acronyms"]
    security["chapter"] = [
        chapter_for_group("ExamCompass SY0-701 Practice Tests", "#C9476A", practice),
        chapter_for_group("ExamCompass SY0-701 Acronym Quizzes", "#8E44AD", acronyms),
    ]
    MENU_PATH.write_text(json.dumps(menu, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="Scrape only the first N source quizzes into the resumable cache, without publishing data.")
    args = parser.parse_args()

    links = extract_quiz_links()
    print(f"Found {len(links)} required source quizzes: 24 practice tests and 10 acronym quizzes")
    selected = links if args.limit is None else links[:args.limit]
    if args.limit is not None and args.limit < 1:
        raise RuntimeError("--limit must be at least 1")

    cache = load_cache()
    for index, link in enumerate(selected, start=1):
        if link.url in cache:
            print(f"[{index}/{len(selected)}] cached {link.section_name}: {len(cache[link.url])} cards")
            continue
        print(f"[{index}/{len(selected)}]", end=" ")
        cache[link.url] = scrape_quiz(link)
        save_cache(cache)
        time.sleep(0.12)

    if args.limit is not None:
        print(f"Cached {len(selected)} source quizzes for verification; no application files were written.")
        return

    missing = [link.section_name for link in links if link.url not in cache]
    if missing:
        raise RuntimeError(f"Missing cached quiz results: {missing}")
    deck = build_deck(links, cache)
    total_cards = sum(len(cards) for cards in deck.values())
    if total_cards < 650:
        raise RuntimeError(f"Expected at least 650 cards from the 34 requested quizzes, got {total_cards}")

    DECK_PATH.write_text(json.dumps(deck, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    DOCS_DECK_PATH.write_text(json.dumps(deck, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    update_menu(links)
    print(f"Wrote {total_cards} cards in {len(deck)} source sections to {DECK_PATH}")
    print(f"Cache: {CACHE_PATH}")


if __name__ == "__main__":
    main()
