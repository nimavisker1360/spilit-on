import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureRestaurantStarterWorkspace } from "@/features/restaurant/restaurant.service";
import { getTrialEndsAt, PRO_PLAN_CODE } from "@/features/billing/plan-config";

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8),
  restaurantName: z.string().min(2).max(120),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Geçersiz veri", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password, restaurantName } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Bu e-posta adresi zaten kullanımda" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const baseSlug = slugify(restaurantName);
    let slug = baseSlug;
    let attempt = 0;

    while (await prisma.restaurant.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const now = new Date();
    const trialEndsAt = getTrialEndsAt(now);

    const proPlan = await prisma.subscriptionPlan.findFirst({
      where: { code: PRO_PLAN_CODE, isActive: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          emailVerified: null,
        },
      });

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
          currentPlanId: proPlan?.id ?? null,
        },
      });

      await tx.membership.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      if (proPlan) {
        await tx.tenantSubscription.create({
          data: {
            restaurantId: restaurant.id,
            planId: proPlan.id,
            status: "TRIALING",
            billingPeriod: "MONTHLY",
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        });
      }

      return { user, restaurant };
    });

    await ensureRestaurantStarterWorkspace(result.restaurant.id);

    return NextResponse.json(
      {
        message: "Hesap oluşturuldu",
        userId: result.user.id,
        restaurantId: result.restaurant.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası, lütfen tekrar deneyin" },
      { status: 500 }
    );
  }
}
