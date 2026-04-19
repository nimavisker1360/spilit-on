import {
  cascadeDeleteBranch,
  cloneValue,
  currentTimestamp,
  getBranchMenuCategories,
  getBranchMenuItems,
  getBranchTables,
  getRestaurantBranches,
  getSessionGuests,
  getSessionOrders,
  makeId,
  readStore,
  sortByCreatedAtAsc,
  sortByNameAsc,
  updateStore
} from "@/lib/local-store";
import {
  createBranchSchema,
  createRestaurantSchema,
  deleteBranchSchema,
  updateBranchSchema,
  type CreateBranchInput,
  type CreateRestaurantInput,
  type DeleteBranchInput,
  type UpdateBranchInput
} from "@/features/restaurant/restaurant.schemas";

function buildAdminBranchSnapshot(store: ReturnType<typeof readStore>, branchId: string) {
  const branch = store.branches.find((entry) => entry.id === branchId);

  if (!branch) {
    return null;
  }

  const tables = getBranchTables(store, branch.id).map((table) => ({
    ...table,
    sessions: store.sessions
      .filter((session) => session.tableId === table.id && session.status === "OPEN")
      .map((session) => ({
        id: session.id,
        openedAt: session.openedAt
      }))
  }));

  const menuCategories = getBranchMenuCategories(store, branch.id).map((category) => ({
    ...category,
    items: getBranchMenuItems(store, branch.id).filter((item) => item.categoryId === category.id)
  }));

  const menuItems = getBranchMenuItems(store, branch.id).map((item) => ({
    ...item,
    category: item.categoryId
      ? (() => {
          const category = store.menuCategories.find((entry) => entry.id === item.categoryId);
          return category ? { id: category.id, name: category.name } : null;
        })()
      : null
  }));

  return {
    ...branch,
    tables,
    menuCategories,
    menuItems
  };
}

function buildRestaurantWithBranches(store: ReturnType<typeof readStore>, restaurantId: string) {
  const restaurant = store.restaurants.find((entry) => entry.id === restaurantId);

  if (!restaurant) {
    return null;
  }

  return {
    ...restaurant,
    branches: getRestaurantBranches(store, restaurant.id)
  };
}

export async function ensureDefaultRestaurant() {
  return updateStore((store) => {
    const existing = sortByCreatedAtAsc(store.restaurants)[0];

    if (existing) {
      const restaurant = buildRestaurantWithBranches(store, existing.id);

      if (!restaurant) {
        throw new Error("Default restaurant relation mismatch");
      }

      return cloneValue(restaurant);
    }

    const now = currentTimestamp();
    const restaurant = {
      id: makeId("restaurant"),
      name: "Main Restaurant",
      slug: "main-restaurant",
      legalName: null,
      taxNumber: null,
      taxOffice: null,
      billingEmail: null,
      phone: null,
      status: "TRIALING" as const,
      workspaceMode: "TRIAL" as const,
      defaultLocale: "tr" as const,
      defaultCurrency: "TRY",
      currentPlanId: "plan_trial",
      trialStartedAt: now,
      trialEndsAt: null,
      createdAt: now,
      updatedAt: now
    };

    store.restaurants.push(restaurant);
    return cloneValue({
      ...restaurant,
      branches: []
    });
  });
}

export async function createRestaurant(input: CreateRestaurantInput) {
  const parsed = createRestaurantSchema.parse(input);

  return updateStore((store) => {
    const now = currentTimestamp();
    const restaurant = {
      id: makeId("restaurant"),
      name: parsed.name,
      slug: parsed.slug,
      legalName: null,
      taxNumber: null,
      taxOffice: null,
      billingEmail: null,
      phone: null,
      status: "TRIALING" as const,
      workspaceMode: "TRIAL" as const,
      defaultLocale: "tr" as const,
      defaultCurrency: "TRY",
      currentPlanId: "plan_trial",
      trialStartedAt: now,
      trialEndsAt: null,
      createdAt: now,
      updatedAt: now
    };

    store.restaurants.push(restaurant);
    return cloneValue(restaurant);
  });
}

export async function createBranch(input: CreateBranchInput) {
  const parsed = createBranchSchema.parse(input);

  return updateStore((store) => {
    const restaurant = store.restaurants.find((entry) => entry.id === parsed.restaurantId);

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const duplicate = store.branches.find(
      (branch) => branch.restaurantId === parsed.restaurantId && branch.slug === parsed.slug
    );

    if (duplicate) {
      throw new Error("A branch with this slug already exists in the selected restaurant");
    }

    const now = currentTimestamp();
    const branch = {
      id: makeId("branch"),
      restaurantId: parsed.restaurantId,
      name: parsed.name,
      slug: parsed.slug,
      location: parsed.location || null,
      logoUrl: parsed.logoUrl || null,
      coverImageUrl: parsed.coverImageUrl || null,
      primaryColor: parsed.primaryColor || "#f28c28",
      accentColor: parsed.accentColor || "#ffd6b5",
      fontFamily: parsed.fontFamily || "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
      currency: "TRY",
      localeDefault: "tr" as const,
      openingHours: null,
      createdAt: now,
      updatedAt: now
    };

    store.branches.push(branch);
    store.branchSettings.push({
      id: makeId("branch_settings"),
      restaurantId: restaurant.id,
      branchId: branch.id,
      taxIncludedInPrices: true,
      defaultTaxRatePercent: "10.00",
      serviceFeeType: "NONE",
      serviceFeeValue: "0.00",
      allowCustomerNotes: true,
      allowSplitBill: true,
      allowOnlinePayment: false,
      requireStaffApprovalForQrOrders: false,
      autoAcceptQrOrders: true,
      supportedLocales: ["tr", "en"],
      createdAt: now,
      updatedAt: now
    });
    restaurant.updatedAt = now;

    return cloneValue(branch);
  });
}

export async function updateBranch(input: UpdateBranchInput) {
  const parsed = updateBranchSchema.parse(input);

  return updateStore((store) => {
    const existing = store.branches.find((branch) => branch.id === parsed.id);

    if (!existing) {
      throw new Error("Branch not found");
    }

    const duplicate = store.branches.find(
      (branch) =>
        branch.restaurantId === existing.restaurantId && branch.slug === parsed.slug && branch.id !== parsed.id
    );

    if (duplicate) {
      throw new Error("A branch with this slug already exists in the selected restaurant");
    }

    existing.name = parsed.name;
    existing.slug = parsed.slug;
    existing.location = parsed.location || null;
    existing.logoUrl = parsed.logoUrl || null;
    existing.coverImageUrl = parsed.coverImageUrl || null;
    existing.primaryColor = parsed.primaryColor || "#f28c28";
    existing.accentColor = parsed.accentColor || "#ffd6b5";
    existing.fontFamily = parsed.fontFamily || "\"Trebuchet MS\", \"Segoe UI\", sans-serif";
    existing.updatedAt = currentTimestamp();

    return cloneValue(existing);
  });
}

export async function deleteBranch(input: DeleteBranchInput) {
  const parsed = deleteBranchSchema.parse(input);

  return updateStore((store) => {
    const existing = store.branches.find((branch) => branch.id === parsed.id);

    if (!existing) {
      throw new Error("Branch not found");
    }

    const openSessionsCount = store.sessions.filter(
      (session) => session.branchId === parsed.id && session.status === "OPEN"
    ).length;

    if (openSessionsCount > 0 && !parsed.force) {
      throw new Error("Close open table sessions before deleting this branch");
    }

    const deleted = { ...existing };
    cascadeDeleteBranch(store, existing.id);

    return cloneValue(deleted);
  });
}

type AdminSnapshotScope = {
  restaurantId?: string;
  branchIds?: string[] | null;
};

export async function getAdminSnapshot(scope: AdminSnapshotScope = {}) {
  const store = readStore();
  const allowedBranchIds = scope.branchIds ? new Set(scope.branchIds) : null;

  return sortByCreatedAtAsc(store.restaurants)
    .filter((restaurant) => !scope.restaurantId || restaurant.id === scope.restaurantId)
    .map((restaurant) => {
      const branches = sortByNameAsc(
        getRestaurantBranches(store, restaurant.id)
          .filter((branch) => !allowedBranchIds || allowedBranchIds.has(branch.id))
          .map((branch) => buildAdminBranchSnapshot(store, branch.id))
          .filter((branch): branch is NonNullable<typeof branch> => Boolean(branch))
      );

      return {
        ...restaurant,
        branches
      };
    })
    .map((restaurant) => cloneValue(restaurant));
}

export async function getBranchBasicList() {
  const store = readStore();

  return cloneValue(
    sortByNameAsc(store.branches).map((branch) => ({
      id: branch.id,
      name: branch.name,
      slug: branch.slug
    }))
  );
}
