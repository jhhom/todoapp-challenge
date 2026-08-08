import type { Kysely } from "kysely";
import type { DB } from "../../db.d";

export function createUserRepo(db: Kysely<DB>) {
  return {
    async findById(id: string) {
      return db
        .selectFrom("appUser")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },
    async findByEmail(email: string) {
      return db
        .selectFrom("appUser")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();
    },
    async create(email: string, passwordHash: string) {
      return db
        .insertInto("appUser")
        .values({ email, passwordHash })
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  };
}
export type UserRepo = ReturnType<typeof createUserRepo>;
