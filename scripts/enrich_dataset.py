#!/usr/bin/env python3
"""Add learning metadata to recovered Theory Tester questions."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from recover_theory_tester import find_all, parse_dom, text_content


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "data" / "questions.json"
HARDEST_HTML = ROOT / "data" / "raw" / "pages" / "hardest-theory-test-questions.html"
ENRICHED_PATH = ROOT / "data" / "questions.enriched.json"
HARDEST_PATH = ROOT / "data" / "hardest_questions.json"
REPORT_PATH = ROOT / "data" / "study_report.json"
USER_STATS_PATHS = [
    ROOT / "data" / "question_stats.json",
    ROOT / "data" / "server_question_stats.json",
    ROOT / "data" / "user_question_stats.json",
    ROOT / "data" / "user_miss_rates.json",
]


BASE_SCORE = 35
HIGH_YIELD_THRESHOLD = 68
CRITICAL_THRESHOLD = 82


CATEGORY_WEIGHTS = {
    "safe and responsible driving": 10,
    "legal matters/rules of the road": 11,
    "managing risk": 9,
    "control of vehicle": 7,
    "traffic signs": 9,
    "road signs": 9,
    "technical": 6,
    "drugs and alcohol": 9,
    "vulnerable road users": 9,
    "alert driving": 7,
    "observation": 7,
    "collisions": 8,
}

SAFETY_CRITICAL_KEYWORDS = {
    "emergency": 5,
    "collision": 5,
    "accident": 5,
    "skid": 5,
    "braking": 4,
    "brake": 3,
    "stopping distance": 5,
    "pedestrian": 3,
    "cyclist": 3,
    "motorcyclist": 3,
    "vulnerable": 4,
    "alcohol": 5,
    "drug": 5,
    "speed": 4,
    "tyre": 4,
    "seat belt": 4,
    "tunnel": 4,
    "hazard": 3,
    "blind spot": 4,
    "weather": 3,
    "wet": 3,
    "break down": 4,
    "breakdown": 4,
    "warning triangle": 4,
    "fire": 5,
    "danger": 4,
    "risk": 3,
}

LEGAL_CONSEQUENCE_KEYWORDS = {
    "must": 2,
    "never": 3,
    "not permitted": 5,
    "illegal": 5,
    "garda": 4,
    "by law": 5,
    "permitted": 3,
    "prohibited": 4,
    "tax": 4,
    "insurance": 4,
    "licence": 4,
    "nct": 4,
    "penalty": 4,
    "offence": 4,
    "motorway": 4,
    "overtake": 4,
    "junction": 3,
    "roundabout": 3,
    "traffic lights": 3,
    "yield": 4,
    "give way": 4,
    "right of way": 4,
    "road markings": 4,
    "road marking": 4,
    "sign": 3,
    "speed limit": 4,
    "public road": 3,
    "disc": 3,
}


def load_questions() -> list[dict[str, Any]]:
    if not QUESTIONS_PATH.exists():
        raise FileNotFoundError("Run recover_theory_tester.py first; data/questions.json is missing.")
    return json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))


def load_user_miss_stats() -> dict[int, dict[str, Any]]:
    for path in USER_STATS_PATHS:
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        rows = normalise_stats_payload(payload)
        stats: dict[int, dict[str, Any]] = {}
        for row in rows:
            qid = row.get("question_id") or row.get("questionId") or row.get("id")
            try:
                question_id = int(qid)
            except (TypeError, ValueError):
                continue

            attempts = int(row.get("attempts") or row.get("answered") or row.get("total") or 0)
            missed = int(row.get("missed") or row.get("wrong") or row.get("incorrect") or 0)
            miss_rate = row.get("miss_rate", row.get("missRate", None))
            if miss_rate is None and attempts:
                miss_rate = missed / attempts
            try:
                miss_rate_float = float(miss_rate)
            except (TypeError, ValueError):
                continue
            if miss_rate_float > 1:
                miss_rate_float = miss_rate_float / 100

            stats[question_id] = {
                "attempts": attempts,
                "miss_rate": max(0.0, min(1.0, miss_rate_float)),
                "source": path.name,
            }
        return stats
    return {}


def normalise_stats_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("questions", "rows", "stats", "question_stats"):
            rows = payload.get(key)
            if isinstance(rows, list):
                return [row for row in rows if isinstance(row, dict)]
        normalised = []
        for key, value in payload.items():
            if isinstance(value, dict):
                row = dict(value)
                row.setdefault("question_id", key)
                normalised.append(row)
        return normalised
    return []


def parse_hardest_page() -> dict[int, dict[str, Any]]:
    if not HARDEST_HTML.exists():
        return {}

    html = HARDEST_HTML.read_text(encoding="utf-8", errors="replace")
    dom = parse_dom(html)
    hardest: dict[int, dict[str, Any]] = {}

    blocks = find_all(dom, lambda node: "p-stats-question" in set(node.attrs.get("class", "").split()))
    for block in blocks:
        href = ""
        for link in find_all(block, lambda node: node.tag == "a"):
            href = link.attrs.get("href", "")
            if "/questions/" in href:
                break
        match = re.search(r"/questions/(\d+)", href)
        if not match:
            continue

        qid = int(match.group(1))
        text = text_content(block)
        rank_match = re.match(r"(\d+)\s+", text)
        rate_match = re.search(r"Answered Correctly\s+([\d.]+)%", text, re.IGNORECASE)
        answer_match = re.search(r"Correct Answer:\s*(.*?)\s*Answered Correctly", text, re.IGNORECASE)

        hardest[qid] = {
            "id": qid,
            "rank": int(rank_match.group(1)) if rank_match else None,
            "correct_rate": float(rate_match.group(1)) if rate_match else None,
            "correct_answer_snapshot": answer_match.group(1).strip() if answer_match else "",
            "source": "Archived Theory Tester hardest questions page",
        }

    return hardest


def category_weight(category: str) -> int:
    category_lower = category.lower()
    for key, weight in CATEGORY_WEIGHTS.items():
        if key in category_lower:
            return weight
    return 3


def question_haystack(question: dict[str, Any]) -> str:
    return " ".join(
        [
            question.get("question", ""),
            question.get("explanation", ""),
            question.get("correct_answer", ""),
            " ".join(option.get("text", "") for option in question.get("options", [])),
        ]
    ).lower()


def keyword_signal(haystack: str, keyword_weights: dict[str, int], cap: int) -> tuple[int, list[str]]:
    score = 0
    matches = []
    for keyword, weight in keyword_weights.items():
        if keyword in haystack:
            score += weight
            matches.append(keyword)
    return min(score, cap), matches[:8]


def archived_hardest_signal(hardest_entry: dict[str, Any] | None) -> tuple[int, list[dict[str, str]]]:
    if not hardest_entry:
        return 0, []

    rank = hardest_entry.get("rank") or 50
    correct_rate = hardest_entry.get("correct_rate")
    score = max(10, int(round(30 - (rank - 1) * 0.4)))
    reasons = [
        {
            "key": "commonly_missed",
            "label": "Commonly missed",
            "detail": f"Appeared at rank #{rank} in the archived hardest-question list.",
        }
    ]
    if correct_rate is not None and correct_rate < 50:
        score += 3
        reasons.append(
            {
                "key": "commonly_missed",
                "label": "Low archive accuracy",
                "detail": f"Archived correct rate was {correct_rate:.1f}%.",
            }
        )
    return min(score, 32), reasons


def road_sign_or_image_signal(question: dict[str, Any], haystack: str) -> tuple[int, list[dict[str, str]], bool]:
    has_image = bool(question.get("local_image_paths") or question.get("image_urls"))
    question_text = question.get("question", "").lower()
    sign_text = (
        re.search(r"\b(sign|signs)\b", question_text) is not None
        or "signed cycle track" in question_text
        or "road marking" in question_text
    )
    if not (has_image or sign_text):
        return 0, [], False
    detail = "Uses an image or sign/road-marking wording."
    return 9, [{"key": "road_sign_or_image", "label": "Road sign/image", "detail": detail}], True


def user_miss_rate_signal(question_id: int, user_stats: dict[int, dict[str, Any]]) -> tuple[int, list[dict[str, str]]]:
    stats = user_stats.get(question_id)
    if not stats:
        return 0, []

    attempts = stats.get("attempts") or 0
    miss_rate = stats.get("miss_rate") or 0
    if attempts < 3:
        return 0, []

    score = min(12, round(float(miss_rate) * 12))
    if score <= 0:
        return 0, []

    return score, [
        {
            "key": "user_miss_rate",
            "label": "User miss rate",
            "detail": f"{miss_rate * 100:.0f}% miss rate from {attempts} saved attempts.",
        }
    ]


def label_for_score(score: int) -> str:
    if score >= CRITICAL_THRESHOLD:
        return "Critical"
    if score >= HIGH_YIELD_THRESHOLD:
        return "High"
    if score >= 54:
        return "Medium"
    return "Standard"


def reason_labels(reasons: list[dict[str, str]]) -> list[str]:
    labels = []
    for reason in reasons:
        label = reason.get("label", "").strip()
        if label and label not in labels:
            labels.append(label)
    return labels


def enrich_question(
    question: dict[str, Any],
    hardest: dict[int, dict[str, Any]],
    user_stats: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    qid = question["id"]
    signals: list[str] = []
    reasons: list[dict[str, str]] = []
    haystack = question_haystack(question)

    cat_weight = category_weight(question.get("category", ""))
    if cat_weight >= 7:
        signals.append("core category")
        reasons.append(
            {
                "key": "category_priority",
                "label": "Core category",
                "detail": f"{question.get('category', 'Uncategorised')} is weighted as a core study category.",
            }
        )

    visual_score, visual_reasons, is_road_sign = road_sign_or_image_signal(question, haystack)
    if visual_score:
        signals.append("road-sign/image")
        reasons.extend(visual_reasons)

    safety_score, safety_signals = keyword_signal(haystack, SAFETY_CRITICAL_KEYWORDS, 18)
    if safety_score:
        signals.append("safety-critical")
        signals.extend(safety_signals)
        reasons.append(
            {
                "key": "safety_critical",
                "label": "Safety-critical",
                "detail": f"Matched safety wording: {', '.join(safety_signals[:4])}.",
            }
        )

    legal_score, legal_signals = keyword_signal(haystack, LEGAL_CONSEQUENCE_KEYWORDS, 16)
    if legal_score:
        signals.append("legal/rules")
        signals.extend(legal_signals)
        reasons.append(
            {
                "key": "legal_consequence",
                "label": "Legal/rules",
                "detail": f"Matched legal or rules wording: {', '.join(legal_signals[:4])}.",
            }
        )

    hardest_entry = hardest.get(qid)
    hardest_score, hardest_reasons = archived_hardest_signal(hardest_entry)
    if hardest_entry:
        correct_rate = hardest_entry.get("correct_rate")
        signals.append("archived hardest list")
        reasons.extend(hardest_reasons)
        if correct_rate is not None and correct_rate < 50:
            signals.append("low community accuracy")

    user_score, user_reasons = user_miss_rate_signal(qid, user_stats)
    if user_score:
        signals.append("user miss rate")
        reasons.extend(user_reasons)

    component_total = (
        BASE_SCORE
        + cat_weight
        + visual_score
        + safety_score
        + legal_score
        + hardest_score
        + user_score
    )
    score = min(100, max(1, component_total))
    label = label_for_score(score)

    score_breakdown = {
        "base_score": BASE_SCORE,
        "archived_hardest_signal": hardest_score,
        "road_sign_or_image_signal": visual_score,
        "safety_critical_signal": safety_score,
        "legal_consequence_signal": legal_score,
        "category_priority_signal": cat_weight,
        "user_miss_rate_signal": user_score,
        "total": score,
        "thresholds": {
            "high_yield": HIGH_YIELD_THRESHOLD,
            "critical": CRITICAL_THRESHOLD,
        },
        "matched_keywords": {
            "safety_critical": safety_signals,
            "legal_consequence": legal_signals,
        },
        "reasons": reasons,
        "note": "Study-priority estimate only; not an official exam-frequency claim.",
    }

    enriched = dict(question)
    enriched["priority_score"] = score
    enriched["priority_label"] = label
    enriched["study_signals"] = sorted(set(signals))
    enriched["score_breakdown"] = score_breakdown
    enriched["is_road_sign"] = is_road_sign
    enriched["hardest_rank"] = hardest_entry.get("rank") if hardest_entry else None
    enriched["community_correct_rate"] = hardest_entry.get("correct_rate") if hardest_entry else None
    enriched["importance_note"] = (
        "High-yield score from transparent archived-hardest, visual, safety, legal, category, "
        "and optional user-miss-rate signals. It is not an official frequency guarantee."
    )
    return enriched


def write_report(questions: list[dict[str, Any]], hardest: dict[int, dict[str, Any]]) -> None:
    label_counts = Counter(question["priority_label"] for question in questions)
    category_counts = Counter(question.get("category", "Uncategorised") for question in questions)
    high_yield = [question for question in questions if question["priority_score"] >= 68]
    road_signs = [question for question in questions if question["is_road_sign"]]
    high_yield_reason_counts = Counter()
    component_positive_counts = Counter()
    for question in high_yield:
        breakdown = question.get("score_breakdown", {})
        for component in (
            "archived_hardest_signal",
            "road_sign_or_image_signal",
            "safety_critical_signal",
            "legal_consequence_signal",
            "category_priority_signal",
            "user_miss_rate_signal",
        ):
            if breakdown.get(component, 0) > 0:
                component_positive_counts[component] += 1
        for reason in breakdown.get("reasons", []):
            high_yield_reason_counts[reason.get("key", "unknown")] += 1

    top_categories = []
    for category, count in category_counts.items():
        category_questions = [question for question in questions if question.get("category", "Uncategorised") == category]
        category_high_yield = [question for question in category_questions if question["priority_score"] >= HIGH_YIELD_THRESHOLD]
        average_score = sum(question["priority_score"] for question in category_questions) / max(1, len(category_questions))
        top_categories.append(
            {
                "category": category,
                "questions": count,
                "high_yield_questions": len(category_high_yield),
                "average_score": round(average_score, 1),
            }
        )

    report = {
        "summary": {
            "questions": len(questions),
            "high_yield_questions": len(high_yield),
            "critical_questions": label_counts.get("Critical", 0),
            "road_sign_or_image_questions": len(road_signs),
            "archived_hardest_questions_found": len(hardest),
        },
        "priority_labels": dict(sorted(label_counts.items())),
        "categories": dict(sorted(category_counts.items())),
        "top_categories": sorted(
            top_categories,
            key=lambda item: (item["high_yield_questions"], item["average_score"], item["questions"]),
            reverse=True,
        )[:12],
        "top_high_yield_reasons": [
            {"reason": reason, "questions": count}
            for reason, count in high_yield_reason_counts.most_common()
        ],
        "component_coverage": dict(sorted(component_positive_counts.items())),
        "top_50_high_yield": [
            {
                "id": question["id"],
                "score": question["priority_score"],
                "label": question["priority_label"],
                "category": question["category"],
                "hardest_rank": question["hardest_rank"],
                "community_correct_rate": question["community_correct_rate"],
                "score_breakdown": {
                    key: question["score_breakdown"][key]
                    for key in (
                        "archived_hardest_signal",
                        "road_sign_or_image_signal",
                        "safety_critical_signal",
                        "legal_consequence_signal",
                        "category_priority_signal",
                        "user_miss_rate_signal",
                    )
                },
                "reasons": reason_labels(question["score_breakdown"].get("reasons", [])),
                "question": question["question"],
            }
            for question in sorted(
                questions,
                key=lambda item: (
                    item["priority_score"],
                    -(item["hardest_rank"] or 999),
                    -item["id"],
                ),
                reverse=True,
            )[:50]
        ],
        "methodology": [
            f"Every question starts with a baseline score of {BASE_SCORE}.",
            "Archived hardest-page presence adds an archived_hardest_signal, with higher-ranked and lower-accuracy archived items receiving more points.",
            "Road sign, road-marking, or image-based questions add road_sign_or_image_signal points.",
            "Safety-critical wording adds safety_critical_signal points for themes such as hazards, braking, vulnerable road users, alcohol/drugs, speed, and emergencies.",
            "Legal/rules wording adds legal_consequence_signal points for themes such as must/never, Garda, tax, insurance, speed limits, giving way, signs, markings, and overtaking.",
            "Category priority adds category_priority_signal points for core Irish Category B study areas.",
            "If exported server attempt stats exist, user_miss_rate_signal adds points for questions missed often by users.",
            "The score estimates study priority; it does not claim official Driver Theory Test frequency.",
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    questions = load_questions()
    hardest = parse_hardest_page()
    user_stats = load_user_miss_stats()
    enriched = [enrich_question(question, hardest, user_stats) for question in questions]
    enriched.sort(key=lambda item: item["id"])

    ENRICHED_PATH.write_text(json.dumps(enriched, indent=2, ensure_ascii=False), encoding="utf-8")
    HARDEST_PATH.write_text(
        json.dumps(list(hardest.values()), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_report(enriched, hardest)

    print(f"Enriched {len(enriched)} questions.")
    print(f"Hardest-page signals: {len(hardest)}.")
    print(f"User miss-rate signals: {len(user_stats)}.")
    print(f"Wrote {ENRICHED_PATH.relative_to(ROOT)} and {REPORT_PATH.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
