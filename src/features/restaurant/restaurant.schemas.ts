import { z } from "zod";

const slugSchema = z.string().min(2).max(60).regex(/^[a-z0-9-]+$/);

export const createRestaurantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: slugSchema
});

export const createBranchSchema = z.object({
  restaurantId: z.string().min(1),
  name: z.string().min(2).max(120),
  slug: slugSchema,
  location: z.string().max(240).optional().or(z.literal(""))
});

export const updateBranchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  slug: slugSchema,
  location: z.string().max(240).optional().or(z.literal(""))
});

export const deleteBranchSchema = z.object({
  id: z.string().min(1)
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type DeleteBranchInput = z.infer<typeof deleteBranchSchema>;
