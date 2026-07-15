import { requireDatabaseUrl } from "./db-utils.mjs";
import { runReliabilityReconciliation } from "../lib/reconciliation.js";

const allowFindings = process.argv.includes("--allow-findings");
const json = process.argv.includes("--json");

try {
  const result = await runReliabilityReconciliation(requireDatabaseUrl(), {
    source: "script",
  });
  if (json) {
    console.log(JSON.stringify({
      ok: true,
      runId: result.runId,
      summary: result.summary,
      findings: result.findings,
    }, null, 2));
  } else {
    console.log(`Reconciliation run ${result.runId || "dry"} complete.`);
    console.log(`Findings: ${result.summary.total}`);
    for (const [check, count] of Object.entries(result.summary.byCheck)) {
      console.log(`- ${check}: ${count}`);
    }
  }
  if (result.findings.length && !allowFindings) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Reconciliation failed:", error?.message || error);
  process.exit(1);
}
