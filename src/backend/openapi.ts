import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { OpenAPIGeneratorGenerateOptions } from "@orpc/openapi";
import { router } from "./router";
import {
  TodoSchema,
  PageMeta,
  TokenOutput,
  TodoChangeEventSchema,
} from "../shared/api";

/**
 * Reusable JSON-Schema converter that knows how to translate every Zod v4
 * schema into a JSON-Schema representation understood by the OpenAPI generator.
 */
const openApiGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

/**
 * High-level OpenAPI metadata: title, version, server URLs and shared
 * `components.schemas` definitions (emitted as `$ref` in the generated spec
 * so the document stays compact and DRY).
 */
const specConfig: OpenAPIGeneratorGenerateOptions = {
  info: {
    title: "Sleekflow Todo API",
    version: "1.0.0",
    description:
      "A type-safe Todo management API built with [oRPC](https://orpc.dev). " +
      "Supports recurring tasks, dependencies, real-time SSE updates, " +
      "filtering, sorting, and pagination.\n\n" +
      "## Authentication\n\n" +
      "All `/todos/**` endpoints require a Bearer JWT obtained from " +
      "`POST /auth/register` or `POST /auth/login`. Pass it in the " +
      "`Authorization` header:\n\n" +
      "```\nAuthorization: Bearer <token>\n```",
  },
  servers: [
    { url: "http://localhost:5170/api", description: "Local dev server" },
  ],
  commonSchemas: {
    Todo: { schema: TodoSchema },
    PageMeta: { schema: PageMeta },
    TokenOutput: { schema: TokenOutput },
    TodoChangeEvent: { schema: TodoChangeEventSchema },
  },
};

/**
 * Generates the full OpenAPI 3.1.1 specification from the oRPC router.
 *
 * The generator resolves procedures at the contract layer, which doesn't
 * carry middleware metadata. To document authentication correctly we:
 *  1. Inject the `bearerAuth` security scheme into `components.securitySchemes`.
 *  2. Tag every protected (`/todos/**`) operation with `security`.
 *
 * The `oo.spec` call on `requireAuth` (see `middleware/auth.ts`) remains in
 * place as the canonical source of truth; these post-processing steps ensure
 * the generated document reflects that intent.
 */
export async function generateOpenAPISpec() {
  const spec = await openApiGenerator.generate(router, specConfig);

  // 1 — Register the Bearer JWT security scheme so consumers can generate
  //     authenticated clients from the spec alone.
  spec.components = {
    ...spec.components,
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  };

  // 2 — All /todos/** endpoints require authentication. Auth endpoints
  //     (/auth/**) are public and must remain unsecured.
  const SECURED: Record<string, unknown> = { security: [{ bearerAuth: [] }] };
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!path.startsWith("/todos") || !pathItem) continue;
    for (const op of Object.values(pathItem)) {
      if (op && typeof op === "object" && "operationId" in op) {
        Object.assign(op, SECURED);
      }
    }
  }

  return spec;
}
