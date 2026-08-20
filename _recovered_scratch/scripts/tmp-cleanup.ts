import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./db");
  const { merchantApplications, users, customerLoginTokens } = await import("../src/lib/db/schema");
  const { eq, like } = await import("drizzle-orm");

  await db.delete(customerLoginTokens).where(eq(customerLoginTokens.email, "testcustomer@example.com"));
  await db.delete(merchantApplications).where(like(merchantApplications.id, "prospect_test_%"));
  await db.delete(users).where(eq(users.email, "testcustomer@example.com"));
  console.log("cleaned up test data");
  process.exit(0);
}
main();
