import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { DEBUG_ROLE_COOKIE, isDebugRoleSwitchEnabled, parseDebugRole } from "@/lib/auth/debugRole";
import RoleSwitcher from "@/components/dev/RoleSwitcher";

export const metadata: Metadata = {
  title: "ClearRate — AIO Proposal Engine",
  description: "AIO payment processing proposal and onboarding tool",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // DEBUG-ROLE-SWITCHER: only ever mounted when ENABLE_DEBUG_ROLE_SWITCH=true
  // (a flag that must only live in a local .env.local — see debugRole.ts).
  const debugSwitchEnabled = isDebugRoleSwitchEnabled();
  const currentDebugRole = debugSwitchEnabled
    ? parseDebugRole((await cookies()).get(DEBUG_ROLE_COOKIE)?.value)
    : null;

  return (
    <html lang="en">
      <body>
        {children}
        {debugSwitchEnabled && <RoleSwitcher current={currentDebugRole} />}
      </body>
    </html>
  );
}
