"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { AdminActions, AdminField, AdminFormCard } from "@/components/admin/admin-form";
import { getTablePublicUrl } from "@/lib/public-url";

type SessionSummary = {
  id: string;
  openedAt: string;
};

type TableStatus = "AVAILABLE" | "OCCUPIED" | "OUT_OF_SERVICE";

type TableRecord = {
  id: string;
  branchId: string;
  name: string;
  code: string;
  publicToken: string;
  capacity: number;
  status: TableStatus;
  sessions: SessionSummary[];
};

type MenuItem = {
  id: string;
  branchId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
  sortOrder: number;
  category: {
    id: string;
    name: string;
  } | null;
};

type MenuCategory = {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
};

type Branch = {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  location: string | null;
  tables: TableRecord[];
  menuCategories: MenuCategory[];
  menuItems: MenuItem[];
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  branches: Branch[];
};

type BranchListRow = Branch & {
  restaurantName: string;
};

type TableListRow = TableRecord & {
  branchName: string;
};

type CategoryListRow = MenuCategory & {
  branchName: string;
};

type ItemListRow = MenuItem & {
  branchName: string;
};

type ApiSnapshotResponse = {
  data: Restaurant[];
  error?: string;
};

type HttpMutationMethod = "POST" | "PUT" | "DELETE";
type AvailabilityValue = "true" | "false";

const TABLE_STATUS_OPTIONS: TableStatus[] = ["AVAILABLE", "OCCUPIED", "OUT_OF_SERVICE"];

async function requestJson<T>(url: string, method: HttpMutationMethod, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Request failed");
  }

  return json;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminDashboardPage() {
  const [snapshot, setSnapshot] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [branchForm, setBranchForm] = useState({
    restaurantId: "",
    name: "",
    slug: "",
    location: ""
  });

  const [tableForm, setTableForm] = useState({
    branchId: "",
    name: "",
    capacity: "4"
  });

  const [categoryForm, setCategoryForm] = useState({
    branchId: "",
    name: "",
    sortOrder: "1"
  });

  const [itemForm, setItemForm] = useState({
    branchId: "",
    categoryId: "",
    name: "",
    description: "",
    price: "",
    sortOrder: "1",
    isAvailable: "true" as AvailabilityValue
  });

  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchEditForm, setBranchEditForm] = useState({
    id: "",
    name: "",
    slug: "",
    location: ""
  });

  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableEditForm, setTableEditForm] = useState({
    id: "",
    name: "",
    capacity: "4",
    status: "AVAILABLE" as TableStatus
  });

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryEditForm, setCategoryEditForm] = useState({
    id: "",
    name: "",
    sortOrder: "1"
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditForm, setItemEditForm] = useState({
    id: "",
    branchId: "",
    categoryId: "",
    name: "",
    description: "",
    price: "",
    sortOrder: "1",
    isAvailable: "true" as AvailabilityValue
  });

  const branches = useMemo<BranchListRow[]>(() => {
    return snapshot.flatMap((restaurant) =>
      restaurant.branches.map((branch) => ({
        ...branch,
        restaurantName: restaurant.name
      }))
    );
  }, [snapshot]);

  const tables = useMemo<TableListRow[]>(() => {
    return branches.flatMap((branch) =>
      branch.tables.map((table) => ({
        ...table,
        branchName: branch.name
      }))
    );
  }, [branches]);

  const categories = useMemo<CategoryListRow[]>(() => {
    return branches.flatMap((branch) =>
      branch.menuCategories.map((category) => ({
        ...category,
        branchName: branch.name
      }))
    );
  }, [branches]);

  const menuItems = useMemo<ItemListRow[]>(() => {
    return branches.flatMap((branch) =>
      branch.menuItems.map((item) => ({
        ...item,
        branchName: branch.name
      }))
    );
  }, [branches]);

  const selectableCategoriesForCreateItem = useMemo(() => {
    return branches.find((branch) => branch.id === itemForm.branchId)?.menuCategories ?? [];
  }, [branches, itemForm.branchId]);

  const selectableCategoriesForEditItem = useMemo(() => {
    return branches.find((branch) => branch.id === itemEditForm.branchId)?.menuCategories ?? [];
  }, [branches, itemEditForm.branchId]);

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/snapshot", { cache: "no-store" });
      const payload = (await response.json()) as ApiSnapshotResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Could not load admin snapshot");
      }

      setSnapshot(payload.data);

      const firstRestaurant = payload.data[0];
      const firstBranch = firstRestaurant?.branches[0];

      if (firstRestaurant) {
        setBranchForm((prev) => (prev.restaurantId ? prev : { ...prev, restaurantId: firstRestaurant.id }));
      }

      if (firstBranch) {
        setTableForm((prev) => (prev.branchId ? prev : { ...prev, branchId: firstBranch.id }));
        setCategoryForm((prev) => (prev.branchId ? prev : { ...prev, branchId: firstBranch.id }));
        setItemForm((prev) => (prev.branchId ? prev : { ...prev, branchId: firstBranch.id }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load snapshot");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  async function handleBootstrap() {
    setError("");
    setMessage("");

    try {
      await requestJson<{ data: { ok: boolean } }>("/api/seed", "POST", {});
      setMessage("Seed data created or already present.");
      await loadSnapshot();
    } catch (bootstrapError) {
      setError(bootstrapError instanceof Error ? bootstrapError.message : "Seed failed");
    }
  }

  async function handleCreateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/branches", "POST", {
        restaurantId: branchForm.restaurantId,
        name: branchForm.name,
        slug: branchForm.slug || slugify(branchForm.name),
        location: branchForm.location
      });

      setMessage("Branch created.");
      setBranchForm((prev) => ({ ...prev, name: "", slug: "", location: "" }));
      await loadSnapshot();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create branch failed");
    }
  }

  async function handleCreateTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/tables", "POST", {
        branchId: tableForm.branchId,
        name: tableForm.name,
        capacity: Number(tableForm.capacity)
      });

      setMessage("Table created.");
      setTableForm((prev) => ({ ...prev, name: "", capacity: "4" }));
      await loadSnapshot();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create table failed");
    }
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-categories", "POST", {
        branchId: categoryForm.branchId,
        name: categoryForm.name,
        sortOrder: Number(categoryForm.sortOrder)
      });

      setMessage("Menu category created.");
      setCategoryForm((prev) => ({ ...prev, name: "", sortOrder: "1" }));
      await loadSnapshot();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create category failed");
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-items", "POST", {
        branchId: itemForm.branchId,
        categoryId: itemForm.categoryId || undefined,
        name: itemForm.name,
        description: itemForm.description,
        price: Number(itemForm.price),
        sortOrder: Number(itemForm.sortOrder),
        isAvailable: itemForm.isAvailable === "true"
      });

      setMessage("Menu item created.");
      setItemForm((prev) => ({
        ...prev,
        categoryId: "",
        name: "",
        description: "",
        price: "",
        sortOrder: "1",
        isAvailable: "true"
      }));
      await loadSnapshot();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create item failed");
    }
  }

  function startBranchEdit(branch: BranchListRow) {
    setEditingBranchId(branch.id);
    setBranchEditForm({
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      location: branch.location ?? ""
    });
  }

  async function handleUpdateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/branches", "PUT", {
        id: branchEditForm.id,
        name: branchEditForm.name,
        slug: branchEditForm.slug || slugify(branchEditForm.name),
        location: branchEditForm.location
      });

      setMessage("Branch updated.");
      setEditingBranchId(null);
      await loadSnapshot();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update branch failed");
    }
  }

  async function handleDeleteBranch(branch: BranchListRow) {
    if (!window.confirm(`Delete branch "${branch.name}" and related data?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/branches", "DELETE", { id: branch.id });
      setMessage("Branch deleted.");

      if (editingBranchId === branch.id) {
        setEditingBranchId(null);
      }

      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete branch failed");
    }
  }

  function startTableEdit(table: TableListRow) {
    setEditingTableId(table.id);
    setTableEditForm({
      id: table.id,
      name: table.name,
      capacity: String(table.capacity),
      status: table.status
    });
  }

  async function handleUpdateTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/tables", "PUT", {
        id: tableEditForm.id,
        name: tableEditForm.name,
        capacity: Number(tableEditForm.capacity),
        status: tableEditForm.status
      });

      setMessage("Table updated.");
      setEditingTableId(null);
      await loadSnapshot();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update table failed");
    }
  }

  async function handleDeleteTable(table: TableListRow) {
    if (!window.confirm(`Delete table "${table.name}"?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/tables", "DELETE", { id: table.id });
      setMessage("Table deleted.");

      if (editingTableId === table.id) {
        setEditingTableId(null);
      }

      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete table failed");
    }
  }

  function startCategoryEdit(category: CategoryListRow) {
    setEditingCategoryId(category.id);
    setCategoryEditForm({
      id: category.id,
      name: category.name,
      sortOrder: String(category.sortOrder)
    });
  }

  async function handleUpdateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-categories", "PUT", {
        id: categoryEditForm.id,
        name: categoryEditForm.name,
        sortOrder: Number(categoryEditForm.sortOrder)
      });

      setMessage("Menu category updated.");
      setEditingCategoryId(null);
      await loadSnapshot();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update category failed");
    }
  }

  async function handleDeleteCategory(category: CategoryListRow) {
    if (!window.confirm(`Delete category "${category.name}"?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-categories", "DELETE", { id: category.id });
      setMessage("Menu category deleted.");

      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
      }

      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete category failed");
    }
  }

  function startItemEdit(item: ItemListRow) {
    setEditingItemId(item.id);
    setItemEditForm({
      id: item.id,
      branchId: item.branchId,
      categoryId: item.categoryId ?? "",
      name: item.name,
      description: item.description ?? "",
      price: Number(item.price).toFixed(2),
      sortOrder: String(item.sortOrder),
      isAvailable: item.isAvailable ? "true" : "false"
    });
  }

  async function handleUpdateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-items", "PUT", {
        id: itemEditForm.id,
        branchId: itemEditForm.branchId,
        categoryId: itemEditForm.categoryId || undefined,
        name: itemEditForm.name,
        description: itemEditForm.description,
        price: Number(itemEditForm.price),
        sortOrder: Number(itemEditForm.sortOrder),
        isAvailable: itemEditForm.isAvailable === "true"
      });

      setMessage("Menu item updated.");
      setEditingItemId(null);
      await loadSnapshot();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update menu item failed");
    }
  }

  async function handleDeleteItem(item: ItemListRow) {
    if (!window.confirm(`Delete menu item "${item.name}"?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-items", "DELETE", { id: item.id });
      setMessage("Menu item deleted.");

      if (editingItemId === item.id) {
        setEditingItemId(null);
      }

      await loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete menu item failed");
    }
  }

  return (
    <div className="stack-md">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Admin dashboard</h2>
            <p className="meta">MVP management without full auth, backed by the local workspace data store.</p>
          </div>
          <div className="inline">
            <button type="button" className="secondary" onClick={handleBootstrap}>
              Seed MVP data
            </button>
            <button type="button" onClick={() => void loadSnapshot()}>
              Refresh
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}
      </section>

      <section className="grid-2">
        <AdminFormCard title="Create branch" description="Add a branch under an existing restaurant.">
          <form className="stack-md" onSubmit={handleCreateBranch}>
            <AdminField label="Restaurant">
              <select
                value={branchForm.restaurantId}
                onChange={(event) => setBranchForm((prev) => ({ ...prev, restaurantId: event.target.value }))}
                required
              >
                <option value="">Select restaurant</option>
                {snapshot.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <AdminField label="Branch name">
              <input
                value={branchForm.name}
                onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </AdminField>

            <AdminField label="Slug">
              <input
                value={branchForm.slug}
                onChange={(event) => setBranchForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="auto if empty"
              />
            </AdminField>

            <AdminField label="Location">
              <input
                value={branchForm.location}
                onChange={(event) => setBranchForm((prev) => ({ ...prev, location: event.target.value }))}
              />
            </AdminField>

            <AdminActions>
              <button type="submit">Create branch</button>
            </AdminActions>
          </form>
        </AdminFormCard>

        <AdminFormCard title="Create table" description="Create a new table with table code and public QR token.">
          <form className="stack-md" onSubmit={handleCreateTable}>
            <AdminField label="Branch">
              <select
                value={tableForm.branchId}
                onChange={(event) => setTableForm((prev) => ({ ...prev, branchId: event.target.value }))}
                required
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <AdminField label="Table name">
              <input
                value={tableForm.name}
                onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="T1"
                required
              />
            </AdminField>

            <AdminField label="Capacity">
              <input
                type="number"
                min={1}
                value={tableForm.capacity}
                onChange={(event) => setTableForm((prev) => ({ ...prev, capacity: event.target.value }))}
                required
              />
            </AdminField>

            <AdminActions>
              <button type="submit">Create table</button>
            </AdminActions>
          </form>
        </AdminFormCard>
      </section>

      <section className="grid-2">
        <AdminFormCard title="Create menu category" description="Define category ordering per branch.">
          <form className="stack-md" onSubmit={handleCreateCategory}>
            <AdminField label="Branch">
              <select
                value={categoryForm.branchId}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, branchId: event.target.value }))}
                required
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <AdminField label="Category name">
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </AdminField>

            <AdminField label="Sort order">
              <input
                type="number"
                value={categoryForm.sortOrder}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </AdminField>

            <AdminActions>
              <button type="submit">Create category</button>
            </AdminActions>
          </form>
        </AdminFormCard>

        <AdminFormCard title="Create menu item" description="Create categorized or uncategorized items.">
          <form className="stack-md" onSubmit={handleCreateItem}>
            <AdminField label="Branch">
              <select
                value={itemForm.branchId}
                onChange={(event) => setItemForm((prev) => ({ ...prev, branchId: event.target.value, categoryId: "" }))}
                required
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <AdminField label="Category">
              <select
                value={itemForm.categoryId}
                onChange={(event) => setItemForm((prev) => ({ ...prev, categoryId: event.target.value }))}
              >
                <option value="">Uncategorized</option>
                {selectableCategoriesForCreateItem.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <AdminField label="Name">
              <input value={itemForm.name} onChange={(event) => setItemForm((prev) => ({ ...prev, name: event.target.value }))} required />
            </AdminField>

            <AdminField label="Description">
              <textarea
                value={itemForm.description}
                onChange={(event) => setItemForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </AdminField>

            <AdminField label="Price">
              <input
                type="number"
                min={0}
                step="0.01"
                value={itemForm.price}
                onChange={(event) => setItemForm((prev) => ({ ...prev, price: event.target.value }))}
                required
              />
            </AdminField>

            <AdminField label="Sort order">
              <input
                type="number"
                value={itemForm.sortOrder}
                onChange={(event) => setItemForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </AdminField>

            <AdminField label="Availability">
              <select
                value={itemForm.isAvailable}
                onChange={(event) => setItemForm((prev) => ({ ...prev, isAvailable: event.target.value as AvailabilityValue }))}
              >
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
            </AdminField>

            <AdminActions>
              <button type="submit">Create menu item</button>
            </AdminActions>
          </form>
        </AdminFormCard>
      </section>

      <section className="panel stack-md">
        <div className="section-head">
          <h3>Branches ({branches.length})</h3>
          {isLoading ? <span className="meta">Loading...</span> : null}
        </div>

        {branches.length === 0 ? <p className="empty">No branches found.</p> : null}

        <div className="list">
          {branches.map((branch) => (
            <article key={branch.id} className="list-item stack-md">
              <div className="section-head">
                <div>
                  <h4>{branch.name}</h4>
                  <p className="meta">Restaurant: {branch.restaurantName}</p>
                </div>
                <AdminActions>
                  <button type="button" className="secondary" onClick={() => startBranchEdit(branch)}>
                    {editingBranchId === branch.id ? "Editing" : "Edit"}
                  </button>
                  <button type="button" className="warn" onClick={() => void handleDeleteBranch(branch)}>
                    Delete
                  </button>
                </AdminActions>
              </div>

              <p className="meta">
                Slug: {branch.slug}
                {branch.location ? ` | ${branch.location}` : ""}
              </p>
              <p className="meta">
                {branch.tables.length} tables | {branch.menuCategories.length} categories | {branch.menuItems.length} items
              </p>

              {editingBranchId === branch.id ? (
                <form className="grid-2" onSubmit={handleUpdateBranch}>
                  <AdminField label="Branch name">
                    <input
                      value={branchEditForm.name}
                      onChange={(event) => setBranchEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Slug">
                    <input
                      value={branchEditForm.slug}
                      onChange={(event) => setBranchEditForm((prev) => ({ ...prev, slug: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Location">
                    <input
                      value={branchEditForm.location}
                      onChange={(event) => setBranchEditForm((prev) => ({ ...prev, location: event.target.value }))}
                    />
                  </AdminField>
                  <AdminActions>
                    <button type="submit">Save branch</button>
                    <button type="button" className="secondary" onClick={() => setEditingBranchId(null)}>
                      Cancel
                    </button>
                  </AdminActions>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel stack-md">
        <div className="section-head">
          <h3>Tables ({tables.length})</h3>
        </div>

        {tables.length === 0 ? <p className="empty">No tables found.</p> : null}

        <div className="list">
          {tables.map((table) => (
            <article key={table.id} className="list-item stack-md">
              <div className="section-head">
                <div>
                  <h4>{table.name}</h4>
                  <p className="meta">Branch: {table.branchName}</p>
                </div>
                <AdminActions>
                  <button type="button" className="secondary" onClick={() => startTableEdit(table)}>
                    {editingTableId === table.id ? "Editing" : "Edit"}
                  </button>
                  <button type="button" className="warn" onClick={() => void handleDeleteTable(table)}>
                    Delete
                  </button>
                </AdminActions>
              </div>

              <p className="meta">Code: {table.code}</p>
              <p className="meta">Capacity: {table.capacity}</p>
              <p className="meta">Status: {table.status}</p>
              <p className="meta">QR URL: {getTablePublicUrl(table.publicToken)}</p>
              <Image src={`/api/admin/qr/${encodeURIComponent(table.publicToken)}`} alt={`QR code for ${table.name}`} width={108} height={108} loading="lazy" unoptimized />
              <p className="meta">Session: {table.sessions.length > 0 ? `OPEN (${table.sessions[0].id.slice(0, 8)})` : "Closed"}</p>

              {editingTableId === table.id ? (
                <form className="grid-2" onSubmit={handleUpdateTable}>
                  <AdminField label="Table name">
                    <input
                      value={tableEditForm.name}
                      onChange={(event) => setTableEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Capacity">
                    <input
                      type="number"
                      min={1}
                      value={tableEditForm.capacity}
                      onChange={(event) => setTableEditForm((prev) => ({ ...prev, capacity: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Status">
                    <select
                      value={tableEditForm.status}
                      onChange={(event) => setTableEditForm((prev) => ({ ...prev, status: event.target.value as TableStatus }))}
                    >
                      {TABLE_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminActions>
                    <button type="submit">Save table</button>
                    <button type="button" className="secondary" onClick={() => setEditingTableId(null)}>
                      Cancel
                    </button>
                  </AdminActions>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel stack-md">
        <div className="section-head">
          <h3>Menu categories ({categories.length})</h3>
        </div>

        {categories.length === 0 ? <p className="empty">No menu categories found.</p> : null}

        <div className="list">
          {categories.map((category) => (
            <article key={category.id} className="list-item stack-md">
              <div className="section-head">
                <div>
                  <h4>{category.name}</h4>
                  <p className="meta">Branch: {category.branchName}</p>
                </div>
                <AdminActions>
                  <button type="button" className="secondary" onClick={() => startCategoryEdit(category)}>
                    {editingCategoryId === category.id ? "Editing" : "Edit"}
                  </button>
                  <button type="button" className="warn" onClick={() => void handleDeleteCategory(category)}>
                    Delete
                  </button>
                </AdminActions>
              </div>

              <p className="meta">Sort: {category.sortOrder}</p>
              <p className="meta">Linked items: {category.items.length}</p>

              {editingCategoryId === category.id ? (
                <form className="grid-2" onSubmit={handleUpdateCategory}>
                  <AdminField label="Category name">
                    <input
                      value={categoryEditForm.name}
                      onChange={(event) => setCategoryEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Sort order">
                    <input
                      type="number"
                      value={categoryEditForm.sortOrder}
                      onChange={(event) => setCategoryEditForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    />
                  </AdminField>
                  <AdminActions>
                    <button type="submit">Save category</button>
                    <button type="button" className="secondary" onClick={() => setEditingCategoryId(null)}>
                      Cancel
                    </button>
                  </AdminActions>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel stack-md">
        <div className="section-head">
          <h3>Menu items ({menuItems.length})</h3>
        </div>

        {menuItems.length === 0 ? <p className="empty">No menu items found.</p> : null}

        <div className="list">
          {menuItems.map((item) => (
            <article key={item.id} className="list-item stack-md">
              <div className="section-head">
                <div>
                  <h4>{item.name}</h4>
                  <p className="meta">Branch: {item.branchName}</p>
                </div>
                <AdminActions>
                  <button type="button" className="secondary" onClick={() => startItemEdit(item)}>
                    {editingItemId === item.id ? "Editing" : "Edit"}
                  </button>
                  <button type="button" className="warn" onClick={() => void handleDeleteItem(item)}>
                    Delete
                  </button>
                </AdminActions>
              </div>

              <p className="meta">Category: {item.category?.name ?? "Uncategorized"}</p>
              <p className="meta">Price: ${Number(item.price).toFixed(2)}</p>
              <p className="meta">Sort: {item.sortOrder}</p>
              <p className="meta">Available: {item.isAvailable ? "Yes" : "No"}</p>

              {editingItemId === item.id ? (
                <form className="grid-2" onSubmit={handleUpdateItem}>
                  <AdminField label="Name">
                    <input
                      value={itemEditForm.name}
                      onChange={(event) => setItemEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Category">
                    <select
                      value={itemEditForm.categoryId}
                      onChange={(event) => setItemEditForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                    >
                      <option value="">Uncategorized</option>
                      {selectableCategoriesForEditItem.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Description">
                    <textarea
                      value={itemEditForm.description}
                      onChange={(event) => setItemEditForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </AdminField>
                  <AdminField label="Price">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={itemEditForm.price}
                      onChange={(event) => setItemEditForm((prev) => ({ ...prev, price: event.target.value }))}
                      required
                    />
                  </AdminField>
                  <AdminField label="Sort order">
                    <input
                      type="number"
                      value={itemEditForm.sortOrder}
                      onChange={(event) => setItemEditForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    />
                  </AdminField>
                  <AdminField label="Availability">
                    <select
                      value={itemEditForm.isAvailable}
                      onChange={(event) => setItemEditForm((prev) => ({ ...prev, isAvailable: event.target.value as AvailabilityValue }))}
                    >
                      <option value="true">Available</option>
                      <option value="false">Unavailable</option>
                    </select>
                  </AdminField>
                  <AdminActions>
                    <button type="submit">Save item</button>
                    <button type="button" className="secondary" onClick={() => setEditingItemId(null)}>
                      Cancel
                    </button>
                  </AdminActions>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
