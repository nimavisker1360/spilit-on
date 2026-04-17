import { z } from "zod";

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
  price: z.coerce.number().positive(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isAvailable: z.boolean().optional().default(true)
});

export const updateMenuItemSchema = createMenuItemSchema.extend({
  id: z.string().min(1)
});

export const deleteMenuItemSchema = z.object({
  id: z.string().min(1)
});

export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type DeleteMenuCategoryInput = z.infer<typeof deleteMenuCategorySchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type DeleteMenuItemInput = z.infer<typeof deleteMenuItemSchema>;
