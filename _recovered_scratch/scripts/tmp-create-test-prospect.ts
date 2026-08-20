import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./db");
  const { users, merchantApplications } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { randomUUID } = await import("crypto");

  const [rep] = await db.select().from(users).where(eq(users.email, "rep@aioapp.com")).limit(1);
  if (!rep) throw new Error("rep not found");

  const token = randomUUID();
  const now = new Date();
  const id = `prospect_test_${now.getTime()}`;
  await db.insert(merchantApplications).values({
    id,
    ownerUserId: rep.id,
    customerUserId: null,
    stage: "prospect_created",
    targetMargin: "0.008",
    pricingModel: "2-tier",
    customerLinkToken: token,
    customerLinkPurpose: "lead_upload",
    customerLinkSentAt: now,
    customerLinkExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    business: { legalName: "Test Coffee Co", dba: "Test Coffee Co", bizType: "llc", address: "", city: "", state: "", zip: "", phone: "", website: "", yearsInBusiness: "", annualRevenue: "" },
    ownerContact: { firstName: "", lastName: "", title: "", email: "testcustomer@example.com", phone: "" },
  });

  console.log("APP_ID=" + id);
  console.log("TOKEN=" + token);
  console.log("LEAD_URL=http://localhost:3001/lead/" + token);
  process.exit(0);
}
main();
