import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  getProPlanFeaturePayload,
  getTrialEndsAt,
  PRO_PLAN_CODE,
  PRO_PLAN_NAME,
  PRO_PLAN_PRICE_MONTHLY,
} from "../src/features/billing/plan-config";

const prisma = new PrismaClient();

function generateSeedTableToken(): string {
  return randomBytes(18).toString("base64url");
}

async function ensureMenuItem(input: {
  branchId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: string;
  sortOrder: number;
}) {
  const existing = await prisma.menuItem.findFirst({
    where: {
      branchId: input.branchId,
      name: input.name
    },
    select: { id: true }
  });

  if (existing) {
    return prisma.menuItem.update({
      where: { id: existing.id },
      data: {
        categoryId: input.categoryId,
        description: input.description ?? null,
        price: input.price,
        sortOrder: input.sortOrder,
        isAvailable: true
      },
      select: { id: true }
    });
  }

  return prisma.menuItem.create({
    data: {
      branchId: input.branchId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      sortOrder: input.sortOrder,
      isAvailable: true
    },
    select: { id: true }
  });
}

async function ensureSubscriptionPlans() {
  await prisma.subscriptionPlan.updateMany({
    where: {
      code: {
        in: ["starter", "business", "trial"],
      },
    },
    data: {
      isActive: false,
    },
  });

  return prisma.subscriptionPlan.upsert({
    where: { code: PRO_PLAN_CODE },
    update: {
      name: PRO_PLAN_NAME,
      monthlyPrice: PRO_PLAN_PRICE_MONTHLY,
      annualPrice: "0.00",
      currency: "TRY",
      includedTables: 30,
      includedBranches: 1,
      includedStaff: 10,
      commissionRate: "0.00",
      features: getProPlanFeaturePayload(),
      isActive: true,
    },
    create: {
      code: PRO_PLAN_CODE,
      name: PRO_PLAN_NAME,
      monthlyPrice: PRO_PLAN_PRICE_MONTHLY,
      annualPrice: "0.00",
      currency: "TRY",
      includedTables: 30,
      includedBranches: 1,
      includedStaff: 10,
      commissionRate: "0.00",
      features: getProPlanFeaturePayload(),
      isActive: true,
    },
  });
}

async function ensureSuperAdminUser() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Skipped super admin seed. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to create the first owner account.");
    return null;
  }

  if (password.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const name = process.env.SUPER_ADMIN_NAME?.trim() || "MasaPayz Owner";

  return prisma.superAdminUser.upsert({
    where: { email },
    update: {
      passwordHash,
      name,
      role: "super_admin",
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      name,
      role: "super_admin",
      isActive: true,
    },
  });
}

async function main() {
  await ensureSuperAdminUser();

  const proPlan = await ensureSubscriptionPlans();
  const trialStartedAt = new Date();
  const trialEndsAt = getTrialEndsAt(trialStartedAt);

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "split-table-demo" },
    create: {
      name: "Split Table Demo",
      slug: "split-table-demo",
      status: "TRIALING",
      workspaceMode: "TRIAL",
      defaultLocale: "TR",
      defaultCurrency: "TRY",
      currentPlanId: proPlan.id,
      trialStartedAt,
      trialEndsAt,
    },
    update: {
      status: "TRIALING",
      workspaceMode: "TRIAL",
      defaultLocale: "TR",
      defaultCurrency: "TRY",
      currentPlanId: proPlan.id,
      trialStartedAt,
      trialEndsAt,
    }
  });

  const existingSubscription = await prisma.tenantSubscription.findFirst({
    where: { restaurantId: restaurant.id },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (existingSubscription) {
    await prisma.tenantSubscription.update({
      where: { id: existingSubscription.id },
      data: {
        planId: proPlan.id,
        status: "TRIALING",
        billingPeriod: "MONTHLY",
        currentPeriodStart: trialStartedAt,
        currentPeriodEnd: trialEndsAt,
        cancelAtPeriodEnd: false,
        autoRenew: true,
      },
    });
  } else {
    await prisma.tenantSubscription.create({
      data: {
        restaurantId: restaurant.id,
        planId: proPlan.id,
        status: "TRIALING",
        billingPeriod: "MONTHLY",
        currentPeriodStart: trialStartedAt,
        currentPeriodEnd: trialEndsAt,
        cancelAtPeriodEnd: false,
        autoRenew: true,
      },
    });
  }

  const branch = await prisma.branch.upsert({
    where: {
      restaurantId_slug: {
        restaurantId: restaurant.id,
        slug: "downtown"
      }
    },
    create: {
      restaurantId: restaurant.id,
      name: "Downtown Branch",
      slug: "downtown",
      location: "Main Street"
    },
    update: {
      name: "Downtown Branch",
      location: "Main Street"
    }
  });

  await prisma.table.upsert({
    where: { code: "DT-T1" },
    create: { branchId: branch.id, name: "T1", code: "DT-T1", publicToken: generateSeedTableToken(), capacity: 4, status: "AVAILABLE" },
    update: { name: "T1", capacity: 4, status: "AVAILABLE" }
  });

  await prisma.table.upsert({
    where: { code: "DT-T2" },
    create: { branchId: branch.id, name: "T2", code: "DT-T2", publicToken: generateSeedTableToken(), capacity: 4, status: "AVAILABLE" },
    update: { name: "T2", capacity: 4, status: "AVAILABLE" }
  });

  await prisma.table.upsert({
    where: { code: "DT-T3" },
    create: { branchId: branch.id, name: "T3", code: "DT-T3", publicToken: generateSeedTableToken(), capacity: 6, status: "AVAILABLE" },
    update: { name: "T3", capacity: 6, status: "AVAILABLE" }
  });

  const starters = await prisma.menuCategory.upsert({
    where: {
      branchId_name: {
        branchId: branch.id,
        name: "Starters"
      }
    },
    create: {
      branchId: branch.id,
      name: "Starters",
      sortOrder: 1
    },
    update: { sortOrder: 1 }
  });

  const mains = await prisma.menuCategory.upsert({
    where: {
      branchId_name: {
        branchId: branch.id,
        name: "Mains"
      }
    },
    create: {
      branchId: branch.id,
      name: "Mains",
      sortOrder: 2
    },
    update: { sortOrder: 2 }
  });

  const drinks = await prisma.menuCategory.upsert({
    where: {
      branchId_name: {
        branchId: branch.id,
        name: "Drinks"
      }
    },
    create: {
      branchId: branch.id,
      name: "Drinks",
      sortOrder: 3
    },
    update: { sortOrder: 3 }
  });

  await ensureMenuItem({
    branchId: branch.id,
    categoryId: starters.id,
    name: "Soup of the Day",
    description: "Daily rotating house soup.",
    price: "6.50",
    sortOrder: 1
  });
  await ensureMenuItem({
    branchId: branch.id,
    categoryId: starters.id,
    name: "Garden Salad",
    description: "Mixed greens, tomato, cucumber, lemon dressing.",
    price: "7.00",
    sortOrder: 2
  });
  await ensureMenuItem({
    branchId: branch.id,
    categoryId: mains.id,
    name: "Grilled Chicken",
    description: "Served with seasonal vegetables.",
    price: "14.90",
    sortOrder: 1
  });
  await ensureMenuItem({
    branchId: branch.id,
    categoryId: mains.id,
    name: "Pasta Alfredo",
    description: "Creamy alfredo sauce with parmesan.",
    price: "13.75",
    sortOrder: 2
  });
  await ensureMenuItem({
    branchId: branch.id,
    categoryId: drinks.id,
    name: "Sparkling Water",
    description: "330ml bottle.",
    price: "2.50",
    sortOrder: 1
  });
  await ensureMenuItem({
    branchId: branch.id,
    categoryId: drinks.id,
    name: "Lemonade",
    description: "Fresh lemon and mint.",
    price: "3.20",
    sortOrder: 2
  });

  console.log(`Seeded restaurant ${restaurant.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


