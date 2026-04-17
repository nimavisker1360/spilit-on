const GUEST_IDENTITY_STORAGE_PREFIX = "split-table:guest";

function buildGuestIdentityKey(tableCode: string): string {
  return `${GUEST_IDENTITY_STORAGE_PREFIX}:${tableCode.trim().toUpperCase()}`;
}

export function readGuestIdentity(tableCode: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(buildGuestIdentityKey(tableCode))?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeGuestIdentity(tableCode: string, guestId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedGuestId = guestId.trim();

  try {
    if (!normalizedGuestId) {
      window.localStorage.removeItem(buildGuestIdentityKey(tableCode));
      return;
    }

    window.localStorage.setItem(buildGuestIdentityKey(tableCode), normalizedGuestId);
  } catch {
    // Ignore localStorage write errors for private browsing / disabled storage.
  }
}

export function clearGuestIdentity(tableCode: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(buildGuestIdentityKey(tableCode));
  } catch {
    // Ignore localStorage write errors for private browsing / disabled storage.
  }
}
