import { z } from "zod";

const requiredIdSchema = z.string().trim().min(1);

const optionalItemNoteSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().max(300).optional());

const optionalOrderNoteSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().max(400).optional());

const baseOrderItemInputSchema = z
  .object({
    menuItemId: requiredIdSchema,
    quantity: z.coerce.number().int().min(1).max(20),
    note: optionalItemNoteSchema
  })
  .strict();

export const customerOrderItemInputSchema = baseOrderItemInputSchema;

export const waiterOrderItemInputSchema = baseOrderItemInputSchema
  .extend({
    guestId: requiredIdSchema
  })
  .strict();

export const createCustomerOrderSchema = z
  .object({
    sessionId: requiredIdSchema,
    guestId: requiredIdSchema,
    note: optionalOrderNoteSchema,
    items: z.array(customerOrderItemInputSchema).min(1).max(30)
  })
  .strict();

export const createWaiterOrderSchema = z
  .object({
    sessionId: requiredIdSchema,
    note: optionalOrderNoteSchema,
    items: z.array(waiterOrderItemInputSchema).min(1).max(30)
  })
  .strict();

export type CreateCustomerOrderInput = z.infer<typeof createCustomerOrderSchema>;
export type CreateWaiterOrderInput = z.infer<typeof createWaiterOrderSchema>;
