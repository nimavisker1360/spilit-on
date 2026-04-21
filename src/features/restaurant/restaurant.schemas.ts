import { z } from "zod";

const slugSchema = z.string().min(2).max(60).regex(/^[a-z0-9-]+$/);
const optionalUrlSchema = z.string().url().max(500).optional().or(z.literal(""));
const optionalColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color must be a valid hex value.")
  .optional()
  .or(z.literal(""));
const optionalFontFamilySchema = z.string().max(160).optional().or(z.literal(""));

export const createRestaurantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: slugSchema
});

export const updateRestaurantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120)
});

export const createBranchSchema = z.object({
  restaurantId: z.string().min(1),
  name: z.string().min(2).max(120),
  slug: slugSchema,
  location: z.string().max(240).optional().or(z.literal("")),
  logoUrl: optionalUrlSchema,
  coverImageUrl: optionalUrlSchema,
  primaryColor: optionalColorSchema,
  accentColor: optionalColorSchema,
  fontFamily: optionalFontFamilySchema
});

export const updateBranchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  slug: slugSchema,
  location: z.string().max(240).optional().or(z.literal("")),
  logoUrl: optionalUrlSchema,
  coverImageUrl: optionalUrlSchema,
  primaryColor: optionalColorSchema,
  accentColor: optionalColorSchema,
  fontFamily: optionalFontFamilySchema
});

export const deleteBranchSchema = z.object({
  id: z.string().min(1),
  force: z.coerce.boolean().optional().default(false)
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type DeleteBranchInput = z.infer<typeof deleteBranchSchema>;
