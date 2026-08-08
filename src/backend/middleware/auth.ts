import { implement } from "@orpc/server";
import { oo } from "@orpc/openapi";
import { apiContract } from "../../shared/api";
import { verifyToken } from "../lib/jwt";
import { unauthorized } from "../lib/errors";
import type { ServerContext } from "../context";

const os = implement(apiContract).$context<ServerContext>();

/**
 * Verifies the Bearer JWT from the Authorization header and injects `user`
 * into the context. Throws UNAUTHORIZED if missing/invalid.
 *
 * `oo.spec` attaches OpenAPI security metadata so every procedure using this
 * middleware is automatically documented as requiring a Bearer token.
 */
export const requireAuth = oo.spec(
  os.middleware(async ({ context, next }) => {
    const header = context.headers["authorization"];
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith("Bearer ") ? raw.slice(7) : undefined;
    const user = token ? await verifyToken(token) : null;
    if (!user) unauthorized();
    return next({ context: { user } });
  }),
  { security: [{ bearerAuth: [] }] },
);

export const baseOs = os;
