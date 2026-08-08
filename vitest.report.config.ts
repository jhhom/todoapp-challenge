import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vite.config";

/**
 * Dedicated Vitest configuration for generating shareable test reports.
 *
 * This config is used by `pnpm test:report` (and the GitHub Actions workflow)
 * to produce:
 *   - An interactive HTML report (via the `html` reporter / @vitest/ui)
 *   - A JUnit XML file (machine-readable, for CI dashboards)
 *   - GitHub Actions annotations + job summary
 *
 * The `base` option is derived from the `PAGES_BASE_PATH` environment variable
 * (set by `actions/configure-pages` in CI) so that the HTML report loads its
 * assets correctly when hosted under a GitHub Pages sub-path such as
 * `https://<owner>.github.io/<repo>/`.
 */
const rawBase = process.env.PAGES_BASE_PATH || "";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

export default mergeConfig(
  baseConfig,
  defineConfig({
    base,
    test: {
      reporters: ["default", "html", "junit", "github-actions"],
      outputFile: {
        html: "./test-report/index.html",
        junit: "./test-report/junit.xml",
      },
    },
  }),
);
