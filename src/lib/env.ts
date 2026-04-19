import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  IYZICO_API_KEY: optionalNonEmptyString,
  IYZICO_SECRET_KEY: optionalNonEmptyString,
  IYZICO_BASE_URL: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().url().default("https://sandbox-api.iyzipay.com")
    ),
  IYZICO_CALLBACK_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional()
  ),
  IYZICO_LOCALE: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.enum(["tr", "en"]).default("tr")
    ),
  IYZICO_CURRENCY: z
    .preprocess(
      (value) => {
        if (typeof value !== "string") {
          return undefined;
        }

        const trimmed = value.trim();
        return trimmed ? trimmed.toUpperCase() : undefined;
      },
      z.enum(["TRY", "USD", "EUR", "GBP"]).default("TRY")
    ),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("SplitTable"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000")
});

const envParseResult = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  IYZICO_API_KEY: process.env.IYZICO_API_KEY,
  IYZICO_SECRET_KEY: process.env.IYZICO_SECRET_KEY,
  IYZICO_BASE_URL: process.env.IYZICO_BASE_URL,
  IYZICO_CALLBACK_URL: process.env.IYZICO_CALLBACK_URL,
  IYZICO_LOCALE: process.env.IYZICO_LOCALE,
  IYZICO_CURRENCY: process.env.IYZICO_CURRENCY,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
});

if (!envParseResult.success) {
  const formatted = envParseResult.error.flatten().fieldErrors;
  throw new Error(`Invalid environment variables: ${JSON.stringify(formatted)}`);
}

export const env = envParseResult.data;
