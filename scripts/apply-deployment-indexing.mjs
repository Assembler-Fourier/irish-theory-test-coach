import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDeploymentIndexingToHtml, isPreviewDeployment } from "../lib/deployment-indexing.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const htmlFiles = fs.readdirSync(publicDir).filter((file) => file.endsWith(".html"));

for (const file of htmlFiles) {
  const filePath = path.join(publicDir, file);
  const source = fs.readFileSync(filePath, "utf8");
  const output = applyDeploymentIndexingToHtml(source, process.env);
  if (output !== source) fs.writeFileSync(filePath, output);
}

console.log(`Deployment indexing: ${isPreviewDeployment(process.env) ? "preview noindex" : "production/indexable"} (${htmlFiles.length} HTML files).`);
