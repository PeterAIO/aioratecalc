import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { hash } = await import("bcryptjs");
  const { db } = await import("./db");
  const { users } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const passwordHash = await hash("testpass123", 10);
  await db.update(users).set({ passwordHash }).where(eq(users.email, "pwtest@example.com"));
  console.log("password set");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
