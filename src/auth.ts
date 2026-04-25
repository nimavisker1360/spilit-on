import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google, { type GoogleProfile } from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { StaffRole } from "@/features/auth/auth.types";

type SessionMembership = {
  restaurantId: string;
  role: StaffRole;
};

type AuthUserInput = {
  userId: string;
  provider?: string | null;
  name?: string | null;
  email?: string | null;
  profile?: GoogleProfile | null;
};

const googleClientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultRestaurantName(name?: string | null, email?: string | null): string {
  const displayName = name?.trim() || email?.split("@")[0]?.trim() || "My";
  return `${displayName}'s Restaurant`;
}

async function createUniqueRestaurantSlug(seed: string): Promise<string> {
  const baseSlug = slugify(seed) || "restaurant";
  let slug = baseSlug;
  let attempt = 0;

  while (await prisma.restaurant.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  return slug;
}

async function getActiveMembership(userId: string): Promise<SessionMembership | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { restaurantId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return null;

  return {
    restaurantId: membership.restaurantId,
    role: membership.role as StaffRole,
  };
}

async function updateGoogleLoginMetadata(userId: string, profile?: GoogleProfile | null) {
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: now,
      ...(profile?.email_verified
        ? {
            emailVerified: now,
            emailVerifiedAt: now,
          }
        : {}),
    },
  });
}

async function createGoogleTrialMembership(input: AuthUserInput): Promise<SessionMembership> {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const restaurantName = defaultRestaurantName(input.name, input.email);
  const slug = await createUniqueRestaurantSlug(restaurantName);

  const trialPlan = await prisma.subscriptionPlan.findFirst({
    where: { code: "trial", isActive: true },
  });

  const membership = await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.membership.findFirst({
      where: { userId: input.userId, status: "ACTIVE" },
      select: { restaurantId: true, role: true },
      orderBy: { createdAt: "asc" },
    });

    if (existingMembership) {
      return existingMembership;
    }

    const restaurant = await tx.restaurant.create({
      data: {
        name: restaurantName,
        slug,
        status: "TRIALING",
        workspaceMode: "TRIAL",
        defaultLocale: "TR",
        defaultCurrency: "TRY",
        trialStartedAt: now,
        trialEndsAt,
        currentPlanId: trialPlan?.id ?? null,
      },
    });

    const ownerMembership = await tx.membership.create({
      data: {
        restaurantId: restaurant.id,
        userId: input.userId,
        role: "OWNER",
        status: "ACTIVE",
      },
      select: { restaurantId: true, role: true },
    });

    if (trialPlan) {
      await tx.tenantSubscription.create({
        data: {
          restaurantId: restaurant.id,
          planId: trialPlan.id,
          status: "TRIALING",
          billingPeriod: "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
        },
      });
    }

    await tx.user.update({
      where: { id: input.userId },
      data: {
        lastLoginAt: now,
        ...(input.profile?.email_verified
          ? {
              emailVerified: now,
              emailVerifiedAt: now,
            }
          : {}),
      },
    });

    return ownerMembership;
  });

  const { ensureRestaurantStarterWorkspace } = await import("@/features/restaurant/restaurant.service");
  await ensureRestaurantStarterWorkspace(membership.restaurantId);

  return {
    restaurantId: membership.restaurantId,
    role: membership.role as StaffRole,
  };
}

async function resolveSessionMembership(input: AuthUserInput): Promise<SessionMembership | null> {
  const existingMembership = await getActiveMembership(input.userId);

  if (existingMembership) {
    if (input.provider === "google") {
      await updateGoogleLoginMetadata(input.userId, input.profile);
    }

    return existingMembership;
  }

  if (input.provider !== "google") {
    return null;
  }

  return createGoogleTrialMembership(input);
}

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
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name || profile.email.split("@")[0] || "Google User",
                email: profile.email,
                image: profile.picture,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const googleProfile = profile as GoogleProfile | undefined;
      return googleProfile?.email_verified === true;
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        const authUser = user as {
          id?: string | null;
          email?: string | null;
          name?: string | null;
        };
        const membership = authUser.id
          ? await resolveSessionMembership({
              userId: authUser.id,
              provider: account?.provider ?? null,
              name: authUser.name ?? token.name ?? null,
              email: authUser.email ?? token.email ?? null,
              profile: account?.provider === "google" ? (profile as GoogleProfile | null) : null,
            })
          : null;

        token.restaurantId = membership?.restaurantId ?? null;
        token.role = membership?.role ?? null;
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
