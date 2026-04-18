import { z } from "zod";

import { parseMoneyValue } from "@/lib/currency";

const priceSchema = z.preprocess(
  (value) => {
    const parsed = parseMoneyValue(value);
    return parsed ?? value;
  },
  z.number({ invalid_type_error: "Fiyat gecerli bir TL tutari olmali." }).positive("Fiyat sifirdan buyuk olmali.")
);

function normalizeAvailabilityToken(value: string): string {
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

const importAvailabilitySchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = normalizeAvailabilityToken(value);

    if (!normalized) {
      return true;
    }

    if (["1", "true", "yes", "y", "evet", "aktif", "available", "var", "acik"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "n", "hayir", "pasif", "unavailable", "yok", "kapali"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());
const optionalItemImageUrlSchema = z.string().url().max(500).optional().or(z.literal(""));

export const createMenuCategorySchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(80),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
});

export const updateMenuCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(80),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
});

export const deleteMenuCategorySchema = z.object({
  id: z.string().min(1)
});

export const createMenuItemSchema = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(400).optional().or(z.literal("")),
  imageUrl: optionalItemImageUrlSchema,
  price: priceSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isAvailable: z.boolean().optional().default(true)
});

export const updateMenuItemSchema = createMenuItemSchema.extend({
  id: z.string().min(1)
});

export const deleteMenuItemSchema = z.object({
  id: z.string().min(1)
});

export const importMenuItemRowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional().default(""),
  categoryName: z.string().trim().max(80).optional().default(""),
  price: priceSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
  isAvailable: importAvailabilitySchema.optional().default(true)
});

export const importMenuItemsSchema = z.object({
  branchId: z.string().min(1),
  rows: z.array(importMenuItemRowSchema).min(1).max(2000)
});

export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type DeleteMenuCategoryInput = z.infer<typeof deleteMenuCategorySchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type DeleteMenuItemInput = z.infer<typeof deleteMenuItemSchema>;
export type ImportMenuItemRowInput = z.infer<typeof importMenuItemRowSchema>;
export type ImportMenuItemsInput = z.infer<typeof importMenuItemsSchema>;
