import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const reportDir = path.join(root, "reports", "audit");
const markdownPath = path.join(reportDir, "audit-report.md");
const htmlPath = path.join(reportDir, "audit-report.html");

const markdown = fs.readFileSync(markdownPath, "utf8");

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1">'
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2">$1</a>'
  );
  return html;
}

function renderTable(lines) {
  const rows = lines
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
    );
  if (rows.length < 2) return "";
  const header = rows[0];
  const body = rows.slice(2);
  return [
    "<table>",
    "<thead><tr>",
    ...header.map((cell) => `<th>${inline(cell)}</th>`),
    "</tr></thead>",
    "<tbody>",
    ...body.map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`
    ),
    "</tbody></table>",
  ].join("");
}

const lines = markdown.split(/\r?\n/);
const output = [];
let index = 0;
let inCode = false;
let codeLines = [];

while (index < lines.length) {
  const line = lines[index];

  if (line.startsWith("```")) {
    if (inCode) {
      output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
      inCode = false;
    } else {
      inCode = true;
    }
    index += 1;
    continue;
  }

  if (inCode) {
    codeLines.push(line);
    index += 1;
    continue;
  }

  if (!line.trim()) {
    index += 1;
    continue;
  }

  if (line.trim().startsWith("|") && lines[index + 1]?.includes("---")) {
    const tableLines = [];
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      tableLines.push(lines[index]);
      index += 1;
    }
    output.push(renderTable(tableLines));
    continue;
  }

  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    const level = heading[1].length;
    output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    index += 1;
    continue;
  }

  if (/^\d+\.\s+/.test(line)) {
    const items = [];
    while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
      items.push(lines[index].replace(/^\d+\.\s+/, ""));
      index += 1;
    }
    output.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`);
    continue;
  }

  if (/^-\s+/.test(line)) {
    const items = [];
    while (index < lines.length && /^-\s+/.test(lines[index])) {
      items.push(lines[index].replace(/^-\s+/, ""));
      index += 1;
    }
    output.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    continue;
  }

  output.push(`<p>${inline(line)}</p>`);
  index += 1;
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Irish Theory Test Coach Audit Report</title>
    <style>
      body { margin: 0; background: #f5f7f7; color: #17211f; font-family: Arial, Helvetica, sans-serif; line-height: 1.55; }
      main { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 64px; }
      h1 { font-size: 42px; line-height: 1.05; margin: 0 0 12px; }
      h2 { margin-top: 34px; border-top: 1px solid #dce4e0; padding-top: 24px; }
      h3 { margin-top: 22px; }
      p, li { color: #3e4a47; }
      code, pre { background: #eef3f1; border: 1px solid #dce4e0; border-radius: 6px; }
      code { padding: 2px 5px; }
      pre { padding: 14px; overflow: auto; }
      table { width: 100%; border-collapse: collapse; margin: 14px 0 22px; background: #fff; }
      th, td { border: 1px solid #dce4e0; padding: 10px; text-align: left; vertical-align: top; }
      th { background: #edf3f1; }
      img { display: block; max-width: 100%; height: auto; border: 1px solid #dce4e0; border-radius: 8px; background: #fff; margin: 12px 0 24px; }
      a { color: #1e6a89; }
      @media print {
        body { background: #fff; }
        main { width: auto; padding: 16px; }
        h2 { break-after: avoid; }
        table, img, pre { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      ${output.join("\n")}
    </main>
  </body>
</html>
`;

fs.writeFileSync(htmlPath, html, "utf8");
console.log(`Rendered ${path.relative(root, htmlPath)}`);
