import { redirect } from "next/navigation";

// Admin is no longer a separate destination — the dashboard at /rep renders the
// admin-scoped view (all reps' accounts + Leads) when an admin is signed in.
// Admin-only config still lives under /admin/* (users, margin padding).
export default function AdminPage() {
  redirect("/rep");
}
