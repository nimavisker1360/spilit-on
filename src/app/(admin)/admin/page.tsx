"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";

import { AdminActions, AdminField, AdminFormCard } from "@/components/admin/admin-form";
import { formatTryCurrency, formatTryMoneyInput, parseMoneyValue } from "@/lib/currency";
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
  imageUrl: string | null;
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
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  fontFamily: string | null;
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

type MenuImportPreviewRow = {
  rowNumber: number;
  branchName: string;
  name: string;
  description: string;
  categoryName: string;
  priceInput: string;
  priceValue: number | null;
  sortOrder: number;
  isAvailable: boolean;
  errors: string[];
};

type MenuImportPayloadRow = {
  name: string;
  description: string;
  categoryName: string;
  price: number;
  sortOrder: number;
  isAvailable: boolean;
};

type MenuImportResult = {
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  categoriesCreatedCount: number;
};

type MenuImportRawRow = Record<string, unknown>;

type MenuImportColumnMapping = Record<ImportColumnKey, string>;

const TABLE_STATUS_OPTIONS: TableStatus[] = ["AVAILABLE", "OCCUPIED", "OUT_OF_SERVICE"];
const MAX_IMPORT_ROWS = 2000;
const ALL_BRANCHES_KEY = "__all_branches__";

const MENU_IMPORT_COLUMN_ALIASES = {
  branchName: ["branch", "branchname", "branch_name", "sube", "subename", "location", "locationname"],
  name: [
    "name",
    "ad",
    "isim",
    "urun",
    "item",
    "itemname",
    "item_name",
    "menuitem",
    "menu_item",
    "menuitemname",
    "product",
    "productname",
    "dishname"
  ],
  description: ["description", "desc", "aciklama", "detay", "itemdescription", "productdescription"],
  categoryName: [
    "category",
    "kategori",
    "categoryname",
    "category_name",
    "kategoriname",
    "kategoriadi",
    "menucategory",
    "menu_category",
    "menucategoryname",
    "group",
    "cat"
  ],
  price: [
    "price",
    "fiyat",
    "amount",
    "tutar",
    "ucret",
    "cost",
    "pricetry",
    "price_try",
    "tryprice",
    "try_price",
    "pricetl",
    "price_tl",
    "tlprice",
    "tl_price",
    "unitprice",
    "unit_price"
  ],
  sortOrder: ["sortorder", "sort", "order", "sort_order", "sirano", "sira", "priority"],
  isAvailable: ["isavailable", "availability", "available", "aktif", "durum", "status", "active", "visible"]
} as const;

type ImportColumnKey = keyof typeof MENU_IMPORT_COLUMN_ALIASES;

const IMPORT_COLUMN_KEYS = Object.keys(MENU_IMPORT_COLUMN_ALIASES) as ImportColumnKey[];

const IMPORT_MAPPING_FIELDS: Array<{
  key: ImportColumnKey;
  label: string;
  required: boolean;
}> = [
  { key: "branchName", label: "Branch column", required: false },
  { key: "name", label: "Item name column", required: true },
  { key: "price", label: "Price column", required: true },
  { key: "categoryName", label: "Category column", required: false },
  { key: "description", label: "Description column", required: false },
  { key: "sortOrder", label: "Sort order column", required: false },
  { key: "isAvailable", label: "Availability column", required: false }
];

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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function formatShortTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatTableSessionSummary(tableName: string, session: SessionSummary): string {
  return `Table ${tableName} • Opened ${formatShortTime(session.openedAt)}`;
}

function sanitizePriceInput(value: string): string {
  return value.replace(/[^\d,.\s₺]/g, "");
}

function formatPriceFieldValue(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const parsed = parseMoneyValue(trimmed);
  return parsed === null ? trimmed : formatTryMoneyInput(parsed);
}

function normalizeImportColumnName(value: string): string {
  return value
    .normalize("NFKD")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u200c\u200d\u200e\u200f]/g, "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[يى]/g, "\u06cc")
    .replace(/ك/g, "\u06a9")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function toImportCellText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function buildImportColumnAliasLookup(): Record<ImportColumnKey, Set<string>> {
  return {
    branchName: new Set(MENU_IMPORT_COLUMN_ALIASES.branchName.map(normalizeImportColumnName)),
    name: new Set(MENU_IMPORT_COLUMN_ALIASES.name.map(normalizeImportColumnName)),
    description: new Set(MENU_IMPORT_COLUMN_ALIASES.description.map(normalizeImportColumnName)),
    categoryName: new Set(MENU_IMPORT_COLUMN_ALIASES.categoryName.map(normalizeImportColumnName)),
    price: new Set(MENU_IMPORT_COLUMN_ALIASES.price.map(normalizeImportColumnName)),
    sortOrder: new Set(MENU_IMPORT_COLUMN_ALIASES.sortOrder.map(normalizeImportColumnName)),
    isAvailable: new Set(MENU_IMPORT_COLUMN_ALIASES.isAvailable.map(normalizeImportColumnName))
  };
}

function createEmptyImportColumnMapping(): MenuImportColumnMapping {
  return {
    branchName: "",
    name: "",
    description: "",
    categoryName: "",
    price: "",
    sortOrder: "",
    isAvailable: ""
  };
}

function autoDetectImportColumnMapping(sourceColumns: string[]): MenuImportColumnMapping {
  const aliasLookup = buildImportColumnAliasLookup();
  const nextMapping = createEmptyImportColumnMapping();

  for (const key of IMPORT_COLUMN_KEYS) {
    nextMapping[key] =
      sourceColumns.find((columnName) => aliasLookup[key].has(normalizeImportColumnName(columnName))) ?? "";
  }

  return nextMapping;
}

function getMappedImportCellValue(row: MenuImportRawRow, columnName: string): unknown {
  if (!columnName) {
    return "";
  }

  return row[columnName] ?? "";
}

function findImportCellValue(
  row: Record<string, unknown>,
  aliasLookup: Record<ImportColumnKey, Set<string>>,
  column: ImportColumnKey
): unknown {
  for (const [rawColumnName, value] of Object.entries(row)) {
    const normalizedColumnName = normalizeImportColumnName(rawColumnName);

    if (aliasLookup[column].has(normalizedColumnName)) {
      return value;
    }
  }

  return "";
}

function parseImportSortOrder(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return 0;
    }

    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  return 0;
}

function parseImportAvailability(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = normalizeImportColumnName(value);

    if (!normalized) {
      return true;
    }

    if (["0", "false", "hayir", "no", "n", "pasif", "kapali"].includes(normalized)) {
      return false;
    }
  }

  return true;
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

  const [restaurantEdits, setRestaurantEdits] = useState<Record<string, string>>({});
  const [savingRestaurantId, setSavingRestaurantId] = useState<string | null>(null);

  const [activeBranchFilter, setActiveBranchFilter] = useState<string>(ALL_BRANCHES_KEY);

  const [branchForm, setBranchForm] = useState({
    restaurantId: "",
    name: "",
    slug: "",
    location: "",
    logoUrl: "",
    coverImageUrl: "",
    primaryColor: "#16a34a",
    accentColor: "#bbf7d0",
    fontFamily: "\"Trebuchet MS\", \"Segoe UI\", sans-serif"
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
    imageUrl: "",
    price: "",
    sortOrder: "1",
    isAvailable: "true" as AvailabilityValue
  });

  const [importBranchId, setImportBranchId] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importSourceColumns, setImportSourceColumns] = useState<string[]>([]);
  const [importSourceRows, setImportSourceRows] = useState<MenuImportRawRow[]>([]);
  const [importColumnMapping, setImportColumnMapping] = useState<MenuImportColumnMapping>(createEmptyImportColumnMapping());
  const [isImportingItems, setIsImportingItems] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchEditForm, setBranchEditForm] = useState({
    id: "",
    name: "",
    slug: "",
    location: "",
    logoUrl: "",
    coverImageUrl: "",
    primaryColor: "#16a34a",
    accentColor: "#bbf7d0",
    fontFamily: "\"Trebuchet MS\", \"Segoe UI\", sans-serif"
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
    imageUrl: "",
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

  const selectedBranchRestaurant = useMemo(() => {
    if (snapshot.length === 1) {
      return snapshot[0];
    }

    return snapshot.find((restaurant) => restaurant.id === branchForm.restaurantId) ?? null;
  }, [branchForm.restaurantId, snapshot]);

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

  const isAllBranchesSelected = activeBranchFilter === ALL_BRANCHES_KEY;

  const filteredBranches = useMemo<BranchListRow[]>(() => {
    if (isAllBranchesSelected) return branches;
    return branches.filter((branch) => branch.id === activeBranchFilter);
  }, [branches, activeBranchFilter, isAllBranchesSelected]);

  useEffect(() => {
    if (isAllBranchesSelected) return;
    if (!branches.some((branch) => branch.id === activeBranchFilter)) {
      setActiveBranchFilter(ALL_BRANCHES_KEY);
    }
  }, [branches, activeBranchFilter, isAllBranchesSelected]);

  useEffect(() => {
    if (!importBranchId) {
      return;
    }

    if (branches.some((branch) => branch.id === importBranchId)) {
      return;
    }

    setImportBranchId(branches[0]?.id ?? "");
  }, [branches, importBranchId]);

  const selectableCategoriesForCreateItem = useMemo(() => {
    return branches.find((branch) => branch.id === itemForm.branchId)?.menuCategories ?? [];
  }, [branches, itemForm.branchId]);

  const selectableCategoriesForEditItem = useMemo(() => {
    return branches.find((branch) => branch.id === itemEditForm.branchId)?.menuCategories ?? [];
  }, [branches, itemEditForm.branchId]);

  const createItemPricePreview = useMemo(() => {
    const parsed = parseMoneyValue(itemForm.price);
    return parsed === null ? null : formatTryCurrency(parsed);
  }, [itemForm.price]);

  const editItemPricePreview = useMemo(() => {
    const parsed = parseMoneyValue(itemEditForm.price);
    return parsed === null ? null : formatTryCurrency(parsed);
  }, [itemEditForm.price]);

  const selectedImportBranch = useMemo(
    () => branches.find((branch) => branch.id === importBranchId) ?? null,
    [branches, importBranchId]
  );

  const importRows = useMemo<MenuImportPreviewRow[]>(() => {
    if (importSourceRows.length === 0) {
      return [];
    }

    const selectedImportBranchTokens = selectedImportBranch
      ? new Set([
          normalizeImportColumnName(selectedImportBranch.name),
          normalizeImportColumnName(selectedImportBranch.slug)
        ])
      : null;
    const normalizedBranchValuesInFile = new Set<string>();

    if (importColumnMapping.branchName) {
      for (const rawRow of importSourceRows) {
        const branchValue = toImportCellText(getMappedImportCellValue(rawRow, importColumnMapping.branchName));
        const normalizedValue = normalizeImportColumnName(branchValue);

        if (normalizedValue) {
          normalizedBranchValuesInFile.add(normalizedValue);
        }
      }
    }

    const hasMixedBranchValues = normalizedBranchValuesInFile.size > 1;

    return importSourceRows
      .map((rawRow, index) => {
        const branchName = toImportCellText(getMappedImportCellValue(rawRow, importColumnMapping.branchName));
        const name = toImportCellText(getMappedImportCellValue(rawRow, importColumnMapping.name));
        const description = toImportCellText(getMappedImportCellValue(rawRow, importColumnMapping.description));
        const categoryName = toImportCellText(getMappedImportCellValue(rawRow, importColumnMapping.categoryName));
        const priceInput = toImportCellText(getMappedImportCellValue(rawRow, importColumnMapping.price));
        const sortOrder = parseImportSortOrder(getMappedImportCellValue(rawRow, importColumnMapping.sortOrder));
        const isAvailable = parseImportAvailability(getMappedImportCellValue(rawRow, importColumnMapping.isAvailable));
        const priceValue = parseMoneyValue(priceInput);
        const errors: string[] = [];

        if (!importColumnMapping.name) {
          errors.push("Urun kolonu secilmemis.");
        } else if (!name) {
          errors.push("Urun adi bos olamaz.");
        } else if (name.length < 2) {
          errors.push("Urun adi en az 2 karakter olmali.");
        }

        if (!importColumnMapping.price) {
          errors.push("Fiyat kolonu secilmemis.");
        } else if (priceValue === null || priceValue <= 0) {
          errors.push("Fiyat pozitif bir TL tutari olmali.");
        }

        if (importColumnMapping.sortOrder && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999)) {
          errors.push("Sira degeri 0 ile 999 arasinda olmali.");
        }

        if (
          importColumnMapping.branchName &&
          branchName &&
          selectedImportBranch &&
          hasMixedBranchValues &&
          !selectedImportBranchTokens?.has(normalizeImportColumnName(branchName))
        ) {
          errors.push("Branch column contains mixed values that do not match the selected branch.");
        }

        return {
          rowNumber: index + 2,
          branchName,
          name,
          description,
          categoryName,
          priceInput,
          priceValue,
          sortOrder,
          isAvailable,
          errors
        };
      })
      .filter((row) => row.branchName || row.name || row.description || row.categoryName || row.priceInput);
  }, [importSourceRows, importColumnMapping, selectedImportBranch]);

  const missingRequiredImportMappings = useMemo(
    () =>
      [
        importColumnMapping.name ? null : "Item name column",
        importColumnMapping.price ? null : "Price column"
      ].filter((value): value is string => Boolean(value)),
    [importColumnMapping.name, importColumnMapping.price]
  );

  const validImportRows = useMemo(() => importRows.filter((row) => row.errors.length === 0), [importRows]);
  const invalidImportRows = useMemo(() => importRows.filter((row) => row.errors.length > 0), [importRows]);

  const importPayloadRows = useMemo<MenuImportPayloadRow[]>(() => {
    return validImportRows
      .filter((row) => row.priceValue !== null)
      .map((row) => ({
        name: row.name,
        description: row.description,
        categoryName: row.categoryName,
        price: row.priceValue ?? 0,
        sortOrder: row.sortOrder,
        isAvailable: row.isAvailable
      }));
  }, [validImportRows]);

  const previewedImportRows = useMemo(() => importRows.slice(0, 12), [importRows]);

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
        setImportBranchId((prev) => (prev ? prev : firstBranch.id));
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

  async function handleRenameRestaurant(restaurantId: string) {
    const nextName = (restaurantEdits[restaurantId] ?? "").trim();

    if (nextName.length < 2) {
      setError("Restaurant name must be at least 2 characters.");
      return;
    }

    const current = snapshot.find((entry) => entry.id === restaurantId);
    if (current && current.name === nextName) {
      setRestaurantEdits((prev) => {
        const next = { ...prev };
        delete next[restaurantId];
        return next;
      });
      return;
    }

    setError("");
    setMessage("");
    setSavingRestaurantId(restaurantId);

    try {
      await requestJson("/api/admin/restaurants", "PUT", { id: restaurantId, name: nextName });

      setSnapshot((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId ? { ...restaurant, name: nextName } : restaurant
        )
      );
      setRestaurantEdits((prev) => {
        const next = { ...prev };
        delete next[restaurantId];
        return next;
      });
      setMessage("Restaurant renamed.");
      void loadSnapshot();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Rename restaurant failed");
    } finally {
      setSavingRestaurantId(null);
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
        location: branchForm.location,
        logoUrl: branchForm.logoUrl,
        coverImageUrl: branchForm.coverImageUrl,
        primaryColor: branchForm.primaryColor,
        accentColor: branchForm.accentColor,
        fontFamily: branchForm.fontFamily
      });

      setMessage("Branch created.");
      setBranchForm((prev) => ({
        ...prev,
        name: "",
        slug: "",
        location: "",
        logoUrl: "",
        coverImageUrl: ""
      }));
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
        imageUrl: itemForm.imageUrl,
        price: itemForm.price,
        sortOrder: Number(itemForm.sortOrder),
        isAvailable: itemForm.isAvailable === "true"
      });

      setMessage("Menu item created.");
      setItemForm((prev) => ({
        ...prev,
        categoryId: "",
        name: "",
        description: "",
        imageUrl: "",
        price: "",
        sortOrder: "1",
        isAvailable: "true"
      }));
      await loadSnapshot();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create item failed");
    }
  }

  function handleImportMappingChange(field: ImportColumnKey, columnName: string) {
    setImportColumnMapping((prev) => ({
      ...prev,
      [field]: columnName
    }));
    setImportError("");
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      setImportFileName("");
      setImportSourceColumns([]);
      setImportSourceRows([]);
      setImportColumnMapping(createEmptyImportColumnMapping());
      setImportMessage("");
      setImportError("");
      return;
    }

    setError("");
    setMessage("");
    setImportError("");
    setImportMessage("");

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("Secilen dosyada okunabilir bir sayfa bulunamadi.");
      }

      const firstSheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

      if (rawRows.length === 0) {
        throw new Error("Secilen dosyada aktarilacak satir bulunamadi.");
      }

      if (rawRows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Tek seferde en fazla ${MAX_IMPORT_ROWS} satir import edilebilir.`);
      }

      const sourceColumns = Array.from(
        new Set(rawRows.flatMap((rawRow) => Object.keys(rawRow).map((key) => key.trim()).filter(Boolean)))
      );
      const autoDetectedMapping = autoDetectImportColumnMapping(sourceColumns);

      if (sourceColumns.length === 0) {
        throw new Error("Dosyada aktarilabilir satir bulunamadi.");
      }

      setImportFileName(file.name);
      setImportSourceColumns(sourceColumns);
      setImportSourceRows(rawRows);
      setImportColumnMapping(autoDetectedMapping);
      const nextMessage = `${file.name} dosyasi okundu. Kolon eslestirmesini kontrol edip import edin.`;
      setMessage(nextMessage);
      setImportMessage(nextMessage);
    } catch (fileError) {
      setImportFileName("");
      setImportSourceColumns([]);
      setImportSourceRows([]);
      setImportColumnMapping(createEmptyImportColumnMapping());
      const nextError = fileError instanceof Error ? fileError.message : "Dosya import onizlemesi basarisiz.";
      setError(nextError);
      setImportError(nextError);
    } finally {
      input.value = "";
    }
  }

  async function handleImportMenuItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setImportError("");
    setImportMessage("");

    if (!importBranchId) {
      const nextError = "Import icin bir branch secin.";
      setError(nextError);
      setImportError(nextError);
      return;
    }

    if (importSourceRows.length === 0) {
      const nextError = "Import icin once Excel veya CSV dosyasi secin.";
      setError(nextError);
      setImportError(nextError);
      return;
    }

    if (missingRequiredImportMappings.length > 0) {
      const nextError = `Import icin zorunlu kolon eslestirmeleri eksik: ${missingRequiredImportMappings.join(", ")}.`;
      setError(nextError);
      setImportError(nextError);
      return;
    }

    if (invalidImportRows.length > 0) {
      const nextError = `Import baslatilamadi. ${invalidImportRows.length} satirdaki hatalari duzeltin.`;
      setError(nextError);
      setImportError(nextError);
      return;
    }

    if (importPayloadRows.length === 0) {
      const nextError = "Gecerli import satiri bulunamadi.";
      setError(nextError);
      setImportError(nextError);
      return;
    }

    setIsImportingItems(true);

    try {
      const response = await requestJson<{ data: MenuImportResult }>("/api/admin/menu-items/import", "POST", {
        branchId: importBranchId,
        rows: importPayloadRows
      });
      const result = response.data;

      const nextMessage =
        `Import tamamlandi: ${result.processedCount} satir islendi, ${result.createdCount} yeni urun eklendi, ` +
          `${result.updatedCount} urun guncellendi, ${result.categoriesCreatedCount} kategori olusturuldu.`;
      setMessage(nextMessage);
      setImportMessage(nextMessage);
      setImportFileName("");
      setImportSourceColumns([]);
      setImportSourceRows([]);
      setImportColumnMapping(createEmptyImportColumnMapping());
      await loadSnapshot();
    } catch (importError) {
      const nextError = importError instanceof Error ? importError.message : "Menu import basarisiz.";
      setError(nextError);
      setImportError(nextError);
    } finally {
      setIsImportingItems(false);
    }
  }

  function startBranchEdit(branch: BranchListRow) {
    setEditingBranchId(branch.id);
    setBranchEditForm({
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      location: branch.location ?? "",
      logoUrl: branch.logoUrl ?? "",
      coverImageUrl: branch.coverImageUrl ?? "",
      primaryColor: branch.primaryColor ?? "#16a34a",
      accentColor: branch.accentColor ?? "#bbf7d0",
      fontFamily: branch.fontFamily ?? "\"Trebuchet MS\", \"Segoe UI\", sans-serif"
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
        location: branchEditForm.location,
        logoUrl: branchEditForm.logoUrl,
        coverImageUrl: branchEditForm.coverImageUrl,
        primaryColor: branchEditForm.primaryColor,
        accentColor: branchEditForm.accentColor,
        fontFamily: branchEditForm.fontFamily
      });

      setMessage("Branch updated.");
      setEditingBranchId(null);
      await loadSnapshot();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update branch failed");
    }
  }

  async function handleDeleteBranch(branch: BranchListRow) {
    const openSessionsCount = branch.tables.reduce((count, table) => count + table.sessions.length, 0);
    const confirmMessage =
      openSessionsCount > 0
        ? `Branch "${branch.name}" has ${openSessionsCount} active session(s). Delete it anyway and remove all related tables, sessions, orders, and payment data?`
        : `Delete branch "${branch.name}" and related data?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/branches", "DELETE", { id: branch.id, force: openSessionsCount > 0 });

      setSnapshot((prev) =>
        prev.map((restaurant) => ({
          ...restaurant,
          branches: restaurant.branches.filter((entry) => entry.id !== branch.id)
        }))
      );

      setMessage(
        openSessionsCount > 0
          ? "Branch deleted. Active sessions and related records were removed."
          : "Branch deleted."
      );

      if (editingBranchId === branch.id) {
        setEditingBranchId(null);
      }

      void loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete branch failed");
    }
  }

  function startTableEdit(table: TableRecord) {
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

  async function handleDeleteTable(table: TableRecord) {
    const hasActiveSession = table.sessions.length > 0;
    const confirmMessage = hasActiveSession
      ? `Table "${table.name}" has an active session. Delete it anyway and remove the session, orders, and payment data linked to this table?`
      : `Delete table "${table.name}"?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/tables", "DELETE", { id: table.id, force: hasActiveSession });

      setSnapshot((prev) =>
        prev.map((restaurant) => ({
          ...restaurant,
          branches: restaurant.branches.map((branch) => ({
            ...branch,
            tables: branch.tables.filter((entry) => entry.id !== table.id)
          }))
        }))
      );

      setMessage(
        hasActiveSession
          ? "Table deleted. The active session and related records were removed."
          : "Table deleted."
      );

      if (editingTableId === table.id) {
        setEditingTableId(null);
      }

      void loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete table failed");
    }
  }

  function startCategoryEdit(category: MenuCategory) {
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

  async function handleDeleteCategory(category: MenuCategory) {
    if (!window.confirm(`Delete category "${category.name}"?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-categories", "DELETE", { id: category.id });

      setSnapshot((prev) =>
        prev.map((restaurant) => ({
          ...restaurant,
          branches: restaurant.branches.map((branch) => ({
            ...branch,
            menuCategories: branch.menuCategories.filter((entry) => entry.id !== category.id)
          }))
        }))
      );

      setMessage("Menu category deleted.");

      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
      }

      void loadSnapshot();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete category failed");
    }
  }

  function startItemEdit(item: MenuItem) {
    setEditingItemId(item.id);
    setItemEditForm({
      id: item.id,
      branchId: item.branchId,
      categoryId: item.categoryId ?? "",
      name: item.name,
      description: item.description ?? "",
      imageUrl: item.imageUrl ?? "",
      price: formatTryMoneyInput(item.price),
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
        imageUrl: itemEditForm.imageUrl,
        price: itemEditForm.price,
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

  async function handleDeleteItem(item: MenuItem) {
    if (!window.confirm(`Delete menu item "${item.name}"?`)) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await requestJson("/api/admin/menu-items", "DELETE", { id: item.id });

      setSnapshot((prev) =>
        prev.map((restaurant) => ({
          ...restaurant,
          branches: restaurant.branches.map((branch) => ({
            ...branch,
            menuItems: branch.menuItems.filter((entry) => entry.id !== item.id),
            menuCategories: branch.menuCategories.map((category) => ({
              ...category,
              items: category.items.filter((entry) => entry.id !== item.id)
            }))
          }))
        }))
      );

      setMessage("Menu item deleted.");

      if (editingItemId === item.id) {
        setEditingItemId(null);
      }

      void loadSnapshot();
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
    <div className="admin-page stack-md">
      <section className="admin-hero stack-md">
        <div className="section-head admin-hero-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Owner overview</p>
            <h2>Restaurant setup and live floor control</h2>
            <p className="panel-subtitle">
              Keep branches, floor tables, QR access, and menu content clear for daily operations.
            </p>
          </div>
          <div className="toolbar admin-toolbar">
            <button type="button" className="secondary" onClick={handleBootstrap}>
              Load sample data
            </button>
            <button type="button" onClick={() => void loadSnapshot()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="dashboard-stat-grid admin-stat-grid">
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

      {snapshot.length > 0 ? (
        <section className="section-block">
          <div className="section-copy">
            <p className="section-kicker">Brand</p>
            <h3>Restaurant name</h3>
            <p className="panel-subtitle">Rename the top-level brand shown across branches and receipts.</p>
          </div>

          <div className="grid-2">
            {snapshot.map((restaurant) => {
              const draftValue = restaurantEdits[restaurant.id] ?? restaurant.name;
              const isDirty = draftValue.trim().length >= 2 && draftValue !== restaurant.name;
              const isSaving = savingRestaurantId === restaurant.id;

              return (
                <AdminFormCard
                  key={restaurant.id}
                  title={restaurant.name}
                  description="Type a new restaurant name and save."
                >
                  <div className="stack-md">
                    <AdminField label="Restaurant name">
                      <input
                        value={draftValue}
                        onChange={(event) =>
                          setRestaurantEdits((prev) => ({ ...prev, [restaurant.id]: event.target.value }))
                        }
                        placeholder="Type a restaurant name"
                      />
                    </AdminField>
                    <div className="ticket-actions">
                      <button
                        type="button"
                        className="ticket-action-btn"
                        onClick={() => void handleRenameRestaurant(restaurant.id)}
                        disabled={!isDirty || isSaving}
                      >
                        {isSaving ? "Saving..." : "Save name"}
                      </button>
                      {isDirty ? (
                        <button
                          type="button"
                          className="ticket-action-btn secondary"
                          onClick={() =>
                            setRestaurantEdits((prev) => {
                              const next = { ...prev };
                              delete next[restaurant.id];
                              return next;
                            })
                          }
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                </AdminFormCard>
              );
            })}
          </div>
        </section>
      ) : null}

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

          <AdminFormCard title="Create menu item" description="Create categorized or uncategorized items in Turkish Lira.">
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

        <AdminFormCard
          title="Import menu items (Excel/CSV)"
          description="Upload .xlsx, .xls, or .csv files. Prices are interpreted as Turkish Lira (TRY)."
        >
          <form className="stack-md" onSubmit={handleImportMenuItems}>
            <AdminField label="Branch">
              <select value={importBranchId} onChange={(event) => setImportBranchId(event.target.value)} required>
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </AdminField>

            <AdminField label="Excel or CSV file">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={(event) => void handleImportFileChange(event)}
              />
            </AdminField>

            <p className="helper-text">
              Zorunlu alanlar: urun adi ve fiyat. Dosya yuklendikten sonra hangi kolonun neye ait oldugunu elle degistirebilirsiniz.
            </p>

            <p className="helper-text">
              Template basliklari da desteklenir: `branch_name`, `category_name`, `item_name`, `price_try`, `sort_order`, `availability`.
            </p>

            {importSourceColumns.length > 0 ? (
              <div className="helper-panel stack-md">
                <p className="helper-text">
                  Algilanan kolonlar: {importSourceColumns.join(", ")}
                </p>
                <div className="grid-2">
                  {IMPORT_MAPPING_FIELDS.map((field) => (
                    <AdminField
                      key={field.key}
                      label={`${field.label}${field.required ? " *" : ""}`}
                    >
                      <select
                        value={importColumnMapping[field.key]}
                        onChange={(event) => handleImportMappingChange(field.key, event.target.value)}
                      >
                        <option value="">Not mapped</option>
                        {importSourceColumns.map((columnName) => (
                          <option key={`${field.key}-${columnName}`} value={columnName}>
                            {columnName}
                          </option>
                        ))}
                      </select>
                    </AdminField>
                  ))}
                </div>
                {missingRequiredImportMappings.length > 0 ? (
                  <p className="helper-text">
                    Import icin eslestirmeniz gereken kolonlar: {missingRequiredImportMappings.join(", ")}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {importError ? <p className="status-banner is-error">{importError}</p> : null}
            {importMessage ? <p className="status-banner is-success">{importMessage}</p> : null}

            {importRows.length > 0 ? (
              <div className="menu-import-preview stack-md">
                <div className="badge-row">
                  <span className="badge badge-outline">{importRows.length} satir</span>
                  <span className="badge badge-neutral">{validImportRows.length} hazir</span>
                  {invalidImportRows.length > 0 ? (
                    <span className="badge badge-danger">{invalidImportRows.length} hatali satir</span>
                  ) : (
                    <span className="badge badge-status-ready">Tum satirlar gecerli</span>
                  )}
                  {importFileName ? <span className="badge badge-outline">{importFileName}</span> : null}
                </div>

                <div className="menu-import-scroll">
                  <table className="menu-import-table">
                    <thead>
                      <tr>
                        <th>Satir</th>
                        {importColumnMapping.branchName ? <th>Branch</th> : null}
                        <th>Urun</th>
                        <th>Kategori</th>
                        <th>Fiyat</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewedImportRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.branchName}-${row.name}-${row.priceInput}`}>
                          <td>{row.rowNumber}</td>
                          {importColumnMapping.branchName ? <td>{row.branchName || "-"}</td> : null}
                          <td>{row.name || "-"}</td>
                          <td>{row.categoryName || "Uncategorized"}</td>
                          <td>{row.priceValue !== null ? formatTryCurrency(row.priceValue) : "-"}</td>
                          <td>
                            {row.errors.length > 0 ? (
                              <span className="badge badge-danger">{row.errors.join(" | ")}</span>
                            ) : (
                              <span className="badge badge-status-ready">{row.isAvailable ? "Aktif" : "Pasif"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importRows.length > previewedImportRows.length ? (
                  <p className="helper-text">
                    Onizleme ilk {previewedImportRows.length} satiri gosterir. Toplam {importRows.length} satir okunmustur.
                  </p>
                ) : null}
              </div>
            ) : null}

            <AdminActions>
              <button
                type="submit"
                disabled={
                  isImportingItems ||
                  importSourceRows.length === 0 ||
                  missingRequiredImportMappings.length > 0 ||
                  invalidImportRows.length > 0 ||
                  !importBranchId
                }
              >
                {isImportingItems ? "Importing..." : "Import menu items"}
              </button>
            </AdminActions>
          </form>
        </AdminFormCard>
      </section>

      {branches.length > 0 ? (
        <section className="panel stack-sm">
          <div className="section-head">
            <div className="section-copy">
              <p className="section-kicker">Filter</p>
              <h3>Branch groups</h3>
              <p className="panel-subtitle">
                Pick a branch to open its workspace. Tables, categories, and menu items all live under their branch.
              </p>
            </div>
          </div>

          <div className="table-filter-bar" role="tablist" aria-label="Branch filter">
            <button
              type="button"
              role="tab"
              aria-selected={isAllBranchesSelected}
              className={`table-filter-chip${isAllBranchesSelected ? " is-active" : ""}`}
              onClick={() => setActiveBranchFilter(ALL_BRANCHES_KEY)}
            >
              <span>All branches</span>
              <span className="table-filter-chip-count">{branches.length}</span>
            </button>
            {branches.map((branch) => {
              const isActive = activeBranchFilter === branch.id;
              const itemCount = branch.tables.length + branch.menuCategories.length + branch.menuItems.length;
              return (
                <button
                  key={branch.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`table-filter-chip${isActive ? " is-active" : ""}`}
                  onClick={() => setActiveBranchFilter(branch.id)}
                >
                  <span>{branch.name}</span>
                  <span className="table-filter-chip-count">{itemCount}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel stack-md">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">Workspace</p>
            <h3>
              Branch workspaces ({filteredBranches.length}
              {isAllBranchesSelected ? "" : ` of ${branches.length}`})
            </h3>
            <p className="panel-subtitle">
              Every branch keeps its own tables, menu categories, and items nested together so setup stays readable.
              Closed tables across all branches: {tablesOutOfService}.
            </p>
          </div>
          {isLoading ? <span className="badge badge-outline">Refreshing</span> : null}
        </div>

        {branches.length === 0 ? (
          <p className="empty empty-state">No branches yet. Create a branch first so tables and menu content can be attached.</p>
        ) : null}

        <div className="stack-md">
          {filteredBranches.map((branch) => {
            const isFocused = !isAllBranchesSelected;
            const activeSessions = branch.tables.filter((table) => table.sessions.length > 0).length;

            return (
              <article key={branch.id} className="branch-workspace stack-md">
                <div className="branch-workspace-head">
                  <div className="entity-title">
                    <h4>{branch.name}</h4>
                    <p className="entity-summary">Part of {branch.restaurantName}</p>
                    <div className="badge-row">
                      <span className="badge badge-outline">{branch.slug}</span>
                      <span className="badge badge-neutral">{branch.location || "Location not set"}</span>
                      <span className="badge badge-neutral">{branch.tables.length} tables</span>
                      <span className="badge badge-neutral">{branch.menuCategories.length} categories</span>
                      <span className="badge badge-neutral">{branch.menuItems.length} items</span>
                      <span className="badge badge-outline">{activeSessions} active session(s)</span>
                    </div>
                  </div>
                  <AdminActions>
                    {isFocused ? null : (
                      <button type="button" onClick={() => setActiveBranchFilter(branch.id)}>
                        Open workspace
                      </button>
                    )}
                    <button type="button" className="secondary" onClick={() => startBranchEdit(branch)}>
                      {editingBranchId === branch.id ? "Editing" : "Edit"}
                    </button>
                    <button type="button" className="warn" onClick={() => void handleDeleteBranch(branch)}>
                      Delete
                    </button>
                  </AdminActions>
                </div>

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
                    <p className="helper-text">Updating a branch does not change QR routes. It updates branding and metadata only.</p>
                    <AdminActions>
                      <button type="submit">Save branch</button>
                      <button type="button" className="secondary" onClick={() => setEditingBranchId(null)}>
                        Cancel
                      </button>
                    </AdminActions>
                  </form>
                ) : null}

                {isFocused ? (
                  <div className="branch-workspace-body stack-md">
                    <details className="branch-workspace-section" open>
                      <summary>
                        <span className="branch-workspace-section-kicker">Floor map</span>
                        <span className="branch-workspace-section-title">Tables</span>
                        <span className="table-filter-chip-count">{branch.tables.length}</span>
                      </summary>

                      <div className="branch-workspace-section-body stack-md">
                        {branch.tables.length === 0 ? (
                          <p className="empty empty-state">No tables for this branch yet. Add tables above to generate QR access.</p>
                        ) : (
                          <div className="list">
                            {branch.tables.map((table) => (
                              <article key={table.id} className="list-item entity-card stack-md">
                                <div className="entity-top">
                                  <div className="entity-title">
                                    <h4>{table.name}</h4>
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
                                        onChange={(event) =>
                                          setTableEditForm((prev) => ({ ...prev, status: event.target.value as TableStatus }))
                                        }
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
                        )}
                      </div>
                    </details>

                    <details className="branch-workspace-section">
                      <summary>
                        <span className="branch-workspace-section-kicker">Catalog</span>
                        <span className="branch-workspace-section-title">Menu categories</span>
                        <span className="table-filter-chip-count">{branch.menuCategories.length}</span>
                      </summary>

                      <div className="branch-workspace-section-body stack-md">
                        {branch.menuCategories.length === 0 ? (
                          <p className="empty empty-state">No categories for this branch yet.</p>
                        ) : (
                          <div className="list">
                            {branch.menuCategories.map((category) => (
                              <article key={category.id} className="list-item entity-card stack-md">
                                <div className="entity-top">
                                  <div className="entity-title">
                                    <h4>{category.name}</h4>
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
                                        onChange={(event) =>
                                          setCategoryEditForm((prev) => ({ ...prev, name: event.target.value }))
                                        }
                                        required
                                      />
                                    </AdminField>
                                    <AdminField label="Sort order">
                                      <input
                                        type="number"
                                        value={categoryEditForm.sortOrder}
                                        onChange={(event) =>
                                          setCategoryEditForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                                        }
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
                        )}
                      </div>
                    </details>

                    <details className="branch-workspace-section">
                      <summary>
                        <span className="branch-workspace-section-kicker">Items</span>
                        <span className="branch-workspace-section-title">Menu items</span>
                        <span className="table-filter-chip-count">{branch.menuItems.length}</span>
                      </summary>

                      <div className="branch-workspace-section-body stack-md">
                        {branch.menuItems.length === 0 ? (
                          <p className="empty empty-state">No menu items for this branch yet.</p>
                        ) : (
                          <div className="list">
                            {branch.menuItems.map((item) => (
                              <article key={item.id} className="list-item entity-card stack-md">
                                <div className="entity-top">
                                  <div className="entity-title">
                                    <h4>{item.name}</h4>
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

                                <div className="admin-menu-item-preview">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="admin-menu-item-image" />
                                  ) : (
                                    <div className="admin-menu-item-image admin-menu-item-image--empty">
                                      {item.name.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="stack-md">
                                    {item.description ? (
                                      <p className="helper-text">{item.description}</p>
                                    ) : (
                                      <p className="helper-text">No description provided yet.</p>
                                    )}
                                    <p className="helper-text">
                                      {item.imageUrl ? "Image attached to customer menu." : "No image attached yet."}
                                    </p>
                                  </div>
                                </div>

                                <div className="detail-grid">
                                  <div className="detail-card">
                                    <span className="detail-label">Fiyat</span>
                                    <span className="detail-value">{formatTryCurrency(item.price)}</span>
                                  </div>
                                  <div className="detail-card">
                                    <span className="detail-label">Sort order</span>
                                    <span className="detail-value">{item.sortOrder}</span>
                                  </div>
                                  <div className="detail-card">
                                    <span className="detail-label">Category</span>
                                    <span className="detail-value">{item.category?.name ?? "Uncategorized"}</span>
                                  </div>
                                  <div className="detail-card">
                                    <span className="detail-label">Image</span>
                                    <span className="detail-value">{item.imageUrl ? "Ready" : "Missing"}</span>
                                  </div>
                                </div>

                                {editingItemId === item.id ? (
                                  <form className="grid-2 helper-panel" onSubmit={handleUpdateItem}>
                                    <AdminField label="Name">
                                      <input
                                        value={itemEditForm.name}
                                        onChange={(event) =>
                                          setItemEditForm((prev) => ({ ...prev, name: event.target.value }))
                                        }
                                        required
                                      />
                                    </AdminField>
                                    <AdminField label="Category">
                                      <select
                                        value={itemEditForm.categoryId}
                                        onChange={(event) =>
                                          setItemEditForm((prev) => ({ ...prev, categoryId: event.target.value }))
                                        }
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
                                        onChange={(event) =>
                                          setItemEditForm((prev) => ({ ...prev, description: event.target.value }))
                                        }
                                      />
                                    </AdminField>
                                    <AdminField label="Availability">
                                      <select
                                        value={itemEditForm.isAvailable}
                                        onChange={(event) =>
                                          setItemEditForm((prev) => ({
                                            ...prev,
                                            isAvailable: event.target.value as AvailabilityValue,
                                          }))
                                        }
                                      >
                                        <option value="true">Available</option>
                                        <option value="false">Unavailable</option>
                                      </select>
                                    </AdminField>
                                    <p className="helper-text">
                                      Changing availability keeps the item record but blocks new orders when off.
                                    </p>
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
                        )}
                      </div>
                    </details>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
