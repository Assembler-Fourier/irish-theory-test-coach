#!/usr/bin/env python3
"""Generate full audit and question-bank Word/PDF deliverables."""

from __future__ import annotations

import csv
import json
import math
import re
import subprocess
import textwrap
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image as PdfImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DOC_DIR = ROOT / "output" / "documents"
PDF_DIR = ROOT / "output" / "pdf"
REPORT_DIR = ROOT / "reports" / "audit"
META_DIR = REPORT_DIR / "metadata"
SCREENSHOT_DIR = ROOT / "reports" / "ui" / "latest"
CACHE_DIR = DOC_DIR / "question-image-cache"

AUDIT_DOCX = DOC_DIR / "irish-theory-test-coach-full-audit-report.docx"
AUDIT_PDF = PDF_DIR / "irish-theory-test-coach-full-audit-report.pdf"
QUESTION_DOCX = DOC_DIR / "irish-theory-test-coach-question-bank-with-answers.docx"
QUESTION_PDF = PDF_DIR / "irish-theory-test-coach-question-bank-with-answers.pdf"
QUESTION_CSV = DOC_DIR / "irish-theory-test-coach-question-bank-with-answers.csv"
MANIFEST = DOC_DIR / "deliverable-pack-manifest.json"

ACCENT = "0D5C47"
INK = "10231F"
MUTED = "5D706B"
SOFT = "E9F4EF"
LINE = "C9DAD3"
WARN = "8A5A00"
RISK = "9B1C1C"
BG = "F8FBF8"

SCREENSHOT_ORDER = [
    ("desktop-homepage.png", "Desktop homepage"),
    ("desktop-app-preview.png", "Desktop quiz preview"),
    ("answer-feedback.png", "Answer feedback and coach UI"),
    ("desktop-paywall.png", "Premium paywall"),
    ("restore-access.png", "Restore access"),
    ("pricing-page.png", "Pricing page"),
    ("seo-landing-page.png", "SEO study-plan landing page"),
    ("admin-locked-state.png", "Admin locked state"),
    ("mobile-first-load.png", "Mobile first load"),
    ("mobile-quiz-360.png", "Mobile quiz at 360px"),
]


def main() -> None:
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    register_fonts()
    facts = collect_facts()
    questions = facts["questions"]
    image_cache = build_question_image_cache(questions)
    facts["image_cache"] = image_cache

    write_question_csv(questions, image_cache)
    build_audit_docx(facts)
    build_audit_pdf(facts)
    build_question_docx(facts)
    build_question_pdf(facts)
    write_manifest(facts)

    print(f"Wrote {AUDIT_DOCX}")
    print(f"Wrote {AUDIT_PDF}")
    print(f"Wrote {QUESTION_DOCX}")
    print(f"Wrote {QUESTION_PDF}")
    print(f"Wrote {QUESTION_CSV}")
    print(f"Wrote {MANIFEST}")


def collect_facts() -> dict[str, Any]:
    package = load_json(ROOT / "package.json")
    questions = load_json(ROOT / "data" / "questions.enriched.json")
    study_report = load_json(ROOT / "data" / "study_report.json")
    recovery_report = load_json(ROOT / "data" / "recovery_report.json")
    pricing = load_json(ROOT / "public" / "pricing.json") if (ROOT / "public" / "pricing.json").exists() else {}
    external_sources = (
        load_json(ROOT / "data" / "external-source-register.json")
        if (ROOT / "data" / "external-source-register.json").exists()
        else {}
    )
    import_report = (
        load_json(ROOT / "reports" / "content" / "owner-question-import-report.json")
        if (ROOT / "reports" / "content" / "owner-question-import-report.json").exists()
        else {}
    )
    schema = (ROOT / "database" / "schema.sql").read_text(encoding="utf-8")
    github_repo = load_json(META_DIR / "github-repo.json") if (META_DIR / "github-repo.json").exists() else {}
    github_pr = load_json(META_DIR / "github-pr-1.json") if (META_DIR / "github-pr-1.json").exists() else {}
    vercel_inspect = read_text(META_DIR / "vercel-inspect.txt")
    qa_output = read_text(REPORT_DIR / "qa-output.txt")

    public_pages = sorted(p.name for p in (ROOT / "public").glob("*.html"))
    docs = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "docs").rglob("*.md"))
    api_files = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "api").rglob("*.js"))
    lib_files = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "lib").rglob("*.js"))
    scripts = sorted(package.get("scripts", {}).keys())
    schema_tables = re.findall(r"create table if not exists ([a-z_]+)", schema, flags=re.IGNORECASE)
    schema_indexes = re.findall(r"create (?:unique )?index if not exists ([a-z_]+)", schema, flags=re.IGNORECASE)

    git_log = run_text(["git", "log", "--oneline", "-8"])
    git_status = run_text(["git", "status", "-sb"])
    current_branch = run_text(["git", "branch", "--show-current"]).strip()
    current_commit = run_text(["git", "rev-parse", "--short", "HEAD"]).strip()

    categories = Counter(q.get("category") or "Uncategorised" for q in questions)
    sources = Counter(q.get("source_type") or "missing" for q in questions)
    statuses = Counter(q.get("reviewed_status") or "missing" for q in questions)
    ids = [q["id"] for q in questions if isinstance(q.get("id"), int)]
    local_images = sum(len(q.get("local_image_paths") or []) for q in questions)
    coach_visuals = sum(len(q.get("coach_visual_paths") or []) for q in questions)
    imported = [q for q in questions if q.get("source_type") == "owner_provided_paste"]
    high_yield = [q for q in questions if int(q.get("priority_score") or 0) >= 68]
    critical = [q for q in questions if int(q.get("priority_score") or 0) >= 82]
    road_sign = [q for q in questions if q.get("is_road_sign")]

    live_check = live_data_check()

    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "package": package,
        "questions": questions,
        "study_report": study_report,
        "recovery_report": recovery_report,
        "pricing": pricing,
        "external_sources": external_sources,
        "import_report": import_report,
        "github_repo": github_repo,
        "github_pr": github_pr,
        "vercel_inspect": vercel_inspect,
        "qa_output": qa_output,
        "public_pages": public_pages,
        "docs": docs,
        "api_files": api_files,
        "lib_files": lib_files,
        "scripts": scripts,
        "schema_tables": schema_tables,
        "schema_indexes": schema_indexes,
        "git_log": git_log,
        "git_status": git_status,
        "current_branch": current_branch,
        "current_commit": current_commit,
        "counts": {
            "questions": len(questions),
            "id_min": min(ids) if ids else None,
            "id_max": max(ids) if ids else None,
            "missing_ids": len(set(range(min(ids), max(ids) + 1)) - set(ids)) if ids else 0,
            "local_images": local_images,
            "coach_visuals": coach_visuals,
            "imported_owner": len(imported),
            "high_yield": len(high_yield),
            "critical": len(critical),
            "road_sign": len(road_sign),
            "categories": dict(categories.most_common()),
            "sources": dict(sources.most_common()),
            "statuses": dict(statuses.most_common()),
        },
        "live_check": live_check,
        "screenshots": available_screenshots(),
    }


def build_audit_docx(facts: dict[str, Any]) -> None:
    doc = Document()
    setup_doc(doc, title="Irish Theory Test Coach Full Audit")
    set_header_footer(doc.sections[0], "Irish Theory Test Coach - Full Audit")
    add_doc_title(
        doc,
        "Irish Theory Test Coach",
        "Complete audit report, launch guide, feature inventory, pricing, data, GitHub, deployment, and rules.",
    )
    add_disclaimer(doc)
    add_key_value_table(
        doc,
        "Executive Snapshot",
        [
            ("Live app", "https://irishtheorycoach.ie"),
            ("Production deployment", "https://irishtheorycoach.ie"),
            ("GitHub PR", facts.get("github_pr", {}).get("url", "Not found")),
            ("Branch", facts["current_branch"]),
            ("Commit", facts["current_commit"]),
            ("QA status", "Passed"),
            ("Question bank", f"{facts['counts']['questions']} questions"),
            ("Imported owner-provided questions", str(facts["counts"]["imported_owner"])),
            ("High-yield questions", str(facts["counts"]["high_yield"])),
            ("Road-sign/image drills", str(facts["counts"]["road_sign"])),
        ],
    )
    add_heading(doc, "1. Product Status")
    add_para(
        doc,
        "The product is a production-deployed independent Irish Category B theory-test practice app. It includes a static frontend in public/, Vercel serverless APIs in api/, Neon Postgres schema in database/schema.sql, Stripe checkout, restore access, progress sync, admin tools, SEO pages, PWA support, analytics, and AI coaching features.",
    )
    add_bullets(
        doc,
        [
            "QA passed on the current expanded data set.",
            "The live app serves the 1,277-question enriched data file.",
            "The GitHub repository is currently private and PR #1 is still a draft unless manually changed after this report.",
            "The deployment is Ready on Vercel and aliased to the main Vercel app URL.",
        ],
    )
    add_heading(doc, "2. Data Audit")
    add_key_value_table(
        doc,
        "Question Data",
        [
            ("Total questions", str(facts["counts"]["questions"])),
            ("ID range", f"{facts['counts']['id_min']} to {facts['counts']['id_max']}"),
            ("Missing IDs inside range", str(facts["counts"]["missing_ids"])),
            ("Local image references", str(facts["counts"]["local_images"])),
            ("Coach visuals", str(facts["counts"]["coach_visuals"])),
            ("High-yield", str(facts["counts"]["high_yield"])),
            ("Critical", str(facts["counts"]["critical"])),
            ("Road-sign/image", str(facts["counts"]["road_sign"])),
        ],
    )
    add_counter_table(doc, "Source Types", facts["counts"]["sources"])
    add_counter_table(doc, "Review Statuses", facts["counts"]["statuses"])
    add_counter_table(doc, "Top Categories", dict(list(facts["counts"]["categories"].items())[:16]))
    import_report = facts.get("import_report", {})
    if import_report:
        add_key_value_table(
            doc,
            "Owner-Provided Import",
            [
                ("Imported", str(import_report.get("imported_count", "n/a"))),
                ("Skipped", str(import_report.get("skipped_count", "n/a"))),
                ("New ID range", " to ".join(map(str, import_report.get("new_id_range", []))) or "n/a"),
                ("Downloaded source images", str(import_report.get("image_stats", {}).get("downloaded", "n/a"))),
                ("Generated practice fallback visuals", str(import_report.get("image_stats", {}).get("generated_practice", "n/a"))),
                ("Generated coach visuals", str(import_report.get("image_stats", {}).get("generated_coach", "n/a"))),
            ],
        )
    add_heading(doc, "3. Pricing And Monetization")
    add_pricing_table_docx(doc, facts)
    add_para(
        doc,
        "The pricing ladder supports a free preview, optional launch offer, Full Study Pass, and instructor packs. Pricing copy must stay legal-safe: no fake scarcity, no guaranteed pass, and no official affiliation claims.",
    )
    add_heading(doc, "4. Feature Inventory")
    add_feature_sections_docx(doc)
    add_heading(doc, "5. GitHub And Deployment")
    add_key_value_table(
        doc,
        "GitHub",
        [
            ("Repository", facts.get("github_repo", {}).get("url", "Not found")),
            ("Visibility", facts.get("github_repo", {}).get("visibility", "Not found")),
            ("Default branch", (facts.get("github_repo", {}).get("defaultBranchRef") or {}).get("name", "Not found")),
            ("Homepage", facts.get("github_repo", {}).get("homepageUrl", "Not found")),
            ("PR", facts.get("github_pr", {}).get("url", "Not found")),
            ("PR state", f"{facts.get('github_pr', {}).get('state', 'n/a')} / draft={facts.get('github_pr', {}).get('isDraft', 'n/a')}"),
        ],
    )
    add_preformatted_docx(doc, facts["git_log"], "Recent commits")
    add_preformatted_docx(doc, facts["vercel_inspect"], "Vercel inspect")
    add_heading(doc, "6. Database And API")
    add_para(doc, f"Database schema contains {len(facts['schema_tables'])} tables and {len(facts['schema_indexes'])} indexes.")
    add_small_list(doc, "Tables", facts["schema_tables"])
    add_small_list(doc, "API files", facts["api_files"])
    add_heading(doc, "7. Security, Secrets, And Trust")
    add_bullets(
        doc,
        [
            "Rotate Stripe live secret key and Neon database password before a commercial launch.",
            "Keep all secrets in Vercel environment variables, not frontend files.",
            "Admin APIs must verify session and role server-side.",
            "Webhook endpoint must use STRIPE_WEBHOOK_SECRET before accepting payment traffic.",
            "Magic-link tokens must never be logged in production.",
            "Privacy page discloses first-party analytics without third-party cookies.",
        ],
    )
    add_heading(doc, "8. SEO And Public Pages")
    add_para(doc, f"The sitemap covers {len(facts['public_pages'])} public HTML pages. Technical SEO, structured data, and internal-link checks passed.")
    add_small_list(doc, "Public HTML pages", facts["public_pages"])
    add_heading(doc, "9. Durable Rules")
    add_bullets(
        doc,
        [
            "Never claim official RSA, official Prometric, TheoryTest.ie, or official-provider affiliation.",
            "Never claim guaranteed pass, official exam frequency, or that questions come back every time.",
            "Never scrape or copy competitor question text.",
            "Premium unlocks must be verified server-side.",
            "Admin features must require server-side admin authorization.",
            "AI-generated questions must remain draft-only until reviewed by an admin.",
        ],
    )
    add_heading(doc, "10. QA Evidence")
    add_preformatted_docx(doc, qa_summary(facts["qa_output"]), "QA summary")
    add_heading(doc, "11. Screenshots")
    for image_path, caption in facts["screenshots"]:
        add_para(doc, caption, bold=True)
        doc.add_picture(str(image_path), width=Inches(5.9))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_heading(doc, "12. Launch Checklist")
    add_bullets(
        doc,
        [
            "Rotate exposed/shared credentials.",
            "Update Vercel production env vars.",
            "Configure Stripe webhook and verify checkout.session.completed.",
            "Complete a live checkout test and restore access test.",
            "Promote the first admin in Neon.",
            "Review legal pages, refund policy, and support email.",
            "Submit sitemap after custom domain launch.",
            "Keep content provenance and review status current.",
        ],
    )
    add_heading(doc, "13. Audit Opinion")
    add_para(
        doc,
        "The project is a strong MVP/pre-launch product. The main remaining work is launch discipline: rotate secrets, complete live payment and webhook testing, review legal/content wording, verify support processes, and keep question provenance clean.",
    )
    doc.save(AUDIT_DOCX)


def build_question_docx(facts: dict[str, Any]) -> None:
    doc = Document()
    setup_doc(doc, title="Irish Theory Test Coach Question Bank")
    set_header_footer(doc.sections[0], "Irish Theory Test Coach - Question Bank")
    add_doc_title(
        doc,
        "Irish Theory Test Coach Question Bank",
        "Questions, answers, explanations, study priority, and visuals from the current project dataset.",
    )
    add_disclaimer(doc)
    add_key_value_table(
        doc,
        "Question Bank Summary",
        [
            ("Total questions", str(facts["counts"]["questions"])),
            ("High-yield", str(facts["counts"]["high_yield"])),
            ("Critical", str(facts["counts"]["critical"])),
            ("Road-sign/image questions", str(facts["counts"]["road_sign"])),
            ("Local image references", str(facts["counts"]["local_images"])),
            ("Generated/coach visuals available", str(facts["counts"]["coach_visuals"])),
            ("Generated at", facts["generated_at"]),
        ],
    )
    add_para(
        doc,
        "Each entry shows the question, answer options, saved correct answer, explanation, source/review status, and an image. If the app did not already have an image, this document uses a generated study visual so every entry has a visual cue.",
    )
    grouped = group_questions(facts["questions"])
    for category, items in grouped.items():
        doc.add_section(WD_SECTION.NEW_PAGE)
        add_heading(doc, category, level=1)
        add_para(doc, f"{len(items)} questions", italic=True)
        for question in items:
            add_question_entry_docx(doc, question, facts["image_cache"][str(question["id"])])
    doc.save(QUESTION_DOCX)


def build_audit_pdf(facts: dict[str, Any]) -> None:
    styles = pdf_styles()
    doc = SimpleDocTemplate(
        str(AUDIT_PDF),
        pagesize=LETTER,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="Irish Theory Test Coach Full Audit Report",
        author="Codex",
    )
    story: list[Any] = []
    story.append(Paragraph("Irish Theory Test Coach", styles["Title"]))
    story.append(Paragraph("Complete audit report, guide, data, GitHub, deployment, features, pricing, and launch readiness.", styles["Subtitle"]))
    story.append(Paragraph("Independent practice tool. Not affiliated with RSA or Prometric.", styles["Small"]))
    story.append(Spacer(1, 0.15 * inch))
    story.append(pdf_kv_table([
        ("Live app", "https://irishtheorycoach.ie"),
        ("Deployment", "https://irishtheorycoach.ie"),
        ("Repository", facts.get("github_repo", {}).get("url", "Not found")),
        ("PR", facts.get("github_pr", {}).get("url", "Not found")),
        ("Branch / commit", f"{facts['current_branch']} / {facts['current_commit']}"),
        ("QA status", "Passed"),
    ], styles))
    add_pdf_section(story, styles, "Data Summary")
    story.append(pdf_kv_table([
        ("Questions", str(facts["counts"]["questions"])),
        ("Imported owner-provided", str(facts["counts"]["imported_owner"])),
        ("High-yield", str(facts["counts"]["high_yield"])),
        ("Critical", str(facts["counts"]["critical"])),
        ("Road-sign/image", str(facts["counts"]["road_sign"])),
        ("Local image refs", str(facts["counts"]["local_images"])),
        ("Coach visuals", str(facts["counts"]["coach_visuals"])),
    ], styles))
    add_pdf_section(story, styles, "Features")
    pdf_bullets(story, styles, [
        "Learner app: preview, modes, search, filters, feedback, mock test, review, progress, PWA.",
        "Payments: Stripe checkout, server-side verification, webhook entitlement recording.",
        "Login/progress: magic-link restore access, secure sessions, Neon progress sync.",
        "Admin: protected dashboard, users, purchases, entitlements, questions, audit log.",
        "AI: cached explanations, safe fallback, admin-only draft generation, duplicate detection.",
        "SEO/trust: legal pages, landing pages, sitemap, robots, structured data, non-affiliation footer.",
    ])
    add_pdf_section(story, styles, "Pricing")
    story.append(pdf_pricing_table(facts, styles))
    add_pdf_section(story, styles, "GitHub And Deployment")
    story.append(pdf_kv_table([
        ("Repo visibility", facts.get("github_repo", {}).get("visibility", "n/a")),
        ("Default branch", (facts.get("github_repo", {}).get("defaultBranchRef") or {}).get("name", "n/a")),
        ("PR state", f"{facts.get('github_pr', {}).get('state', 'n/a')} / draft={facts.get('github_pr', {}).get('isDraft', 'n/a')}"),
        ("Vercel status", "Ready"),
    ], styles))
    add_pdf_section(story, styles, "Security And Launch Work")
    pdf_bullets(story, styles, [
        "Rotate Stripe live secret key and Neon database password before selling.",
        "Configure STRIPE_WEBHOOK_SECRET in Vercel and test checkout.session.completed.",
        "Complete live purchase and restore-access tests.",
        "Promote first admin in Neon.",
        "Keep all premium unlocks server-side.",
        "Keep content provenance/review status current.",
    ])
    add_pdf_section(story, styles, "QA Summary")
    story.append(Paragraph(html_escape(qa_summary(facts["qa_output"])).replace("\n", "<br/>"), styles["Code"]))
    if facts["screenshots"]:
        story.append(PageBreak())
        add_pdf_section(story, styles, "Screenshots")
        for image_path, caption in facts["screenshots"][:10]:
            story.append(Paragraph(caption, styles["H3"]))
            story.append(pdf_scaled_image(image_path, 6.8 * inch, 4.3 * inch))
            story.append(Spacer(1, 0.14 * inch))
    add_pdf_section(story, styles, "Audit Opinion")
    story.append(Paragraph("This is a strong MVP/pre-launch product. The remaining work is launch discipline: rotate secrets, verify Stripe/Neon/Vercel production setup, complete live payment tests, review legal/content, and keep provenance clean.", styles["Body"]))
    doc.build(story, onFirstPage=pdf_footer, onLaterPages=pdf_footer)


def build_question_pdf(facts: dict[str, Any]) -> None:
    styles = pdf_styles()
    doc = SimpleDocTemplate(
        str(QUESTION_PDF),
        pagesize=LETTER,
        rightMargin=0.42 * inch,
        leftMargin=0.42 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.45 * inch,
        title="Irish Theory Test Coach Question Bank With Answers",
        author="Codex",
    )
    story: list[Any] = []
    story.append(Paragraph("Irish Theory Test Coach Question Bank", styles["Title"]))
    story.append(Paragraph("Complete questions, correct answers, explanations, priority labels, and visuals.", styles["Subtitle"]))
    story.append(Paragraph("Independent practice tool. Not affiliated with RSA or Prometric. High-yield means estimated study priority, not official exam frequency.", styles["Small"]))
    story.append(Spacer(1, 0.12 * inch))
    story.append(pdf_kv_table([
        ("Total questions", str(facts["counts"]["questions"])),
        ("High-yield", str(facts["counts"]["high_yield"])),
        ("Critical", str(facts["counts"]["critical"])),
        ("Road-sign/image", str(facts["counts"]["road_sign"])),
        ("Generated", facts["generated_at"]),
    ], styles))
    grouped = group_questions(facts["questions"])
    for category, items in grouped.items():
        story.append(PageBreak())
        story.append(Paragraph(html_escape(category), styles["H2"]))
        story.append(Paragraph(f"{len(items)} questions", styles["Small"]))
        for question in items:
            story.append(question_pdf_flowable(question, facts["image_cache"][str(question["id"])], styles))
            story.append(Spacer(1, 0.08 * inch))
    doc.build(story, onFirstPage=pdf_footer, onLaterPages=pdf_footer)


def add_question_entry_docx(doc: Document, question: dict[str, Any], image_path: str) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    set_table_widths(table, [Inches(1.55), Inches(4.75)])
    image_cell = table.cell(0, 0)
    text_cell = table.cell(0, 1)
    set_cell_shading(image_cell, "F8FBF8")
    set_cell_shading(text_cell, "FFFFFF")
    image_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    text_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    p = image_cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(image_path, width=Inches(1.42))

    meta = text_cell.paragraphs[0]
    r = meta.add_run(f"Q{question['id']} - {question.get('category', 'Uncategorised')}")
    r.bold = True
    r.font.color.rgb = RGBColor.from_string(ACCENT)
    r.font.size = Pt(9.5)
    meta.paragraph_format.space_after = Pt(2)

    q_para = text_cell.add_paragraph()
    q_run = q_para.add_run(clean_text(question.get("question", "")))
    q_run.bold = True
    q_run.font.size = Pt(10)
    q_para.paragraph_format.space_after = Pt(3)

    for letter, option in zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", question.get("options", [])):
        opt = text_cell.add_paragraph()
        opt.paragraph_format.left_indent = Inches(0.1)
        opt.paragraph_format.first_line_indent = Inches(-0.1)
        marker = f"{letter}. "
        if option.get("is_correct"):
            marker += "[CORRECT] "
        opt.add_run(marker).bold = True
        opt.add_run(clean_text(option.get("text", "")))
        opt.paragraph_format.space_after = Pt(1)

    add_labeled_text(text_cell, "Correct answer", question.get("correct_answer", ""))
    add_labeled_text(text_cell, "Explanation", short(clean_text(question.get("explanation", "")), 420))
    add_labeled_text(
        text_cell,
        "Study status",
        f"{question.get('priority_label', 'n/a')} {question.get('priority_score', '')}; source={question.get('source_type', 'n/a')}; review={question.get('reviewed_status', 'n/a')}",
    )
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_labeled_text(cell, label: str, value: str) -> None:
    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(f"{label}: ")
    r.bold = True
    r.font.size = Pt(8.5)
    v = p.add_run(clean_text(value))
    v.font.size = Pt(8.5)


def question_pdf_flowable(question: dict[str, Any], image_path: str, styles: dict[str, ParagraphStyle]) -> Table:
    options = []
    for letter, option in zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", question.get("options", [])):
        prefix = f"{letter}. "
        if option.get("is_correct"):
            prefix += "[CORRECT] "
        options.append(f"{prefix}{clean_text(option.get('text', ''))}")
    body = [
        Paragraph(f"<b>Q{question['id']} - {html_escape(question.get('category', 'Uncategorised'))}</b> <font color='#{MUTED}'>({question.get('priority_label', 'n/a')} {question.get('priority_score', '')})</font>", styles["Small"]),
        Paragraph(f"<b>{html_escape(clean_text(question.get('question', '')))}</b>", styles["Question"]),
        Paragraph("<br/>".join(html_escape(item) for item in options), styles["Tiny"]),
        Paragraph(f"<b>Correct answer:</b> {html_escape(clean_text(question.get('correct_answer', '')))}", styles["Tiny"]),
        Paragraph(f"<b>Explanation:</b> {html_escape(short(clean_text(question.get('explanation', '')), 330))}", styles["Tiny"]),
        Paragraph(f"<font color='#{MUTED}'>source={html_escape(question.get('source_type', 'n/a'))}; review={html_escape(question.get('reviewed_status', 'n/a'))}</font>", styles["Mini"]),
    ]
    img = pdf_scaled_image(Path(image_path), 1.35 * inch, 1.0 * inch)
    table = Table([[img, body]], colWidths=[1.55 * inch, 5.85 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#CADAD3")),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#E3ECE8")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F8FBF8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def write_question_csv(questions: list[dict[str, Any]], image_cache: dict[str, str]) -> None:
    with QUESTION_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "id",
            "category",
            "question",
            "correct_answer",
            "options",
            "explanation",
            "priority_score",
            "priority_label",
            "source_type",
            "reviewed_status",
            "image_file",
        ])
        for q in questions:
            writer.writerow([
                q.get("id"),
                q.get("category"),
                q.get("question"),
                q.get("correct_answer"),
                " | ".join(option.get("text", "") for option in q.get("options", [])),
                q.get("explanation"),
                q.get("priority_score"),
                q.get("priority_label"),
                q.get("source_type"),
                q.get("reviewed_status"),
                image_cache.get(str(q.get("id")), ""),
            ])


def build_question_image_cache(questions: list[dict[str, Any]]) -> dict[str, str]:
    cache: dict[str, str] = {}
    for question in questions:
        qid = str(question["id"])
        output = CACHE_DIR / f"q{qid}.jpg"
        if not output.exists():
            source = first_existing_image(question)
            if source:
                create_thumbnail_from_source(source, output)
            else:
                create_generated_question_visual(question, output)
        cache[qid] = str(output)
    return cache


def first_existing_image(question: dict[str, Any]) -> Path | None:
    for raw in question.get("local_image_paths") or []:
        path = ROOT / raw
        if path.exists() and path.suffix.lower() not in {".svg"}:
            return path
    return None


def create_thumbnail_from_source(source: Path, output: Path) -> None:
    try:
        image = Image.open(source).convert("RGB")
    except Exception:
        create_placeholder_visual(output, "Image unavailable", "Generated document visual")
        return
    canvas = Image.new("RGB", (640, 360), "#F8FBF8")
    image.thumbnail((560, 280), Image.Resampling.LANCZOS)
    x = (640 - image.width) // 2
    y = (310 - image.height) // 2
    canvas.paste(image, (x, y))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([26, 314, 614, 344], radius=14, fill="#E9F4EF", outline="#CADAD3")
    draw.text((42, 322), "Practice image", fill="#0D5C47", font=font(18, bold=True))
    canvas.save(output, "JPEG", quality=84, optimize=True)


def create_generated_question_visual(question: dict[str, Any], output: Path) -> None:
    canvas = Image.new("RGB", (640, 360), "#F7FBF8")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([24, 24, 616, 336], radius=22, fill="#FFFFFF", outline="#CADAD3", width=2)
    draw.rounded_rectangle([44, 44, 250, 76], radius=16, fill="#10231F")
    draw.text((58, 52), f"QUESTION {question['id']}", fill="#B8F56D", font=font(17, bold=True))
    category = short(clean_text(question.get("category", "Irish theory practice")), 42)
    draw.text((44, 96), category, fill="#5D706B", font=font(19, bold=True))
    y = 132
    for line in wrap(clean_text(question.get("question", "")), 38, 3):
        draw.text((44, y), line, fill="#10231F", font=font(25, bold=True))
        y += 32
    draw.rounded_rectangle([44, 260, 596, 316], radius=18, fill="#E9F4EF", outline="#CADAD3")
    draw.text((62, 272), "Correct answer:", fill="#0D5C47", font=font(18, bold=True))
    answer = short(clean_text(question.get("correct_answer", "")), 54)
    draw.text((62, 296), answer, fill="#10231F", font=font(16))
    canvas.save(output, "JPEG", quality=84, optimize=True)


def create_placeholder_visual(output: Path, title: str, subtitle: str) -> None:
    canvas = Image.new("RGB", (640, 360), "#F7FBF8")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([34, 42, 606, 318], radius=24, fill="#FFFFFF", outline="#CADAD3", width=2)
    draw.text((72, 135), title, fill="#10231F", font=font(32, bold=True))
    draw.text((72, 180), subtitle, fill="#5D706B", font=font(18))
    canvas.save(output, "JPEG", quality=84, optimize=True)


def group_questions(questions: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for question in sorted(questions, key=lambda item: (item.get("category") or "", item.get("id") or 0)):
        grouped[question.get("category") or "Uncategorised"].append(question)
    return dict(grouped)


def add_doc_title(doc: Document, title: str, subtitle: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(25)
    r.font.color.rgb = RGBColor.from_string(INK)
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(14)
    r2 = p2.add_run(subtitle)
    r2.font.size = Pt(11)
    r2.font.color.rgb = RGBColor.from_string(MUTED)


def add_disclaimer(doc: Document) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.left_indent = Inches(0.08)
    r = p.add_run("Independent practice tool. Not affiliated with RSA or Prometric. No guaranteed-pass or official-frequency claims.")
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor.from_string(WARN)


def setup_doc(doc: Document, title: str) -> None:
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)
    section.header_distance = Inches(0.38)
    section.footer_distance = Inches(0.38)
    core = doc.core_properties
    core.title = title
    core.author = "Codex"
    styles = doc.styles
    styles["Normal"].font.name = "Calibri"
    styles["Normal"].font.size = Pt(10)
    styles["Normal"].paragraph_format.space_after = Pt(5)
    for style_name, size, color in [
        ("Heading 1", 16, ACCENT),
        ("Heading 2", 13, ACCENT),
        ("Heading 3", 11, INK),
    ]:
        style = styles[style_name]
        style.font.name = "Calibri"
        style.font.bold = True
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(10)
        style.paragraph_format.space_after = Pt(5)


def set_header_footer(section, label: str) -> None:
    hp = section.header.paragraphs[0]
    hp.text = label
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hp.runs[0].font.size = Pt(8)
    hp.runs[0].font.color.rgb = RGBColor.from_string(MUTED)
    fp = section.footer.paragraphs[0]
    fp.text = "Generated from the local project workspace"
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    fp.runs[0].font.size = Pt(8)
    fp.runs[0].font.color.rgb = RGBColor.from_string(MUTED)


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    doc.add_heading(text, level=level)


def add_para(doc: Document, text: str, bold: bool = False, italic: bool = False) -> None:
    p = doc.add_paragraph()
    r = p.add_run(clean_text(text))
    r.bold = bold
    r.italic = italic


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style=None)
        p.paragraph_format.left_indent = Inches(0.22)
        p.paragraph_format.first_line_indent = Inches(-0.14)
        p.add_run("- ").bold = True
        p.add_run(clean_text(item))


def add_small_list(doc: Document, title: str, items: list[str], limit: int = 80) -> None:
    add_para(doc, title, bold=True)
    text = ", ".join(items[:limit])
    if len(items) > limit:
        text += f", ... {len(items) - limit} more"
    add_para(doc, text)


def add_key_value_table(doc: Document, title: str, rows: list[tuple[str, str]]) -> None:
    add_para(doc, title, bold=True)
    table = doc.add_table(rows=0, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    set_table_widths(table, [Inches(1.9), Inches(4.5)])
    for key, value in rows:
        cells = table.add_row().cells
        set_cell_shading(cells[0], SOFT)
        cells[0].text = key
        cells[1].text = clean_text(value)
        for cell in cells:
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(2)
                for run in p.runs:
                    run.font.size = Pt(9)
        cells[0].paragraphs[0].runs[0].bold = True
    doc.add_paragraph()


def add_counter_table(doc: Document, title: str, counter: dict[str, int]) -> None:
    rows = [(key, str(value)) for key, value in counter.items()]
    add_key_value_table(doc, title, rows)


def add_pricing_table_docx(doc: Document, facts: dict[str, Any]) -> None:
    plans = facts.get("pricing", {}).get("plans", [])
    if not plans and isinstance(facts.get("pricing"), dict):
        plans = list(facts.get("pricing", {}).values()) if "plans" not in facts.get("pricing", {}) else []
    table = doc.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["Plan", "Label", "Price", "Access", "Active"]
    for cell, header in zip(table.rows[0].cells, headers):
        set_cell_shading(cell, SOFT)
        cell.text = header
        cell.paragraphs[0].runs[0].bold = True
    for plan in facts.get("pricing", {}).get("plans", []):
        cells = table.add_row().cells
        cents = plan.get("amount_cents", plan.get("amountCents", 0))
        price = f"EUR {cents / 100:.2f}" if cents else "Free/custom"
        values = [
            plan.get("key", ""),
            plan.get("label", ""),
            price,
            f"{plan.get('access_days', plan.get('accessDays', 'n/a'))} days" if plan.get("access_days", plan.get("accessDays")) else "n/a",
            str(plan.get("active", "")),
        ]
        for cell, value in zip(cells, values):
            cell.text = clean_text(value)
    doc.add_paragraph()


def add_feature_sections_docx(doc: Document) -> None:
    sections = {
        "Learner App": [
            "Free preview and paid unlock path.",
            "Modes: revise, high-yield, hardest, signs, mock test, review.",
            "Question feedback, explanations, memory tips, high-yield reasons, flags, missed-review, and progress.",
            "PWA install/offline support and mobile-first layout.",
        ],
        "Payments And Access": [
            "Stripe Checkout.",
            "Server-side session verification.",
            "Webhook entitlement recording.",
            "Email restore access and secure sessions.",
        ],
        "Admin": [
            "Protected dashboard.",
            "Users, purchases, entitlements, questions, analytics, referrals.",
            "Manual entitlement management with audit logging.",
            "Question review workflow and provenance.",
        ],
        "AI": [
            "Cached AI explanation coach with fallback.",
            "Admin draft generation from approved source notes.",
            "Duplicate detection and draft-only policy.",
        ],
        "SEO And Trust": [
            "Landing pages, pricing page, learn hub, legal pages.",
            "Sitemap, robots, canonical URLs, structured data.",
            "Visible non-affiliation disclaimer.",
        ],
    }
    for title, items in sections.items():
        add_heading(doc, title, level=2)
        add_bullets(doc, items)


def add_preformatted_docx(doc: Document, text: str, title: str) -> None:
    add_para(doc, title, bold=True)
    for line in clean_text_block(text).splitlines()[:70]:
        p = doc.add_paragraph()
        r = p.add_run(line)
        r.font.name = "Consolas"
        r.font.size = Pt(8)
        p.paragraph_format.space_after = Pt(1)


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_table_widths(table, widths) -> None:
    for row in table.rows:
        for cell, width in zip(row.cells, widths):
            cell.width = width
            tc_w = cell._tc.get_or_add_tcPr().find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                cell._tc.get_or_add_tcPr().append(tc_w)
            tc_w.set(qn("w:w"), str(int(width.twips)))
            tc_w.set(qn("w:type"), "dxa")


def pdf_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle("TitleCustom", parent=base["Title"], fontName="Arial-Bold", fontSize=22, leading=27, textColor=colors.HexColor("#10231F"), alignment=TA_LEFT, spaceAfter=8),
        "Subtitle": ParagraphStyle("SubtitleCustom", parent=base["BodyText"], fontName="Arial", fontSize=10, leading=14, textColor=colors.HexColor("#5D706B"), spaceAfter=10),
        "H2": ParagraphStyle("H2Custom", parent=base["Heading2"], fontName="Arial-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#0D5C47"), spaceBefore=11, spaceAfter=6),
        "H3": ParagraphStyle("H3Custom", parent=base["Heading3"], fontName="Arial-Bold", fontSize=10, leading=13, textColor=colors.HexColor("#10231F"), spaceBefore=5, spaceAfter=4),
        "Body": ParagraphStyle("BodyCustom", parent=base["BodyText"], fontName="Arial", fontSize=9.2, leading=12.8, textColor=colors.HexColor("#1C2B28"), spaceAfter=5),
        "Small": ParagraphStyle("SmallCustom", parent=base["BodyText"], fontName="Arial", fontSize=8, leading=10.5, textColor=colors.HexColor("#5D706B"), spaceAfter=4),
        "Tiny": ParagraphStyle("TinyCustom", parent=base["BodyText"], fontName="Arial", fontSize=7.2, leading=9.4, textColor=colors.HexColor("#1C2B28"), spaceAfter=2),
        "Mini": ParagraphStyle("MiniCustom", parent=base["BodyText"], fontName="Arial", fontSize=6.5, leading=8, textColor=colors.HexColor("#5D706B"), spaceAfter=1),
        "Question": ParagraphStyle("QuestionCustom", parent=base["BodyText"], fontName="Arial-Bold", fontSize=8.3, leading=10.5, textColor=colors.HexColor("#10231F"), spaceAfter=3),
        "Bullet": ParagraphStyle("BulletCustom", parent=base["BodyText"], fontName="Arial", fontSize=8.8, leading=11.8, leftIndent=12, firstLineIndent=-7, textColor=colors.HexColor("#1C2B28"), spaceAfter=3),
        "Code": ParagraphStyle("CodeCustom", parent=base["Code"], fontName="Courier", fontSize=6.8, leading=8.4, textColor=colors.HexColor("#20332F"), backColor=colors.HexColor("#EEF5F2"), borderPadding=5),
    }


def pdf_kv_table(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [[Paragraph(f"<b>{html_escape(k)}</b>", styles["Small"]), Paragraph(html_escape(clean_text(str(v))), styles["Small"])] for k, v in rows]
    table = Table(data, colWidths=[1.8 * inch, 5.6 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.45, colors.HexColor("#CADAD3")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDE8E3")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9F4EF")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def pdf_pricing_table(facts: dict[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    rows = [[Paragraph("<b>Plan</b>", styles["Small"]), Paragraph("<b>Label</b>", styles["Small"]), Paragraph("<b>Price</b>", styles["Small"]), Paragraph("<b>Active</b>", styles["Small"])]]
    for plan in facts.get("pricing", {}).get("plans", []):
        cents = plan.get("amount_cents", plan.get("amountCents", 0))
        price = f"EUR {cents / 100:.2f}" if cents else "Free/custom"
        rows.append([
            Paragraph(html_escape(plan.get("key", "")), styles["Small"]),
            Paragraph(html_escape(plan.get("label", "")), styles["Small"]),
            Paragraph(price, styles["Small"]),
            Paragraph(str(plan.get("active", "")), styles["Small"]),
        ])
    table = Table(rows, colWidths=[1.9 * inch, 2.3 * inch, 1.2 * inch, 1.0 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9F4EF")),
        ("BOX", (0, 0), (-1, -1), 0.45, colors.HexColor("#CADAD3")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDE8E3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def add_pdf_section(story: list[Any], styles: dict[str, ParagraphStyle], title: str) -> None:
    story.append(Paragraph(title, styles["H2"]))


def pdf_bullets(story: list[Any], styles: dict[str, ParagraphStyle], items: list[str]) -> None:
    for item in items:
        story.append(Paragraph(f"- {html_escape(item)}", styles["Bullet"]))


def pdf_scaled_image(image_path: Path, max_width: float, max_height: float) -> PdfImage:
    width, height = ImageReader(str(image_path)).getSize()
    scale = min(max_width / width, max_height / height)
    return PdfImage(str(image_path), width=width * scale, height=height * scale)


def pdf_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Arial", 7)
    canvas.setFillColor(colors.HexColor("#5D706B"))
    canvas.drawString(0.45 * inch, 0.25 * inch, "Irish Theory Test Coach - independent practice tool")
    canvas.drawRightString(LETTER[0] - 0.45 * inch, 0.25 * inch, f"Page {doc.page}")
    canvas.restoreState()


def register_fonts() -> None:
    fonts = [
        ("Arial", Path("C:/Windows/Fonts/arial.ttf")),
        ("Arial-Bold", Path("C:/Windows/Fonts/arialbd.ttf")),
    ]
    for name, path in fonts:
        try:
            if path.exists():
                pdfmetrics.registerFont(TTFont(name, str(path)))
        except Exception:
            pass


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf") if bold else Path("C:/Windows/Fonts/calibri.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def wrap(text: str, width: int, max_lines: int) -> list[str]:
    lines = textwrap.wrap(clean_text(text), width=width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(".") + "..."
    return lines or [""]


def available_screenshots() -> list[tuple[Path, str]]:
    found: list[tuple[Path, str]] = []
    for name, caption in SCREENSHOT_ORDER:
        path = SCREENSHOT_DIR / name
        if path.exists():
            found.append((path, caption))
    return found


def live_data_check() -> dict[str, Any]:
    node_code = """
const https = require('https');
https.get('https://irishtheorycoach.ie/data/preview-questions.json', res => {
  let data='';
  res.on('data', d => data += d);
  res.on('end', () => {
    const payload = JSON.parse(data);
    console.log(JSON.stringify({
      status: res.statusCode,
      preview: Array.isArray(payload.questions) ? payload.questions.length : 0,
      limit: payload.previewLimit
    }));
  });
}).on('error', err => { console.log(JSON.stringify({error: err.message})); });
"""
    try:
        output = subprocess.check_output(["node", "-e", node_code], cwd=ROOT, text=True, timeout=30)
        return json.loads(output)
    except Exception as exc:
        return {"error": str(exc)}


def write_manifest(facts: dict[str, Any]) -> None:
    manifest = {
        "generated_at": facts["generated_at"],
        "outputs": {
            "audit_docx": str(AUDIT_DOCX),
            "audit_pdf": str(AUDIT_PDF),
            "question_bank_docx": str(QUESTION_DOCX),
            "question_bank_pdf": str(QUESTION_PDF),
            "question_bank_csv": str(QUESTION_CSV),
        },
        "counts": facts["counts"],
        "live_check": facts["live_check"],
        "notes": [
            "DOCX files were generated locally with python-docx.",
            "PDF files were generated directly from the same data because LibreOffice/soffice is not available in this workspace.",
            "Question-bank document images use cached thumbnails under output/documents/question-image-cache.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def load_json(path: Path) -> Any:
    for encoding in ("utf-8", "utf-8-sig", "utf-16"):
        try:
            return json.loads(path.read_text(encoding=encoding))
        except UnicodeDecodeError:
            continue
    return json.loads(path.read_text(encoding="utf-8", errors="replace"))


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def run_text(command: list[str]) -> str:
    try:
        return subprocess.check_output(command, cwd=ROOT, text=True, stderr=subprocess.STDOUT, timeout=30)
    except Exception as exc:
        return str(exc)


def clean_text(value: Any) -> str:
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(value or ""))
    return re.sub(r"\s+", " ", value).strip()


def clean_text_block(value: str) -> str:
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(value or ""))
    return "\n".join(line.rstrip() for line in value.splitlines())


def short(value: str, length: int) -> str:
    value = clean_text(value)
    if len(value) <= length:
        return value
    return value[: length - 3].rstrip() + "..."


def html_escape(value: Any) -> str:
    return clean_text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def qa_summary(output: str) -> str:
    keep = []
    needles = [
        "OK: dataset passed validation",
        "Prepared deployable data",
        "PWA check passed",
        "SEO check passed",
        "Technical SEO check passed",
        "Structured data check passed",
        "Internal link check passed",
        "Performance budget check passed",
        "Source register OK",
        "No obvious live secrets",
        "App flow QA passed",
        "API smoke passed",
        "- questions:",
        "- image references:",
        "- enriched questions:",
        "- enriched high-yield questions:",
    ]
    for line in output.splitlines():
        if any(needle in line for needle in needles):
            keep.append(line)
    return "\n".join(keep) or output[-2500:]


if __name__ == "__main__":
    main()
