import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { hash } = await import("bcryptjs");
  const { db } = await import("./db");
  const { users } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const seeds = [
    { email: "admin@aioapp.com", name: "AIO Admin", role: "admin" as const, password: "admin123" },
    { email: "rep@aioapp.com", name: "AIO Rep", role: "rep" as const, password: "rep123" },
    { email: "customer@aioapp.com", name: "AIO Customer", role: "customer" as const, password: "customer123" },
  ];

  for (const seed of seeds) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, seed.email)).limit(1);
    const passwordHash = await hash(seed.password, 10);
    if (existing) {
      await db.update(users).set({ passwordHash, name: seed.name, role: seed.role }).where(eq(users.id, existing.id));
      console.log(`updated ${seed.email}`);
    } else {
      await db.insert(users).values({ email: seed.email, name: seed.name, role: seed.role, passwordHash });
      console.log(`created ${seed.email}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
