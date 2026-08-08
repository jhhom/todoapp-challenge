import { PostgresDialect, Kysely, CamelCasePlugin } from "kysely";
import { type DB } from "./db.d";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://joohom@localhost:5432/sleekflow";

const dialect = new PostgresDialect({
  pool: new Pool({ connectionString: databaseUrl, max: 10 }),
});

export const database = new Kysely<DB>({
  dialect,
  plugins: [new CamelCasePlugin()],
});
