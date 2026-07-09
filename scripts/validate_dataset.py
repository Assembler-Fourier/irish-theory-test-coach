#!/usr/bin/env python3
"""Validate the recovered Theory Tester dataset."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "data" / "questions.json"
ENRICHED_DATASET = ROOT / "data" / "questions.enriched.json"
REVIEW_STATUSES = {"unreviewed", "needs_official_cross_check", "approved", "rejected"}
HIGH_YIELD_THRESHOLD = 68
BREAKDOWN_COMPONENTS = {
    "archived_hardest_signal",
    "road_sign_or_image_signal",
    "safety_critical_signal",
    "legal_consequence_signal",
    "category_priority_signal",
    "user_miss_rate_signal",
}


def fail(message: str) -> int:
    print(f"ERROR: {message}")
    return 1


def load_questions() -> list[dict[str, Any]]:
    if not DATASET.exists():
        raise FileNotFoundError(f"{DATASET} does not exist yet. Run recover_theory_tester.py first.")
    payload = json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("data/questions.json must contain a list of questions.")
    return payload


def validate_enriched_dataset(errors: list[str]) -> tuple[int, int]:
    if not ENRICHED_DATASET.exists():
        return 0, 0

    payload = json.loads(ENRICHED_DATASET.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        errors.append("data/questions.enriched.json must contain a list of questions")
        return 0, 0

    high_yield_count = 0
    breakdown_count = 0
    for index, question in enumerate(payload):
        qid = question.get("id", f"row {index}")
        priority_score = question.get("priority_score")
        breakdown = question.get("score_breakdown")

        if isinstance(breakdown, dict):
            breakdown_count += 1

        if not isinstance(priority_score, int):
            errors.append(f"enriched question {qid}: missing integer priority_score")
            continue

        if priority_score >= HIGH_YIELD_THRESHOLD:
            high_yield_count += 1

        if not isinstance(breakdown, dict):
            errors.append(f"enriched question {qid}: missing score_breakdown")
            continue

        missing_components = sorted(component for component in BREAKDOWN_COMPONENTS if component not in breakdown)
        if missing_components:
            errors.append(f"enriched question {qid}: missing score_breakdown components {missing_components}")

        for component in BREAKDOWN_COMPONENTS:
            value = breakdown.get(component)
            if not isinstance(value, (int, float)):
                errors.append(f"enriched question {qid}: component {component} must be numeric")

        if breakdown.get("total") != priority_score:
            errors.append(f"enriched question {qid}: score_breakdown.total does not match priority_score")

        if priority_score >= HIGH_YIELD_THRESHOLD and not breakdown.get("reasons"):
            errors.append(f"enriched question {qid}: high-yield question must include score_breakdown reasons")

    return len(payload), high_yield_count


def main() -> int:
    try:
        questions = load_questions()
    except Exception as exc:  # noqa: BLE001
        return fail(str(exc))

    errors: list[str] = []
    warnings: list[str] = []
    ids: list[int] = []
    category_counts: Counter[str] = Counter()
    image_count = 0

    for index, question in enumerate(questions):
        qid = question.get("id")
        if not isinstance(qid, int):
            errors.append(f"row {index}: missing integer id")
            continue
        ids.append(qid)

        text = str(question.get("question", "")).strip()
        if not text:
            errors.append(f"question {qid}: missing question text")

        category = str(question.get("category", "")).strip() or "(uncategorized)"
        category_counts[category] += 1

        source_type = str(question.get("source_type", "")).strip()
        if not source_type:
            errors.append(f"question {qid}: missing source_type")

        source_reference = str(question.get("source_reference", "")).strip()
        if not source_reference:
            errors.append(f"question {qid}: missing source_reference")

        reviewed_status = str(question.get("reviewed_status", "")).strip()
        if reviewed_status not in REVIEW_STATUSES:
            errors.append(f"question {qid}: invalid reviewed_status {reviewed_status!r}")

        if source_type == "ai_generated" and reviewed_status != "approved" and question.get("safe_to_show") is True:
            errors.append(f"question {qid}: unapproved AI-generated question cannot be safe_to_show")

        if reviewed_status == "rejected" and question.get("safe_to_show") is True:
            errors.append(f"question {qid}: rejected question cannot be safe_to_show")

        options = question.get("options")
        if not isinstance(options, list) or len(options) < 2:
            errors.append(f"question {qid}: expected at least 2 answer options")
            options = []

        correct_options = [option for option in options if option.get("is_correct")]
        if len(correct_options) != 1:
            errors.append(f"question {qid}: expected exactly 1 correct answer, found {len(correct_options)}")

        correct_index = question.get("correct_index")
        if not isinstance(correct_index, int) or correct_index < 0 or correct_index >= len(options):
            errors.append(f"question {qid}: invalid correct_index")

        for image_path in question.get("local_image_paths") or []:
            image_count += 1
            full_path = ROOT / image_path
            if not full_path.exists():
                warnings.append(f"question {qid}: missing image file {image_path}")

    duplicate_ids = sorted(qid for qid, count in Counter(ids).items() if count > 1)
    if duplicate_ids:
        errors.append(f"duplicate question ids: {duplicate_ids[:20]}")

    missing_between_min_max: list[int] = []
    if ids:
        present = set(ids)
        missing_between_min_max = [qid for qid in range(min(ids), max(ids) + 1) if qid not in present]

    print("Dataset summary")
    print(f"- questions: {len(questions)}")
    print(f"- id range: {min(ids) if ids else 'n/a'} to {max(ids) if ids else 'n/a'}")
    print(f"- missing ids inside range: {len(missing_between_min_max)}")
    print(f"- image references: {image_count}")
    enriched_count, enriched_high_yield = validate_enriched_dataset(errors)
    if enriched_count:
        print(f"- enriched questions: {enriched_count}")
        print(f"- enriched high-yield questions: {enriched_high_yield}")
    print("- categories:")
    for category, count in sorted(category_counts.items()):
        print(f"  - {category}: {count}")

    if warnings:
        print("\nWarnings")
        for warning in warnings[:50]:
            print(f"- {warning}")
        if len(warnings) > 50:
            print(f"- ... {len(warnings) - 50} more warnings")

    if errors:
        print("\nErrors")
        for error in errors[:50]:
            print(f"- {error}")
        if len(errors) > 50:
            print(f"- ... {len(errors) - 50} more errors")
        return 1

    print("\nOK: dataset passed validation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
