export const CATEGORY_REGISTRY_VERSION = 1;

export const CANONICAL_CATEGORIES = [
  category("alert_driving_consideration", "Alert Driving and Consideration", "Observation, anticipation, courtesy, and consideration for other road users.", 10, [
    "Alert Driving and Consideration",
    "Alert Driving and Consideration for Other Road Users",
    "Driver Behaviour and Anticipation",
    "Observation/Field of View",
    "Good Judgement and Perception",
  ]),
  category("safe_responsible_driving", "Safe and Responsible Driving", "Safe driving behaviour, vulnerable-road-user awareness, and responsible decision-making.", 20, [
    "Safe and Responsible Driving",
    "Vulnerable Road Users",
  ]),
  category("legal_rules_road", "Legal Matters / Rules of the Road", "Legal duties, rules of the road, restrictions, priorities, and required driver actions.", 30, [
    "Legal Matters/Rules of the Road",
    "Legal Matters / Rules of the Road",
    "Road Signs, Markings and Traffic Regulations",
  ]),
  category("traffic_signs_regulatory", "Traffic Signs and Regulatory Matters", "Traffic signs, road markings, regulatory instructions, and visual road information.", 40, [
    "Traffic Signs and Regulatory Matters",
    "Road markings",
    "Road Markings",
    "Regulatory signs",
    "Regulatory Signs",
    "Warning signs",
    "Warning Signs",
  ]),
  category("managing_risk", "Managing Risk", "Hazard awareness, changing road conditions, speed choice, and risk reduction.", 50, [
    "Managing Risk",
    "Driving Risk Factors Related to Various Road Conditions",
    "Driving Risk Factors Related to Road Conditions as they Change with Weather and Day/Night",
    "Observance of Safe Distance",
    "Observance of Safe Distances and Driving in Various Weather/Road Conditions",
  ]),
  category("control_vehicle", "Control of Vehicle", "Vehicle control, positioning, steering, braking, and safe operation of controls.", 60, [
    "Control of Vehicle",
    "Getting On or Off the Vehicle",
  ]),
  category("technical_matters", "Technical Matters", "Vehicle condition, maintenance, tyres, lights, warning systems, and technical safety checks.", 70, [
    "Technical Matters",
    "Techincal Matters",
    "Technical Matters with a Bearing on Road Safety",
    "Safety Factors Relating to Vehicle and Persons Carried",
    "Safety Factors Relating to Vehicle Loading and Persons Carried",
  ]),
  category("collisions_emergency", "Collisions and Emergency Action", "Collisions, emergencies, corrective action, and incident response.", 80, [
    "Collisions",
    "Taking Emergency/Corrective Action",
    "Taking Corrective or Emergency Action",
  ]),
  category("documents", "Necessary Documents", "Licences, insurance, test certificates, and required vehicle or driver documents.", 90, [
    "Necessary Documents",
  ]),
  category("road_types_environment", "Road Types and Environmental Matters", "Road types, environmental considerations, and conditions affecting driving choices.", 100, [
    "Characteristics of Various Types of Road",
    "Environmental Matters",
  ]),
  category("drugs_alcohol", "Drugs and Alcohol", "Alcohol, drugs, medication, impairment, and related legal or safety consequences.", 110, [
    "Drugs and Alcohol",
  ]),
  category("uncategorised", "Uncategorised", "Questions awaiting canonical category assignment.", 999, [
    "Uncategorized",
    "Uncategorised",
    "",
  ], false),
];

const CATEGORY_BY_KEY = new Map(CANONICAL_CATEGORIES.map((item) => [item.key, item]));
const ALIAS_INDEX = buildAliasIndex(CANONICAL_CATEGORIES);

export function canonicalCategoryFor(value) {
  const original = cleanCategory(value);
  const normalized = normalizeCategory(original);
  const exact = ALIAS_INDEX.get(normalized);
  if (exact) {
    return {
      ...exact,
      originalCategory: original,
      mappingReason: exact.displayName === original ? "exact" : "alias",
    };
  }

  const fuzzy = fuzzyCategory(normalized);
  if (fuzzy) {
    return {
      ...fuzzy,
      originalCategory: original,
      mappingReason: "near_alias",
    };
  }

  const fallback = CATEGORY_BY_KEY.get("uncategorised");
  return {
    ...fallback,
    originalCategory: original,
    mappingReason: original ? "unmapped" : "blank",
  };
}

export function categoryByKey(key) {
  return CATEGORY_BY_KEY.get(String(key || "")) || CATEGORY_BY_KEY.get("uncategorised");
}

export function categoryMappingsFor(categories) {
  return Array.from(new Set(categories.map(cleanCategory))).sort((a, b) => a.localeCompare(b)).map((original) => {
    const canonical = canonicalCategoryFor(original);
    return {
      originalCategory: original,
      canonicalKey: canonical.key,
      displayName: canonical.displayName,
      description: canonical.description,
      order: canonical.order,
      active: canonical.active,
      mappingReason: canonical.mappingReason,
    };
  });
}

function category(key, displayName, description, order, aliases, active = true) {
  return {
    key,
    displayName,
    description,
    order,
    aliases,
    active,
  };
}

function buildAliasIndex(categories) {
  const index = new Map();
  categories.forEach((item) => {
    [item.displayName, ...item.aliases].forEach((alias) => {
      index.set(normalizeCategory(alias), item);
    });
  });
  return index;
}

function fuzzyCategory(normalized) {
  if (!normalized) return null;
  if (normalized.includes("technical") || normalized.includes("techincal")) return CATEGORY_BY_KEY.get("technical_matters");
  if (normalized.includes("traffic sign") || normalized.includes("road marking") || normalized.includes("regulatory")) {
    return CATEGORY_BY_KEY.get("traffic_signs_regulatory");
  }
  if (normalized.includes("legal") || normalized.includes("rules of the road")) return CATEGORY_BY_KEY.get("legal_rules_road");
  if (normalized.includes("risk") || normalized.includes("safe distance") || normalized.includes("weather")) return CATEGORY_BY_KEY.get("managing_risk");
  if (normalized.includes("vehicle") && normalized.includes("control")) return CATEGORY_BY_KEY.get("control_vehicle");
  if (normalized.includes("safe") || normalized.includes("responsible") || normalized.includes("vulnerable")) {
    return CATEGORY_BY_KEY.get("safe_responsible_driving");
  }
  if (normalized.includes("collision") || normalized.includes("emergency") || normalized.includes("corrective")) {
    return CATEGORY_BY_KEY.get("collisions_emergency");
  }
  return null;
}

function cleanCategory(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeCategory(value) {
  return cleanCategory(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[/_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmatters\b/g, "matter")
    .replace(/\s+/g, " ")
    .trim();
}
