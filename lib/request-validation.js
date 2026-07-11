import { readJsonBody } from "./auth.js";

export async function readValidatedJson(req, schema, options = {}) {
  const body = await readJsonBody(req, { maxBytes: options.maxBytes || schema.maxBytes || 16_384 });
  return validateObject(body, schema);
}

export function validateObject(body, schema) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throwRequestError(400, "invalid_body");
  }

  const fields = schema.fields || {};
  const unknown = Object.keys(body).filter((key) => !fields[key]);
  if (schema.rejectUnknown !== false && unknown.length) {
    throwRequestError(400, "unknown_fields");
  }

  const output = {};
  for (const [fieldName, rule] of Object.entries(fields)) {
    const value = body[fieldName];
    if ((value === undefined || value === null || value === "") && rule.required) {
      throwRequestError(400, "missing_field");
    }
    if (value === undefined || value === null || value === "") {
      if (Object.hasOwn(rule, "default")) output[fieldName] = rule.default;
      continue;
    }
    output[fieldName] = normalizeField(value, rule);
  }
  return output;
}

export function throwRequestError(statusCode, code) {
  const error = new Error(code || "invalid_request");
  error.statusCode = statusCode;
  error.code = code || "invalid_request";
  throw error;
}

export function fieldString({ max = 500, pattern = null, required = false, default: defaultValue, unsafe = false } = {}) {
  return { type: "string", max, pattern, required, default: defaultValue, unsafe };
}

export function fieldEmail({ required = false } = {}) {
  return {
    type: "string",
    max: 254,
    required,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  };
}

export function fieldEnum(values, { required = false, default: defaultValue } = {}) {
  return { type: "enum", values, required, default: defaultValue };
}

export function fieldNumber({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, integer = false, required = false, default: defaultValue } = {}) {
  return { type: "number", min, max, integer, required, default: defaultValue };
}

export function fieldBoolean({ required = false, default: defaultValue } = {}) {
  return { type: "boolean", required, default: defaultValue };
}

export function fieldArray({ maxItems = 50, item = null, required = false, default: defaultValue } = {}) {
  return { type: "array", maxItems, item, required, default: defaultValue };
}

export function fieldObject({ required = false, default: defaultValue } = {}) {
  return { type: "object", required, default: defaultValue };
}

export function isSafeText(value) {
  return !/[<>]|\bjavascript:/i.test(String(value || ""));
}

function normalizeField(value, rule) {
  if (rule.type === "string") {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length > rule.max) throwRequestError(400, "field_too_large");
    if (!rule.unsafe && !isSafeText(text)) throwRequestError(400, "unsafe_string");
    if (rule.pattern && !rule.pattern.test(text)) throwRequestError(400, "invalid_field");
    return text;
  }

  if (rule.type === "enum") {
    const text = String(value || "").trim();
    if (!rule.values.includes(text)) throwRequestError(400, "invalid_enum");
    return text;
  }

  if (rule.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throwRequestError(400, "invalid_number");
    if (rule.integer && !Number.isInteger(number)) throwRequestError(400, "invalid_number");
    if (number < rule.min || number > rule.max) throwRequestError(400, "impossible_value");
    return number;
  }

  if (rule.type === "boolean") {
    if (typeof value !== "boolean") throwRequestError(400, "invalid_boolean");
    return value;
  }

  if (rule.type === "array") {
    if (!Array.isArray(value)) throwRequestError(400, "invalid_array");
    if (value.length > rule.maxItems) throwRequestError(400, "array_too_large");
    return rule.item ? value.map((item) => normalizeField(item, rule.item)) : value;
  }

  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throwRequestError(400, "invalid_object");
    return value;
  }

  throwRequestError(400, "invalid_schema");
}
