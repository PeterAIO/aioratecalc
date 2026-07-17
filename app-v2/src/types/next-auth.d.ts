import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "rep" | "admin" | "customer";
  }
  interface Session {
    user: {
      id: string;
      role: "rep" | "admin" | "customer";
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: "rep" | "admin" | "customer";
  }
}
