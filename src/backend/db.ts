import { PostgresDialect, Kysely, CamelCasePlugin } from "kysely";
import { type DB } from "./db.d";
import { Pool } from "pg";

const dialect = new PostgresDialect({
  pool: new Pool({
    database: "sleekflow",
    host: "localhost",
    user: "joohom",
    port: 5432,
    max: 10,
  }),
});

export const database = new Kysely<DB>({
  dialect,
  plugins: [new CamelCasePlugin()],
});
