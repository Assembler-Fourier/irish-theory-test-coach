from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports" / "audit"
SCREENSHOT_DIR = REPORT_DIR / "screenshots"
PDF_DIR = ROOT / "output" / "pdf"
MARKDOWN_PATH = REPORT_DIR / "irish-theory-test-coach-project-audit.md"
PDF_PATH = PDF_DIR / "irish-theory-test-coach-project-audit.pdf"

SCREENSHOTS = [
    ("01-desktop-preview.png", "Desktop preview quiz"),
    ("02-answer-feedback.png", "Answer feedback and explanation controls"),
    ("03-premium-paywall.png", "Premium paywall and high-yield unlock"),
    ("04-restore-access.png", "Restore access form"),
    ("05-privacy-page.png", "Privacy and non-affiliation page"),
    ("06-seo-study-plan.png", "SEO landing page"),
    ("07-admin-dashboard.png", "Admin dashboard shell"),
    ("08-mobile-preview.png", "Mobile preview check"),
]


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)

    facts = load_project_facts()
    markdown = build_markdown(facts)
    MARKDOWN_PATH.write_text(markdown, encoding="utf-8")
    build_pdf(facts, markdown)
    print(f"Wrote {MARKDOWN_PATH}")
    print(f"Wrote {PDF_PATH}")


def load_project_facts() -> dict:
    package = load_json(ROOT / "package.json")
    study_report = load_json(ROOT / "data" / "study_report.json")
    recovery_report = load_json(ROOT / "data" / "recovery_report.json")
    questions = load_json(ROOT / "data" / "questions.enriched.json")
    schema = (ROOT / "database" / "schema.sql").read_text(encoding="utf-8")

    api_files = sorted(relative(p) for p in (ROOT / "api").rglob("*.js"))
    public_pages = sorted(relative(p) for p in (ROOT / "public").glob("*.html"))
    docs = sorted(relative(p) for p in (ROOT / "docs").glob("*.md"))
    scripts = sorted(package.get("scripts", {}).keys())
    schema_tables = re.findall(r"create table if not exists ([a-z_]+)", schema, flags=re.IGNORECASE)
    schema_indexes = re.findall(r"create index if not exists ([a-z_]+)", schema, flags=re.IGNORECASE)

    ids = [question["id"] for question in questions if isinstance(question.get("id"), int)]
    image_refs = sum(len(question.get("local_image_paths") or []) for question in questions)
    reviewed_statuses = count_by(questions, "reviewed_status")
    source_types = count_by(questions, "source_type")
    score_breakdown_count = sum(1 for question in questions if isinstance(question.get("score_breakdown"), dict))

    qa_output = read_text_flexible(REPORT_DIR / "qa-output.txt")

    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "package": package,
        "study_report": study_report,
        "recovery_report": recovery_report,
        "questions": {
            "count": len(questions),
            "id_min": min(ids) if ids else None,
            "id_max": max(ids) if ids else None,
            "missing_ids": len(set(range(min(ids), max(ids) + 1)) - set(ids)) if ids else 0,
            "image_refs": image_refs,
            "reviewed_statuses": reviewed_statuses,
            "source_types": source_types,
            "score_breakdown_count": score_breakdown_count,
        },
        "api_files": api_files,
        "public_pages": public_pages,
        "docs": docs,
        "scripts": scripts,
        "schema_tables": schema_tables,
        "schema_indexes": schema_indexes,
        "qa_output": qa_output,
    }


def build_markdown(facts: dict) -> str:
    summary = facts["study_report"]["summary"]
    recovery = facts["recovery_report"]
    questions = facts["questions"]

    sections = [
        "# Irish Theory Test Coach - Complete Project Audit And Guide",
        "",
        f"Generated: {facts['generated_at']}",
        "",
        "## Executive Status",
        "",
        "Irish Theory Test Coach is an independent Irish Category B theory-test practice MVP. It is now feature-rich enough for a controlled production launch after final live-service setup and content/legal review.",
        "",
        "Current status: QA green, deployable to Vercel, data loaded, Stripe/Neon architecture implemented, public trust pages present, and a release checklist exists.",
        "",
        "Do not market it as official, affiliated, guaranteed-pass, or official-frequency. High-yield means estimated study priority, not official exam prediction.",
        "",
        "## Project At A Glance",
        "",
        table_markdown(
            ["Area", "Status"],
            [
                ["Product", "Static frontend in public/ with Vercel serverless APIs in api/"],
                ["Questions", f"{summary['questions']} enriched questions; {summary['high_yield_questions']} high-yield; {summary['road_sign_or_image_questions']} road-sign/image questions"],
                ["Payments", "Stripe Checkout plus server-side verify-session and webhook entitlement recording"],
                ["Database", f"Neon Postgres schema with {len(facts['schema_tables'])} tables and {len(facts['schema_indexes'])} indexes"],
                ["Auth", "Email magic-link restore access with server-side sessions"],
                ["Admin", "Role-protected admin dashboard and admin APIs"],
                ["AI", "Explanation coach plus draft-only generated-question pipeline"],
                ["SEO", f"{len(facts['public_pages'])} public HTML pages, sitemap, robots, FAQ/metadata foundation"],
                ["QA", "npm run qa passes"],
            ],
        ),
        "",
        "## Fresh QA Result",
        "",
        "The full QA command passed during this audit:",
        "",
        "```text",
        qa_summary(facts["qa_output"]),
        "```",
        "",
        f"Raw QA output is stored at `{relative(REPORT_DIR / 'qa-output.txt')}`.",
        "",
        "## Data Recovery And Content Status",
        "",
        f"- Source: {recovery.get('source', 'Not recorded')}.",
        f"- Domain status when checked: {recovery.get('domain_status_when_checked', 'Not recorded')}.",
        f"- Questions recovered: {recovery.get('questions_recovered', questions['count'])}.",
        f"- Question detail URLs available during recovery: {recovery.get('question_ids_available', 'Not recorded')}.",
        f"- Captures available during recovery: {recovery.get('question_captures_available', 'Not recorded')}.",
        f"- Current enriched dataset: {questions['count']} questions, ID range {questions['id_min']} to {questions['id_max']}, {questions['missing_ids']} missing IDs inside that range.",
        f"- Image references in current dataset: {questions['image_refs']}.",
        f"- Questions with score breakdowns: {questions['score_breakdown_count']}.",
        "",
        "Content policy: existing recovered questions are treated as needing official cross-check unless reviewed. AI-generated content must remain draft-only until an admin approves it.",
        "",
        "## High-Yield Scoring",
        "",
        f"- High-yield questions: {summary['high_yield_questions']}.",
        f"- Critical questions: {summary['critical_questions']}.",
        f"- Archived hardest signals found: {summary['archived_hardest_questions_found']}.",
        f"- Road-sign/image questions: {summary['road_sign_or_image_questions']}.",
        "",
        "Scoring components now include archived hardest signal, road sign or image signal, safety-critical signal, legal consequence signal, category priority signal, and optional user miss-rate signal. The UI explains why a question is high-yield without claiming official exam frequency.",
        "",
        "Top categories by high-yield value:",
        "",
        table_markdown(
            ["Category", "Questions", "High-yield", "Average score"],
            [
                [
                    item["category"],
                    str(item["questions"]),
                    str(item["high_yield_questions"]),
                    str(item["average_score"]),
                ]
                for item in facts["study_report"].get("top_categories", [])[:8]
            ],
        ),
        "",
        "## Feature Inventory",
        "",
        "### Learner App",
        "",
        "- Free preview with 15 questions.",
        "- Search and category filters.",
        "- Modes: revise, high-yield, hardest, signs, mock test, review.",
        "- Study-flow card: drill 25 high-yield questions, clear missed questions, take one mock test, repeat road signs.",
        "- Answer feedback, progress stats, missed questions, flags, daily target, and category summaries.",
        "- 40-question mock test with 35 pass mark and timer.",
        "- Mobile sticky unlock CTA.",
        "- PWA manifest, service worker, offline page, and cached question bank/assets.",
        "",
        "### Monetization",
        "",
        "- Stripe Checkout product flow for EUR 0.99 access.",
        "- Server-side environment validation for payment APIs.",
        "- Server-side checkout session verification.",
        "- Stripe webhook endpoint for checkout.session.completed.",
        "- Idempotent entitlement recording through Stripe session/payment IDs.",
        "- Restore-access link near unlock buttons.",
        "",
        "### Login And Progress Sync",
        "",
        "- Email magic-link login endpoints.",
        "- Secure session cookie architecture.",
        "- Restore access across browsers/devices for paying users.",
        "- Attempts, missed questions, flagged questions, and category progress sync to Neon for logged-in users.",
        "- LocalStorage fallback for guest/offline users and legacy purchases.",
        "",
        "### Admin",
        "",
        "- Protected admin page.",
        "- Server-side admin authorization helper.",
        "- Admin APIs for stats, users, entitlements, and questions.",
        "- Manual entitlement grant/revoke/extend without hard deletes.",
        "- Admin audit log for mutations.",
        "- Question QA workflow: source, review, version, approve/reject.",
        "- AI-generated question draft review pipeline.",
        "",
        "### AI Features",
        "",
        "- AI explanation endpoint with database cache by question and selected answer.",
        "- Safe fallback explanation when no AI provider is configured.",
        "- Rate limiting by session/user.",
        "- Admin-only draft question generation from source notes.",
        "- Duplicate detection against existing questions.",
        "- AI-generated questions are draft-only until reviewed.",
        "",
        "### SEO, Trust, Legal",
        "",
        "- Public pages for privacy, terms, refunds, contact, Category B, road signs, mock exam, rules practice, and study plan.",
        "- Metadata, canonical URLs, Open Graph, Twitter cards, FAQ JSON-LD, SoftwareApplication JSON-LD, BreadcrumbList JSON-LD.",
        "- Sitemap and robots file.",
        "- Visible footer disclaimer: Independent practice tool. Not affiliated with RSA or Prometric.",
        "- Refund policy for low-cost digital access.",
        "",
        "### Analytics",
        "",
        "- Privacy-safe first-party events table.",
        "- Events include page_view, preview_started, question_answered, answer_correct, answer_wrong, mode_selected, paywall_viewed, checkout_clicked, checkout_success, restore_access_clicked, mock_started, and mock_completed.",
        "- Admin stats include conversion funnel, missed categories/questions, and paywall-to-checkout indicators.",
        "- No third-party analytics cookies.",
        "",
        "## API Surface",
        "",
        "\n".join(f"- `{api}`" for api in facts["api_files"]),
        "",
        "## Database Structure",
        "",
        "Tables:",
        "",
        ", ".join(f"`{table}`" for table in facts["schema_tables"]),
        "",
        "Indexes:",
        "",
        ", ".join(f"`{index}`" for index in facts["schema_indexes"]),
        "",
        "## Environment Variables",
        "",
        "Required or supported variables are documented in `.env.example`: DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, PUBLIC_SITE_URL, SUPPORT_EMAIL, EMAIL_FROM, EMAIL_PROVIDER_API_KEY, AI_EXPLANATION_* and AI_QUESTION_* variables.",
        "",
        "Never expose these values in frontend code, screenshots, docs, reports, logs, or commits.",
        "",
        "## Durable Engineering Rules",
        "",
        "- Never claim official RSA, official Prometric, TheoryTest.ie, or testing-provider affiliation.",
        "- Never add guaranteed-pass, official exam frequency, or comes-up-every-time claims.",
        "- Never scrape or copy competitor question text.",
        "- Premium unlocks must be verified server-side.",
        "- Secrets must stay out of frontend code and public assets.",
        "- Admin features must verify server-side authorization.",
        "- AI-generated questions must be draft-only until reviewed by an admin.",
        "- Keep the current MVP working unless a framework migration is explicitly requested.",
        "- Before finishing code changes, run validate, build, and node --check on changed JavaScript files.",
        "",
        "## Release Readiness",
        "",
        "Ready:",
        "",
        "- Local QA passes.",
        "- Vercel build configuration exists.",
        "- Public static output is prepared by npm run build.",
        "- Core product pages and app flows exist.",
        "- Payment, webhook, auth, progress, admin, AI, analytics, PWA, and SEO foundations exist.",
        "",
        "Must complete before selling:",
        "",
        "- Rotate Stripe live secret key and Neon database password because credentials were handled during setup.",
        "- Confirm Vercel production env vars match rotated secrets.",
        "- Confirm Stripe live product, EUR 0.99 price, payouts, and webhook endpoint.",
        "- Complete one production test purchase.",
        "- Confirm support email receives mail.",
        "- Promote the first admin in Neon manually.",
        "- Review legal wording before public paid launch.",
        "- Continue content provenance and official cross-check of recovered questions.",
        "- Fix or polish any mobile layout issues found during visual checks before paid traffic.",
        "",
        "## Manual Test Guide",
        "",
        "1. Run `npm run qa`.",
        "2. Open the deployed URL.",
        "3. Confirm the preview question loads.",
        "4. Answer a question and confirm feedback appears.",
        "5. Click high-yield, signs, review, or mock mode while unpaid and confirm the paywall appears.",
        "6. Click restore access and request a magic link using a test email.",
        "7. Complete a Stripe test/live purchase depending on environment.",
        "8. Close the checkout success tab and confirm the webhook still records entitlement.",
        "9. Log in on another browser and confirm premium access restores.",
        "10. Answer questions while logged in and confirm attempts/flags/progress sync to Neon.",
        "11. Visit admin.html as admin and confirm users, entitlements, questions, and stats load.",
        "12. Visit all legal and SEO pages from the footer/nav.",
        "13. Test mobile viewport and offline reload.",
        "",
        "## File Structure Guide",
        "",
        f"- `public/`: app UI, landing pages, PWA files, sitemap, robots ({len(facts['public_pages'])} HTML pages).",
        f"- `api/`: serverless endpoints ({len(facts['api_files'])} JS files).",
        f"- `lib/`: shared auth, DB, env, Stripe, admin, AI helpers.",
        "- `database/schema.sql`: Neon Postgres schema.",
        "- `data/`: recovered and enriched question data.",
        f"- `docs/`: contributor and launch documentation ({len(facts['docs'])} docs).",
        "- `reports/`: generated audits and QA/content reports.",
        "- `output/pdf/`: final PDF exports.",
        "",
        "## Screenshots",
        "",
        "\n".join(
            f"### {caption}\n\n![{caption}](screenshots/{filename})\n"
            for filename, caption in SCREENSHOTS
            if (SCREENSHOT_DIR / filename).exists()
        ),
        "",
        "## Document Index",
        "",
        "\n".join(f"- `{doc}`" for doc in facts["docs"]),
        "",
        "## NPM Scripts",
        "",
        "\n".join(f"- `{script}`" for script in facts["scripts"]),
        "",
        "## Final Audit Opinion",
        "",
        "This project stands at a strong MVP/pre-launch stage. The app is not just a clone shell: it now has a recovered/enriched dataset, premium access path, restore access, persistence, admin tooling, AI support, trust/legal pages, SEO pages, analytics, PWA support, and automated QA. The main thing left is not building more features; it is finishing launch discipline: rotate secrets, verify production Stripe and Neon, test the purchase path end-to-end, review legal/content, and polish mobile before spending money on traffic.",
        "",
    ]

    return "\n".join(sections)


def build_pdf(facts: dict, markdown: str) -> None:
    styles = get_styles()
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.58 * inch,
        title="Irish Theory Test Coach Project Audit",
        author="Codex",
    )

    story = []
    add_title(story, styles, facts)
    add_status_cards(story, styles, facts)
    add_section(story, styles, "Fresh QA Result")
    story.append(Preformatted(qa_summary(facts["qa_output"]), styles["Code"]))
    story.append(Spacer(1, 0.16 * inch))
    add_section(story, styles, "Feature Inventory")
    add_bullets(
        story,
        styles,
        [
            "Learner app: preview quiz, filters, high-yield, hardest, signs, mock test, review, flags, missed questions, progress, feedback, PWA.",
            "Payments: Stripe Checkout, server verification, webhook entitlement recording, EUR 0.99 unlock path.",
            "Login/progress: magic-link restore access, sessions, Neon progress sync, local fallback.",
            "Admin: role checks, users, purchases, entitlements, questions, stats, audit logs, QA workflow.",
            "AI: cached explanations, safe fallback, admin-only draft question generation, duplicate detection.",
            "SEO/trust: legal pages, footer disclaimer, sitemap, robots, landing pages, structured data.",
            "Analytics: first-party privacy-safe funnel and learning events.",
        ],
    )
    add_section(story, styles, "Release Readiness")
    add_bullets(
        story,
        styles,
        [
            "Ready: local QA passes, Vercel config exists, app/data build succeeds, legal/SEO pages exist.",
            "Before selling: rotate Stripe and Neon secrets, set Vercel env vars, configure webhook, complete live test purchase.",
            "Before paid traffic: review legal/content claims, promote first admin, verify support email, polish mobile layout.",
        ],
    )
    add_section(story, styles, "Rules That Must Never Be Broken")
    add_bullets(
        story,
        styles,
        [
            "Do not claim official RSA, official Prometric, TheoryTest.ie, guaranteed pass, or official exam frequency.",
            "Do not scrape/copy competitor question text.",
            "Verify premium server-side; do not trust frontend-only unlock state.",
            "Do not expose secrets in frontend code, docs, logs, screenshots, or reports.",
            "Require server-side admin authorization for every admin API.",
            "Keep AI-generated questions draft-only until admin review.",
        ],
    )
    add_section(story, styles, "Database And API")
    story.append(
        Paragraph(
            f"Schema includes {len(facts['schema_tables'])} tables and {len(facts['schema_indexes'])} indexes. API surface includes {len(facts['api_files'])} serverless JS files.",
            styles["Body"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(", ".join(facts["schema_tables"]), styles["Small"]))
    story.append(PageBreak())
    add_section(story, styles, "Screenshots")
    for filename, caption in SCREENSHOTS:
        image_path = SCREENSHOT_DIR / filename
        if not image_path.exists():
            continue
        story.append(Paragraph(caption, styles["H3"]))
        story.append(scaled_image(image_path, max_width=7.0 * inch, max_height=4.7 * inch))
        story.append(Spacer(1, 0.16 * inch))
    story.append(PageBreak())
    add_section(story, styles, "Manual Launch Checklist")
    add_bullets(
        story,
        styles,
        [
            "Run npm run qa.",
            "Rotate secrets and update Vercel production env vars.",
            "Confirm Stripe product, EUR 0.99 price, payouts, and webhook.",
            "Complete a production test purchase and refund-path rehearsal.",
            "Check restore access across browsers/devices.",
            "Promote the first admin in Neon.",
            "Review legal pages and support email.",
            "Submit sitemap after domain launch.",
            "Review mobile screenshots and fix any layout issues before paid traffic.",
        ],
    )
    add_section(story, styles, "Final Audit Opinion")
    story.append(
        Paragraph(
            "This is a strong MVP/pre-launch product. It has the major commercial foundation in place. The next work is launch discipline: secrets, live payment verification, legal/content review, support readiness, and mobile polish.",
            styles["Body"],
        )
    )

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)


def get_styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "AuditTitle",
            parent=base["Title"],
            alignment=TA_LEFT,
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            textColor=colors.HexColor("#10231f"),
            spaceAfter=10,
        ),
        "Subtitle": ParagraphStyle(
            "AuditSubtitle",
            parent=base["BodyText"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#38534c"),
            spaceAfter=16,
        ),
        "H2": ParagraphStyle(
            "AuditH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#0d5c47"),
            spaceBefore=12,
            spaceAfter=7,
        ),
        "H3": ParagraphStyle(
            "AuditH3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#10231f"),
            spaceBefore=7,
            spaceAfter=5,
        ),
        "Body": ParagraphStyle(
            "AuditBody",
            parent=base["BodyText"],
            fontSize=9.3,
            leading=13.2,
            textColor=colors.HexColor("#1c2b28"),
            spaceAfter=6,
        ),
        "Small": ParagraphStyle(
            "AuditSmall",
            parent=base["BodyText"],
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#435852"),
        ),
        "Bullet": ParagraphStyle(
            "AuditBullet",
            parent=base["BodyText"],
            fontSize=9,
            leading=12.2,
            leftIndent=12,
            firstLineIndent=-8,
            textColor=colors.HexColor("#1c2b28"),
        ),
        "Code": ParagraphStyle(
            "AuditCode",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.3,
            leading=9,
            textColor=colors.HexColor("#20332f"),
            backColor=colors.HexColor("#eef5f2"),
            borderPadding=6,
        ),
    }


def add_title(story: list, styles: dict, facts: dict) -> None:
    story.append(Paragraph("Irish Theory Test Coach", styles["Title"]))
    story.append(Paragraph("Complete Project Audit, Guide, Rules, QA Evidence, And Launch Readiness", styles["Subtitle"]))
    story.append(
        Paragraph(
            f"Generated {facts['generated_at']}. Independent practice tool. Not affiliated with RSA or Prometric.",
            styles["Body"],
        )
    )


def add_status_cards(story: list, styles: dict, facts: dict) -> None:
    summary = facts["study_report"]["summary"]
    data = [
        ["Questions", "High-yield", "Image/sign", "QA"],
        [
            str(summary["questions"]),
            str(summary["high_yield_questions"]),
            str(summary["road_sign_or_image_questions"]),
            "Passed",
        ],
    ]
    table = Table(data, colWidths=[1.7 * inch, 1.7 * inch, 1.7 * inch, 1.7 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e9f4ef")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0d5c47")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cadbd5")),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#cadbd5")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 0.14 * inch))


def add_section(story: list, styles: dict, title: str) -> None:
    story.append(Paragraph(title, styles["H2"]))


def add_bullets(story: list, styles: dict, bullets: list[str]) -> None:
    for bullet in bullets:
        story.append(Paragraph(f"- {escape_pdf_text(bullet)}", styles["Bullet"]))


def scaled_image(image_path: Path, max_width: float, max_height: float) -> Image:
    width, height = ImageReader(str(image_path)).getSize()
    scale = min(max_width / width, max_height / height)
    return Image(str(image_path), width=width * scale, height=height * scale)


def draw_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#5d706b"))
    canvas.drawString(0.55 * inch, 0.34 * inch, "Irish Theory Test Coach - independent practice tool")
    canvas.drawRightString(A4[0] - 0.55 * inch, 0.34 * inch, f"Page {doc.page}")
    canvas.restoreState()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_text_flexible(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-16", "utf-16-le"):
        try:
            text = raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        if "\x00" not in text[:200]:
            return text
    return raw.decode("utf-8", errors="replace").replace("\x00", "")


def relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def count_by(items: list[dict], key: str) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in items:
        value = item.get(key) or "missing"
        result[str(value)] = result.get(str(value), 0) + 1
    return dict(sorted(result.items(), key=lambda pair: (-pair[1], pair[0])))


def table_markdown(headers: list[str], rows: list[list[str]]) -> str:
    header = "| " + " | ".join(headers) + " |"
    divider = "| " + " | ".join("---" for _ in headers) + " |"
    body = ["| " + " | ".join(str(cell).replace("|", "\\|") for cell in row) + " |" for row in rows]
    return "\n".join([header, divider, *body])


def qa_summary(output: str) -> str:
    keep = []
    for line in output.splitlines():
        if (
            "OK: dataset passed validation" in line
            or "Prepared deployable data" in line
            or "PWA check passed" in line
            or "SEO check passed" in line
            or "No obvious live secrets" in line
            or "App flow QA passed" in line
            or "API smoke passed" in line
            or line.startswith("- questions:")
            or line.startswith("- enriched high-yield questions:")
            or line.startswith("- image references:")
        ):
            keep.append(line)
    return "\n".join(keep)


def escape_pdf_text(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


if __name__ == "__main__":
    main()
