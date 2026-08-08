import type { IncomingHttpHeaders } from "node:http";
import type { Kysely } from "kysely";
import type { DB } from "./db.d";

export type ServerContext = {
  db: Kysely<DB>;
  headers: IncomingHttpHeaders;
};

/** Authenticated context produced by the requireAuth middleware. */
export type AuthedContext = ServerContext & {
  user: { id: string; email: string };
};
