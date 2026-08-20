import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./db");
  const { customerLoginTokens, merchantApplications, customerSubmissions, users } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const tokens = await db.delete(customerLoginTokens).returning({ id: customerLoginTokens.id });
  console.log(`deleted ${tokens.length} customer_login_tokens`);

  const apps = await db.delete(merchantApplications).returning({ id: merchantApplications.id });
  console.log(`deleted ${apps.length} merchant_applications`);

  const subs = await db.delete(customerSubmissions).returning({ id: customerSubmissions.id });
  console.log(`deleted ${subs.length} customer_submissions`);

  const custUsers = await db.delete(users).where(eq(users.role, "customer")).returning({ id: users.id, email: users.email });
  console.log(`deleted ${custUsers.length} users (role=customer)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
