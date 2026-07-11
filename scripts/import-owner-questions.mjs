import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const defaultInputPath = path.join(
  process.env.USERPROFILE || "",
  ".codex",
  "attachments",
  "95cb1c0c-ee8e-4799-8fde-95f611541b8a",
  "pasted-text.txt"
);
const inputPath = path.resolve(process.argv[2] || defaultInputPath);
const questionsPath = path.join(root, "data", "questions.json");
const assetsDir = path.join(root, "data", "assets", "img", "owner-provided");
const generatedDir = path.join(root, "data", "assets", "img", "coach-generated");
const reportDir = path.join(root, "reports", "content");
const importSource = "owner_provided_paste";
const importBatch = "owner-paste-2026-07-11";
const maxDownloadMs = 12000;

function normalise(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/&amp;/gi, "&")
    .replace(/\bexplantion\b/gi, "explanation")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanExplanation(value) {
  return clean(value)
    .replace(/^explantion:\s*/i, "")
    .replace(/^explanation:\s*/i, "")
    .trim();
}

function optionsFromPasted(question) {
  return Array.isArray(question.questions) ? question.questions.map(clean).filter(Boolean) : [];
}

function optionsFromOwn(question) {
  return Array.isArray(question.options) ? question.options.map((option) => clean(option.text)).filter(Boolean) : [];
}

function correctFromOwn(question) {
  return clean(question.correct_answer || (question.options || []).find((option) => option.is_correct)?.text || "");
}

function strongKeyForParts(questionText, correctAnswer, options) {
  return [normalise(questionText), normalise(correctAnswer), options.map(normalise).sort().join("||")].join(" :: ");
}

function strongKeyPasted(question) {
  return strongKeyForParts(question.question, question.answer, optionsFromPasted(question));
}

function strongKeyOwn(question) {
  return strongKeyForParts(question.question, correctFromOwn(question), optionsFromOwn(question));
}

function qaKey(questionText, answer) {
  return [normalise(questionText), normalise(answer)].join(" :: ");
}

function choicesKey(answer, options) {
  return [normalise(answer), options.map(normalise).sort().join("||")].join(" :: ");
}

function imageBase(url) {
  return String(url || "").split("/").pop()?.toLowerCase() || "";
}

function imageAnswerKey(image, answer) {
  return [imageBase(image), normalise(answer)].join(" :: ");
}

function tokensFromParts(parts) {
  return new Set(normalise(parts.join(" ")).split(" ").filter(Boolean));
}

function jaccard(left, right) {
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function indexBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function isDistinctFromExisting(candidate, indexes) {
  const options = optionsFromPasted(candidate);
  const questionText = clean(candidate.question);
  const answer = clean(candidate.answer);
  if (indexes.strong.has(strongKeyForParts(questionText, answer, options))) return false;
  if (indexes.qa.has(qaKey(questionText, answer))) return false;
  if (indexes.choices.has(choicesKey(answer, options))) return false;
  if (candidate.image && indexes.imageAnswer.has(imageAnswerKey(candidate.image, answer))) return false;

  const candidateTokens = tokensFromParts([questionText, answer, ...options]);
  for (const own of indexes.ownTokenCache) {
    if (jaccard(candidateTokens, own.tokens) >= 0.88) return false;
  }
  return true;
}

function buildIndexes(questions) {
  return {
    strong: indexBy(questions, strongKeyOwn),
    qa: indexBy(questions, (question) => qaKey(question.question, correctFromOwn(question))),
    choices: indexBy(questions, (question) => choicesKey(correctFromOwn(question), optionsFromOwn(question))),
    imageAnswer: indexBy(questions, (question) => {
      const image = (question.image_urls || [])[0] || (question.local_image_paths || [])[0] || "";
      return imageAnswerKey(image, correctFromOwn(question));
    }),
    ownTokenCache: questions.map((question) => ({
      id: question.id,
      tokens: tokensFromParts([question.question, correctFromOwn(question), ...optionsFromOwn(question)]),
    })),
  };
}

function validateCandidate(candidate, importKeys) {
  const issues = [];
  const questionText = clean(candidate.question);
  const answer = clean(candidate.answer);
  const options = optionsFromPasted(candidate);
  const normalisedOptions = options.map(normalise);
  const answerIndex = normalisedOptions.findIndex((option) => option === normalise(answer));
  const key = strongKeyPasted(candidate);

  if (questionText.length < 8) issues.push("question text is too short");
  if (!answer) issues.push("missing answer");
  if (options.length < 2) issues.push("fewer than two options");
  if (answerIndex < 0) issues.push("answer not found in options");
  if (new Set(normalisedOptions).size !== normalisedOptions.length) issues.push("duplicate answer options");
  if (importKeys.has(key)) issues.push("duplicate inside import batch");

  return {
    ok: issues.length === 0,
    issues,
    questionText,
    answer,
    answerIndex,
    options,
    key,
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapWords(text, maxChars, maxLines) {
  const words = clean(text).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (words.join(" ").length > lines.join(" ").length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\.*$/, "")}...`;
  }
  return lines;
}

function keywordCue(question) {
  const haystack = normalise([
    question.question,
    question.heading,
    question.answer,
    question.explanation,
  ].join(" "));
  const cues = [
    ["sign", "Visual recognition"],
    ["marking", "Road marking"],
    ["speed", "Speed judgement"],
    ["motorway", "Motorway rules"],
    ["garda", "Garda signal/rule"],
    ["pedestrian", "Vulnerable road users"],
    ["cyclist", "Cyclist awareness"],
    ["overtake", "Overtaking"],
    ["brake", "Vehicle control"],
    ["tyre", "Vehicle condition"],
    ["alcohol", "Legal consequences"],
    ["drug", "Legal consequences"],
    ["insurance", "Documents and duties"],
    ["licence", "Licence rules"],
    ["collision", "Collision response"],
    ["skid", "Skid control"],
  ];
  return cues.find(([keyword]) => haystack.includes(keyword))?.[1] || "Study cue";
}

function memoryTip(question, answer) {
  const cue = keywordCue(question);
  if (/sign|marking|visual/i.test(cue)) return "Look for shape, colour, position, and the safest required action.";
  if (/speed|motorway/i.test(cue)) return "Anchor the rule to the road type, vehicle type, and conditions.";
  if (/legal|documents|licence/i.test(cue)) return "Remember who must act, what must be carried, and when the rule applies.";
  if (/vehicle|tyre|brake|skid/i.test(cue)) return "Connect the symptom to the safest control or maintenance action.";
  if (/vulnerable/i.test(cue)) return "Slow down, scan early, and protect the road user with less protection.";
  return `Link the question to the key action: ${clean(answer).slice(0, 80)}`;
}

function svgText(lines, x, y, size, weight = 650, fill = "#13201b", lineHeight = 1.25) {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * size * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}">${xmlEscape(line)}</text>`)
    .join("\n");
}

function makeNeutralVisual(question, id) {
  const titleLines = wrapWords(question.question, 36, 3);
  const cue = keywordCue(question);
  const category = clean(question.heading || question.category || "Irish theory practice");
  const accent = cue.includes("Legal") || cue.includes("Documents") ? "#f7c948" : cue.includes("Visual") ? "#8ed6ff" : "#b8f56d";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-labelledby="title desc">
  <title id="title">Practice visual for question ${id}</title>
  <desc id="desc">A study cue card for an Irish theory-test practice question.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fff4"/>
      <stop offset="0.52" stop-color="#eef7ff"/>
      <stop offset="1" stop-color="#fff8e8"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eef4ef"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#142019" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="960" height="540" rx="36" fill="url(#bg)"/>
  <path d="M108 390 C240 318 315 340 426 270 C550 191 666 210 838 134" fill="none" stroke="#d9e9df" stroke-width="30" stroke-linecap="round"/>
  <path d="M108 390 C240 318 315 340 426 270 C550 191 666 210 838 134" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="20 20" stroke-linecap="round"/>
  <g filter="url(#shadow)">
    <path d="M208 110 L708 76 L796 377 L280 421 Z" fill="#d6e3dc"/>
    <path d="M180 92 L684 58 L772 360 L258 402 Z" fill="url(#panel)" stroke="#cdd9d0" stroke-width="2"/>
    <path d="M684 58 L772 360 L796 377 L708 76 Z" fill="#bfcfc4"/>
  </g>
  <circle cx="735" cy="126" r="58" fill="${accent}" opacity="0.9"/>
  <path d="M736 84 L785 170 L686 170 Z" fill="#13201b" opacity="0.82"/>
  <rect x="242" y="126" width="208" height="34" rx="17" fill="#13201b"/>
  <text x="260" y="149" font-size="17" font-weight="800" fill="#b8f56d">QUESTION ${id}</text>
  <text x="242" y="200" font-size="24" font-weight="850" fill="#5f6b63">${xmlEscape(category.slice(0, 42))}</text>
  ${svgText(titleLines, 242, 250, 34, 900)}
  <rect x="242" y="350" width="250" height="42" rx="21" fill="${accent}"/>
  <text x="264" y="378" font-size="20" font-weight="900" fill="#13201b">${xmlEscape(cue)}</text>
  <text x="540" y="374" font-size="18" font-weight="750" fill="#5f6b63">Answer first. Coach visual appears after.</text>
</svg>
`;
}

function makeCoachVisual(question, id, answer, explanation) {
  const category = clean(question.heading || question.category || "Irish theory practice");
  const answerLines = wrapWords(answer, 33, 3);
  const explanationLines = wrapWords(explanation || "Use the safest legal action for this situation.", 50, 3);
  const tipLines = wrapWords(memoryTip(question, answer), 50, 2);
  const cue = keywordCue(question);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-labelledby="title desc">
  <title id="title">Coach visual for question ${id}</title>
  <desc id="desc">A coaching card showing the correct answer, why it matters, and a memory tip.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101915"/>
      <stop offset="0.52" stop-color="#20352d"/>
      <stop offset="1" stop-color="#152820"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#edf6ee"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="20" stdDeviation="20" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="960" height="540" rx="34" fill="url(#bg)"/>
  <path d="M86 428 C222 312 370 360 480 250 C592 138 722 159 872 86" fill="none" stroke="#b8f56d" stroke-width="34" stroke-opacity="0.18" stroke-linecap="round"/>
  <g filter="url(#shadow)">
    <path d="M122 120 L664 78 L830 352 L286 426 Z" fill="#728176" opacity="0.55"/>
    <path d="M98 94 L642 54 L806 330 L264 400 Z" fill="url(#card)" stroke="#d8e5dc" stroke-width="2"/>
    <path d="M642 54 L806 330 L830 352 L664 78 Z" fill="#c9d8ce"/>
  </g>
  <rect x="150" y="128" width="196" height="34" rx="17" fill="#13201b"/>
  <text x="169" y="151" font-size="17" font-weight="900" fill="#b8f56d">COACH VISUAL</text>
  <text x="150" y="202" font-size="23" font-weight="850" fill="#5e6a63">${xmlEscape(category.slice(0, 42))}</text>
  <text x="150" y="252" font-size="25" font-weight="900" fill="#13201b">Correct answer</text>
  ${svgText(answerLines, 150, 292, 32, 900)}
  <rect x="538" y="132" width="184" height="42" rx="21" fill="#b8f56d"/>
  <text x="560" y="160" font-size="20" font-weight="900" fill="#13201b">${xmlEscape(cue)}</text>
  <text x="514" y="230" font-size="24" font-weight="900" fill="#13201b">Why it matters</text>
  ${svgText(explanationLines, 514, 270, 21, 760, "#405049", 1.35)}
  <text x="514" y="390" font-size="24" font-weight="900" fill="#13201b">Memory tip</text>
  ${svgText(tipLines, 514, 430, 21, 760, "#405049", 1.35)}
</svg>
`;
}

function extensionFromUrl(url) {
  const basename = imageBase(url).split("?")[0] || "image";
  const ext = path.extname(basename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return ext;
  return ".jpg";
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maxDownloadMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImage(url, originalId, newId) {
  if (!url) return null;
  fs.mkdirSync(assetsDir, { recursive: true });
  const ext = extensionFromUrl(url);
  const fileName = `owner-${originalId}-q${newId}${ext}`;
  const relativePath = path.posix.join("data", "assets", "img", "owner-provided", fileName);
  const outputPath = path.join(root, relativePath);
  if (fs.existsSync(outputPath)) return { ok: true, path: relativePath, status: "existing" };

  const urls = [url];
  if (url.startsWith("http://")) urls.push(url.replace(/^http:\/\//, "https://"));

  let lastError = "";
  for (const candidateUrl of urls) {
    try {
      const response = await fetchWithTimeout(candidateUrl);
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length < 256) {
        lastError = "downloaded image was too small";
        continue;
      }
      fs.writeFileSync(outputPath, buffer);
      return { ok: true, path: relativePath, status: "downloaded" };
    } catch (error) {
      lastError = error.message;
    }
  }

  return { ok: false, error: lastError || "download failed" };
}

function writeGeneratedVisuals(candidate, newId, answer, explanation) {
  fs.mkdirSync(generatedDir, { recursive: true });
  const neutralRelative = path.posix.join("data", "assets", "img", "coach-generated", `q${newId}-practice.svg`);
  const coachRelative = path.posix.join("data", "assets", "img", "coach-generated", `q${newId}-coach.svg`);
  fs.writeFileSync(path.join(root, neutralRelative), makeNeutralVisual(candidate, newId), "utf8");
  fs.writeFileSync(path.join(root, coachRelative), makeCoachVisual(candidate, newId, answer, explanation), "utf8");
  return { neutralRelative, coachRelative };
}

function makeQuestionRecord(candidate, validation, newId, localImagePath, coachVisualPath) {
  const options = validation.options.map((text, index) => ({
    index,
    text,
    is_correct: index === validation.answerIndex,
  }));

  return {
    id: newId,
    question: validation.questionText,
    category: clean(candidate.heading) || "Uncategorised",
    options,
    correct_index: validation.answerIndex,
    correct_answer: validation.answer,
    explanation: cleanExplanation(candidate.explanation) || "Review the safest legal action for this situation.",
    image_urls: candidate.image ? [candidate.image] : [],
    local_image_paths: localImagePath ? [localImagePath] : [],
    coach_visual_paths: [coachVisualPath],
    previous_id: null,
    next_id: null,
    source_url: "",
    archive_url: "",
    archive_timestamp: "",
    source_type: importSource,
    source_reference: `${importBatch}:original-id:${candidate.id}`,
    owner_source_id: candidate.id,
    import_batch: importBatch,
    reviewed_status: "needs_official_cross_check",
    reviewed_by: null,
    reviewed_at: null,
    notes: "Owner-provided pasted question imported after duplicate and quality checks. Needs independent content review before being treated as verified.",
    safe_to_show: true,
    imported_quality: {
      status: "passed",
      checks: [
        "distinct_against_current_dataset",
        "answer_matches_option",
        "minimum_two_options",
        "generated_coach_visual",
      ],
    },
  };
}

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!fs.existsSync(questionsPath)) {
    throw new Error("data/questions.json is missing.");
  }

  fs.mkdirSync(reportDir, { recursive: true });
  const pasted = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const existing = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
  if (!Array.isArray(pasted)) throw new Error("Input JSON must be an array.");
  if (!Array.isArray(existing)) throw new Error("data/questions.json must be an array.");

  const indexes = buildIndexes(existing);
  const existingSourceReferences = new Set(existing.map((question) => question.source_reference).filter(Boolean));
  const importKeys = new Set();
  const nextStartId = Math.max(...existing.map((question) => Number(question.id) || 0)) + 1;
  let nextId = nextStartId;
  const imported = [];
  const skipped = [];
  const imageStats = { supplied: 0, downloaded: 0, existing: 0, failed: 0, generated_practice: 0, generated_coach: 0 };

  for (const candidate of pasted) {
    const sourceReference = `${importBatch}:original-id:${candidate.id}`;
    if (existingSourceReferences.has(sourceReference)) {
      skipped.push({ original_id: candidate.id, reason: "already_imported" });
      continue;
    }

    if (!isDistinctFromExisting(candidate, indexes)) {
      skipped.push({ original_id: candidate.id, reason: "matched_existing_dataset" });
      continue;
    }

    const validation = validateCandidate(candidate, importKeys);
    if (!validation.ok) {
      skipped.push({ original_id: candidate.id, reason: "quality_failed", issues: validation.issues });
      continue;
    }

    const newId = nextId++;
    const explanation = cleanExplanation(candidate.explanation) || "Review the safest legal action for this situation.";
    const visuals = writeGeneratedVisuals(candidate, newId, validation.answer, explanation);
    imageStats.generated_coach += 1;

    let localImagePath = null;
    let downloadedImage = null;
    if (candidate.image) {
      imageStats.supplied += 1;
      downloadedImage = await downloadImage(candidate.image, candidate.id, newId);
      if (downloadedImage?.ok) {
        localImagePath = downloadedImage.path;
        imageStats[downloadedImage.status] += 1;
      } else {
        imageStats.failed += 1;
      }
    }

    if (!localImagePath) {
      localImagePath = visuals.neutralRelative;
      imageStats.generated_practice += 1;
    }

    const record = makeQuestionRecord(candidate, validation, newId, localImagePath, visuals.coachRelative);
    imported.push({
      new_id: newId,
      original_id: candidate.id,
      category: record.category,
      question: record.question,
      correct_answer: record.correct_answer,
      source_image: candidate.image || "",
      local_image: localImagePath,
      coach_visual: visuals.coachRelative,
      image_status: downloadedImage?.status || (downloadedImage?.ok === false ? "generated_fallback" : "generated_practice"),
    });
    existing.push(record);
    indexes.strong.set(strongKeyOwn(record), [record]);
    indexes.qa.set(qaKey(record.question, record.correct_answer), [record]);
    indexes.choices.set(choicesKey(record.correct_answer, optionsFromOwn(record)), [record]);
    indexes.imageAnswer.set(imageAnswerKey(record.local_image_paths[0] || "", record.correct_answer), [record]);
    indexes.ownTokenCache.push({
      id: record.id,
      tokens: tokensFromParts([record.question, correctFromOwn(record), ...optionsFromOwn(record)]),
    });
    importKeys.add(validation.key);
  }

  existing.sort((left, right) => left.id - right.id);
  fs.writeFileSync(questionsPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  const summary = {
    generated_at: new Date().toISOString(),
    input_path: inputPath,
    import_batch: importBatch,
    existing_before: existing.length - imported.length,
    pasted_total: pasted.length,
    imported_count: imported.length,
    skipped_count: skipped.length,
    new_id_range: imported.length ? [imported[0].new_id, imported.at(-1).new_id] : [],
    image_stats: imageStats,
    imported,
    skipped,
  };
  const jsonReport = path.join(reportDir, "owner-question-import-report.json");
  fs.writeFileSync(jsonReport, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const skippedByReason = skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
  const byCategory = imported.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  const md = `# Owner Question Import Report

Generated: ${summary.generated_at}

## Summary

- Pasted input questions: ${pasted.length}
- Existing dataset before import: ${summary.existing_before}
- Imported distinct questions: ${imported.length}
- Skipped questions: ${skipped.length}
- New ID range: ${summary.new_id_range.join(" to ") || "none"}

## Image Work

- Source images supplied: ${imageStats.supplied}
- Source images downloaded: ${imageStats.downloaded}
- Source images already present: ${imageStats.existing}
- Source image download failures: ${imageStats.failed}
- Generated practice fallback visuals: ${imageStats.generated_practice}
- Generated feedback coach visuals: ${imageStats.generated_coach}

## Skipped By Reason

${Object.entries(skippedByReason).map(([reason, count]) => `- ${reason}: ${count}`).join("\n")}

## Imported By Category

${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([category, count]) => `- ${category}: ${count}`).join("\n")}

## Notes

Imported questions are owner-provided, distinct against the current dataset, and marked \`needs_official_cross_check\`. Generated coach visuals appear after answering so they support learning without replacing server-side entitlement or exam logic.
`;
  fs.writeFileSync(path.join(reportDir, "owner-question-import-report.md"), md, "utf8");

  console.log(JSON.stringify({
    imported_count: imported.length,
    skipped_count: skipped.length,
    new_id_range: summary.new_id_range,
    image_stats: imageStats,
    report: path.relative(root, jsonReport),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
