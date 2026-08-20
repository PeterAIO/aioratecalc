import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "crypto";

async function main() {
  const { db } = await import("./db");
  const { customerLoginTokens } = await import("../src/lib/db/schema");
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(customerLoginTokens).values({ email: "shaheer.hasnain@aioapp.com", token, expiresAt });
  console.log("TOKEN:", token);
  process.exit(0);
}
main();
