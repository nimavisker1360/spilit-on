import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

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

async function main() {
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "split-table-demo" },
    create: {
      name: "Split Table Demo",
      slug: "split-table-demo"
    },
    update: {}
  });

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


