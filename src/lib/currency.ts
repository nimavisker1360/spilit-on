import { Prisma } from "@prisma/client";

export function toCents(value: Prisma.Decimal | number | string): number {
  const parsed = typeof value === "string" ? Number(value) : Number(value.toString());
  return Math.round(parsed * 100);
}

export function centsToDecimalString(value: number): string {
  return (value / 100).toFixed(2);
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, current) => acc + current, 0);
}
