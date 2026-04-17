import {
  cloneValue,
  currentTimestamp,
  getBranchMenuCategories,
  getBranchMenuItems,
  makeId,
  readStore,
  sortMenuCategories,
  sortMenuItems,
  updateStore
} from "@/lib/local-store";
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  deleteMenuCategorySchema,
  deleteMenuItemSchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
  type CreateMenuCategoryInput,
  type CreateMenuItemInput,
  type DeleteMenuCategoryInput,
  type DeleteMenuItemInput,
  type UpdateMenuCategoryInput,
  type UpdateMenuItemInput
} from "@/features/menu/menu.schemas";

function assertCategoryBelongsToBranch(store: ReturnType<typeof readStore>, categoryId: string, branchId: string) {
  const category = store.menuCategories.find((entry) => entry.id === categoryId);

  if (!category || category.branchId !== branchId) {
    throw new Error("Category is not linked to this branch");
  }
}

export async function createMenuCategory(input: CreateMenuCategoryInput) {
  const parsed = createMenuCategorySchema.parse(input);

  return updateStore((store) => {
    const branch = store.branches.find((entry) => entry.id === parsed.branchId);

    if (!branch) {
      throw new Error("Branch not found");
    }

    const duplicate = store.menuCategories.find(
      (category) => category.branchId === parsed.branchId && category.name === parsed.name
    );

    if (duplicate) {
      throw new Error("A record with this name already exists in the selected branch.");
    }

    const now = currentTimestamp();
    const category = {
      id: makeId("category"),
      branchId: parsed.branchId,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      createdAt: now,
      updatedAt: now
    };

    store.menuCategories.push(category);
    branch.updatedAt = now;

    return cloneValue(category);
  });
}

export async function createMenuItem(input: CreateMenuItemInput) {
  const parsed = createMenuItemSchema.parse(input);

  return updateStore((store) => {
    const branch = store.branches.find((entry) => entry.id === parsed.branchId);

    if (!branch) {
      throw new Error("Branch not found");
    }

    if (parsed.categoryId) {
      assertCategoryBelongsToBranch(store, parsed.categoryId, parsed.branchId);
    }

    const now = currentTimestamp();
    const item = {
      id: makeId("menu_item"),
      branchId: parsed.branchId,
      categoryId: parsed.categoryId ?? null,
      name: parsed.name,
      description: parsed.description || null,
      price: Number(parsed.price).toFixed(2),
      sortOrder: parsed.sortOrder,
      isAvailable: parsed.isAvailable,
      createdAt: now,
      updatedAt: now
    };

    store.menuItems.push(item);
    branch.updatedAt = now;

    return cloneValue(item);
  });
}

export async function updateMenuCategory(input: UpdateMenuCategoryInput) {
  const parsed = updateMenuCategorySchema.parse(input);

  return updateStore((store) => {
    const existing = store.menuCategories.find((category) => category.id === parsed.id);

    if (!existing) {
      throw new Error("Menu category not found");
    }

    existing.name = parsed.name;
    existing.sortOrder = parsed.sortOrder;
    existing.updatedAt = currentTimestamp();

    return cloneValue(existing);
  });
}

export async function deleteMenuCategory(input: DeleteMenuCategoryInput) {
  const parsed = deleteMenuCategorySchema.parse(input);

  return updateStore((store) => {
    const existing = store.menuCategories.find((category) => category.id === parsed.id);

    if (!existing) {
      throw new Error("Menu category not found");
    }

    const deleted = { ...existing };
    store.menuCategories = store.menuCategories.filter((category) => category.id !== parsed.id);
    store.menuItems = store.menuItems.map((item) =>
      item.categoryId === parsed.id ? { ...item, categoryId: null, updatedAt: currentTimestamp() } : item
    );

    return cloneValue(deleted);
  });
}

export async function updateMenuItem(input: UpdateMenuItemInput) {
  const parsed = updateMenuItemSchema.parse(input);

  return updateStore((store) => {
    const existing = store.menuItems.find((item) => item.id === parsed.id);

    if (!existing) {
      throw new Error("Menu item not found");
    }

    if (existing.branchId !== parsed.branchId) {
      throw new Error("Menu item does not belong to this branch");
    }

    if (parsed.categoryId) {
      assertCategoryBelongsToBranch(store, parsed.categoryId, parsed.branchId);
    }

    existing.categoryId = parsed.categoryId ?? null;
    existing.name = parsed.name;
    existing.description = parsed.description || null;
    existing.price = Number(parsed.price).toFixed(2);
    existing.sortOrder = parsed.sortOrder;
    existing.isAvailable = parsed.isAvailable;
    existing.updatedAt = currentTimestamp();

    return cloneValue(existing);
  });
}

export async function deleteMenuItem(input: DeleteMenuItemInput) {
  const parsed = deleteMenuItemSchema.parse(input);

  return updateStore((store) => {
    const existing = store.menuItems.find((item) => item.id === parsed.id);

    if (!existing) {
      throw new Error("Menu item not found");
    }

    const isReferenced = store.orderItems.some((item) => item.menuItemId === parsed.id);

    if (isReferenced) {
      throw new Error("Menu item is referenced by existing orders and cannot be deleted");
    }

    store.menuItems = store.menuItems.filter((item) => item.id !== parsed.id);
    return cloneValue(existing);
  });
}

type ListBranchMenuOptions = {
  includeUnavailable?: boolean;
};

export async function listBranchMenu(branchId: string, options: ListBranchMenuOptions = {}) {
  const store = readStore();
  const { includeUnavailable = false } = options;
  const categories = getBranchMenuCategories(store, branchId);
  const items = getBranchMenuItems(store, branchId).filter((item) => includeUnavailable || item.isAvailable);

  return cloneValue(
    sortMenuCategories(categories).map((category) => ({
      ...category,
      items: sortMenuItems(items.filter((item) => item.categoryId === category.id))
    }))
  );
}
