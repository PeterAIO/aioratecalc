import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { randomUUID } = await import("crypto");
  const { db } = await import("./db");
  const { users, merchantApplications } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const [rep] = await db.select().from(users).where(eq(users.email, "rep@aioapp.com")).limit(1);
  if (!rep) throw new Error("rep@aioapp.com not seeded — run scripts/seed-users.ts first");

  const id = "test-pw-flow-" + randomUUID().slice(0, 8);
  const token = randomUUID();

  await db.insert(merchantApplications).values({
    id,
    ownerUserId: rep.id,
    stage: "prospect_created",
    targetMargin: "0.005",
    pricingModel: "flat",
    customerLinkToken: token,
    customerLinkPurpose: "lead_upload",
    customerLinkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  console.log(JSON.stringify({ id, token }));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
