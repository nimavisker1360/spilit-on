const LOCALHOST_FALLBACK_URL = "http://localhost:3000";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseAbsoluteBaseUrl(value: string, errorMessage: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(errorMessage);
  }
}

function normalizeAbsoluteBaseUrl(value: string, errorMessage: string): string {
  return trimTrailingSlashes(parseAbsoluteBaseUrl(value, errorMessage).toString());
}

function getConfiguredPublicAppBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredBaseUrl) {
    return LOCALHOST_FALLBACK_URL;
  }

  return normalizeAbsoluteBaseUrl(configuredBaseUrl, "NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function shouldPreferConfiguredBaseUrl(requestBaseUrl: string, configuredBaseUrl: string): boolean {
  const requestUrl = parseAbsoluteBaseUrl(requestBaseUrl, "Request origin must be a valid absolute URL.");
  const configuredUrl = parseAbsoluteBaseUrl(configuredBaseUrl, "NEXT_PUBLIC_APP_URL must be a valid absolute URL.");

  return isLoopbackHost(requestUrl.hostname) && !isLoopbackHost(configuredUrl.hostname);
}

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function getRequestBaseUrl(request: Request): string {
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host");

  if (!host) {
    return normalizeAbsoluteBaseUrl(new URL(request.url).origin, "Request origin must be a valid absolute URL.");
  }

  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const requestProtocol = new URL(request.url).protocol.replace(/:$/, "");
  const protocol = forwardedProto ?? requestProtocol;

  return normalizeAbsoluteBaseUrl(`${protocol}://${host}`, "Request origin must be a valid absolute URL.");
}

export function getPublicAppBaseUrl(): string {
  return getConfiguredPublicAppBaseUrl();
}

export function getRequestPublicAppBaseUrl(request: Request): string {
  const requestBaseUrl = getRequestBaseUrl(request);
  const configuredBaseUrl = getConfiguredPublicAppBaseUrl();

  return shouldPreferConfiguredBaseUrl(requestBaseUrl, configuredBaseUrl) ? configuredBaseUrl : requestBaseUrl;
}

export function getClientPublicAppBaseUrl(): string {
  const configuredBaseUrl = getConfiguredPublicAppBaseUrl();

  if (typeof window === "undefined") {
    return configuredBaseUrl;
  }

  const currentBaseUrl = normalizeAbsoluteBaseUrl(window.location.origin, "Browser origin must be a valid absolute URL.");
  return shouldPreferConfiguredBaseUrl(currentBaseUrl, configuredBaseUrl) ? configuredBaseUrl : currentBaseUrl;
}

export function getTablePublicUrl(tableToken: string, baseUrl = getPublicAppBaseUrl()): string {
  return `${trimTrailingSlashes(baseUrl)}/table/${encodeURIComponent(tableToken)}`;
}
