import { z } from "zod";

export const openSessionSchema = z.object({
  tableCode: z.string().trim().min(2).max(80)
});

export const joinSessionSchema = z.object({
  tableCode: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(1).max(80),
  reuseGuestId: z.string().trim().min(1).optional()
});

export const closeSessionSchema = z.object({
  sessionId: z.string().min(1)
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
