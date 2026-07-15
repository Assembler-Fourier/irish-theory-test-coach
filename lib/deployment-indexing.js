const PREVIEW_ROBOTS_META = '<meta name="robots" content="noindex,nofollow" data-deployment-indexing="preview">';
const GENERATED_META_PATTERN = /\s*<meta name="robots" content="noindex,nofollow" data-deployment-indexing="preview">\s*/gi;

export function isPreviewDeployment(env = {}) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
}

export function applyDeploymentIndexingToHtml(html, env = {}) {
  const source = String(html);
  if (!isPreviewDeployment(env)) return source.replace(GENERATED_META_PATTERN, "\n");
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(source)) return source;
  return source.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    ${PREVIEW_ROBOTS_META}`);
}

export { PREVIEW_ROBOTS_META };
