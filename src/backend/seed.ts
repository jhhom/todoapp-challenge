import { database } from "./db";

async function main() {
  let user = await database
    .selectFrom("appUser")
    .selectAll()
    .where("email", "=", "seed@x.com")
    .executeTakeFirst();

  if (!user) {
    user = await database
      .insertInto("appUser")
      .values({ email: "seed@x.com", passwordHash: "seed-no-login" })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  const userId = String(user.id);
  const BATCH = 500;
  const TOTAL = 10_000;
  for (let i = 0; i < TOTAL; i += BATCH) {
    const rows = Array.from({ length: BATCH }, (_, j) => ({
      name: `Seeded task ${i + j}`,
      status: "not_started" as const,
      priority: (["low", "medium", "high"] as const)[(i + j) % 3],
      schedule: "none" as const,
      createdBy: userId,
    }));
    await database.insertInto("todo").values(rows).execute();
    process.stdout.write(`Inserted ${Math.min(i + BATCH, TOTAL)}\r`);
  }
  console.log("\nDone. Inserted 10000 todos for user", userId);
  await database.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
