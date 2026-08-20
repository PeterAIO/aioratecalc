import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./db");
  const { merchantApplications, customerLoginTokens, users } = await import("../src/lib/db/schema");
  const leads = await db.select().from(merchantApplications).limit(20);
  console.log("applications:", JSON.stringify(leads.map(l => ({ id: l.id, token: l.customerLinkToken, purpose: l.customerLinkPurpose, expires: l.customerLinkExpiresAt, customerUserId: l.customerUserId })), null, 2));
  const tokens = await db.select().from(customerLoginTokens).limit(20);
  console.log("login tokens:", JSON.stringify(tokens, null, 2));
  const us = await db.select().from(users);
  console.log("users:", JSON.stringify(us.map(u => ({ id: u.id, email: u.email, role: u.role })), null, 2));
  process.exit(0);
}
main();
