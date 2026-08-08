import { ORPCError } from "@orpc/server";

export function unauthorized(message = "Authentication required"): never {
  throw new ORPCError("UNAUTHORIZED", { message });
}

export function notFound(message = "Not found"): never {
  throw new ORPCError("NOT_FOUND", { message });
}

export function badRequest(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}
