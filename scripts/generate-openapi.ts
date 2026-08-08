/**
 * Standalone OpenAPI specification generator.
 *
 * Usage:  npx tsx --tsconfig tsconfig.app.json scripts/generate-openapi.ts
 *
 * Writes the full OpenAPI 3.1.1 document to `openapi.json` at the project root.
 * Useful for CI pipelines, committing the spec to the repo, or feeding it to
 * code generators / API documentation tools.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateOpenAPISpec } from "../src/backend/openapi";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const spec = await generateOpenAPISpec();
  const outPath = resolve(__dirname, "..", "openapi.json");
  writeFileSync(outPath, JSON.stringify(spec, null, 2));

  console.log(`✅ OpenAPI spec written to ${outPath}`);
  console.log(
    `   ${Object.keys(spec.paths ?? {}).length} paths, ${
      Object.keys(spec.components?.schemas ?? {}).length
    } schemas`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
