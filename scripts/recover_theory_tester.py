#!/usr/bin/env python3
"""Recover archived Theory Tester question data from the Wayback Machine.

This script only uses public archive captures. It does not authenticate,
scrape private accounts, or bypass access controls.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw" / "questions"
ASSET_DIR = DATA_DIR / "assets"

CDX_URL = (
    "https://web.archive.org/cdx"
    "?url=theory-tester.com/questions/*"
    "&output=json"
    "&fl=timestamp,original,statuscode,mimetype,digest"
    "&filter=statuscode:200"
    "&filter=mimetype:text/html"
)

USER_AGENT = "Mozilla/5.0 (compatible; TheoryTesterRecovery/1.0)"
WORKERS = int(os.environ.get("RECOVERY_WORKERS", "16"))
SNAPSHOT_LIMIT = int(os.environ.get("RECOVERY_SNAPSHOT_LIMIT", "12"))
QUESTION_RE = re.compile(
    r"https?://(?:www\.)?theory-tester\.com(?::80)?/questions/(\d+)(?:[/?#].*)?$",
    re.IGNORECASE,
)
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


@dataclass(frozen=True)
class CdxRow:
    timestamp: str
    original: str
    statuscode: str
    mimetype: str
    digest: str


class Node:
    def __init__(self, tag: str, attrs: list[tuple[str, str | None]] | None = None):
        self.tag = tag.lower()
        self.attrs = {name.lower(): value or "" for name, value in (attrs or [])}
        self.children: list[Node | str] = []


class MiniDomParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("__root__")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag.lower() not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def request_text(url: str, attempts: int = 4) -> str:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=45) as response:
                return response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(min(2 * attempt, 8))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def request_bytes(url: str, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=45) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(min(2 * attempt, 8))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def archive_url(row: CdxRow) -> str:
    return f"https://web.archive.org/web/{row.timestamp}id_/{row.original}"


def load_cdx_rows() -> list[CdxRow]:
    body = request_text(CDX_URL)
    rows = json.loads(body)
    header, values = rows[0], rows[1:]
    if header != ["timestamp", "original", "statuscode", "mimetype", "digest"]:
        raise RuntimeError(f"Unexpected CDX header: {header}")
    return [CdxRow(*row) for row in values]


def question_id(original: str) -> int | None:
    match = QUESTION_RE.match(original)
    return int(match.group(1)) if match else None


def group_question_rows(rows: list[CdxRow]) -> dict[int, list[CdxRow]]:
    grouped: dict[int, list[CdxRow]] = {}
    for row in rows:
        qid = question_id(row.original)
        if qid is None:
            continue
        grouped.setdefault(qid, []).append(row)

    for qid, captures in grouped.items():
        grouped[qid] = sorted(captures, key=lambda item: item.timestamp, reverse=True)
    return dict(sorted(grouped.items()))


def unique_snapshot_rows(rows: list[CdxRow]) -> list[CdxRow]:
    unique: list[CdxRow] = []
    seen: set[str] = set()
    for row in rows:
        key = row.digest or f"{row.timestamp}:{row.original}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    if SNAPSHOT_LIMIT > 0:
        return unique[:SNAPSHOT_LIMIT]
    return unique


def parse_dom(html: str) -> Node:
    parser = MiniDomParser()
    parser.feed(html)
    return parser.root


def classes(node: Node) -> set[str]:
    return set(node.attrs.get("class", "").split())


def find_all(node: Node, predicate) -> list[Node]:
    found: list[Node] = []
    for child in node.children:
        if isinstance(child, Node):
            if predicate(child):
                found.append(child)
            found.extend(find_all(child, predicate))
    return found


def find_first(node: Node, predicate) -> Node | None:
    for child in node.children:
        if isinstance(child, Node):
            if predicate(child):
                return child
            match = find_first(child, predicate)
            if match:
                return match
    return None


def text_content(node: Node) -> str:
    parts: list[str] = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        else:
            parts.append(text_content(child))
    return normalize_text(" ".join(parts))


def normalize_text(value: str) -> str:
    value = re.sub(r"(?<=[A-Za-z])\?(?=[A-Za-z])", "'", value)
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def relative_posix(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def parse_question_page(qid: int, row: CdxRow, html: str) -> dict[str, Any]:
    dom = parse_dom(html)

    heading = find_first(
        dom, lambda node: node.tag == "h1" and "pageHeading" in classes(node)
    )
    content = find_first(dom, lambda node: "p-questionSingle-content" in classes(node))
    if heading is None or content is None:
        raise ValueError("question heading/content not found")

    options_container = find_first(content, lambda node: node.tag == "ul" and "options" in classes(node))
    option_nodes = (
        find_all(options_container, lambda node: node.tag == "li" and "options-single" in classes(node))
        if options_container
        else []
    )
    options = []
    correct_index: int | None = None
    for index, option in enumerate(option_nodes):
        is_correct = "js-correct-answer" in classes(option)
        if is_correct:
            correct_index = index
        options.append(
            {
                "index": index,
                "text": text_content(option),
                "is_correct": is_correct,
            }
        )

    explanation_node = find_first(
        content, lambda node: "p-questionSingle-explanation" in classes(node)
    )
    explanation = text_content(explanation_node) if explanation_node else ""
    explanation = re.sub(r"^Expla?n?t?ion:\s*", "", explanation, flags=re.IGNORECASE)
    explanation = re.sub(r"^Explanation:\s*", "", explanation, flags=re.IGNORECASE)

    category_node = find_first(
        content, lambda node: "p-questionSingle-heading" in classes(node)
    )
    category = text_content(category_node) if category_node else ""

    image_urls = []
    for image in find_all(content, lambda node: node.tag == "img"):
        src = image.attrs.get("src", "").strip()
        if src:
            image_urls.append(src)

    previous_id = None
    next_id = None
    for link in find_all(content, lambda node: node.tag == "a"):
        href = link.attrs.get("href", "")
        match = re.search(r"/questions/(\d+)", href)
        if not match:
            continue
        title = link.attrs.get("title", "").lower()
        if "previous" in title:
            previous_id = int(match.group(1))
        elif "next" in title:
            next_id = int(match.group(1))

    return {
        "id": qid,
        "question": text_content(heading),
        "category": category,
        "options": options,
        "correct_index": correct_index,
        "correct_answer": options[correct_index]["text"] if correct_index is not None else "",
        "explanation": explanation,
        "image_urls": image_urls,
        "local_image_paths": [],
        "previous_id": previous_id,
        "next_id": next_id,
        "source_url": row.original,
        "archive_url": archive_url(row),
        "archive_timestamp": row.timestamp,
    }


def raw_snapshot_path(qid: int, row: CdxRow) -> Path:
    return RAW_DIR / f"{qid}_{row.timestamp}.html"


def fetch_and_parse_question(item: tuple[int, list[CdxRow]]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    qid, rows = item
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    stable_path = RAW_DIR / f"{qid}.html"
    attempts: list[dict[str, str]] = []

    if stable_path.exists() and stable_path.stat().st_size > 0:
        try:
            html = stable_path.read_text(encoding="utf-8", errors="replace")
            return parse_question_page(qid, rows[0], html), None
        except Exception as exc:  # noqa: BLE001 - fall through to alternate captures.
            attempts.append({"url": str(stable_path), "error": str(exc)})

    for row in unique_snapshot_rows(rows):
        url = archive_url(row)
        snapshot_path = raw_snapshot_path(qid, row)
        try:
            if snapshot_path.exists() and snapshot_path.stat().st_size > 0:
                html = snapshot_path.read_text(encoding="utf-8", errors="replace")
            else:
                html = request_text(url)
                snapshot_path.write_text(html, encoding="utf-8")
            question = parse_question_page(qid, row, html)
            stable_path.write_text(html, encoding="utf-8")
            return question, None
        except Exception as exc:  # noqa: BLE001 - keep per-page recovery moving.
            attempts.append({"url": url, "error": str(exc)})

    last_error = attempts[-1]["error"] if attempts else "no archived captures found"
    return None, {
        "id": qid,
        "error": last_error,
        "attempts": attempts[-10:],
        "captures_checked": len(attempts),
        "captures_available": len(rows),
    }


def asset_path_for(url: str) -> Path:
    parsed = urlparse(url)
    path = parsed.path.lstrip("/")
    if not path:
        path = quote(url, safe="")
    return ASSET_DIR / path


def download_asset(url: str) -> tuple[str, str | None, str | None]:
    target = asset_path_for(url)
    if target.exists() and target.stat().st_size > 0:
        return url, relative_posix(target), None
    try:
        payload = request_bytes(url)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        return url, relative_posix(target), None
    except Exception as exc:  # noqa: BLE001
        return url, None, str(exc)


def write_outputs(questions: list[dict[str, Any]], errors: list[dict[str, Any]], rows: dict[int, list[CdxRow]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    (DATA_DIR / "questions.json").write_text(
        json.dumps(questions, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    with (DATA_DIR / "questions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "category",
                "question",
                "correct_answer",
                "explanation",
                "options_json",
                "image_paths_json",
                "archive_url",
            ],
        )
        writer.writeheader()
        for question in questions:
            writer.writerow(
                {
                    "id": question["id"],
                    "category": question["category"],
                    "question": question["question"],
                    "correct_answer": question["correct_answer"],
                    "explanation": question["explanation"],
                    "options_json": json.dumps(question["options"], ensure_ascii=False),
                    "image_paths_json": json.dumps(question["local_image_paths"], ensure_ascii=False),
                    "archive_url": question["archive_url"],
                }
            )

    manifest = [
        {
            "id": qid,
            "captures": len(captures),
            "latest_timestamp": captures[0].timestamp,
            "latest_original": captures[0].original,
            "latest_archive_url": archive_url(captures[0]),
            "latest_digest": captures[0].digest,
        }
        for qid, captures in rows.items()
    ]
    (DATA_DIR / "recovery_manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    ids = [question["id"] for question in questions]
    missing_between_min_max = []
    if ids:
        present = set(ids)
        missing_between_min_max = [
            qid for qid in range(min(ids), max(ids) + 1) if qid not in present
        ]

    categories: dict[str, int] = {}
    for question in questions:
        categories[question["category"]] = categories.get(question["category"], 0) + 1

    report = {
        "source": "Internet Archive Wayback Machine CDX API",
        "domain_status_when_checked": "theory-tester.com was not reachable from this machine",
        "questions_recovered": len(questions),
        "question_ids_available": len(rows),
        "question_captures_available": sum(len(captures) for captures in rows.values()),
        "snapshot_limit_per_question": SNAPSHOT_LIMIT,
        "parse_errors": errors,
        "id_range": [min(ids), max(ids)] if ids else None,
        "missing_ids_between_min_max": missing_between_min_max,
        "categories": dict(sorted(categories.items())),
        "generated_files": [
            "data/questions.json",
            "data/questions.csv",
            "data/recovery_manifest.json",
            "data/recovery_report.json",
            "data/raw/questions/*.html",
            "data/assets/**",
        ],
        "rights_note": (
            "Recovered pages came from public archives. Reuse the content only if you "
            "own it or have the rights/licence to republish it."
        ),
    }
    (DATA_DIR / "recovery_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def main() -> int:
    print("Loading Wayback CDX index...", flush=True)
    rows = load_cdx_rows()
    selected = group_question_rows(rows)
    print(f"CDX rows: {len(rows)}", flush=True)
    print(f"Question detail IDs: {len(selected)}", flush=True)
    print(f"Snapshot fallback limit: {SNAPSHOT_LIMIT}", flush=True)

    questions: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = [executor.submit(fetch_and_parse_question, item) for item in selected.items()]
        for index, future in enumerate(as_completed(futures), 1):
            question, error = future.result()
            if question:
                questions.append(question)
            if error:
                errors.append(error)
            if index % 50 == 0 or index == len(futures):
                print(f"Fetched {index}/{len(futures)} pages...", flush=True)

    questions.sort(key=lambda item: item["id"])
    errors.sort(key=lambda item: item["id"])

    image_urls = sorted({url for question in questions for url in question["image_urls"]})
    image_map: dict[str, str] = {}
    asset_errors: list[dict[str, str]] = []
    if image_urls:
        print(f"Downloading {len(image_urls)} unique images...", flush=True)
        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = [executor.submit(download_asset, url) for url in image_urls]
            for index, future in enumerate(as_completed(futures), 1):
                url, path, error = future.result()
                if path:
                    image_map[url] = path
                if error:
                    asset_errors.append({"url": url, "error": error})
                if index % 25 == 0 or index == len(futures):
                    print(f"Downloaded {index}/{len(futures)} images...", flush=True)

    for question in questions:
        question["local_image_paths"] = [
            image_map[url] for url in question["image_urls"] if url in image_map
        ]

    if asset_errors:
        errors.append({"id": "assets", "errors": asset_errors})

    write_outputs(questions, errors, selected)
    print(f"Recovered {len(questions)} questions.", flush=True)
    if errors:
        print(f"Completed with {len(errors)} recovery warnings. See data/recovery_report.json.", flush=True)
    else:
        print("Completed without recovery warnings.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
