import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./db");
  const { users, merchantApplications, customerLoginTokens } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const [customer] = await db.select().from(users).where(eq(users.email, "pwtest@example.com")).limit(1);

  await db.delete(customerLoginTokens).where(eq(customerLoginTokens.applicationId, "test-pw-flow-3f178403"));
  await db.delete(merchantApplications).where(eq(merchantApplications.id, "test-pw-flow-3f178403"));
  if (customer) {
    await db.delete(customerLoginTokens).where(eq(customerLoginTokens.email, "pwtest@example.com"));
    await db.delete(users).where(eq(users.id, customer.id));
  }
  console.log("cleaned up");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
