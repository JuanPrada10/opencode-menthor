import { readFileSync } from "node:fs";
import { Eta } from "eta";
import type { LearningState } from "../types.js";

/**
 * Eta instance used to render the dashboard. `autoEscape` is enabled so any
 * escaped interpolation is XML-escaped by default.
 */
const eta = new Eta({ autoEscape: true, cache: true });

/**
 * Raw template source, lazily loaded once from disk (relative to this module,
 * never `process.cwd()`, since the OpenCode daemon may run from another cwd).
 */
let templateSource: string | null = null;

function loadTemplate(): string {
  if (templateSource === null) {
    const templateUrl = new URL("../views/dashboard.eta", import.meta.url);
    templateSource = readFileSync(templateUrl, "utf-8");
  }
  return templateSource;
}

/**
 * Renders the full modern, responsive SPA dashboard for Menthor Studio.
 *
 * The template receives a pre-serialized `stateJson` string with `<` escaped
 * to `\u003c` so it can be safely embedded in a `<script>` context.
 */
export function renderDashboardHtml(initialState: LearningState): string {
  const template = loadTemplate();
  const stateJson = JSON.stringify(initialState).replace(/</g, "\\u003c");
  return eta.renderString(template, { stateJson });
}
