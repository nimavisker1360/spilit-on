import type { Prisma } from "@prisma/client";

export const TURKISH_LOCALE = "tr-TR";
export const DEFAULT_CURRENCY_CODE = "TRY" as const;
export const DEFAULT_CURRENCY_SYMBOL = "₺";

type MoneyValue = Prisma.Decimal | number | string;

const tryCurrencyFormatter = new Intl.NumberFormat(TURKISH_LOCALE, {
  style: "currency",
  currency: DEFAULT_CURRENCY_CODE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const tryMoneyInputFormatter = new Intl.NumberFormat(TURKISH_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false
});

function sanitizeMoneyString(value: string): string {
  const trimmed = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/₺/g, "")
    .replace(/TRY/gi, "")
    .replace(/TL/gi, "")
    .replace(/[^\d,.-]/g, "");

  if (!trimmed) {
    return "";
  }

  if (trimmed.includes(",") && trimmed.includes(".")) {
    if (trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")) {
      return trimmed.replace(/\./g, "").replace(",", ".");
    }

    return trimmed.replace(/,/g, "");
  }

  if (trimmed.includes(",")) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(trimmed)) {
      return trimmed.replace(/,/g, "");
    }

    return trimmed.replace(",", ".");
  }

  if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    return trimmed.replace(/\./g, "");
  }

  return trimmed;
}

export function parseMoneyValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = sanitizeMoneyString(value);

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return parseMoneyValue(String(value));
  }

  return null;
}

export function toMoneyNumber(value: MoneyValue): number {
  const parsed = parseMoneyValue(value);

  if (parsed === null) {
    throw new Error("Invalid money value.");
  }

  return parsed;
}

export function normalizeMoneyStorage(value: unknown, fallback = "0.00"): string {
  const parsed = parseMoneyValue(value);
  return parsed === null ? fallback : parsed.toFixed(2);
}

export function formatTryCurrency(value: unknown): string {
  return tryCurrencyFormatter.format(parseMoneyValue(value) ?? 0);
}

export function formatTryMoneyInput(value: unknown): string {
  return tryMoneyInputFormatter.format(parseMoneyValue(value) ?? 0);
}

export function normalizeCurrencyCode(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (!normalized || normalized === "USD") {
    return DEFAULT_CURRENCY_CODE;
  }

  return normalized;
}

export function toCents(value: MoneyValue): number {
  return Math.round(toMoneyNumber(value) * 100);
}

export function centsToDecimalString(value: number): string {
  return (value / 100).toFixed(2);
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, current) => acc + current, 0);
}
