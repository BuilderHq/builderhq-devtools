// ─── CHECK 27 — Missing Error Boundaries on Route-Level Components ────────────
// Without ErrorBoundary wrappers, a single uncaught render error crashes the
// entire app — the user sees a blank white screen with no recovery path.
import * as path from "path";
import { getAllFiles, readFile, relPath, addIssue } from "../../utils.js";
import type { AuditConfig, CheckResult } from "../../types.js";

export function check27_errorBoundaries(config: AuditConfig): CheckResult {
  const label = "Missing Error Boundaries on Route Components";
  let count = 0;

  if (!config.stack.hasReact) {
    return { check: 27, label, passed: true, count: 0, skipped: true, skipReason: "React not detected" };
  }

  // Check if ErrorBoundary is used anywhere in the project
  const allFiles = getAllFiles(config.paths.clientSrc, [".tsx", ".jsx", ".ts"]);
  const hasErrorBoundaryDefined = allFiles.some(f => {
    const src = readFile(f);
    return /ErrorBoundary|error.?boundary/i.test(src) &&
      (/<ErrorBoundary/.test(src) || /extends\s+(?:React\.)?Component/.test(src));
  });

  // Find page/route components (files in pages/ or routes/ directories)
  const pageFiles = allFiles.filter(f => {
    const rel = relPath(f, config.paths.rootDir);
    return /(?:pages?|routes?|views?)[/\\]/.test(rel) &&
      (f.endsWith(".tsx") || f.endsWith(".jsx")) &&
      !f.includes("_app") && !f.includes("layout") && !f.includes("index");
  });

  if (pageFiles.length === 0) {
    // No page files found — check if there's a router setup
    const routerFiles = allFiles.filter(f => {
      const src = readFile(f);
      return /<Route\s|createBrowserRouter|createHashRouter|RouterProvider/.test(src);
    });

    if (routerFiles.length > 0) {
      for (const f of routerFiles) {
        const rel = relPath(f, config.paths.rootDir);
        const src = readFile(f);
        if (!/<ErrorBoundary|errorElement\s*=/.test(src) && !hasErrorBoundaryDefined) {
          addIssue("WARNING", 27, rel, 1,
            `Router has no errorElement or ErrorBoundary — uncaught render errors will show a blank screen`,
            config);
          count++;
          break; // one warning per project is enough
        }
      }
    }
    return { check: 27, label, passed: count === 0, count };
  }

  // Check if the app has any ErrorBoundary usage at all
  if (!hasErrorBoundaryDefined && pageFiles.length > 3) {
    // Multiple pages but no error boundary anywhere
    addIssue("WARNING", 27, rel(pageFiles[0], config.paths.rootDir), 1,
      `${pageFiles.length} page components found but no ErrorBoundary detected — one render error crashes the entire app`,
      config);
    count++;
  }

  return { check: 27, label, passed: count === 0, count };
}

function rel(file: string, root: string): string {
  return path.relative(root, file);
}
