import { Prisma } from "@prisma/client";

export class RouteAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "RouteAccessError";
    this.status = status;
  }
}

export function routeErrorMessage(error: unknown): string {
  if (error instanceof RouteAccessError) {
    return error.message;
  }

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

export function routeErrorStatus(error: unknown): number {
  if (error instanceof RouteAccessError) {
    return error.status;
  }

  return 400;
}
