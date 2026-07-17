// Standalone-script DB client (no "server-only" guard) — for scripts run via
// `tsx` outside Next's bundler. App code must use src/lib/db/client.ts instead.
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../src/lib/db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");

export const db = drizzle(neon(connectionString), { schema });
