import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_SCHEMA_VERSION,
  FUNNEL_EVENTS,
  SOCIAL_IMAGE_TARGETS,
  buildGrowthConfig,
  canonicalSiteOrigin,
  publicGrowthConfig,
} from "../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");
const errors = [];

checkRuntimeConfig();
checkRequiredFiles();
checkSchema();
checkEventEndpoint();
checkCanonicalSource();
checkPublicPages();

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Growth surface check passed.");

function checkRuntimeConfig() {
  const expected = publicGrowthConfig(buildGrowthConfig(process.env));
  const actual = readJson(path.join(publicDir, "growth-config.json"));
  try {
    assert.deepEqual(actual, expected);
  } catch {
    errors.push("public/growth-config.json differs from shared growth config.");
  }
  const js = readText(path.join(publicDir, "growth-config.js"));
  if (!js.includes("window.GROWTH_CONFIG")) errors.push("public/growth-config.js is missing GROWTH_CONFIG global.");
  for (const event of FUNNEL_EVENTS) {
    if (!js.includes(event.eventName)) errors.push(`Growth config missing funnel event ${event.eventName}.`);
  }
}

function checkRequiredFiles() {
  for (const file of [
    "docs/growth/search-console-setup.md",
    "docs/growth/analytics-event-catalogue.md",
    "docs/growth/conversion-dashboard-guide.md",
    "docs/growth/seo-content-map.md",
    "reports/growth/seo-audit.md",
    "reports/growth/performance-audit.md",
  ]) {
    if (!fs.existsSync(path.join(root, file))) errors.push(`${file} is missing.`);
  }
  for (const target of SOCIAL_IMAGE_TARGETS) {
    const file = path.join(publicDir, "marketing", target.file);
    if (!fs.existsSync(file)) errors.push(`${target.file} social image is missing.`);
    else if (fs.statSync(file).size > 95_000) errors.push(`${target.file} is too large for an OG SVG.`);
  }
}

function checkSchema() {
  const schema = readText(path.join(root, "database", "schema.sql"));
  for (const phrase of [
    "event_id text",
    "schema_version integer",
    "attribution jsonb",
    "experiments jsonb",
    "bot_signals jsonb",
    "environment text",
    "client_created_at timestamptz",
    "events_event_id_unique_idx",
  ]) {
    if (!schema.includes(phrase)) errors.push(`database/schema.sql missing ${phrase}.`);
  }
}

function checkEventEndpoint() {
  const source = readText(path.join(root, "server", "api", "events.js"));
  for (const phrase of [
    "ANALYTICS_SCHEMA_VERSION",
    "eventId",
    "on conflict (event_id) do nothing",
    "sanitizeAttribution",
    "sanitizeBotSignals",
    "schemaVersion !== ANALYTICS_SCHEMA_VERSION",
  ]) {
    if (!source.includes(phrase)) errors.push(`events API missing ${phrase}.`);
  }
}

function checkCanonicalSource() {
  assert.equal(canonicalSiteOrigin({ PUBLIC_CANONICAL_ORIGIN: "https://example.com/path" }), "https://example.com");
  const sources = [
    "scripts/generate-seo-assets.mjs",
    "scripts/generate-ia-pages.mjs",
    "scripts/generate-compliance-pages.mjs",
  ];
  for (const file of sources) {
    const text = readText(path.join(root, file));
    if (!text.includes("canonicalSiteOrigin")) errors.push(`${file} does not use canonicalSiteOrigin.`);
  }
}

function checkPublicPages() {
  const homepage = readText(path.join(publicDir, "index.html"));
  if (!homepage.includes("/marketing/og-home.svg")) errors.push("Homepage does not use the branded home OG image.");
  if (!homepage.includes("growth-tracking.js")) errors.push("Homepage does not load growth tracking.");
  const pricing = readText(path.join(publicDir, "pricing.html"));
  if (!pricing.includes("type=\"module\" src=\"./pricing.js")) errors.push("Pricing page must load pricing.js as a module.");
  if (!pricing.includes("/marketing/og-pricing.svg")) errors.push("Pricing page does not use pricing OG image.");
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function readText(file) {
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}
