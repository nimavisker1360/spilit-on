import { SplitMode } from "@prisma/client";
import { z } from "zod";

export const createInvoiceSchema = z.object({
  sessionId: z.string().min(1),
  splitMode: z.nativeEnum(SplitMode),
  payerGuestId: z.string().min(1).optional()
}).superRefine((value, context) => {
  if (value.splitMode === SplitMode.FULL_BY_ONE && !value.payerGuestId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payerGuestId"],
      message: "payerGuestId is required for FULL_BY_ONE split mode."
    });
  }
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
