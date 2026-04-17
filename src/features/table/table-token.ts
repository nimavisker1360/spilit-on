import { randomBytes } from "node:crypto";

import { readStore } from "@/lib/local-store";

const TABLE_PUBLIC_TOKEN_BYTES = 18;
const TABLE_PUBLIC_TOKEN_MAX_ATTEMPTS = 8;

export function generateTablePublicToken(): string {
  return randomBytes(TABLE_PUBLIC_TOKEN_BYTES).toString("base64url");
}

export async function generateUniqueTablePublicToken(): Promise<string> {
  for (let attempt = 0; attempt < TABLE_PUBLIC_TOKEN_MAX_ATTEMPTS; attempt += 1) {
    const token = generateTablePublicToken();
    const existing = readStore().tables.find((table) => table.publicToken === token);

    if (!existing) {
      return token;
    }
  }

  throw new Error("Failed to generate a unique table token");
}
