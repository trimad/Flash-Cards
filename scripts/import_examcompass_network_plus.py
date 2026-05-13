#!/usr/bin/env python3
"""Scrape ExamCompass Network+ N10-009 quiz answers into Flash-Cards deck data.

This follows ExamCompass's normal quiz flow without submitting answers, then parses
its final review page for the correct answers. A cache in /tmp lets interrupted runs
resume without re-walking completed quizzes.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, cast
from urllib.parse import urljoin

import bs4
import requests

ROOT = Path(__file__).resolve().parents[1]
LANDING_URL = "https://www.examcompass.com/comptia/network-plus-certification/free-network-plus-practice-tests"
DECK_RELATIVE_PATH = "Network+/examcompass-n10-009-practice-tests.json"
DECK_PATH = ROOT / "static" / "assets" / DECK_RELATIVE_PATH
DOCS_DECK_PATH = ROOT / "docs" / "assets" / DECK_RELATIVE_PATH
MENU_PATH = ROOT / "static" / "assets" / "menu.json"
CACHE_PATH = Path("/tmp/examcompass-network-plus-n10-009-cache.json")

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
    sort_key: tuple[int, int, str]
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
        except Exception as exc:  # noqa: BLE001 - retry network flakiness from the site
            last_error = exc
            wait = min(30.0, 1.5 * (attempt + 1))
            print(f"  {method.upper()} retry {attempt + 1}/10 after {exc!r}; sleeping {wait:.1f}s")
            time.sleep(wait)
    raise RuntimeError(f"{method.upper()} {url} failed after retries") from last_error


def classify_link(title: str, url: str) -> tuple[str, tuple[int, int, str], str, str] | None:
    title = clean_text(title)
    if not title:
        return None

    practice = re.search(r"Network\+ Practice Exam (\d+)", title, flags=re.I)
    if practice:
        number = int(practice.group(1))
        return "practice", (0, number, title), f"Exam {number}", title

    acronym = re.search(r"Acronyms Quiz pt\.\s*(\d+)", title, flags=re.I)
    if acronym:
        number = int(acronym.group(1))
        return "acronyms", (1, number, title), f"Acronyms {number}", title

    if "quiz" in title.lower() and "n10-009" in url.lower():
        # Topic quizzes keep their landing-page order after practice/acronym sections.
        return "topics", (2, 0, title), title.removesuffix(" Quiz"), title

    return None


def extract_quiz_links() -> list[QuizLink]:
    session = requests.Session()
    session.headers.update(HEADERS)
    response = request_with_retry(session, "get", LANDING_URL)
    soup = bs4.BeautifulSoup(response.text, "html.parser")

    links: dict[str, QuizLink] = {}
    topic_order = 0
    for anchor in soup.find_all("a", href=True):
        title = clean_text(anchor.get_text(" ", strip=True))
        href = cast(str, anchor.get("href", ""))
        url = urljoin(LANDING_URL, href)
        classified = classify_link(title, url)
        if not classified:
            continue
        group, sort_key, section_name, label = classified
        if group == "topics":
            topic_order += 1
            sort_key = (2, topic_order, title)
        links[url] = QuizLink(title=title, url=url, group=group, sort_key=sort_key, section_name=section_name, label=label)

    result = sorted(links.values(), key=lambda item: item.sort_key)
    if len(result) < 50:
        raise RuntimeError(f"Expected many Network+ quiz links, found only {len(result)}")
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
    data = []
    for key, value in values.items():
        data.append((key, "response.next" if key == "task" else value))
    return data


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

        if not question or not answers:
            # Keep the scraper conservative: cards without answer keys are not useful flash cards.
            continue

        card: dict[str, object] = {"Q": question, "A": answers}
        if options:
            card["O"] = options
        cards.append(card)

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

    action = urljoin(link.url, cast(str, form.get("action", "")))
    post_url = action + ("&" if "?" in action else "?") + "format=json"
    state = hidden_inputs(form)
    review_html = ""
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
            review_html = data.get("html") or ""
            break

        fragment = bs4.BeautifulSoup("<form>" + (data.get("html") or "") + "</form>", "html.parser")
        fragment_form = fragment.form
        if fragment_form is None:
            raise RuntimeError(f"Missing follow-up form fragment for {link.url}")
        new_state = hidden_inputs(fragment_form)
        state.update(new_state)
        if data.get("responseId"):
            state["rid"] = str(data["responseId"])

        if page_count > 80:
            raise RuntimeError(f"Too many pages while scraping {link.url}")
        time.sleep(0.04)

    cards = parse_review_cards(review_html)
    print(f"  extracted {len(cards)} cards across {page_count} pages")
    if len(cards) < 5:
        raise RuntimeError(f"Too few cards extracted from {link.url}: {len(cards)}")
    return cards


def load_cache() -> dict[str, list[dict[str, object]]]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text())
    return {}


def save_cache(cache: dict[str, list[dict[str, object]]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False) + "\n")


def build_deck(links: Iterable[QuizLink], cache: dict[str, list[dict[str, object]]]) -> dict[str, list[dict[str, object]]]:
    deck: dict[str, list[dict[str, object]]] = {}

    for link in links:
        # Preserve cards per source quiz. Some ExamCompass topic quizzes overlap
        # with the numbered practice exams, but Tristan asked for all questions
        # from all quizzes, not a globally deduplicated study set.
        deck[link.section_name] = cache[link.url]

    return deck


def chapter_for_group(name: str, color: str, sections: list[QuizLink]) -> dict[str, object]:
    return {
        "color": color,
        "file": Path(DECK_RELATIVE_PATH).name,
        "name": name,
        "section": [
            {"name": link.section_name, "label": link.label, "source": link.url}
            for link in sections
        ],
    }


def update_menu(links: list[QuizLink]) -> None:
    menu = json.loads(MENU_PATH.read_text())
    network = next((item for item in menu if item.get("name") == "CompTIA Network+"), None)
    if network is None:
        raise RuntimeError("Could not find CompTIA Network+ in menu.json")

    generated_names = {
        "ExamCompass N10-009 Practice Exams",
        "ExamCompass N10-009 Acronym Quizzes",
        "ExamCompass N10-009 Topic Quizzes",
    }
    network["chapter"] = [chapter for chapter in network.get("chapter", []) if chapter.get("name") not in generated_names]

    by_group = {
        "practice": [link for link in links if link.group == "practice"],
        "acronyms": [link for link in links if link.group == "acronyms"],
        "topics": [link for link in links if link.group == "topics"],
    }
    network["chapter"].extend(
        [
            chapter_for_group("ExamCompass N10-009 Practice Exams", "#D35400", by_group["practice"]),
            chapter_for_group("ExamCompass N10-009 Acronym Quizzes", "#8E44AD", by_group["acronyms"]),
            chapter_for_group("ExamCompass N10-009 Topic Quizzes", "#1F7A8C", by_group["topics"]),
        ]
    )

    MENU_PATH.write_text(json.dumps(menu, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    links = extract_quiz_links()
    print(f"Found {len(links)} quiz pages")
    cache = load_cache()

    for index, link in enumerate(links, start=1):
        if link.url in cache:
            print(f"[{index}/{len(links)}] cached {link.section_name}: {len(cache[link.url])} cards")
            continue
        print(f"[{index}/{len(links)}]", end=" ")
        cache[link.url] = scrape_quiz(link)
        save_cache(cache)
        time.sleep(0.12)

    deck = build_deck(links, cache)
    total_cards = sum(len(cards) for cards in deck.values())
    if total_cards < 1200:
        raise RuntimeError(f"Expected at least 1200 cards, got {total_cards}")

    DECK_PATH.parent.mkdir(parents=True, exist_ok=True)
    DECK_PATH.write_text(json.dumps(deck, indent=2, ensure_ascii=False) + "\n")
    # Keep docs in sync for projects that publish the generated docs tree directly;
    # Hugo validation/build will also refresh it.
    DOCS_DECK_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOCS_DECK_PATH.write_text(json.dumps(deck, indent=2, ensure_ascii=False) + "\n")
    update_menu(links)

    print(f"Wrote {total_cards} cards in {len(deck)} sections to {DECK_PATH}")
    print(f"Cache: {CACHE_PATH}")


if __name__ == "__main__":
    main()
