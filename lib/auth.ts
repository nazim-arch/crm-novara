import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) {
            console.error("Auth: validation failed", parsed.error);
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          });
          if (!user) {
            console.error("Auth: user not found", parsed.data.email);
            return null;
          }
          if (!user.is_active) {
            console.error("Auth: user inactive", parsed.data.email);
            return null;
          }

          const valid = await bcrypt.compare(
            parsed.data.password,
            user.password_hash
          );
          if (!valid) {
            console.error("Auth: password mismatch for", parsed.data.email);
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
        } catch (error) {
          console.error("Auth: unexpected error", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "";
        token.id = user.id ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
