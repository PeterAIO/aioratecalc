import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { db } from "@/lib/db/client";
import { users, customerLoginTokens, merchantApplications } from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, magicToken: {} },
      async authorize(credentials) {
        const magicToken = credentials?.magicToken as string | undefined;
        if (magicToken) {
          const [tokenRow] = await db
            .select()
            .from(customerLoginTokens)
            .where(eq(customerLoginTokens.token, magicToken))
            .limit(1);
          if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt.getTime() < Date.now()) return null;

          await db
            .update(customerLoginTokens)
            .set({ usedAt: new Date() })
            .where(eq(customerLoginTokens.id, tokenRow.id));

          let [user] = await db.select().from(users).where(eq(users.email, tokenRow.email)).limit(1);
          if (!user) {
            [user] = await db
              .insert(users)
              .values({ email: tokenRow.email, name: tokenRow.email.split("@")[0], role: "customer" })
              .returning();
          }
          if (user.disabledAt) return null;

          if (tokenRow.applicationId) {
            await db
              .update(merchantApplications)
              .set({ customerUserId: user.id })
              .where(
                and(
                  eq(merchantApplications.id, tokenRow.applicationId),
                  isNull(merchantApplications.customerUserId)
                )
              );
          }

          return { id: user.id, email: user.email, name: user.name, role: user.role };
        }

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user || !user.passwordHash || user.disabledAt) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
