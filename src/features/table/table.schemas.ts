import { TableStatus } from "@prisma/client";
import { z } from "zod";

export const tablePublicTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid table token format");

export const createTableSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(1).max(30),
  capacity: z.coerce.number().int().min(1).max(30)
});

export const updateTableSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(30),
  capacity: z.coerce.number().int().min(1).max(30),
  status: z.nativeEnum(TableStatus)
});

export const deleteTableSchema = z.object({
  id: z.string().min(1)
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type DeleteTableInput = z.infer<typeof deleteTableSchema>;
