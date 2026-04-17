const LOCALHOST_FALLBACK_URL = "http://localhost:3000";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicAppBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredBaseUrl) {
    return LOCALHOST_FALLBACK_URL;
  }

  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
  }

  return trimTrailingSlashes(parsedBaseUrl.toString());
}

export function getTablePublicUrl(tableToken: string): string {
  return `${getPublicAppBaseUrl()}/table/${encodeURIComponent(tableToken)}`;
}
