import { SplitMode } from "@prisma/client";
import { z } from "zod";

export const createInvoiceSchema = z.object({
  sessionId: z.string().min(1),
  splitMode: z.nativeEnum(SplitMode),
  payerGuestId: z.string().min(1).optional()
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
