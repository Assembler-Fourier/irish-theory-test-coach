import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const questionsPath = path.join(root, "data", "questions.json");
const assetRoot = path.join(root, "data", "assets");
const currencyEncodingQuestionIds = new Set([649, 650, 651, 655, 666, 669, 671, 674]);

const categoryRepairs = new Map([
  [2, "Control of Vehicle"],
  [4, "Control of Vehicle"],
  [7, "Control of Vehicle"],
  [9, "Control of Vehicle"],
  [10, "Control of Vehicle"],
  [12, "Control of Vehicle"],
  [748, "Technical Matters"],
  [786, "Legal Matters / Rules of the Road"],
  [807, "Collisions and Emergency Action"],
  [808, "Collisions and Emergency Action"],
  [909, "Traffic Signs and Regulatory Matters"],
  [999, "Control of Vehicle"],
  [1163, "Necessary Documents"],
  [1291, "Technical Matters"],
  [1293, "Technical Matters"],
  [1294, "Technical Matters"],
  [1295, "Technical Matters"],
  [1297, "Technical Matters"],
  [1298, "Technical Matters"],
  [1303, "Legal Matters / Rules of the Road"],
  [1304, "Legal Matters / Rules of the Road"],
  [1305, "Safe and Responsible Driving"],
  [1306, "Safe and Responsible Driving"],
  [1307, "Legal Matters / Rules of the Road"],
  [1308, "Safe and Responsible Driving"],
  [1309, "Safe and Responsible Driving"],
  [1311, "Safe and Responsible Driving"],
  [1312, "Safe and Responsible Driving"],
  [1313, "Collisions and Emergency Action"],
  [1314, "Collisions and Emergency Action"],
  [1315, "Collisions and Emergency Action"],
  [1316, "Collisions and Emergency Action"],
  [1317, "Collisions and Emergency Action"],
  [1318, "Collisions and Emergency Action"],
]);

const questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
if (!Array.isArray(questions)) throw new Error("data/questions.json must contain an array.");

const summary = {
  questions: questions.length,
  categoriesMapped: 0,
  textFieldsRepaired: 0,
  imageAltDescriptionsAdded: 0,
  imageFingerprintsAdded: 0,
  missingImageFiles: 0,
};

for (const question of questions) {
  repairCategory(question);
  repairTextFields(question);
  repairImageMetadata(question);
}

fs.writeFileSync(questionsPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

function repairCategory(question) {
  const category = isDirectTrafficSignRecognition(question)
    ? "Traffic Signs and Regulatory Matters"
    : categoryRepairs.get(Number(question.id));
  if (!category || question.category === category) return;
  if (!question.original_category) question.original_category = question.category || "Uncategorized";
  question.category = category;
  question.category_mapping_note = isDirectTrafficSignRecognition(question)
    ? "Deterministic image-backed sign or road-marking recognition mapping; factual answer not reviewed by this repair."
    : "Deterministic topic mapping; factual answer not reviewed by this repair.";
  summary.categoriesMapped += 1;
}

function isDirectTrafficSignRecognition(question) {
  const hasImage = Array.isArray(question.local_image_paths) && question.local_image_paths.some(Boolean);
  if (!hasImage) return false;
  return /\bwhat (?:does|do)\b[^?]{0,140}\b(?:sign|signs|road marking|road markings)\b[^?]{0,100}\b(?:mean|indicate|tell)\b/i.test(
    String(question.question || "")
  );
}

function repairTextFields(question) {
  for (const field of ["question", "correct_answer", "explanation"]) {
    const repaired = repairText(question[field], question.id);
    if (repaired !== question[field]) {
      question[field] = repaired;
      summary.textFieldsRepaired += 1;
    }
  }

  for (const option of Array.isArray(question.options) ? question.options : []) {
    const repaired = repairText(option.text, question.id);
    if (repaired !== option.text) {
      option.text = repaired;
      summary.textFieldsRepaired += 1;
    }
  }

  const correctOption = question.options?.[question.correct_index];
  if (correctOption?.text && question.correct_answer !== correctOption.text) {
    const previous = comparable(question.correct_answer);
    const current = comparable(correctOption.text);
    if (previous === current || previous.replace(/^euro /, "") === current.replace(/^euro /, "")) {
      question.correct_answer = correctOption.text;
    }
  }
}

function repairText(value, questionId) {
  const original = String(value || "");
  const currencyRepaired = currencyEncodingQuestionIds.has(Number(questionId))
    ? original.replace(/\?(?=\d)/g, "€")
    : original;

  return currencyRepaired
    .replace(/No, except on (?:\u20ac|\?)2-plus-1 roads\?\./g, "No, except on 2-plus-1 roads.")
    .replace(/\bqueses\b/gi, "queues")
    .replace(/\bblood alcohol concentrate \(BAC\)/gi, "blood alcohol concentration (BAC)")
    .replace(/\bWhat does these signs\b/g, "What do these signs")
    .replace(/\bmillimeters\b/gi, "millimetres")
    .replace(/\bdual-carriage way\b/gi, "dual carriageway")
    .replace(/\bMain roads bears\b/g, "Main road bears")
    .replace(/\bVehicles weight restriction\b/g, "Vehicle weight restriction")
    .replace(/\bemergency\. what should\b/gi, "emergency, what should")
    .replace(/\bmust not not\b/gi, "must not")
    .replace(/\bin the center of the road\b/gi, "in the centre of the road")
    .replace(/\bfrom center to\b/gi, "from centre to")
    .replace(/\bcategory ([MW]) license\b/g, "category $1 licence")
    .replace(/\bdriving license\b/gi, "driving licence")
    .replace(/\bchildren's behavior\b/gi, "children's behaviour")
    .replace(/\bemergency CPR\b/g, "emergency cardiopulmonary resuscitation (CPR)")
    .replace(/\bbe involved a fatal collision\b/gi, "be involved in a fatal collision")
    .replace(/\bNeither males or females\b/g, "Neither males nor females")
    .replace(/\bby the starting the engine\b/gi, "by starting the engine")
    .replace(/\bsterring whell\b/gi, "steering wheel")
    .replace(/\bthat it operated smoothly\b/gi, "that it operates smoothly")
    .replace(/\s+/g, " ")
    .trim();
}

function repairImageMetadata(question) {
  const paths = Array.isArray(question.local_image_paths) ? question.local_image_paths.filter(Boolean) : [];
  if (!paths.length) return;

  if (!String(question.image_alt || "").trim()) {
    question.image_alt = neutralImageAlt(question.question);
    summary.imageAltDescriptionsAdded += 1;
  }

  const hashes = [];
  for (const relativePath of paths) {
    const absolutePath = path.resolve(root, String(relativePath));
    if (!absolutePath.startsWith(`${assetRoot}${path.sep}`) || !fs.existsSync(absolutePath)) {
      summary.missingImageFiles += 1;
      continue;
    }
    hashes.push(crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex"));
  }
  const uniqueHashes = Array.from(new Set(hashes));
  if (JSON.stringify(question.image_content_hashes || []) !== JSON.stringify(uniqueHashes)) {
    question.image_content_hashes = uniqueHashes;
    summary.imageFingerprintsAdded += 1;
  }
}

function neutralImageAlt(stem) {
  const value = String(stem || "").toLowerCase();
  if (value.includes("road marking")) return "Road marking shown for this practice question.";
  if (value.includes("garda signal")) return "Garda hand signal shown for this practice question.";
  if (value.includes("sign")) return "Road sign shown for this practice question.";
  return "Road scenario image shown for this practice question.";
}

function comparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/€/g, "euro ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
