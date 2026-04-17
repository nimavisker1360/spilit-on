import { Prisma } from "@prisma/client";

export function routeErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];

      if (target.includes("branchId") && target.includes("name")) {
        return "A record with this name already exists in the selected branch.";
      }

      if (target.includes("code")) {
        return "Table code conflict detected. Please retry.";
      }

      if (target.includes("publicToken")) {
        return "Table token conflict detected. Please retry.";
      }

      return "Duplicate value violates a unique constraint.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected server error";
}