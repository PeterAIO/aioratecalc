import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./db");
  const { users, merchantApplications, customerLoginTokens } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { randomUUID } = await import("crypto");

  const [rep] = await db.select({ id: users.id }).from(users).where(eq(users.email, "rep@aioapp.com")).limit(1);
  if (!rep) throw new Error("rep@aioapp.com not seeded");

  const appId = `tmp_test_${Date.now()}`;
  const now = new Date();

  await db.insert(merchantApplications).values({
    id: appId,
    ownerUserId: rep.id,
    stage: "merchant_filling",
    business: {
      legalName: "Test Coffee LLC", dba: "Test Coffee", bizType: "llc",
      address: "123 Main St", city: "Austin", state: "TX", zip: "78701",
      phone: "555-000-1111", website: "https://testcoffee.example", yearsInBusiness: "5", annualRevenue: "500000",
    },
    ownerContact: { firstName: "Jane", lastName: "Doe", title: "Owner", email: "jane@testcoffee.example", phone: "555-000-2222" },
    processing: {
      monthlyVolume: "50000", avgTicket: "12", cardPresentPct: "90", mcc: "5812",
      businessDescription: "Coffee shop", previouslyTerminated: "no", bankruptcy: "no", currentProcessor: "Square",
    },
    agreement: { sigName: "Jane Doe", sigDate: now.toISOString(), termsAccepted: true, electronicConsentAccepted: true },
    createdAt: now,
    updatedAt: now,
  });

  const loginToken = randomUUID();
  await db.insert(customerLoginTokens).values({
    email: "jane@testcoffee.example",
    token: loginToken,
    applicationId: appId,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
  });

  console.log(JSON.stringify({ appId, loginToken }));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
