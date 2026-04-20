import { prisma } from "@/lib/prisma";
import { normalizeMoneyStorage } from "@/lib/currency";
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  deleteMenuCategorySchema,
  deleteMenuItemSchema,
  importMenuItemsSchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
  type CreateMenuCategoryInput,
  type CreateMenuItemInput,
  type DeleteMenuCategoryInput,
  type DeleteMenuItemInput,
  type ImportMenuItemsInput,
  type UpdateMenuCategoryInput,
  type UpdateMenuItemInput,
} from "@/features/menu/menu.schemas";

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

export async function createMenuCategory(input: CreateMenuCategoryInput) {
  const parsed = createMenuCategorySchema.parse(input);

  const branch = await prisma.branch.findUnique({ where: { id: parsed.branchId } });
  if (!branch) throw new Error("Branch not found");

  const duplicate = await prisma.menuCategory.findUnique({
    where: { branchId_name: { branchId: parsed.branchId, name: parsed.name } },
  });
  if (duplicate) throw new Error("A record with this name already exists in the selected branch.");

  return prisma.menuCategory.create({
    data: { branchId: parsed.branchId, name: parsed.name, sortOrder: parsed.sortOrder },
  });
}

export async function updateMenuCategory(input: UpdateMenuCategoryInput) {
  const parsed = updateMenuCategorySchema.parse(input);

  const existing = await prisma.menuCategory.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Menu category not found");

  return prisma.menuCategory.update({
    where: { id: parsed.id },
    data: { name: parsed.name, sortOrder: parsed.sortOrder },
  });
}

export async function deleteMenuCategory(input: DeleteMenuCategoryInput) {
  const parsed = deleteMenuCategorySchema.parse(input);

  const existing = await prisma.menuCategory.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Menu category not found");

  await prisma.$transaction([
    prisma.menuItem.updateMany({
      where: { categoryId: parsed.id },
      data: { categoryId: null },
    }),
    prisma.menuCategory.delete({ where: { id: parsed.id } }),
  ]);

  return existing;
}

export async function createMenuItem(input: CreateMenuItemInput) {
  const parsed = createMenuItemSchema.parse(input);

  const branch = await prisma.branch.findUnique({ where: { id: parsed.branchId } });
  if (!branch) throw new Error("Branch not found");

  if (parsed.categoryId) {
    const category = await prisma.menuCategory.findUnique({ where: { id: parsed.categoryId } });
    if (!category || category.branchId !== parsed.branchId) {
      throw new Error("Category is not linked to this branch");
    }
  }

  return prisma.menuItem.create({
    data: {
      branchId: parsed.branchId,
      categoryId: parsed.categoryId ?? null,
      name: parsed.name,
      description: parsed.description || null,
      imageUrl: parsed.imageUrl || null,
      price: normalizeMoneyStorage(parsed.price),
      sortOrder: parsed.sortOrder,
      isAvailable: parsed.isAvailable,
    },
  });
}

export async function updateMenuItem(input: UpdateMenuItemInput) {
  const parsed = updateMenuItemSchema.parse(input);

  const existing = await prisma.menuItem.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Menu item not found");
  if (existing.branchId !== parsed.branchId) throw new Error("Menu item does not belong to this branch");

  if (parsed.categoryId) {
    const category = await prisma.menuCategory.findUnique({ where: { id: parsed.categoryId } });
    if (!category || category.branchId !== parsed.branchId) {
      throw new Error("Category is not linked to this branch");
    }
  }

  return prisma.menuItem.update({
    where: { id: parsed.id },
    data: {
      categoryId: parsed.categoryId ?? null,
      name: parsed.name,
      description: parsed.description || null,
      imageUrl: parsed.imageUrl || null,
      price: normalizeMoneyStorage(parsed.price),
      sortOrder: parsed.sortOrder,
      isAvailable: parsed.isAvailable,
    },
  });
}

export async function deleteMenuItem(input: DeleteMenuItemInput) {
  const parsed = deleteMenuItemSchema.parse(input);

  const existing = await prisma.menuItem.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Menu item not found");

  const isReferenced = await prisma.orderItem.count({ where: { menuItemId: parsed.id } });
  if (isReferenced > 0) {
    throw new Error("Menu item is referenced by existing orders and cannot be deleted");
  }

  await prisma.menuItem.delete({ where: { id: parsed.id } });
  return existing;
}

export async function importMenuItems(input: ImportMenuItemsInput) {
  const parsed = importMenuItemsSchema.parse(input);

  const branch = await prisma.branch.findUnique({ where: { id: parsed.branchId } });
  if (!branch) throw new Error("Branch not found");

  const existingCategories = await prisma.menuCategory.findMany({
    where: { branchId: parsed.branchId },
  });
  const existingItems = await prisma.menuItem.findMany({
    where: { branchId: parsed.branchId },
  });

  const categoryByName = new Map(existingCategories.map((c) => [normalizeText(c.name), c]));
  const itemByName = new Map(existingItems.map((i) => [normalizeText(i.name), i]));

  let maxSortOrder = existingCategories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
  let createdCount = 0;
  let updatedCount = 0;
  let categoriesCreatedCount = 0;

  for (const row of parsed.rows) {
    const rowName = row.name.trim();
    const rowCategoryName = row.categoryName.trim();
    let rowCategoryId: string | null = null;

    if (rowCategoryName) {
      const key = normalizeText(rowCategoryName);
      let category = categoryByName.get(key);
      if (!category) {
        maxSortOrder += 1;
        category = await prisma.menuCategory.create({
          data: { branchId: parsed.branchId, name: rowCategoryName, sortOrder: maxSortOrder },
        });
        categoryByName.set(key, category);
        categoriesCreatedCount++;
      }
      rowCategoryId = category.id;
    }

    const existingItem = itemByName.get(normalizeText(rowName));
    const price = normalizeMoneyStorage(row.price);

    if (existingItem) {
      await prisma.menuItem.update({
        where: { id: existingItem.id },
        data: {
          categoryId: rowCategoryId,
          name: rowName,
          description: row.description.trim() || null,
          price,
          sortOrder: row.sortOrder,
          isAvailable: row.isAvailable,
        },
      });
      updatedCount++;
    } else {
      const newItem = await prisma.menuItem.create({
        data: {
          branchId: parsed.branchId,
          categoryId: rowCategoryId,
          name: rowName,
          description: row.description.trim() || null,
          price,
          sortOrder: row.sortOrder,
          isAvailable: row.isAvailable,
        },
      });
      itemByName.set(normalizeText(rowName), newItem);
      createdCount++;
    }
  }

  return { processedCount: parsed.rows.length, createdCount, updatedCount, categoriesCreatedCount };
}

export async function listBranchMenu(branchId: string, options: { includeUnavailable?: boolean } = {}) {
  const categories = await prisma.menuCategory.findMany({
    where: { branchId },
    include: {
      items: {
        where: options.includeUnavailable ? undefined : { isAvailable: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return categories;
}
