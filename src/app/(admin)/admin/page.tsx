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

function formatCurrency(value: string | number): string {
  return `$${Number(value).toFixed(2)}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function formatShortTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatTableSessionSummary(tableName: string, session: SessionSummary): string {
  return `Table ${tableName} • Opened ${formatShortTime(session.openedAt)}`;
}

function getTableStatusBadgeClass(status: TableStatus): string {
  if (status === "AVAILABLE") {
    return "badge badge-status-available";
  }

  if (status === "OCCUPIED") {
    return "badge badge-status-occupied";
  }

  return "badge badge-status-out";
}

function getTableStatusLabel(status: TableStatus): string {
  if (status === "AVAILABLE") {
    return "Available";
  }

  if (status === "OCCUPIED") {
    return "Occupied";
  }

  if (status === "OUT_OF_SERVICE") {
    return "Closed";
  }

  return status;
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

  const totalOpenSessions = tables.filter((table) => table.sessions.length > 0).length;
  const occupiedTables = tables.filter((table) => table.status === "OCCUPIED").length;
  const qrReadyTables = tables.filter((table) => Boolean(table.publicToken)).length;
  const availableMenuItems = menuItems.filter((item) => item.isAvailable).length;
  const unavailableMenuItems = menuItems.length - availableMenuItems;
  const tablesOutOfService = tables.filter((table) => table.status === "OUT_OF_SERVICE").length;

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Owner overview</p>
            <h2>Restaurant setup and live floor control</h2>
            <p className="panel-subtitle">
              Keep branches, floor tables, QR access, and menu content clear for daily operations.
            </p>
          </div>
          <div className="toolbar">
            <button type="button" className="secondary" onClick={handleBootstrap}>
              Load sample data
            </button>
            <button type="button" onClick={() => void loadSnapshot()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="dashboard-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Restaurants</p>
            <p className="dashboard-stat-value">{snapshot.length}</p>
            <p className="dashboard-stat-note">Top-level brands loaded into this workspace.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Branches</p>
            <p className="dashboard-stat-value">{branches.length}</p>
            <p className="dashboard-stat-note">Operating locations with tables and menu data.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Active sessions</p>
            <p className="dashboard-stat-value">{totalOpenSessions}</p>
            <p className="dashboard-stat-note">{occupiedTables} table(s) currently occupied.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">QR readiness</p>
            <p className="dashboard-stat-value">{qrReadyTables}</p>
            <p className="dashboard-stat-note">
              {tablesOutOfService} table(s) closed. {availableMenuItems} menu item(s) available, {unavailableMenuItems} hidden.
            </p>
          </article>
        </div>

        <div className="status-stack">
          {isLoading ? <p className="status-banner is-neutral">Refreshing latest restaurant snapshot.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      <section className="section-block">
        <div className="section-copy">
          <p className="section-kicker">Setup</p>
          <h3>Business structure</h3>
          <p className="panel-subtitle">
            Add branches and tables first so QR entry, live sessions, and waiter operations stay organized.
          </p>
        </div>

        <div className="grid-2">
          <AdminFormCard title="Create branch" description="Add an operating location under an existing restaurant.">
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

            <p className="helper-text">Leave slug empty to generate a safe public identifier automatically.</p>

            <AdminActions>
              <button type="submit">Create branch</button>
            </AdminActions>
          </form>
          </AdminFormCard>

          <AdminFormCard title="Create table" description="Create a table with automatic code and customer QR token.">
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

            <p className="helper-text">Each table is linked to a unique code and QR destination automatically.</p>

            <AdminActions>
              <button type="submit">Create table</button>
            </AdminActions>
          </form>
          </AdminFormCard>
        </div>
      </section>

      <section className="section-block">
        <div className="section-copy">
          <p className="section-kicker">Menu setup</p>
          <h3>Categories and items</h3>
          <p className="panel-subtitle">
            Keep menu structure easy to maintain so waiter, kitchen, and QR ordering stay consistent.
          </p>
        </div>

        <div className="grid-2">
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

            <p className="helper-text">Lower sort values appear earlier in customer and operator views.</p>

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

            <p className="helper-text">Unavailable items stay in the catalog but are blocked from ordering.</p>

            <AdminActions>
              <button type="submit">Create menu item</button>
            </AdminActions>
          </form>
          </AdminFormCard>
        </div>
      </section>

      <section className="panel stack-md">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">Locations</p>
            <h3>Branches ({branches.length})</h3>
            <p className="panel-subtitle">Owner-friendly visibility into each branch, floor setup, and catalog coverage.</p>
          </div>
          {isLoading ? <span className="badge badge-outline">Refreshing</span> : null}
        </div>

        {branches.length === 0 ? (
          <p className="empty empty-state">No branches yet. Create a branch first so tables and menu content can be attached.</p>
        ) : null}

        <div className="list">
          {branches.map((branch) => (
            <article key={branch.id} className="list-item entity-card stack-md">
              <div className="entity-top">
                <div className="entity-title">
                  <h4>{branch.name}</h4>
                  <p className="entity-summary">Part of {branch.restaurantName}</p>
                  <div className="badge-row">
                    <span className="badge badge-outline">{branch.slug}</span>
                    <span className="badge badge-neutral">{branch.location || "Location not set"}</span>
                  </div>
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

              <div className="detail-grid">
                <div className="detail-card">
                  <span className="detail-label">Tables</span>
                  <span className="detail-value">{branch.tables.length}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Menu categories</span>
                  <span className="detail-value">{branch.menuCategories.length}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Menu items</span>
                  <span className="detail-value">{branch.menuItems.length}</span>
                </div>
              </div>

              <p className="helper-text">
                {branch.tables.filter((table) => table.sessions.length > 0).length} active session(s) on this branch
                floor right now.
              </p>

              {editingBranchId === branch.id ? (
                <form className="grid-2 helper-panel" onSubmit={handleUpdateBranch}>
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
                  <p className="helper-text">Updating a branch does not change any routes or existing table behavior.</p>
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
          <div className="section-copy">
            <p className="section-kicker">Floor map</p>
            <h3>Tables ({tables.length})</h3>
            <p className="panel-subtitle">
              Track table status, QR readiness, and live session activity at a glance. Closed: {tablesOutOfService}.
            </p>
          </div>
        </div>

        {tables.length === 0 ? <p className="empty empty-state">No tables found. Create tables to generate QR access and waiter-ready sessions.</p> : null}

        <div className="list">
          {tables.map((table) => (
            <article key={table.id} className="list-item entity-card stack-md">
              <div className="entity-top">
                <div className="entity-title">
                  <h4>{table.name}</h4>
                  <p className="entity-summary">{table.branchName}</p>
                  <div className="badge-row">
                    <span className={getTableStatusBadgeClass(table.status)}>{getTableStatusLabel(table.status)}</span>
                    <span className={`badge ${table.sessions.length > 0 ? "badge-status-open" : "badge-status-closed"}`}>
                      {table.sessions.length > 0 ? "Active session" : "No active session"}
                    </span>
                    <span className={`badge ${table.publicToken ? "badge-status-ready" : "badge-status-pending"}`}>
                      {table.publicToken ? "QR ready" : "QR missing"}
                    </span>
                  </div>
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

              <div className="qr-card">
                <div className="stack-md">
                  <div className="detail-grid">
                    <div className="detail-card">
                      <span className="detail-label">Table code</span>
                      <span className="detail-value is-mono">{table.code}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">Capacity</span>
                      <span className="detail-value">{table.capacity} seats</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">QR link</span>
                      <span className="detail-value is-mono">{getTablePublicUrl(table.publicToken)}</span>
                    </div>
                  </div>

                  <p className="helper-text">
                    {table.sessions.length > 0
                      ? `${formatTableSessionSummary(table.name, table.sessions[0])} (${formatDateTime(table.sessions[0].openedAt)}).`
                      : "No active session on this table right now."}
                  </p>
                </div>

                <div className="qr-preview">
                  <Image
                    src={`/api/admin/qr/${encodeURIComponent(table.publicToken)}`}
                    alt={`QR code for ${table.name}`}
                    width={108}
                    height={108}
                    loading="lazy"
                    unoptimized
                  />
                  <p className="helper-text">Print-ready QR destination for customers.</p>
                </div>
              </div>

              {editingTableId === table.id ? (
                <form className="grid-2 helper-panel" onSubmit={handleUpdateTable}>
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
                          {getTableStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                  <p className="helper-text">Status changes only update table availability and do not alter routes or session logic.</p>
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
          <div className="section-copy">
            <p className="section-kicker">Catalog</p>
            <h3>Menu categories ({categories.length})</h3>
            <p className="panel-subtitle">Keep category ordering readable for customers and operators.</p>
          </div>
        </div>

        {categories.length === 0 ? <p className="empty empty-state">No menu categories found. Add categories to organize the customer menu.</p> : null}

        <div className="list">
          {categories.map((category) => (
            <article key={category.id} className="list-item entity-card stack-md">
              <div className="entity-top">
                <div className="entity-title">
                  <h4>{category.name}</h4>
                  <p className="entity-summary">{category.branchName}</p>
                  <div className="badge-row">
                    <span className="badge badge-outline">Sort {category.sortOrder}</span>
                    <span className="badge badge-neutral">{category.items.length} linked items</span>
                  </div>
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

              {editingCategoryId === category.id ? (
                <form className="grid-2 helper-panel" onSubmit={handleUpdateCategory}>
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
                  <p className="helper-text">Sort order controls how categories appear in QR and waiter menus.</p>
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
          <div className="section-copy">
            <p className="section-kicker">Items</p>
            <h3>Menu items ({menuItems.length})</h3>
            <p className="panel-subtitle">
              Availability, pricing, and descriptions shown here feed directly into waiter and QR ordering.
            </p>
          </div>
        </div>

        {menuItems.length === 0 ? <p className="empty empty-state">No menu items found. Add dishes or drinks to make ordering available.</p> : null}

        <div className="list">
          {menuItems.map((item) => (
            <article key={item.id} className="list-item entity-card stack-md">
              <div className="entity-top">
                <div className="entity-title">
                  <h4>{item.name}</h4>
                  <p className="entity-summary">{item.branchName}</p>
                  <div className="badge-row">
                    <span className={`badge ${item.isAvailable ? "badge-status-available" : "badge-danger"}`}>
                      {item.isAvailable ? "Available to order" : "Hidden from ordering"}
                    </span>
                    <span className="badge badge-neutral">{item.category?.name ?? "Uncategorized"}</span>
                  </div>
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

              {item.description ? <p className="helper-text">{item.description}</p> : <p className="helper-text">No description provided yet.</p>}

              <div className="detail-grid">
                <div className="detail-card">
                  <span className="detail-label">Price</span>
                  <span className="detail-value">{formatCurrency(item.price)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Sort order</span>
                  <span className="detail-value">{item.sortOrder}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Category</span>
                  <span className="detail-value">{item.category?.name ?? "Uncategorized"}</span>
                </div>
              </div>

              {editingItemId === item.id ? (
                <form className="grid-2 helper-panel" onSubmit={handleUpdateItem}>
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
                  <p className="helper-text">Changing availability keeps the item record but blocks new orders when off.</p>
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
