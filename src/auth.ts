import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { StaffRole } from "@/features/auth/auth.types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as ReturnType<typeof PrismaAdapter>,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email).toLowerCase() },
        });

        if (!user || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(
          String(credentials.password),
          user.passwordHash
        );
        if (!isValid) return null;

        const membership = await prisma.membership.findFirst({
          where: { userId: user.id, status: "ACTIVE" },
          include: { restaurant: true },
          orderBy: { createdAt: "asc" },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          restaurantId: membership?.restaurantId ?? null,
          role: (membership?.role ?? null) as StaffRole | null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.restaurantId = (user as { restaurantId?: string }).restaurantId ?? null;
        token.role = (user as { role?: StaffRole }).role ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? "";
        (session as { restaurantId?: string | null }).restaurantId =
          (token.restaurantId as string | null) ?? null;
        (session as { role?: StaffRole | null }).role =
          (token.role as StaffRole | null) ?? null;
      }
      return session;
    },
  },
});
